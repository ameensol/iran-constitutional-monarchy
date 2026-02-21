// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Constitution.sol";
import "./Parliament.sol";
import "./Executive.sol";
import "./SupremeCourt.sol";
import "./ProvincialCouncil.sol";
import "./IIdentityVerifier.sol";

/// @title Crown
/// @notice Constitutional office of continuity and guardianship.
///         The Crown shall not govern, legislate, or control finances.
///         Powers are limited to ministerial acts, nominations, and appointments.
/// @dev Implements Part II and Part VI of the Constitution.
///      Ministerial acts have deadlines — if the Crown doesn't act within the deadline,
///      anyone can call the corresponding execute function to trigger the automatic outcome.
contract Crown {
    // ─── Errors ──────────────────────────────────────────────────────────

    error NotMonarch();
    error NotAuthorized();
    error NoMonarch();
    error MonarchAlreadySet();
    error CrownSuspended();
    error CrownNotSuspended();
    error InvalidSuccessor();
    error ZeroAddress();
    error CourtCertificationRequired();
    error NotCitizen(address candidate);
    error SuccessionListTooLong();
    error VacancyNotCertified();
    error IncapacityNotCertified();
    error HeirNotConfirmed();
    error RegentNotConfirmed();
    error RegentAlreadySet();
    error RecoveryNotCertified();
    error SuccessionNotExhausted();
    error SuccessionOrderViolated();
    error DeadlineNotReached();
    error AlreadyClaimed();

    // ─── Events ──────────────────────────────────────────────────────────

    event Coronation(address indexed monarch, uint256 timestamp);
    event Abdication(address indexed monarch, uint256 timestamp);
    event SuccessionTriggered(address indexed oldMonarch, address indexed newMonarch);
    event RegencyStarted(address indexed regent);
    event RegencyEnded(address indexed regent);
    event CrownSuspension(bool suspended);
    event SuccessorUpdated(uint256 index, address indexed successor);

    event PMNominated(address indexed nominee);
    event JusticeNominated(address indexed nominee);
    event SenatorsAppointed(address[] senators);
    event LawReturned(uint256 indexed billId);
    event LawReferred(uint256 indexed billId);
    event LawEnacted(uint256 indexed billId);
    event DissolutionDeclared(uint256 timestamp);
    event SuccessionReferendumDue(uint256 timestamp);

    // ─── State ───────────────────────────────────────────────────────────

    Constitution public constitution;

    /// @notice Whether the Crown is currently suspended (no eligible monarch or regent).
    bool public suspended;

    /// @notice Ordered succession list.
    address[] public successionList;

    /// @notice Timestamp when succession was exhausted (0 = not exhausted).
    ///         Used to enforce the Art. VI.6.1 referendum deadline.
    uint256 public successionExhaustedAt;

    /// @notice Whether the succession referendum deadline has already been claimed.
    bool public successionReferendumClaimed;

    // ─── Constructor ─────────────────────────────────────────────────────

    constructor(address _constitution) {
        if (_constitution == address(0)) revert ZeroAddress();
        constitution = Constitution(_constitution);
    }

    // ─── Modifiers ───────────────────────────────────────────────────────

    modifier onlyMonarch() {
        address monarch = constitution.getRole(constitution.ROLE_MONARCH());
        address regent = constitution.getRole(constitution.ROLE_REGENT());
        if (msg.sender != monarch && msg.sender != regent) revert NotMonarch();
        if (suspended) revert CrownSuspended();
        _;
    }


    // ─── Coronation & Succession ─────────────────────────────────────────

    /// @notice Initial coronation — set the first monarch. Can only be called once
    ///         during system bootstrap by the deployer (before finalizeSetup).
    /// @param monarch The address of the first monarch.
    function coronation(address monarch) external {
        if (monarch == address(0)) revert ZeroAddress();
        if (constitution.getRole(constitution.ROLE_MONARCH()) != address(0)) {
            revert MonarchAlreadySet();
        }
        if (msg.sender != constitution.deployer()) revert NotAuthorized();

        constitution.setRole(constitution.ROLE_MONARCH(), monarch);
        constitution.finalizeSetup();
        emit Coronation(monarch, block.timestamp);
    }

    /// @notice Abdicate the throne. Requires Supreme Court certification per Art. VI.4.
    ///         The Court must also confirm the heir via HEIR_CONFIRMED fact before
    ///         abdication can proceed. Atomic: abdicates and crowns the heir in one step.
    /// @param confirmedHeir The Court-confirmed heir (must match HEIR_CONFIRMED certification).
    function abdicate(address confirmedHeir) external onlyMonarch {
        // Require Court certification of the abdication — hash includes monarch address
        // so each monarch needs their own certification (prevents reuse across reigns)
        address courtAddr = constitution.getContract(constitution.CONTRACT_SUPREME_COURT());
        address currentMonarch = constitution.getRole(constitution.ROLE_MONARCH());
        bytes32 certHash = keccak256(abi.encodePacked("ABDICATION_CERTIFIED", currentMonarch));
        if (courtAddr.code.length > 0 && !SupremeCourt(courtAddr).isFactCertified(certHash)) {
            revert CourtCertificationRequired();
        }

        // Require Court confirmation of the specific heir
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", currentMonarch, confirmedHeir));
        if (courtAddr.code.length > 0 && !SupremeCourt(courtAddr).isFactCertified(heirHash)) {
            revert HeirNotConfirmed();
        }

        // Verify succession order: confirmed heir must be first eligible in the list
        address registryAddr = constitution.getContract(constitution.CONTRACT_CITIZEN_REGISTRY());
        uint256 heirPos = _verifySuccessionOrder(confirmedHeir, courtAddr, registryAddr, currentMonarch);

        emit Abdication(currentMonarch, block.timestamp);

        // Crown the confirmed heir (atomic abdication + succession)
        constitution.setRole(constitution.ROLE_MONARCH(), confirmedHeir);
        successionList[heirPos] = address(0); // Clear heir's slot (permanent)

        emit SuccessionTriggered(currentMonarch, confirmedHeir);
    }

    /// @notice Update the succession list. Requires Supreme Court certification per Art. VI.1.
    ///         All successors must be registered citizens per Art. VI.2.
    /// @param successors Ordered list of successor addresses.
    function updateSuccessionList(address[] calldata successors) external onlyMonarch {
        if (successors.length > 20) revert SuccessionListTooLong();

        // Require Court certification — hash includes monarch address (per-reign certification)
        address courtAddr = constitution.getContract(constitution.CONTRACT_SUPREME_COURT());
        address currentMonarch = constitution.getRole(constitution.ROLE_MONARCH());
        bytes32 certHash = keccak256(abi.encodePacked("SUCCESSION_LIST_UPDATE", currentMonarch));
        if (courtAddr.code.length > 0 && !SupremeCourt(courtAddr).isFactCertified(certHash)) {
            revert CourtCertificationRequired();
        }

        // Verify all successors are registered citizens
        address registryAddr = constitution.getContract(constitution.CONTRACT_CITIZEN_REGISTRY());
        for (uint256 i = 0; i < successors.length; i++) {
            if (successors[i] == address(0)) revert ZeroAddress();
            if (registryAddr.code.length > 0 && !IIdentityVerifier(registryAddr).isCitizen(successors[i])) {
                revert NotCitizen(successors[i]);
            }
        }

        delete successionList;
        for (uint256 i = 0; i < successors.length; i++) {
            successionList.push(successors[i]);
            emit SuccessorUpdated(i, successors[i]);
        }
    }

    /// @notice Get the full succession list.
    function getSuccessionList() external view returns (address[] memory) {
        return successionList;
    }

    /// @notice Get the number of successors in the list.
    function successionListLength() external view returns (uint256) {
        return successionList.length;
    }

    // ─── PM Nomination (Art. II.4) ───────────────────────────────────────

    /// @notice Nominate a candidate for Prime Minister.
    ///         Called by the monarch during executive formation (max 2 per cycle).
    ///         The Executive contract enforces the formation cycle rules.
    /// @param candidate The PM candidate address.
    function nominatePrimeMinister(address candidate) external onlyMonarch {
        if (candidate == address(0)) revert ZeroAddress();
        address execAddr = constitution.getContract(constitution.CONTRACT_EXECUTIVE());
        Executive(execAddr).nominatePM(candidate);
        emit PMNominated(candidate);
    }

    // ─── Justice Nomination (Art. V.3) ───────────────────────────────────

    /// @notice Nominate a candidate for Supreme Court Justice (first nomination).
    /// @param candidate The justice candidate address.
    /// @param seat The seat number (0-11) to fill.
    function nominateJustice(address candidate, uint256 seat) external onlyMonarch {
        if (candidate == address(0)) revert ZeroAddress();
        address courtAddr = constitution.getContract(constitution.CONTRACT_SUPREME_COURT());
        SupremeCourt(courtAddr).nominateJustice(candidate, seat);
        emit JusticeNominated(candidate);
    }

    /// @notice Make a second justice nomination after the Senate rejected the first.
    /// @param candidate The second nominee (must differ from the first).
    /// @param seat The seat number.
    function nominateJusticeSecond(address candidate, uint256 seat) external onlyMonarch {
        if (candidate == address(0)) revert ZeroAddress();
        address courtAddr = constitution.getContract(constitution.CONTRACT_SUPREME_COURT());
        SupremeCourt(courtAddr).nominateJusticeSecond(candidate, seat);
        emit JusticeNominated(candidate);
    }

    /// @notice Pick a justice from the Senate's ranked list of 3 (Art. V.3.5).
    /// @param seat The seat number.
    /// @param index Which candidate from the list (0, 1, or 2).
    function appointJusticeFromList(uint256 seat, uint256 index) external onlyMonarch {
        address courtAddr = constitution.getContract(constitution.CONTRACT_SUPREME_COURT());
        SupremeCourt(courtAddr).appointFromList(seat, index);
    }

    // ─── Senator Appointment (Art. II.6) ─────────────────────────────────

    /// @notice Appoint Crown senators (max 10% of Senate per Art. III.4).
    ///         The Parliament contract enforces the cap.
    /// @param senators Array of senator addresses to appoint.
    function appointSenators(address[] calldata senators) external onlyMonarch {
        address parlAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        for (uint256 i = 0; i < senators.length; i++) {
            if (senators[i] == address(0)) revert ZeroAddress();
            Parliament(parlAddr).seatCrownSenator(senators[i]);
        }
        emit SenatorsAppointed(senators);
    }

    /// @notice Pick a PM from the Majlis-proposed ranked list (Art. IV.7.3).
    /// @param index Which candidate from the list (0, 1, or 2).
    function appointPMFromList(uint256 index) external onlyMonarch {
        address execAddr = constitution.getContract(constitution.CONTRACT_EXECUTIVE());
        Executive(execAddr).appointFromList(index);
    }

    // ─── Senate Stagger Initialization (Art. III.4.3) ────────────────────

    /// @notice Initialize Senate term staggering. Monarch triggers once after first Senate is seated.
    /// @param senators All currently seated senators.
    function initializeSenateStagger(address[] calldata senators) external onlyMonarch {
        address parlAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        Parliament(parlAddr).initializeSenateStagger(senators);
    }

    // ─── Provincial Council Initialization ──────────────────────────────

    /// @notice Initialize provincial councils. Monarch wrapper for one-time province bootstrap.
    /// @param inits Array of province initialization data.
    function initializeProvincialCouncils(
        ProvincialCouncil.ProvinceInit[] calldata inits
    ) external onlyMonarch {
        ProvincialCouncil(constitution.getContract(constitution.CONTRACT_PROVINCIAL_COUNCIL()))
            .initializeProvinces(inits);
    }

    // ─── Legislative Actions (Art. II.5) ─────────────────────────────────

    /// @notice Return a law to the Majlis for reconsideration (one-time per bill).
    /// @param billId The bill ID.
    function returnLaw(uint256 billId) external onlyMonarch {
        address parlAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        Parliament(parlAddr).markReturned(billId);
        emit LawReturned(billId);
    }

    /// @notice Refer a re-adopted law to the Supreme Court for constitutional review.
    /// @param billId The bill ID.
    function referToSupremeCourt(uint256 billId) external onlyMonarch {
        address parlAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        Parliament(parlAddr).markReferred(billId);
        emit LawReferred(billId);
    }

    /// @notice Enact a law (ministerial act — Crown signs the bill into law).
    /// @param billId The bill ID.
    function enactLaw(uint256 billId) external onlyMonarch {
        address parlAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        Parliament(parlAddr).markEnacted(billId);
        emit LawEnacted(billId);
    }

    // ─── Acting PM Designation (Art. IV.7) ────────────────────────────────

    /// @notice Crown designates an Acting PM when both PM and Deputy PM are dead.
    ///         Formation cycle must already be in progress.
    /// @param acting The Acting PM address.
    function designateActingPM(address acting) external onlyMonarch {
        address execAddr = constitution.getContract(constitution.CONTRACT_EXECUTIVE());
        Executive(execAddr).designateActingPM(acting);
    }

    // ─── Dissolution Declaration (Art. II.7) ─────────────────────────────

    /// @notice Declare dissolution of the Majlis (ministerial act).
    ///         Cross-wires to Parliament.dissolveMajlis().
    function declareDissolution() external onlyMonarch {
        address parlAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        Parliament(parlAddr).dissolveMajlis();
        emit DissolutionDeclared(block.timestamp);
    }

    // ─── Permissionless Claim Functions ────────────────────────────────
    //     Court certifies facts, anyone can trigger the constitutional consequence.

    /// @notice Claim succession after the Court certifies a monarch vacancy.
    ///         Anyone can call. The Court must have certified both MONARCH_VACANCY
    ///         and HEIR_CONFIRMED for the specific heir. The code verifies succession
    ///         order: every candidate ahead of the heir must be either on-chain
    ///         ineligible or Court-certified as SUCCESSION_INELIGIBLE.
    /// @param confirmedHeir The Court-confirmed heir address.
    function claimSuccession(address confirmedHeir) external {
        // Hash includes current monarch so each vacancy needs its own certification
        address courtAddr = constitution.getContract(constitution.CONTRACT_SUPREME_COURT());
        address currentMonarch = constitution.getRole(constitution.ROLE_MONARCH());
        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", currentMonarch));
        if (!SupremeCourt(courtAddr).isFactCertified(vacancyHash)) revert VacancyNotCertified();

        // Require Court confirmation of the specific heir
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", currentMonarch, confirmedHeir));
        if (!SupremeCourt(courtAddr).isFactCertified(heirHash)) revert HeirNotConfirmed();

        // Verify succession order
        address registryAddr = constitution.getContract(constitution.CONTRACT_CITIZEN_REGISTRY());
        uint256 heirPos = _verifySuccessionOrder(confirmedHeir, courtAddr, registryAddr, currentMonarch);

        // Crown the confirmed heir
        constitution.setRole(constitution.ROLE_MONARCH(), confirmedHeir);
        successionList[heirPos] = address(0); // Clear heir's slot (permanent)

        emit SuccessionTriggered(currentMonarch, confirmedHeir);
    }

    /// @notice Claim that the succession line is exhausted after the Court certifies
    ///         a monarch vacancy. Anyone can call. Every candidate in the succession
    ///         list must be either on-chain ineligible or Court-certified as
    ///         SUCCESSION_INELIGIBLE. Suspends the Crown (Art. VI.5).
    function claimSuccessionExhausted() external {
        address courtAddr = constitution.getContract(constitution.CONTRACT_SUPREME_COURT());
        address currentMonarch = constitution.getRole(constitution.ROLE_MONARCH());
        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", currentMonarch));
        if (!SupremeCourt(courtAddr).isFactCertified(vacancyHash)) revert VacancyNotCertified();

        // Verify every candidate in the succession list is ineligible
        address registryAddr = constitution.getContract(constitution.CONTRACT_CITIZEN_REGISTRY());
        for (uint256 i = 0; i < successionList.length; i++) {
            address candidate = successionList[i];
            if (candidate == address(0) || candidate == currentMonarch) continue;

            // On-chain ineligible (not a citizen)?
            if (registryAddr.code.length > 0 && !IIdentityVerifier(registryAddr).isCitizen(candidate)) {
                continue;
            }

            // Court-certified ineligible?
            bytes32 ineligibleHash = keccak256(abi.encodePacked("SUCCESSION_INELIGIBLE", candidate));
            if (courtAddr.code.length > 0 && SupremeCourt(courtAddr).isFactCertified(ineligibleHash)) {
                continue;
            }

            // Found someone who is potentially eligible and not excluded
            revert SuccessionNotExhausted();
        }

        // Succession exhausted — vacate monarch and suspend the Crown
        if (currentMonarch != address(0)) {
            constitution.setRole(constitution.ROLE_MONARCH(), address(0));
        }
        suspended = true;
        successionExhaustedAt = block.timestamp;
        emit CrownSuspension(true);
    }

    /// @notice Claim regency after the Court certifies monarch incapacity.
    ///         Anyone can call. The Court must have certified both MONARCH_INCAPACITY
    ///         and REGENT_CONFIRMED for the specific regent. The code verifies
    ///         succession order: the regent must be the first eligible person in the
    ///         succession list. The regent is NOT removed from the list (temporary role).
    /// @param confirmedRegent The Court-confirmed regent address.
    function claimRegency(address confirmedRegent) external {
        // Hash includes current monarch so each incapacity needs its own certification
        address courtAddr = constitution.getContract(constitution.CONTRACT_SUPREME_COURT());
        address currentMonarch = constitution.getRole(constitution.ROLE_MONARCH());
        bytes32 factHash = keccak256(abi.encodePacked("MONARCH_INCAPACITY", currentMonarch));
        if (!SupremeCourt(courtAddr).isFactCertified(factHash)) revert IncapacityNotCertified();
        if (confirmedRegent == address(0)) revert ZeroAddress();
        // Prevent silent regent replacement — existing regency must end first
        if (constitution.getRole(constitution.ROLE_REGENT()) != address(0)) revert RegentAlreadySet();

        // Require Court confirmation of the specific regent
        bytes32 regentHash = keccak256(abi.encodePacked("REGENT_CONFIRMED", currentMonarch, confirmedRegent));
        if (!SupremeCourt(courtAddr).isFactCertified(regentHash)) revert RegentNotConfirmed();

        // Verify succession order (regent must be first eligible in the list)
        address registryAddr = constitution.getContract(constitution.CONTRACT_CITIZEN_REGISTRY());
        _verifySuccessionOrder(confirmedRegent, courtAddr, registryAddr, currentMonarch);
        // Do NOT clear succession list entry — regency is temporary

        constitution.setRole(constitution.ROLE_REGENT(), confirmedRegent);
        emit RegencyStarted(confirmedRegent);
    }

    /// @notice End regency after the Court certifies monarch recovery.
    ///         Anyone can call. Hash includes current monarch for instance specificity.
    function claimRegencyEnd() external {
        address courtAddr = constitution.getContract(constitution.CONTRACT_SUPREME_COURT());
        address currentMonarch = constitution.getRole(constitution.ROLE_MONARCH());
        bytes32 factHash = keccak256(abi.encodePacked("MONARCH_RECOVERY", currentMonarch));
        if (!SupremeCourt(courtAddr).isFactCertified(factHash)) revert RecoveryNotCertified();

        address regent = constitution.getRole(constitution.ROLE_REGENT());
        constitution.setRole(constitution.ROLE_REGENT(), address(0));
        emit RegencyEnded(regent);
    }

    /// @notice Resume Crown operations after suspension is resolved.
    ///         Anyone can call. No Court certification needed because the succession
    ///         or other mechanism already validated the new monarch.
    function claimCrownResumption() external {
        if (!suspended) revert CrownNotSuspended();
        address monarchAddr = constitution.getRole(constitution.ROLE_MONARCH());
        if (monarchAddr == address(0)) revert NoMonarch();
        suspended = false;
        successionExhaustedAt = 0;
        successionReferendumClaimed = false;
        emit CrownSuspension(false);
    }

    /// @notice Claim that the succession referendum deadline has passed (Art. VI.6.1).
    ///         Anyone can call after 1 year from succession exhaustion.
    ///         Emits an on-chain record that the constitutional mandate for a
    ///         national referendum on the form of government has been triggered.
    function claimSuccessionReferendumDeadline() external {
        if (successionExhaustedAt == 0) revert SuccessionNotExhausted();
        if (successionReferendumClaimed) revert AlreadyClaimed();
        uint256 deadline = successionExhaustedAt + constitution.getParameter(
            constitution.PARAM_SUCCESSION_REFERENDUM_DEADLINE()
        );
        if (block.timestamp < deadline) revert DeadlineNotReached();

        successionReferendumClaimed = true;
        emit SuccessionReferendumDue(block.timestamp);
    }

    // ─── Generic Ministerial Execute ────────────────────────────────────
    //     The monarch can call any gated function on any registered governance
    //     contract through this single entry point. Target contracts enforce
    //     their own caller-specific modifiers (e.g., onlyCrown).

    error InvalidTarget();
    error ExecutionFailed();

    /// @notice Execute a ministerial act on a registered governance contract.
    ///         msg.sender must be the monarch or regent.
    /// @param target The registered governance contract to call.
    /// @param data The encoded function call.
    function executeMinisterialAct(address target, bytes calldata data) external onlyMonarch {
        if (!_isRegisteredContract(target)) revert InvalidTarget();
        (bool success,) = target.call(data);
        if (!success) revert ExecutionFailed();
    }

    /// @dev Check if an address is a registered governance contract.
    function _isRegisteredContract(address target) internal view returns (bool) {
        return target == address(constitution) ||
               target == constitution.getContract(constitution.CONTRACT_CITIZEN_REGISTRY()) ||
               target == constitution.getContract(constitution.CONTRACT_PARLIAMENT()) ||
               target == constitution.getContract(constitution.CONTRACT_EXECUTIVE()) ||
               target == constitution.getContract(constitution.CONTRACT_SUPREME_COURT()) ||
               target == constitution.getContract(constitution.CONTRACT_ELECTION()) ||
               target == constitution.getContract(constitution.CONTRACT_REFERENDUM()) ||
               target == constitution.getContract(constitution.CONTRACT_BUDGET()) ||
               target == constitution.getContract(constitution.CONTRACT_PROVINCIAL_COUNCIL());
    }

    // ─── Internal ────────────────────────────────────────────────────────

    /// @dev Verify succession order: the confirmed person must be in the succession
    ///      list, and every candidate ahead of them must be either on-chain ineligible
    ///      (zero address, same as excluded monarch, not a citizen) or Court-certified
    ///      as SUCCESSION_INELIGIBLE. Returns the position of the confirmed person.
    /// @param confirmed The address to verify as the rightful successor/regent.
    /// @param courtAddr The Supreme Court contract address.
    /// @param registryAddr The Citizen Registry contract address.
    /// @param excludeMonarch The departing/incapacitated monarch to exclude.
    function _verifySuccessionOrder(
        address confirmed,
        address courtAddr,
        address registryAddr,
        address excludeMonarch
    ) internal view returns (uint256 confirmedPos) {
        bool found = false;

        for (uint256 i = 0; i < successionList.length; i++) {
            address candidate = successionList[i];

            if (candidate == confirmed) {
                // Found the confirmed person — verify they pass on-chain checks
                if (candidate == address(0) || candidate == excludeMonarch) {
                    revert InvalidSuccessor();
                }
                if (registryAddr.code.length > 0 && !IIdentityVerifier(registryAddr).isCitizen(candidate)) {
                    revert NotCitizen(candidate);
                }
                found = true;
                confirmedPos = i;
                break;
            }

            // For candidates before the confirmed person: they must be ineligible
            if (candidate == address(0) || candidate == excludeMonarch) {
                continue; // On-chain ineligible
            }
            if (registryAddr.code.length > 0 && !IIdentityVerifier(registryAddr).isCitizen(candidate)) {
                continue; // Not a citizen
            }
            // This candidate passes on-chain checks — they must be Court-certified ineligible
            bytes32 ineligibleHash = keccak256(abi.encodePacked("SUCCESSION_INELIGIBLE", candidate));
            if (courtAddr.code.length > 0 && SupremeCourt(courtAddr).isFactCertified(ineligibleHash)) {
                continue; // Court says ineligible
            }

            // Someone eligible ahead of the confirmed person was not excluded
            revert SuccessionOrderViolated();
        }

        if (!found) revert InvalidSuccessor();
    }
}
