// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Constitution.sol";
import "./Parliament.sol";
import "./SupremeCourt.sol";

/// @title Executive
/// @notice PM nomination, confidence vote, no-confidence, caretaker government,
///         and executive formation cycle. Implements Part IV of the Constitution.
/// @dev Formation cycle state machine:
///      Idle → CrownNom1 → (fail) → CrownNom2 → (fail) → MajlisList → (fail) → Dissolution
///      At any stage, confidence vote success → PM appointed → Idle.
contract Executive {
    // ─── Enums ───────────────────────────────────────────────────────────

    enum FormationStage {
        Idle,           // PM is active, no formation in progress
        CrownNom1,      // Crown's first nomination
        CrownNom2,      // Crown's second nomination
        MajlisList,     // Majlis proposes ranked list of 3
        Dissolved       // Majlis dissolved after all stages failed
    }

    // ─── Errors ──────────────────────────────────────────────────────────

    error NotAuthorized();
    error NotMajlisMember();
    error ZeroAddress();
    error NoFormationInProgress();
    error FormationInProgress();
    error NotInStage(FormationStage expected);
    error AlreadyVoted();
    error NomineeNotSet();
    error IndexOutOfBounds();
    error PMNotActive();
    error ProgramNotPresented();
    error ParliamentCallFailed();
    error DeadlineNotReached();
    error DeadlineNotSet();
    error VotingPeriodNotElapsed();
    error DuplicateCandidate();
    error NotPrimeMinister();
    error PMVacancyNotCertified();
    error DeputyDesignationOverdue();
    error CrownNotSuspended();

    // ─── Events ──────────────────────────────────────────────────────────

    event FormationStarted(uint256 timestamp);
    event PMNominated(address indexed nominee, FormationStage stage);
    event ConfidenceVoteCast(address indexed voter, bool support);
    event ConfidenceGranted(address indexed pm, uint256 timestamp);
    event ConfidenceFailed(address indexed nominee, FormationStage stage);
    event NoConfidenceMotionFiled(uint256 timestamp);
    event NoConfidenceVoteCast(address indexed voter, bool support);
    event NoConfidencePassed(address indexed pm, uint256 timestamp);
    event NoConfidenceFailed(uint256 timestamp);
    event CaretakerActivated(uint256 timestamp);
    event MajlisListSubmitted(address[3] candidates);
    event GovernmentProgramPresented(address indexed nominee, bytes32 programHash);
    event DissolutionTriggered(uint256 timestamp);
    event DeputyPMDesignated(address indexed deputy);
    event ActingPMActivated(address indexed actingPM);
    event CrownNominationTimeout(FormationStage fromStage);

    // ─── State ───────────────────────────────────────────────────────────

    Constitution public constitution;

    /// @notice Current formation stage.
    FormationStage public stage;

    /// @notice Current PM nominee (during formation).
    address public nominee;

    /// @notice Whether the government is in caretaker mode.
    bool public caretaker;

    /// @notice Timestamp when current PM received confidence.
    uint256 public confidenceTimestamp;

    /// @notice Confidence vote tracking.
    uint256 public confYes;
    uint256 public confNo;
    uint256 public confRound; // Incremented each new vote context
    mapping(uint256 => mapping(address => bool)) public confVoted; // round => voter => voted

    /// @notice No-confidence motion tracking.
    bool public noConfidenceMotionActive;
    uint256 public noConfYes;
    uint256 public noConfNo;
    uint256 public noConfRound;
    mapping(uint256 => mapping(address => bool)) public noConfVoted;

    /// @notice Government program hash presented by the nominee.
    bytes32 public governmentProgram;

    /// @notice Majlis-proposed candidates (stage 3).
    address[3] public majlisCandidates;
    uint256 public majlisListDeadline;

    /// @notice Deadline for Majlis to submit its list when formation enters MajlisList stage.
    uint256 public majlisSubmissionDeadline;

    /// @notice Deadline for current confidence vote (prevents stuck votes).
    uint256 public confidenceVoteDeadline;

    /// @notice Start timestamp of current confidence vote (for minimum period).
    uint256 public confidenceVoteStart;

    /// @notice Deadline for current no-confidence vote (prevents stuck votes).
    uint256 public noConfidenceDeadline;

    /// @notice Deadline for Crown to nominate during CrownNom1/CrownNom2 stages.
    uint256 public crownNominationDeadline;

    /// @notice Deputy PM designated by the sitting PM (Art. IV.9).
    address public deputyPM;

    /// @notice Deadline for PM to designate a Deputy PM after receiving confidence (Art. IV.9.1).
    uint256 public deputyDesignationDeadline;

    // ─── Constructor ─────────────────────────────────────────────────────

    constructor(address _constitution) {
        if (_constitution == address(0)) revert ZeroAddress();
        constitution = Constitution(_constitution);
    }

    // ─── Modifiers ───────────────────────────────────────────────────────

    modifier onlyCrown() {
        if (msg.sender != constitution.getContract(constitution.CONTRACT_CROWN())) revert NotAuthorized();
        _;
    }

    modifier onlyParliament() {
        if (msg.sender != constitution.getContract(constitution.CONTRACT_PARLIAMENT())) revert NotAuthorized();
        _;
    }

    modifier onlyMajlisMember() {
        address parliamentAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        if (parliamentAddr.code.length == 0) revert NotMajlisMember();
        (bool success, bytes memory data) = parliamentAddr.staticcall(
            abi.encodeWithSignature("isActiveMajlisMember(address)", msg.sender)
        );
        if (!success || !abi.decode(data, (bool))) revert NotMajlisMember();
        _;
    }

    // ─── Formation Cycle ─────────────────────────────────────────────────

    /// @notice Start an executive formation cycle. Called when PM office becomes vacant.
    ///         Always begins at CrownNom1. During Crown suspension, the Senate
    ///         nominates via Parliament governance action (Art. VI.5.2).
    function startFormation() external onlyParliament {
        if (stage != FormationStage.Idle && stage != FormationStage.Dissolved) {
            revert FormationInProgress();
        }

        caretaker = true;
        nominee = address(0);
        majlisListDeadline = 0;
        majlisSubmissionDeadline = 0;
        confidenceVoteDeadline = 0;
        confidenceVoteStart = 0;
        noConfidenceDeadline = 0;
        crownNominationDeadline = 0;
        deputyDesignationDeadline = 0;
        majlisCandidates = [address(0), address(0), address(0)];
        _resetConfidenceVote();

        // Vacate PM role
        constitution.setRole(constitution.ROLE_PRIME_MINISTER(), address(0));

        stage = FormationStage.CrownNom1;
        crownNominationDeadline = block.timestamp + constitution.getParameter(
            constitution.PARAM_NOMINATION_DEADLINE()
        );

        emit FormationStarted(block.timestamp);
        emit CaretakerActivated(block.timestamp);
    }

    /// @notice Crown nominates a PM candidate (stages 1 and 2).
    ///         During Crown suspension, the Senate nominates via Parliament
    ///         governance action (Art. VI.5.2). Majlis governance actions are rejected.
    /// @param candidate The nominee address.
    function nominatePM(address candidate) external {
        if (_isCrownSuspended()) {
            // During Crown suspension, only Senate governance actions may nominate (Art. VI.5.2)
            address parliamentAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
            if (msg.sender != parliamentAddr) revert NotAuthorized();
            if (!Parliament(parliamentAddr).executingSenateAction()) revert NotAuthorized();
        } else {
            if (msg.sender != constitution.getContract(constitution.CONTRACT_CROWN())) revert NotAuthorized();
        }
        if (candidate == address(0)) revert ZeroAddress();
        if (stage != FormationStage.CrownNom1 && stage != FormationStage.CrownNom2) {
            revert NotInStage(FormationStage.CrownNom1);
        }

        nominee = candidate;
        crownNominationDeadline = 0; // Crown acted, clear nomination deadline
        _resetConfidenceVote();
        confidenceVoteStart = block.timestamp;
        confidenceVoteDeadline = block.timestamp + constitution.getParameter(
            constitution.PARAM_CONFIDENCE_VOTE_PERIOD()
        );

        emit PMNominated(candidate, stage);
    }

    /// @notice Present government program (by the nominee). Required before
    ///         confidence voting can begin per Art. IV.4.
    function presentGovernment(bytes32 programHash) external {
        if (nominee == address(0)) revert NomineeNotSet();
        if (msg.sender != nominee) revert NotAuthorized();
        governmentProgram = programHash;
        emit GovernmentProgramPresented(nominee, programHash);
    }

    /// @notice Cast a confidence vote for the current nominee.
    ///         Requires that the nominee has presented a government program first.
    function voteConfidence(bool support) external onlyMajlisMember {
        if (nominee == address(0)) revert NomineeNotSet();
        if (governmentProgram == bytes32(0)) revert ProgramNotPresented();
        if (confVoted[confRound][msg.sender]) revert AlreadyVoted();

        confVoted[confRound][msg.sender] = true;
        if (support) {
            confYes++;
        } else {
            confNo++;
        }

        emit ConfidenceVoteCast(msg.sender, support);
    }

    /// @notice Finalize the confidence vote. Anyone can call.
    function finalizeConfidenceVote() external {
        if (nominee == address(0)) revert NomineeNotSet();

        // Minimum deliberation period must elapse (unless deadline already reached)
        uint256 minPeriod = constitution.getParameter(constitution.PARAM_MIN_VOTING_PERIOD());
        if (block.timestamp < confidenceVoteStart + minPeriod && block.timestamp < confidenceVoteDeadline) {
            revert VotingPeriodNotElapsed();
        }

        // Get effective Majlis member count (excludes incapacitated members)
        address parliamentAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        if (parliamentAddr.code.length == 0) revert ParliamentCallFailed();
        (bool success, bytes memory data) = parliamentAddr.staticcall(
            abi.encodeWithSignature("effectiveMajlisMemberCount()")
        );
        if (!success) revert ParliamentCallFailed();
        uint256 majlisCount = abi.decode(data, (uint256));

        // Absolute majority required (Art. IV.4)
        if (confYes > majlisCount / 2) {
            // Confidence granted
            constitution.setRole(constitution.ROLE_PRIME_MINISTER(), nominee);
            confidenceTimestamp = block.timestamp;
            caretaker = false;
            stage = FormationStage.Idle;
            deputyDesignationDeadline = block.timestamp + constitution.getParameter(
                constitution.PARAM_DEPUTY_DESIGNATION_DEADLINE()
            );

            emit ConfidenceGranted(nominee, block.timestamp);

            nominee = address(0);
            _resetConfidenceVote();
        } else if (confYes + confNo >= majlisCount || block.timestamp >= confidenceVoteDeadline) {
            // All members voted or deadline reached — confidence failed
            _handleConfidenceFailure();
        }
    }

    // ─── No-Confidence ───────────────────────────────────────────────────

    /// @notice File a motion of no confidence against the sitting PM.
    function fileNoConfidence() external onlyMajlisMember {
        if (stage != FormationStage.Idle) revert FormationInProgress();
        if (constitution.getRole(constitution.ROLE_PRIME_MINISTER()) == address(0)) {
            revert PMNotActive();
        }
        if (noConfidenceMotionActive) revert FormationInProgress();

        noConfidenceMotionActive = true;
        noConfYes = 0;
        noConfNo = 0;
        noConfidenceDeadline = block.timestamp + constitution.getParameter(
            constitution.PARAM_CONFIDENCE_VOTE_PERIOD()
        );

        emit NoConfidenceMotionFiled(block.timestamp);
    }

    /// @notice Vote on the no-confidence motion.
    function voteNoConfidence(bool support) external onlyMajlisMember {
        if (!noConfidenceMotionActive) revert NoFormationInProgress();
        if (noConfVoted[noConfRound][msg.sender]) revert AlreadyVoted();

        noConfVoted[noConfRound][msg.sender] = true;
        if (support) {
            noConfYes++;
        } else {
            noConfNo++;
        }

        emit NoConfidenceVoteCast(msg.sender, support);
    }

    /// @notice Finalize the no-confidence vote. Anyone can call.
    function finalizeNoConfidence() external {
        if (!noConfidenceMotionActive) revert NoFormationInProgress();

        // Get effective Majlis member count (excludes incapacitated members)
        address parliamentAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        if (parliamentAddr.code.length == 0) revert ParliamentCallFailed();
        (bool success, bytes memory data) = parliamentAddr.staticcall(
            abi.encodeWithSignature("effectiveMajlisMemberCount()")
        );
        if (!success) revert ParliamentCallFailed();
        uint256 majlisCount = abi.decode(data, (uint256));

        // Art. IV.5: Within 90 days → 2/3 required; after → simple majority
        uint256 honeymoon = constitution.getParameter(constitution.PARAM_CONFIDENCE_HONEYMOON());
        bool inHoneymoon = (block.timestamp - confidenceTimestamp) <= honeymoon;
        uint256 threshold;

        if (inHoneymoon) {
            threshold = (majlisCount * 2) / 3; // 2/3
        } else {
            threshold = majlisCount / 2; // simple majority
        }

        if (noConfYes > threshold) {
            address pm = constitution.getRole(constitution.ROLE_PRIME_MINISTER());
            emit NoConfidencePassed(pm, block.timestamp);

            noConfidenceMotionActive = false;
            _resetNoConfidenceVotes();

            // Trigger formation
            constitution.setRole(constitution.ROLE_PRIME_MINISTER(), address(0));
            caretaker = true;
            nominee = address(0);
            crownNominationDeadline = 0;
            deputyDesignationDeadline = 0;
            _resetConfidenceVote();

            stage = FormationStage.CrownNom1;
            crownNominationDeadline = block.timestamp + constitution.getParameter(
                constitution.PARAM_NOMINATION_DEADLINE()
            );

            emit FormationStarted(block.timestamp);
            emit CaretakerActivated(block.timestamp);
        } else if (noConfYes + noConfNo >= majlisCount || block.timestamp >= noConfidenceDeadline) {
            // All members voted or deadline reached — motion failed
            emit NoConfidenceFailed(block.timestamp);
            noConfidenceMotionActive = false;
            _resetNoConfidenceVotes();
        }
    }

    // ─── Majlis List (Stage 3) ───────────────────────────────────────────

    /// @notice Majlis submits a ranked list of 3 PM candidates.
    ///         Must be called via a Majlis governance action (Art. IV.7.3).
    function submitMajlisList(address[3] calldata candidates) external onlyParliament {
        // Verify this is a Majlis governance action, not Senate
        address parliamentAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        if (!Parliament(parliamentAddr).executingMajlisAction()) revert NotAuthorized();

        if (stage != FormationStage.MajlisList) revert NotInStage(FormationStage.MajlisList);
        for (uint256 i = 0; i < 3; i++) {
            if (candidates[i] == address(0)) revert ZeroAddress();
        }
        // Ensure all three candidates are distinct
        if (candidates[0] == candidates[1] || candidates[0] == candidates[2] || candidates[1] == candidates[2]) revert DuplicateCandidate();

        majlisCandidates = candidates;
        majlisListDeadline = block.timestamp + constitution.getParameter(
            constitution.PARAM_CROWN_APPOINT_DEADLINE()
        );

        emit MajlisListSubmitted(candidates);

        // Crown should appoint from list, or first-ranked is auto-appointed after deadline
        nominee = candidates[0];
        _resetConfidenceVote();
    }

    /// @notice Crown appoints from the Majlis list (or auto-appoint after deadline).
    ///         During Crown suspension, the Senate appoints via Parliament
    ///         governance action (Art. VI.5.2). Majlis governance actions are rejected.
    function appointFromList(uint256 index) external {
        if (_isCrownSuspended()) {
            // During Crown suspension, only Senate governance actions may appoint (Art. VI.5.2)
            address parliamentAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
            if (msg.sender != parliamentAddr) revert NotAuthorized();
            if (!Parliament(parliamentAddr).executingSenateAction()) revert NotAuthorized();
        } else {
            if (msg.sender != constitution.getContract(constitution.CONTRACT_CROWN())) revert NotAuthorized();
        }
        if (stage != FormationStage.MajlisList) revert NotInStage(FormationStage.MajlisList);
        if (index > 2) revert IndexOutOfBounds();

        address selected = majlisCandidates[index];
        if (selected == address(0)) revert ZeroAddress();
        constitution.setRole(constitution.ROLE_PRIME_MINISTER(), selected);
        confidenceTimestamp = block.timestamp;
        caretaker = false;
        stage = FormationStage.Idle;
        deputyDesignationDeadline = block.timestamp + constitution.getParameter(
            constitution.PARAM_DEPUTY_DESIGNATION_DEADLINE()
        );

        emit ConfidenceGranted(selected, block.timestamp);
    }

    /// @notice Auto-appoint first-ranked after deadline.
    function autoAppointFromList() external {
        if (stage != FormationStage.MajlisList) revert NotInStage(FormationStage.MajlisList);
        if (majlisListDeadline == 0) revert DeadlineNotSet();
        if (block.timestamp < majlisListDeadline) revert DeadlineNotReached();

        address selected = majlisCandidates[0];
        if (selected == address(0)) revert ZeroAddress();
        constitution.setRole(constitution.ROLE_PRIME_MINISTER(), selected);
        confidenceTimestamp = block.timestamp;
        caretaker = false;
        stage = FormationStage.Idle;
        deputyDesignationDeadline = block.timestamp + constitution.getParameter(
            constitution.PARAM_DEPUTY_DESIGNATION_DEADLINE()
        );

        emit ConfidenceGranted(selected, block.timestamp);
    }

    /// @notice Trigger dissolution after Majlis fails to propose a list.
    function triggerDissolution() external onlyParliament {
        if (stage != FormationStage.MajlisList) revert NotInStage(FormationStage.MajlisList);

        stage = FormationStage.Dissolved;
        emit DissolutionTriggered(block.timestamp);

        // Cross-wire: dissolve Parliament
        address parliamentAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        if (parliamentAddr != address(0) && parliamentAddr.code.length > 0) {
            Parliament(parliamentAddr).dissolveMajlis();
        }
    }

    /// @notice Claim Majlis list submission timeout. If Majlis hasn't submitted
    ///         its ranked list by the deadline, anyone can trigger dissolution.
    function claimMajlisListTimeout() external {
        if (stage != FormationStage.MajlisList) revert NotInStage(FormationStage.MajlisList);
        if (majlisSubmissionDeadline == 0) revert DeadlineNotSet();
        if (block.timestamp < majlisSubmissionDeadline) revert DeadlineNotReached();

        stage = FormationStage.Dissolved;
        emit DissolutionTriggered(block.timestamp);

        address parliamentAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        if (parliamentAddr != address(0) && parliamentAddr.code.length > 0) {
            Parliament(parliamentAddr).dissolveMajlis();
        }
    }

    /// @notice Claim Crown nomination timeout. If the Crown hasn't nominated within
    ///         PARAM_NOMINATION_DEADLINE, anyone can advance directly to MajlisList.
    ///         Skips CrownNom2 on CrownNom1 timeout (inaction forfeits both chances).
    function claimCrownNominationTimeout() external {
        if (stage != FormationStage.CrownNom1 && stage != FormationStage.CrownNom2) {
            revert NotInStage(FormationStage.CrownNom1);
        }
        if (crownNominationDeadline == 0) revert DeadlineNotSet();
        if (block.timestamp < crownNominationDeadline) revert DeadlineNotReached();

        emit CrownNominationTimeout(stage);

        stage = FormationStage.MajlisList;
        crownNominationDeadline = 0;
        majlisSubmissionDeadline = block.timestamp + constitution.getParameter(
            constitution.PARAM_MAJLIS_LIST_DEADLINE()
        );
    }

    // ─── Deputy PM + Executive Succession (Art. IV.9) ──────────────────

    /// @notice PM designates a Deputy PM. Only the sitting PM can call.
    ///         Deputy PM designation is mandatory (Art. IV.9.1). The PM cannot
    ///         designate address(0) — to change the Deputy, a replacement must
    ///         be named simultaneously.
    /// @param deputy The Deputy PM address (must be non-zero).
    function designateDeputyPM(address deputy) external {
        if (deputy == address(0)) revert ZeroAddress();
        address pm = constitution.getRole(constitution.ROLE_PRIME_MINISTER());
        if (msg.sender != pm) revert NotPrimeMinister();

        deputyPM = deputy;
        deputyDesignationDeadline = 0; // Obligation fulfilled
        emit DeputyPMDesignated(deputy);
    }

    /// @notice Permissionless claim of PM vacancy after Court certification.
    ///         Deputy PM becomes Acting PM with caretaker powers (Art. IV.9.3).
    ///         If no Deputy (edge case: PM incapacitated before designation deadline),
    ///         PM role is vacated; the Crown should designate an Acting PM via
    ///         designateActingPM(). In both cases, the formation cycle starts.
    function claimPMVacancy() external {
        // Verify Court certification of PM vacancy — hash includes current PM address
        // so each vacancy needs its own certification (prevents reuse across PMs)
        address courtAddr = constitution.getContract(constitution.CONTRACT_SUPREME_COURT());
        address currentPM = constitution.getRole(constitution.ROLE_PRIME_MINISTER());
        bytes32 factHash = keccak256(abi.encodePacked("PM_VACANCY", currentPM));
        if (!SupremeCourt(courtAddr).isFactCertified(factHash)) revert PMVacancyNotCertified();

        // Enter formation/caretaker mode
        caretaker = true;
        nominee = address(0);
        majlisListDeadline = 0;
        majlisSubmissionDeadline = 0;
        confidenceVoteDeadline = 0;
        confidenceVoteStart = 0;
        noConfidenceDeadline = 0;
        crownNominationDeadline = 0;
        deputyDesignationDeadline = 0;
        majlisCandidates = [address(0), address(0), address(0)];
        _resetConfidenceVote();

        stage = FormationStage.CrownNom1;
        crownNominationDeadline = block.timestamp + constitution.getParameter(
            constitution.PARAM_NOMINATION_DEADLINE()
        );

        if (deputyPM != address(0)) {
            // Deputy PM becomes Acting PM with caretaker powers
            constitution.setRole(constitution.ROLE_PRIME_MINISTER(), deputyPM);
            emit ActingPMActivated(deputyPM);
            deputyPM = address(0);
        } else {
            // Edge case: PM incapacitated before designating Deputy (Art. IV.9.4).
            // PM role vacated; Crown should use designateActingPM().
            constitution.setRole(constitution.ROLE_PRIME_MINISTER(), address(0));
        }

        emit FormationStarted(block.timestamp);
        emit CaretakerActivated(block.timestamp);
    }

    /// @notice Crown designates an Acting PM when both PM and Deputy are dead.
    ///         Called by authorized contracts (Crown.sol wrapper).
    ///         Formation cycle must already be in progress.
    /// @param acting The Acting PM address.
    function designateActingPM(address acting) external onlyCrown {
        if (acting == address(0)) revert ZeroAddress();
        if (stage == FormationStage.Idle) revert NoFormationInProgress();

        constitution.setRole(constitution.ROLE_PRIME_MINISTER(), acting);
        emit ActingPMActivated(acting);
    }

    // ─── PM Justice Nomination During Crown Suspension (Art. V.3) ──────
    //     When Crown is suspended, PM exercises Crown nomination powers.
    //     Senate confirmation still required (unchanged).

    /// @notice PM nominates a justice candidate when Crown is suspended.
    /// @param candidate The justice candidate address.
    /// @param seat The seat number (0-11) to fill.
    function nominateJusticeDuringSuspension(address candidate, uint256 seat) external {
        address pm = constitution.getRole(constitution.ROLE_PRIME_MINISTER());
        if (msg.sender != pm) revert NotPrimeMinister();
        if (!_isCrownSuspended()) revert CrownNotSuspended();
        if (_isDeputyOverdue()) revert DeputyDesignationOverdue();
        if (candidate == address(0)) revert ZeroAddress();

        address courtAddr = constitution.getContract(constitution.CONTRACT_SUPREME_COURT());
        SupremeCourt(courtAddr).nominateJustice(candidate, seat);
    }

    /// @notice PM makes second justice nomination during Crown suspension.
    /// @param candidate The second nominee (must differ from the first).
    /// @param seat The seat number.
    function nominateJusticeSecondDuringSuspension(address candidate, uint256 seat) external {
        address pm = constitution.getRole(constitution.ROLE_PRIME_MINISTER());
        if (msg.sender != pm) revert NotPrimeMinister();
        if (!_isCrownSuspended()) revert CrownNotSuspended();
        if (_isDeputyOverdue()) revert DeputyDesignationOverdue();
        if (candidate == address(0)) revert ZeroAddress();

        address courtAddr = constitution.getContract(constitution.CONTRACT_SUPREME_COURT());
        SupremeCourt(courtAddr).nominateJusticeSecond(candidate, seat);
    }

    /// @notice PM picks from the Senate's ranked list during Crown suspension.
    /// @param seat The seat number.
    /// @param index Which candidate from the list (0, 1, or 2).
    function appointJusticeFromListDuringSuspension(uint256 seat, uint256 index) external {
        address pm = constitution.getRole(constitution.ROLE_PRIME_MINISTER());
        if (msg.sender != pm) revert NotPrimeMinister();
        if (!_isCrownSuspended()) revert CrownNotSuspended();
        if (_isDeputyOverdue()) revert DeputyDesignationOverdue();

        address courtAddr = constitution.getContract(constitution.CONTRACT_SUPREME_COURT());
        SupremeCourt(courtAddr).appointFromList(seat, index);
    }

    // ─── Generic PM Execute ─────────────────────────────────────────────
    //     The PM can call any gated function on any registered governance
    //     contract through this single entry point. Target contracts enforce
    //     their own caller-specific modifiers (e.g., onlyExecutive).

    error InvalidTarget();
    error ExecutionFailed();

    /// @notice Execute a PM action on a registered governance contract.
    ///         msg.sender must be the PM.
    /// @param target The registered governance contract to call.
    /// @param data The encoded function call.
    function executePMAction(address target, bytes calldata data) external {
        address pmAddr = constitution.getRole(constitution.ROLE_PRIME_MINISTER());
        if (msg.sender != pmAddr) revert NotPrimeMinister();
        if (!_isRegisteredContract(target)) revert InvalidTarget();
        (bool success,) = target.call(data);
        if (!success) revert ExecutionFailed();
    }

    /// @dev Check if an address is a registered governance contract.
    function _isRegisteredContract(address target) internal view returns (bool) {
        return target == address(constitution) ||
               target == constitution.getContract(constitution.CONTRACT_CITIZEN_REGISTRY()) ||
               target == constitution.getContract(constitution.CONTRACT_CROWN()) ||
               target == constitution.getContract(constitution.CONTRACT_PARLIAMENT()) ||
               target == constitution.getContract(constitution.CONTRACT_SUPREME_COURT()) ||
               target == constitution.getContract(constitution.CONTRACT_ELECTION()) ||
               target == constitution.getContract(constitution.CONTRACT_REFERENDUM()) ||
               target == constitution.getContract(constitution.CONTRACT_BUDGET()) ||
               target == constitution.getContract(constitution.CONTRACT_PROVINCIAL_COUNCIL());
    }

    // ─── View Functions ──────────────────────────────────────────────────

    /// @notice Check if the government is in caretaker mode.
    function isCaretaker() external view returns (bool) {
        return caretaker;
    }

    /// @notice Check if the PM has failed to designate a Deputy PM within the deadline (Art. IV.9.2).
    ///         When true, the PM may not submit new legislation or make judicial nominations.
    function isDeputyOverdue() external view returns (bool) {
        return _isDeputyOverdue();
    }

    // ─── Internal ────────────────────────────────────────────────────────

    /// @dev Check if deputy PM designation is overdue (Art. IV.9.2).
    function _isDeputyOverdue() internal view returns (bool) {
        return deputyDesignationDeadline != 0 && block.timestamp > deputyDesignationDeadline && deputyPM == address(0);
    }

    /// @dev Check if Crown is suspended via staticcall (avoids circular import).
    function _isCrownSuspended() internal view returns (bool) {
        address crownAddr = constitution.getContract(constitution.CONTRACT_CROWN());
        if (crownAddr.code.length == 0) return false;
        (bool s, bytes memory d) = crownAddr.staticcall(abi.encodeWithSignature("suspended()"));
        return s && d.length >= 32 && abi.decode(d, (bool));
    }

    function _handleConfidenceFailure() internal {
        emit ConfidenceFailed(nominee, stage);

        nominee = address(0);
        _resetConfidenceVote();

        if (stage == FormationStage.CrownNom1) {
            stage = FormationStage.CrownNom2;
            crownNominationDeadline = block.timestamp + constitution.getParameter(
                constitution.PARAM_NOMINATION_DEADLINE()
            );
        } else if (stage == FormationStage.CrownNom2) {
            stage = FormationStage.MajlisList;
            // Set deadline for Majlis to submit its list
            majlisSubmissionDeadline = block.timestamp + constitution.getParameter(
                constitution.PARAM_MAJLIS_LIST_DEADLINE()
            );
        }
        // MajlisList stage failure is handled by triggerDissolution
    }

    function _resetConfidenceVote() internal {
        confYes = 0;
        confNo = 0;
        confRound++; // New round invalidates all previous votes
        governmentProgram = bytes32(0);
    }

    function _resetNoConfidenceVotes() internal {
        noConfYes = 0;
        noConfNo = 0;
        noConfRound++;
    }
}
