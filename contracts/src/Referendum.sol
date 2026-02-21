// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Constitution.sol";
import "./CitizenRegistry.sol";
import "./IIdentityVerifier.sol";
import "./SupremeCourt.sol";
import "./verifiers/IBallotVerifier.sol";

/// @title Referendum
/// @notice Constitutional amendment proposals and citizen referendums.
///         Implements Part VII of the Constitution.
/// @dev Amendment flow:
///      1. Parliament adopts amendment with 2/3 majority (off-chain trigger)
///      2. Authorized contract proposes amendment on-chain
///      3. Referendum voting period opens for citizens
///      4. Simple majority of valid votes → amendment enacted
///      5. Constitution.amendParameter() is called to update the parameter
///
///      Emergency amendments (3/4 parliament) can be enacted without referendum
///      but expire after 1 year if not ratified by referendum.
contract Referendum {
    // ─── Enums ───────────────────────────────────────────────────────────

    enum AmendmentStatus {
        Proposed,       // Proposed but referendum not yet started
        Voting,         // Referendum voting is open
        Approved,       // Referendum passed, awaiting enactment
        Enacted,        // Amendment enacted in Constitution
        Rejected,       // Referendum failed
        Expired,        // Emergency amendment expired without ratification
        Confirmed,      // Emergency amendment confirmed by referendum (permanent)
        Superseded      // Emergency amendment superseded by normal referendum on same parameter
    }

    enum AmendmentType {
        Parameter,      // Change a Constitution parameter value
        Role,           // Grant/revoke a constitutional role
        Contract        // Swap a governance contract address
    }

    // ─── Structs ─────────────────────────────────────────────────────────

    struct Amendment {
        bytes32 amendmentHash;     // Hash of the amendment text
        bytes32 parameterKey;      // Constitution key (parameter, role, or contract name)
        uint256 newValue;          // New value (for Parameter type)
        uint256 oldValue;          // Previous value (stored for emergency amendment rollback)
        address targetAddress;     // Target address (for Role and Contract types)
        AmendmentType amendType;   // Type of amendment
        address proposer;
        AmendmentStatus status;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 votingStart;
        uint256 votingEnd;
        bool emergency;            // True if emergency amendment (3/4 parliament)
        uint256 enactedAt;         // Timestamp when enacted (for emergency expiry tracking)
        uint256 expiresAt;         // Expiry deadline for emergency amendments (0 for normal)
    }

    // ─── Structs (ZK) ───────────────────────────────────────────────────

    struct ProofPoints {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    // ─── Errors ──────────────────────────────────────────────────────────

    error NotAuthorized();
    error ZeroAddress();
    error InvalidAmendment();
    error NotInStatus(AmendmentStatus expected);
    error VotingNotOpen();
    error AlreadyVoted(uint256 nullifier);
    error InvalidProof();
    error InvalidElectionBinding();
    error AmendmentNotApproved();
    error EmergencyNotExpired();
    error ProtectedParameter(bytes32 key);
    error CourtCertificationRequired();
    error EmergencyAlreadyActive(bytes32 key);
    error NotEmergencyAmendment();
    error AmendmentAlreadyConfirmed();
    error VotingDurationTooShort();

    // ─── Events ──────────────────────────────────────────────────────────

    event AmendmentProposed(uint256 indexed amendmentId, bytes32 amendmentHash, address proposer);
    event ReferendumStarted(uint256 indexed amendmentId, uint256 votingEnd);
    event ReferendumVoteCast(uint256 indexed amendmentId, uint256 indexed nullifier, bool support);
    event ReferendumPassed(uint256 indexed amendmentId, uint256 yesVotes, uint256 noVotes);
    event ReferendumFailed(uint256 indexed amendmentId, uint256 yesVotes, uint256 noVotes);
    event AmendmentEnacted(uint256 indexed amendmentId, bytes32 parameterKey, uint256 newValue, address targetAddress);
    event EmergencyAmendmentEnacted(uint256 indexed amendmentId, uint256 expiresAt);
    event EmergencyAmendmentExpired(uint256 indexed amendmentId);
    event EmergencyAmendmentConfirmed(uint256 indexed amendmentId);
    event EmergencyAmendmentSuperseded(uint256 indexed emergencyId, uint256 indexed supersedingId);

    // ─── State ───────────────────────────────────────────────────────────

    Constitution public constitution;

    /// @notice All amendments.
    Amendment[] internal amendments;

    /// @notice Track which nullifiers have been used: amendmentId → nullifier → bool.
    mapping(uint256 => mapping(uint256 => bool)) public nullifierUsed;

    /// @notice Track active emergency amendment per parameter key.
    ///         Only one emergency amendment per parameter at a time.
    mapping(bytes32 => uint256) public activeEmergencyForParam;
    mapping(bytes32 => bool) public hasActiveEmergency;

    // ─── Constructor ─────────────────────────────────────────────────────

    constructor(address _constitution) {
        if (_constitution == address(0)) revert ZeroAddress();
        constitution = Constitution(_constitution);
    }

    // ─── Modifiers ───────────────────────────────────────────────────────

    modifier onlyParliament() {
        if (msg.sender != constitution.getContract(constitution.CONTRACT_PARLIAMENT())) revert NotAuthorized();
        _;
    }

    // ─── Amendment Proposal ─────────────────────────────────────────────

    /// @notice Propose a parameter amendment after parliamentary adoption.
    /// @param amendmentHash Hash of the amendment text.
    /// @param parameterKey The Constitution parameter to change (bytes32(0) for text-only).
    /// @param newValue The new value for the parameter.
    /// @return amendmentId The ID of the proposed amendment.
    function proposeAmendment(
        bytes32 amendmentHash,
        bytes32 parameterKey,
        uint256 newValue
    ) external onlyParliament returns (uint256 amendmentId) {
        amendmentId = _createAmendment(amendmentHash, parameterKey, newValue, address(0), AmendmentType.Parameter);
    }

    /// @notice Propose a structural amendment — changing a role holder.
    /// @param amendmentHash Hash of the amendment text.
    /// @param roleKey The Constitution role to change.
    /// @param newHolder The new role holder (address(0) to vacate).
    function proposeRoleAmendment(
        bytes32 amendmentHash,
        bytes32 roleKey,
        address newHolder
    ) external onlyParliament returns (uint256 amendmentId) {
        amendmentId = _createAmendment(amendmentHash, roleKey, 0, newHolder, AmendmentType.Role);
    }

    /// @notice Propose a structural amendment — swapping a governance contract.
    /// @param amendmentHash Hash of the amendment text.
    /// @param contractKey The contract slot to replace.
    /// @param newContract The new contract address.
    function proposeContractAmendment(
        bytes32 amendmentHash,
        bytes32 contractKey,
        address newContract
    ) external onlyParliament returns (uint256 amendmentId) {
        amendmentId = _createAmendment(amendmentHash, contractKey, 0, newContract, AmendmentType.Contract);
    }

    /// @notice Start a referendum for a proposed amendment.
    /// @param amendmentId The amendment ID.
    /// @param votingDuration Duration of the voting period in seconds.
    function startReferendum(uint256 amendmentId, uint256 votingDuration) external onlyParliament {
        if (amendmentId >= amendments.length) revert InvalidAmendment();
        Amendment storage a = amendments[amendmentId];
        if (a.status != AmendmentStatus.Proposed) revert NotInStatus(AmendmentStatus.Proposed);

        // Enforce minimum voting period
        uint256 minPeriod = constitution.getParameter(constitution.PARAM_MIN_VOTING_PERIOD());
        if (votingDuration < minPeriod) revert VotingDurationTooShort();

        a.status = AmendmentStatus.Voting;
        a.votingStart = block.timestamp;
        a.votingEnd = block.timestamp + votingDuration;

        emit ReferendumStarted(amendmentId, a.votingEnd);
    }

    // ─── Referendum Voting ──────────────────────────────────────────────

    /// @notice Cast a vote in a referendum using a ZK proof.
    ///         The proof demonstrates citizenship eligibility without revealing identity.
    /// @param amendmentId The amendment ID.
    /// @param support True for yes, false for no.
    /// @param proof Groth16 proof points (a, b, c).
    /// @param pubSignals 23 public signals from the ZK circuit.
    function castReferendumVote(
        uint256 amendmentId,
        bool support,
        ProofPoints calldata proof,
        uint256[23] calldata pubSignals
    ) external {
        if (amendmentId >= amendments.length) revert InvalidAmendment();
        Amendment storage a = amendments[amendmentId];
        if (a.status != AmendmentStatus.Voting) revert NotInStatus(AmendmentStatus.Voting);
        if (block.timestamp > a.votingEnd) revert VotingNotOpen();

        // Extract nullifier and check for double-voting
        uint256 nullifier = pubSignals[0];
        if (nullifierUsed[amendmentId][nullifier]) revert AlreadyVoted(nullifier);

        // Verify election binding: proof must be for this amendment
        if (pubSignals[9] != amendmentId) revert InvalidElectionBinding();

        // Verify citizenship (0x495241 = "IRA" = Iran in ISO 3166-1 alpha-3)
        if (pubSignals[6] != 0x495241) revert InvalidProof();

        // Verify CSCA key authorization
        {
            address registryAddr = constitution.getContract(constitution.CONTRACT_CITIZEN_REGISTRY());
            uint256 expectedCscaHash = CitizenRegistry(registryAddr).cscaKeyHash();
            if (expectedCscaHash == 0 || pubSignals[12] != expectedCscaHash) revert InvalidProof();
        }

        // Verify currentDate not in the future (prevents age-check gaming)
        if (pubSignals[13] > _timestampToYYYYMMDD(block.timestamp)) revert InvalidProof();

        // Verify ZK proof
        address verifierAddr = constitution.getContract(constitution.CONTRACT_BALLOT_VERIFIER());
        if (!IBallotVerifier(verifierAddr).verifyProof(proof.a, proof.b, proof.c, pubSignals)) {
            revert InvalidProof();
        }

        // Record vote
        nullifierUsed[amendmentId][nullifier] = true;
        if (support) {
            a.yesVotes++;
        } else {
            a.noVotes++;
        }

        emit ReferendumVoteCast(amendmentId, nullifier, support);
    }

    /// @notice Finalize a referendum after voting ends. Anyone can call.
    /// @param amendmentId The amendment ID.
    function finalizeReferendum(uint256 amendmentId) external {
        if (amendmentId >= amendments.length) revert InvalidAmendment();
        Amendment storage a = amendments[amendmentId];
        if (a.status != AmendmentStatus.Voting) revert NotInStatus(AmendmentStatus.Voting);
        if (block.timestamp < a.votingEnd) revert VotingNotOpen();

        // Simple majority of valid votes
        if (a.yesVotes > a.noVotes) {
            a.status = AmendmentStatus.Approved;
            emit ReferendumPassed(amendmentId, a.yesVotes, a.noVotes);
        } else {
            a.status = AmendmentStatus.Rejected;
            emit ReferendumFailed(amendmentId, a.yesVotes, a.noVotes);
        }
    }

    // ─── Enactment ──────────────────────────────────────────────────────

    /// @notice Enact an approved amendment by updating the Constitution.
    ///         Intentionally permissionless: once citizens approve an amendment by
    ///         referendum, no governance actor may block its enactment. This prevents
    ///         the Crown, Parliament, or Executive from frustrating the people's will
    ///         by refusing to call this function.
    /// @param amendmentId The amendment ID.
    function enactAmendment(uint256 amendmentId) external {
        if (amendmentId >= amendments.length) revert InvalidAmendment();
        Amendment storage a = amendments[amendmentId];
        if (a.status != AmendmentStatus.Approved) revert AmendmentNotApproved();

        a.status = AmendmentStatus.Enacted;
        a.enactedAt = block.timestamp;

        if (a.parameterKey != bytes32(0)) {
            if (a.amendType == AmendmentType.Parameter) {
                constitution.amendParameter(a.parameterKey, a.newValue);

                // Supersede any active emergency amendment on the same parameter.
                // A normal referendum represents the permanent will of the people,
                // so the emergency's oldValue snapshot is now stale.
                if (hasActiveEmergency[a.parameterKey]) {
                    uint256 emergId = activeEmergencyForParam[a.parameterKey];
                    amendments[emergId].status = AmendmentStatus.Superseded;
                    hasActiveEmergency[a.parameterKey] = false;
                    activeEmergencyForParam[a.parameterKey] = 0;
                    emit EmergencyAmendmentSuperseded(emergId, amendmentId);
                }
            } else if (a.amendType == AmendmentType.Role) {
                constitution.setRole(a.parameterKey, a.targetAddress);
            } else if (a.amendType == AmendmentType.Contract) {
                constitution.amendContract(a.parameterKey, a.targetAddress);
            }
        }

        emit AmendmentEnacted(amendmentId, a.parameterKey, a.newValue, a.targetAddress);
    }

    // ─── Emergency Amendments ───────────────────────────────────────────

    /// @notice Enact an emergency amendment (3/4 parliament, no referendum needed).
    ///         Expires after 1 year if not ratified by referendum.
    /// @param amendmentHash Hash of the amendment text.
    /// @param parameterKey The Constitution parameter to change.
    /// @param newValue The new value for the parameter.
    /// @return amendmentId The ID of the emergency amendment.
    function enactEmergencyAmendment(
        bytes32 amendmentHash,
        bytes32 parameterKey,
        uint256 newValue
    ) external onlyParliament returns (uint256 amendmentId) {
        // Protected parameters cannot be changed by emergency amendment
        if (parameterKey != bytes32(0) && constitution.isProtectedParameter(parameterKey)) {
            revert ProtectedParameter(parameterKey);
        }

        // Only one active emergency amendment per parameter at a time
        if (parameterKey != bytes32(0) && hasActiveEmergency[parameterKey]) {
            revert EmergencyAlreadyActive(parameterKey);
        }

        // Requires Supreme Court certification of the emergency
        address courtAddr = constitution.getContract(constitution.CONTRACT_SUPREME_COURT());
        bytes32 certHash = keccak256(abi.encodePacked("EMERGENCY_AMENDMENT", amendmentHash));
        if (!SupremeCourt(courtAddr).isFactCertified(certHash)) revert CourtCertificationRequired();

        amendmentId = amendments.length;

        uint256 duration = constitution.getParameter(constitution.PARAM_EMERGENCY_AMEND_DURATION());

        // Store old value before changing, for rollback on expiry
        uint256 previousValue = 0;
        if (parameterKey != bytes32(0)) {
            previousValue = constitution.getParameter(parameterKey);
        }

        amendments.push(Amendment({
            amendmentHash: amendmentHash,
            parameterKey: parameterKey,
            newValue: newValue,
            oldValue: previousValue,
            targetAddress: address(0),
            amendType: AmendmentType.Parameter,
            proposer: msg.sender,
            status: AmendmentStatus.Enacted,
            yesVotes: 0,
            noVotes: 0,
            votingStart: 0,
            votingEnd: 0,
            emergency: true,
            enactedAt: block.timestamp,
            expiresAt: block.timestamp + duration
        }));

        // Update the Constitution parameter and track active emergency
        if (parameterKey != bytes32(0)) {
            constitution.amendParameter(parameterKey, newValue);
            hasActiveEmergency[parameterKey] = true;
            activeEmergencyForParam[parameterKey] = amendmentId;
        }

        emit EmergencyAmendmentEnacted(amendmentId, block.timestamp + duration);
    }

    /// @notice Mark an expired emergency amendment. Anyone can call after expiry.
    /// @param amendmentId The amendment ID.
    function expireEmergencyAmendment(uint256 amendmentId) external {
        if (amendmentId >= amendments.length) revert InvalidAmendment();
        Amendment storage a = amendments[amendmentId];
        if (!a.emergency) revert NotAuthorized();
        if (a.status == AmendmentStatus.Superseded) revert NotInStatus(AmendmentStatus.Enacted);
        if (a.status != AmendmentStatus.Enacted) revert NotInStatus(AmendmentStatus.Enacted);

        if (block.timestamp < a.expiresAt) revert EmergencyNotExpired();

        a.status = AmendmentStatus.Expired;

        // Restore the original parameter value and clear active tracking
        if (a.parameterKey != bytes32(0)) {
            constitution.amendParameter(a.parameterKey, a.oldValue);
            hasActiveEmergency[a.parameterKey] = false;
            activeEmergencyForParam[a.parameterKey] = 0;
        }

        emit EmergencyAmendmentExpired(amendmentId);
    }

    /// @notice Confirm an emergency amendment by referendum, making it permanent.
    ///         Art. VII.5.2: emergency amendments expire unless confirmed by referendum.
    ///         After confirmation, the amendment cannot be rolled back by expiry.
    /// @param amendmentId The emergency amendment ID.
    function confirmEmergencyAmendment(uint256 amendmentId) external onlyParliament {
        if (amendmentId >= amendments.length) revert InvalidAmendment();
        Amendment storage a = amendments[amendmentId];
        if (!a.emergency) revert NotEmergencyAmendment();
        if (a.status == AmendmentStatus.Confirmed) revert AmendmentAlreadyConfirmed();
        if (a.status == AmendmentStatus.Superseded) revert NotInStatus(AmendmentStatus.Enacted);
        if (a.status != AmendmentStatus.Enacted) revert NotInStatus(AmendmentStatus.Enacted);

        a.status = AmendmentStatus.Confirmed;

        // Clear active emergency tracking — parameter is now permanently changed
        if (a.parameterKey != bytes32(0)) {
            hasActiveEmergency[a.parameterKey] = false;
            activeEmergencyForParam[a.parameterKey] = 0;
        }

        emit EmergencyAmendmentConfirmed(amendmentId);
    }

    // ─── View Functions ──────────────────────────────────────────────────

    /// @notice Get the total number of amendments.
    function amendmentCount() external view returns (uint256) {
        return amendments.length;
    }

    /// @notice Get an amendment's status.
    function getAmendmentStatus(uint256 amendmentId) external view returns (AmendmentStatus) {
        if (amendmentId >= amendments.length) revert InvalidAmendment();
        return amendments[amendmentId].status;
    }

    /// @notice Get an amendment's vote counts.
    function getAmendmentVotes(uint256 amendmentId) external view returns (uint256 yesVotes, uint256 noVotes) {
        if (amendmentId >= amendments.length) revert InvalidAmendment();
        Amendment storage a = amendments[amendmentId];
        return (a.yesVotes, a.noVotes);
    }

    /// @notice Get an amendment's emergency data.
    function getAmendmentEmergency(uint256 amendmentId) external view returns (
        bool emergency, uint256 enactedAt, uint256 expiresAt
    ) {
        if (amendmentId >= amendments.length) revert InvalidAmendment();
        Amendment storage a = amendments[amendmentId];
        return (a.emergency, a.enactedAt, a.expiresAt);
    }

    /// @notice Check if a nullifier has been used in a referendum.
    /// @param amendmentId The amendment ID.
    /// @param nullifier The nullifier to check.
    /// @return True if the nullifier has been used.
    function isNullifierUsed(uint256 amendmentId, uint256 nullifier) external view returns (bool) {
        return nullifierUsed[amendmentId][nullifier];
    }

    // ─── Internal ────────────────────────────────────────────────────────

    function _createAmendment(
        bytes32 amendmentHash,
        bytes32 key,
        uint256 newValue,
        address targetAddress,
        AmendmentType amendType
    ) internal returns (uint256 amendmentId) {
        amendmentId = amendments.length;
        amendments.push(Amendment({
            amendmentHash: amendmentHash,
            parameterKey: key,
            newValue: newValue,
            oldValue: 0,
            targetAddress: targetAddress,
            amendType: amendType,
            proposer: msg.sender,
            status: AmendmentStatus.Proposed,
            yesVotes: 0,
            noVotes: 0,
            votingStart: 0,
            votingEnd: 0,
            emergency: false,
            enactedAt: 0,
            expiresAt: 0
        }));

        emit AmendmentProposed(amendmentId, amendmentHash, msg.sender);
    }

    /// @dev Convert a Unix timestamp to YYYYMMDD integer using the Howard Hinnant algorithm.
    function _timestampToYYYYMMDD(uint256 timestamp) internal pure returns (uint256) {
        uint256 z = timestamp / 86400 + 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        uint256 y = yoe + era * 400;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        uint256 d = doy - (153 * mp + 2) / 5 + 1;
        uint256 m = mp < 10 ? mp + 3 : mp - 9;
        if (m <= 2) y += 1;
        return y * 10000 + m * 100 + d;
    }
}
