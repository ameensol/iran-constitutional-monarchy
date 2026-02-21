// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Constitution.sol";
import "./Executive.sol";
import "./Parliament.sol";

/// @title SupremeCourt
/// @notice Highest judicial authority — constitutional review, disputes, fact certification.
///         Implements Part V of the Constitution.
/// @dev 12 justices, 9-year non-renewable terms, renewed by thirds.
///      "Process, not judgment" exemplar: the contract tracks procedural steps
///      (petitions filed, votes cast, rulings recorded), not legal reasoning.
contract SupremeCourt {
    // ─── Enums ───────────────────────────────────────────────────────────

    enum ReviewStatus { Voting, Constitutional, Unconstitutional, Executed }
    enum DisputeStatus { Voting, Resolved }
    enum AppointmentStage {
        Idle,           // No active appointment for this seat
        CrownNom1,      // Crown has made first nomination, awaiting Senate vote
        CrownNom2,      // Crown has made second nomination, awaiting Senate vote
        SenateList,     // Senate rejected both; Senate proposes ranked list of 3
        CrownFromList,  // Crown picks from Senate's list (or auto-appoint after deadline)
        Completed       // Appointment finalized
    }
    // ─── Structs ─────────────────────────────────────────────────────────

    struct Justice {
        address addr;
        uint256 termStart;
        uint256 termEnd;
        bool active;
    }

    struct JusticeAppointment {
        uint256 seat;
        AppointmentStage stage;
        address nominee1;       // Crown's first nominee
        address nominee2;       // Crown's second nominee
        address[3] senateList;  // Senate's ranked list of 3
        uint256 stageDeadline;  // Deadline for current stage
    }

    struct ConstitutionalReview {
        uint256 lawId;
        bytes32 petitionHash;
        address petitioner;
        ReviewStatus status;
        uint256 yesConstitutional;
        uint256 noUnconstitutional;
        uint256 filedAt;
    }

    struct Dispute {
        bytes32 disputeHash;
        address petitioner;
        DisputeStatus status;
        bytes32 rulingHash;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 filedAt;
    }

    // ─── Errors ──────────────────────────────────────────────────────────

    error NotAuthorized();
    error NotJustice();
    error ZeroAddress();
    error CourtFull();
    error AlreadyJustice(address addr);
    error NotActiveJustice(address addr);
    error AlreadyVoted();
    error InvalidReview();
    error InvalidDispute();
    error NotInStatus();
    error QuorumNotMet();
    error TermNotExpired(address justice);
    error CaretakerModeActive();
    error VacancyNotCertified();
    error FactAlreadyCertified();
    error FactCertPeriodNotElapsed();
    error AppointmentNotInStage(AppointmentStage expected);
    error PreviouslyServed(address justice);
    error DeadlineNotExpired();
    error NoActiveAppointment();
    error SeatOccupied(uint256 seat);
    error NotParliamentMember();
    error PetitionAlreadySigned();
    error PetitionAlreadyFiled();
    error PetitionExpired();
    error NoActiveJustices();
    error IndexOutOfBounds();
    error DuplicatePetition();
    error InvalidPetition();
    error NomineeNotDistinct();
    error DuplicateCandidate();
    error LivenessChallengeActive();
    error NeitherLivenessConditionMet();
    error AlreadyPetitioned();

    // ─── Events ──────────────────────────────────────────────────────────

    event JusticeAppointed(address indexed justice, uint256 seat, uint256 termEnd);
    event JusticeRemoved(address indexed justice, uint256 seat);
    event ReviewFiled(uint256 indexed reviewId, uint256 lawId, address petitioner);
    event ReviewVoteCast(uint256 indexed reviewId, address indexed justice, bool constitutional);
    event ReviewDecided(uint256 indexed reviewId, ReviewStatus outcome);
    event DisputeFiled(uint256 indexed disputeId, address petitioner);
    event DisputeVoteCast(uint256 indexed disputeId, address indexed justice, bool support);
    event DisputeResolved(uint256 indexed disputeId, bytes32 rulingHash);
    event FactVoteCast(bytes32 indexed factHash, address indexed justice);
    event FactCertified(bytes32 indexed factHash, uint256 timestamp);
    event FactCertificationFailed(bytes32 indexed factHash, uint256 round);
    event NominationMade(uint256 indexed seat, address nominee, AppointmentStage stage);
    event NominationConfirmed(uint256 indexed seat, address nominee);
    event NominationRejected(uint256 indexed seat, address nominee, AppointmentStage stage);
    event SenateListProposed(uint256 indexed seat, address[3] candidates);
    event JusticeSeated(uint256 indexed seat, address justice);
    event PetitionCreated(uint256 indexed petitionId, uint256 lawId, Parliament.Chamber chamber);
    event PetitionSigned(uint256 indexed petitionId, address indexed signer);
    event PetitionThresholdMet(uint256 indexed petitionId, uint256 reviewId);
    event LivenessChallenged(uint256 deadline);
    event LivenessPetitionCast(address indexed petitioner);
    event EmergencyVacated(uint256 indexed seat);
    event JusticeCheckedIn(address indexed justice);

    // ─── State ───────────────────────────────────────────────────────────

    Constitution public constitution;

    /// @notice Justice seats (fixed-size array, indexed by seat number).
    Justice[12] public justices;
    uint256 public activeJusticeCount;

    /// @notice Track which addresses are active justices.
    mapping(address => bool) public isActiveJustice;
    mapping(address => uint256) public justiceSeat; // address → seat index

    /// @notice Constitutional reviews.
    ConstitutionalReview[] public reviews;
    mapping(uint256 => mapping(address => bool)) public reviewVoted;

    /// @notice Disputes.
    Dispute[] public disputes;
    mapping(uint256 => mapping(address => bool)) public disputeVoted;

    /// @notice Certified facts.
    mapping(bytes32 => bool) public certifiedFacts;

    /// @notice Fact certification round counter (incremented on failed certification).
    mapping(bytes32 => uint256) public factCertRound;
    /// @notice Fact certification votes: factHash → round → justice → voted.
    mapping(bytes32 => mapping(uint256 => mapping(address => bool))) public factVotedInRound;
    /// @notice Fact certification vote counts per round.
    mapping(bytes32 => mapping(uint256 => uint256)) public factYesVotesInRound;
    mapping(bytes32 => mapping(uint256 => uint256)) public factNoVotesInRound;
    /// @notice Fact certification start timestamp (0 = not started).
    mapping(bytes32 => uint256) public factCertStarted;

    /// @notice Active appointment processes per seat.
    mapping(uint256 => JusticeAppointment) public appointments;

    /// @notice Collective petitions for constitutional review (Art. V.5).
    struct CollectivePetition {
        uint256 lawId;
        bytes32 petitionHash;
        Parliament.Chamber chamber;
        uint256 signatureCount;
        bool filed; // true once converted to a review
        uint256 reviewId;
        uint256 createdAt;
    }
    CollectivePetition[] public petitions;
    mapping(uint256 => mapping(address => bool)) public petitionSigned;
    /// @notice Track existing petitions per (chamber, lawId) to prevent duplicates.
    mapping(uint8 => mapping(uint256 => bool)) public petitionExists;

    /// @notice Addresses that have previously served as justices (non-renewable).
    mapping(address => bool) public hasServed;

    // ─── Court Liveness (Art. V.8) ──────────────────────────────────────

    /// @notice Timestamp of last court activity (any justice vote action).
    ///         Initialized when the first justice is seated.
    uint256 public lastCourtActivity;

    /// @notice Liveness challenge deadline (0 = no active challenge).
    uint256 public livenessDeadline;

    /// @notice Round counter for liveness petition tracking (incremented on reset).
    uint256 public livenessChallengeRound;

    /// @notice Petition counts per chamber for current round.
    uint256 public majlisLivenessPetitions;
    uint256 public senateLivenessPetitions;

    /// @notice Track who has petitioned in the current round.
    mapping(uint256 => mapping(address => bool)) public hasLivenessPetitioned;

    // ─── Constructor ─────────────────────────────────────────────────────

    constructor(address _constitution) {
        if (_constitution == address(0)) revert ZeroAddress();
        constitution = Constitution(_constitution);
    }

    // ─── Modifiers ───────────────────────────────────────────────────────

    modifier onlyCrownOrExecutive() {
        address s = msg.sender;
        if (s != constitution.getContract(constitution.CONTRACT_CROWN()) &&
            s != constitution.getContract(constitution.CONTRACT_EXECUTIVE())) revert NotAuthorized();
        _;
    }

    modifier onlyParliament() {
        if (msg.sender != constitution.getContract(constitution.CONTRACT_PARLIAMENT())) revert NotAuthorized();
        _;
    }

    modifier onlyJustice() {
        if (!isActiveJustice[msg.sender]) revert NotJustice();
        _;
    }

    // ─── Justice Appointment State Machine ────────────────────────────────
    // Flow per Art. V.3: Crown nominates → Senate confirms/rejects (30d deadline)
    //   → If rejected: Crown nominates again → Senate confirms/rejects
    //   → If rejected again: Senate proposes ranked list of 3 (30d)
    //   → Crown picks from list (14d) or first-ranked auto-appointed
    //   → If Senate fails to propose list: Crown appoints either previous nominee

    /// @notice Crown nominates a candidate for a vacant seat. Starts or continues the process.
    function nominateJustice(address nominee, uint256 seat) external onlyCrownOrExecutive {
        if (nominee == address(0)) revert ZeroAddress();
        if (seat >= 12) revert CourtFull();
        // Caretaker check: skip during Crown suspension (emergency court recovery)
        if (!_isCrownSuspended()) {
            address execAddr = constitution.getContract(constitution.CONTRACT_EXECUTIVE());
            if (execAddr != address(0) && execAddr.code.length > 0 && Executive(execAddr).isCaretaker()) revert CaretakerModeActive();
        }
        if (isActiveJustice[nominee]) revert AlreadyJustice(nominee);
        if (hasServed[nominee]) revert PreviouslyServed(nominee);
        if (justices[seat].active) revert SeatOccupied(seat);

        JusticeAppointment storage appt = appointments[seat];
        uint256 senateDeadline = constitution.getParameter(constitution.PARAM_SENATE_REVIEW_PERIOD());

        if (appt.stage == AppointmentStage.Idle || appt.stage == AppointmentStage.Completed) {
            // First nomination
            appt.seat = seat;
            appt.stage = AppointmentStage.CrownNom1;
            appt.nominee1 = nominee;
            appt.nominee2 = address(0);
            appt.stageDeadline = block.timestamp + senateDeadline;
            emit NominationMade(seat, nominee, AppointmentStage.CrownNom1);
        } else if (appt.stage == AppointmentStage.CrownNom2) {
            // This is the second nomination after first was rejected
            // Actually, Crown calls nominateJustice again after rejection advances stage
            revert AppointmentNotInStage(AppointmentStage.Idle);
        } else {
            revert AppointmentNotInStage(AppointmentStage.Idle);
        }
    }

    /// @notice Senate confirms the current nominee. Called via Senate governance action.
    function confirmNominee(uint256 seat) external onlyParliament {
        _requireSenateAction();
        JusticeAppointment storage appt = appointments[seat];
        if (appt.stage != AppointmentStage.CrownNom1 && appt.stage != AppointmentStage.CrownNom2) {
            revert AppointmentNotInStage(AppointmentStage.CrownNom1);
        }

        address nominee = appt.stage == AppointmentStage.CrownNom1 ? appt.nominee1 : appt.nominee2;
        appt.stage = AppointmentStage.Completed;
        _seatJustice(nominee, seat);

        emit NominationConfirmed(seat, nominee);
    }

    /// @notice Senate rejects the current nominee. Called via Senate governance action.
    function rejectNominee(uint256 seat) external onlyParliament {
        _requireSenateAction();
        JusticeAppointment storage appt = appointments[seat];
        uint256 senateDeadline = constitution.getParameter(constitution.PARAM_SENATE_REVIEW_PERIOD());

        if (appt.stage == AppointmentStage.CrownNom1) {
            // First rejection → Crown gets second nomination within deadline
            appt.stage = AppointmentStage.CrownNom2;
            uint256 nomDeadline = constitution.getParameter(constitution.PARAM_NOMINATION_DEADLINE());
            appt.stageDeadline = block.timestamp + nomDeadline;
            emit NominationRejected(seat, appt.nominee1, AppointmentStage.CrownNom1);
        } else if (appt.stage == AppointmentStage.CrownNom2) {
            // Second rejection → Senate must propose list
            appt.stage = AppointmentStage.SenateList;
            appt.stageDeadline = block.timestamp + senateDeadline;
            emit NominationRejected(seat, appt.nominee2, AppointmentStage.CrownNom2);
        } else {
            revert AppointmentNotInStage(AppointmentStage.CrownNom1);
        }
    }

    /// @notice Crown makes second nomination after first was rejected.
    function nominateJusticeSecond(address nominee, uint256 seat) external onlyCrownOrExecutive {
        if (nominee == address(0)) revert ZeroAddress();
        if (isActiveJustice[nominee]) revert AlreadyJustice(nominee);
        if (hasServed[nominee]) revert PreviouslyServed(nominee);

        JusticeAppointment storage appt = appointments[seat];
        if (appt.stage != AppointmentStage.CrownNom2) revert AppointmentNotInStage(AppointmentStage.CrownNom2);
        if (nominee == appt.nominee1) revert NomineeNotDistinct();

        uint256 senateDeadline = constitution.getParameter(constitution.PARAM_SENATE_REVIEW_PERIOD());
        appt.nominee2 = nominee;
        appt.stageDeadline = block.timestamp + senateDeadline;

        emit NominationMade(seat, nominee, AppointmentStage.CrownNom2);
    }

    /// @notice Senate proposes a ranked list of 3 candidates after rejecting both nominees.
    function proposeSenateList(uint256 seat, address[3] calldata candidates) external onlyParliament {
        _requireSenateAction();
        JusticeAppointment storage appt = appointments[seat];
        if (appt.stage != AppointmentStage.SenateList) revert AppointmentNotInStage(AppointmentStage.SenateList);

        for (uint256 i = 0; i < 3; i++) {
            if (candidates[i] == address(0)) revert ZeroAddress();
            if (isActiveJustice[candidates[i]]) revert AlreadyJustice(candidates[i]);
            if (hasServed[candidates[i]]) revert PreviouslyServed(candidates[i]);
        }
        // Ensure all three candidates are distinct
        if (candidates[0] == candidates[1] || candidates[0] == candidates[2] || candidates[1] == candidates[2]) revert DuplicateCandidate();

        uint256 crownDeadline = constitution.getParameter(constitution.PARAM_CROWN_JUSTICE_APPOINT_DEADLINE());
        appt.senateList = candidates;
        appt.stage = AppointmentStage.CrownFromList;
        appt.stageDeadline = block.timestamp + crownDeadline;

        emit SenateListProposed(seat, candidates);
    }

    /// @notice Crown picks from the Senate's ranked list.
    function appointFromList(uint256 seat, uint256 index) external onlyCrownOrExecutive {
        JusticeAppointment storage appt = appointments[seat];
        if (appt.stage != AppointmentStage.CrownFromList) revert AppointmentNotInStage(AppointmentStage.CrownFromList);
        if (index >= 3) revert IndexOutOfBounds();

        address chosen = appt.senateList[index];
        appt.stage = AppointmentStage.Completed;
        _seatJustice(chosen, seat);
    }

    /// @notice Claim deadline timeout at any appointment stage. Anyone can call.
    function claimAppointmentTimeout(uint256 seat) external {
        JusticeAppointment storage appt = appointments[seat];
        if (appt.stageDeadline == 0 || block.timestamp < appt.stageDeadline) revert DeadlineNotExpired();

        if (appt.stage == AppointmentStage.CrownNom1) {
            // Senate didn't act within 30 days → deemed confirmed (Art. V.3.2)
            appt.stage = AppointmentStage.Completed;
            _seatJustice(appt.nominee1, seat);
            emit NominationConfirmed(seat, appt.nominee1);
        } else if (appt.stage == AppointmentStage.CrownNom2) {
            if (appt.nominee2 == address(0)) {
                // Crown didn't make second nomination within deadline → Senate proposes list
                uint256 senateDeadline = constitution.getParameter(constitution.PARAM_SENATE_REVIEW_PERIOD());
                appt.stage = AppointmentStage.SenateList;
                appt.stageDeadline = block.timestamp + senateDeadline;
            } else {
                // Senate didn't act on second nominee within 30 days → deemed confirmed
                appt.stage = AppointmentStage.Completed;
                _seatJustice(appt.nominee2, seat);
                emit NominationConfirmed(seat, appt.nominee2);
            }
        } else if (appt.stage == AppointmentStage.SenateList) {
            // Senate failed to propose list → Crown appoints either previous nominee (Art. V.3.6)
            appt.stage = AppointmentStage.Completed;
            _seatJustice(appt.nominee1, seat);
            emit NominationConfirmed(seat, appt.nominee1);
        } else if (appt.stage == AppointmentStage.CrownFromList) {
            // Crown didn't pick → first-ranked auto-appointed (Art. V.3.5)
            appt.stage = AppointmentStage.Completed;
            _seatJustice(appt.senateList[0], seat);
        } else {
            revert NoActiveAppointment();
        }
    }

    /// @notice Get the current appointment stage for a seat.
    function getAppointmentStage(uint256 seat) external view returns (AppointmentStage) {
        return appointments[seat].stage;
    }

    /// @notice Remove a justice whose term has expired. Anyone can call.
    function removeExpiredJustice(uint256 seat) external {
        if (seat >= 12 || !justices[seat].active) revert NotActiveJustice(address(0));
        if (block.timestamp < justices[seat].termEnd) revert TermNotExpired(justices[seat].addr);
        _removeJustice(seat);
    }

    /// @notice Vacate a justice seat after the Court has certified the vacancy fact.
    ///         Handles incapacity, misconduct conviction, or any other grounds.
    ///         The fact hash is: keccak256(abi.encodePacked("JUSTICE_VACANCY", seat)).
    ///         Anyone can call after the fact is certified.
    function vacateJusticeSeat(uint256 seat) external {
        if (seat >= 12 || !justices[seat].active) revert NotActiveJustice(address(0));
        bytes32 factHash = keccak256(abi.encodePacked("JUSTICE_VACANCY", seat));
        if (!certifiedFacts[factHash]) revert VacancyNotCertified();
        _removeJustice(seat);
    }

    // ─── Constitutional Review ───────────────────────────────────────────

    /// @notice File a petition for constitutional review of a law.
    /// @param lawId The ID of the law to review.
    /// @param petitionHash Hash of the petition document.
    function fileConstitutionalReview(uint256 lawId, bytes32 petitionHash) external returns (uint256 reviewId) {
        // Standing check: petitioner must be PM, Monarch, Crown, Executive, or Parliament.
        // For 1/10 collective petition standing, see createCollectivePetition().
        address pm = constitution.getRole(constitution.ROLE_PRIME_MINISTER());
        address monarch = constitution.getRole(constitution.ROLE_MONARCH());
        address s = msg.sender;
        bool hasStanding = (s == pm) ||
                          (s == monarch) ||
                          s == constitution.getContract(constitution.CONTRACT_CROWN()) ||
                          s == constitution.getContract(constitution.CONTRACT_EXECUTIVE()) ||
                          s == constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        if (!hasStanding) revert NotAuthorized();

        reviewId = reviews.length;
        reviews.push(ConstitutionalReview({
            lawId: lawId,
            petitionHash: petitionHash,
            petitioner: msg.sender,
            status: ReviewStatus.Voting,
            yesConstitutional: 0,
            noUnconstitutional: 0,
            filedAt: block.timestamp
        }));

        emit ReviewFiled(reviewId, lawId, msg.sender);
    }

    /// @notice Vote on a constitutional review.
    /// @param reviewId The review ID.
    /// @param isConstitutional True if the justice finds the law constitutional.
    function voteOnReview(uint256 reviewId, bool isConstitutional) external onlyJustice {
        _recordActivity();
        if (reviewId >= reviews.length) revert InvalidReview();
        if (reviews[reviewId].status != ReviewStatus.Voting) revert NotInStatus();
        if (reviewVoted[reviewId][msg.sender]) revert AlreadyVoted();

        reviewVoted[reviewId][msg.sender] = true;
        if (isConstitutional) {
            reviews[reviewId].yesConstitutional++;
        } else {
            reviews[reviewId].noUnconstitutional++;
        }

        emit ReviewVoteCast(reviewId, msg.sender, isConstitutional);
    }

    /// @notice Finalize a constitutional review. Requires effective quorum.
    function finalizeReview(uint256 reviewId) external {
        if (reviewId >= reviews.length) revert InvalidReview();
        ConstitutionalReview storage review = reviews[reviewId];
        if (review.status != ReviewStatus.Voting) revert NotInStatus();

        uint256 totalVotes = review.yesConstitutional + review.noUnconstitutional;
        if (totalVotes < _effectiveQuorum()) revert QuorumNotMet();

        if (review.yesConstitutional > review.noUnconstitutional) {
            review.status = ReviewStatus.Constitutional;
        } else {
            review.status = ReviewStatus.Unconstitutional;
        }

        emit ReviewDecided(reviewId, review.status);
    }

    /// @notice Push a finalized review outcome to Parliament, updating the bill's status.
    ///         Anyone can call this after a review is decided. Can only be called once.
    /// @param reviewId The review ID.
    function executeReviewOutcome(uint256 reviewId) external {
        if (reviewId >= reviews.length) revert InvalidReview();
        ConstitutionalReview storage review = reviews[reviewId];

        address parliamentAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        Parliament parliament = Parliament(parliamentAddr);

        if (review.status == ReviewStatus.Constitutional) {
            review.status = ReviewStatus.Executed;
            parliament.markConstitutional(review.lawId);
        } else if (review.status == ReviewStatus.Unconstitutional) {
            review.status = ReviewStatus.Executed;
            parliament.markVetoed(review.lawId);
        } else {
            revert NotInStatus(); // Review not finalized yet or already executed
        }
    }

    // ─── Collective Petition Standing (Art. V.5) ────────────────────────
    //     1/10 of Majlis or Senate members can collectively petition for
    //     constitutional review. Once the threshold is met, the petition
    //     is auto-filed as a constitutional review.

    /// @notice Create a collective petition. The creator automatically signs.
    /// @param lawId The law to challenge.
    /// @param petitionHash Hash of the petition document.
    /// @param chamber Which chamber's members are signing (Majlis or Senate).
    function createCollectivePetition(
        uint256 lawId,
        bytes32 petitionHash,
        Parliament.Chamber chamber
    ) external returns (uint256 petitionId) {
        address parliamentAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        Parliament parliament = Parliament(parliamentAddr);

        // Caller must be an active member of the specified chamber (term not expired)
        if (chamber == Parliament.Chamber.Majlis) {
            if (!parliament.isActiveMajlisMember(msg.sender)) revert NotParliamentMember();
        } else {
            if (!parliament.isActiveSenateMember(msg.sender)) revert NotParliamentMember();
        }

        // Prevent duplicate petitions for the same (chamber, lawId)
        if (petitionExists[uint8(chamber)][lawId]) revert DuplicatePetition();
        petitionExists[uint8(chamber)][lawId] = true;

        petitionId = petitions.length;
        petitions.push(CollectivePetition({
            lawId: lawId,
            petitionHash: petitionHash,
            chamber: chamber,
            signatureCount: 1,
            filed: false,
            reviewId: 0,
            createdAt: block.timestamp
        }));
        petitionSigned[petitionId][msg.sender] = true;

        emit PetitionCreated(petitionId, lawId, chamber);
        emit PetitionSigned(petitionId, msg.sender);

        // Check if 1 signature is enough (small chamber)
        _checkPetitionThreshold(petitionId, parliament);
    }

    /// @notice Sign an existing collective petition.
    /// @param petitionId The petition to sign.
    function signPetition(uint256 petitionId) external {
        if (petitionId >= petitions.length) revert InvalidPetition();
        CollectivePetition storage petition = petitions[petitionId];
        if (petition.filed) revert PetitionAlreadyFiled();
        uint256 timeout = constitution.getParameter(constitution.PARAM_PETITION_TIMEOUT());
        if (block.timestamp > petition.createdAt + timeout) revert PetitionExpired();
        if (petitionSigned[petitionId][msg.sender]) revert PetitionAlreadySigned();

        address parliamentAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        Parliament parliament = Parliament(parliamentAddr);

        // Caller must be an active member of the petition's chamber (term not expired)
        if (petition.chamber == Parliament.Chamber.Majlis) {
            if (!parliament.isActiveMajlisMember(msg.sender)) revert NotParliamentMember();
        } else {
            if (!parliament.isActiveSenateMember(msg.sender)) revert NotParliamentMember();
        }

        petitionSigned[petitionId][msg.sender] = true;
        petition.signatureCount++;

        emit PetitionSigned(petitionId, msg.sender);

        _checkPetitionThreshold(petitionId, parliament);
    }

    /// @dev Check if petition has reached 1/10 threshold and auto-file review.
    function _checkPetitionThreshold(uint256 petitionId, Parliament parliament) internal {
        CollectivePetition storage petition = petitions[petitionId];
        if (petition.filed) return;

        uint256 memberCount;
        if (petition.chamber == Parliament.Chamber.Majlis) {
            memberCount = parliament.majlisMemberCount();
        } else {
            memberCount = parliament.senateMemberCount();
        }

        // Threshold: 1/10 of chamber (ceiling division), minimum 1
        uint256 threshold = (memberCount + 9) / 10;

        if (petition.signatureCount >= threshold) {
            petition.filed = true;

            // Auto-file constitutional review
            uint256 reviewId = reviews.length;
            reviews.push(ConstitutionalReview({
                lawId: petition.lawId,
                petitionHash: petition.petitionHash,
                petitioner: address(this), // Court itself is the petitioner (collective)
                status: ReviewStatus.Voting,
                yesConstitutional: 0,
                noUnconstitutional: 0,
                filedAt: block.timestamp
            }));
            petition.reviewId = reviewId;

            emit PetitionThresholdMet(petitionId, reviewId);
            emit ReviewFiled(reviewId, petition.lawId, address(this));
        }
    }

    /// @notice Get the number of collective petitions.
    function petitionCount() external view returns (uint256) {
        return petitions.length;
    }

    // ─── Dispute Resolution ──────────────────────────────────────────────

    /// @notice File a dispute between constitutional organs.
    function fileDispute(bytes32 disputeHash) external returns (uint256 disputeId) {
        // Standing: PM, Monarch, Crown, Executive, or Parliament
        address pm = constitution.getRole(constitution.ROLE_PRIME_MINISTER());
        address monarch = constitution.getRole(constitution.ROLE_MONARCH());
        address s = msg.sender;
        bool hasStanding = (s == pm) ||
                          (s == monarch) ||
                          s == constitution.getContract(constitution.CONTRACT_CROWN()) ||
                          s == constitution.getContract(constitution.CONTRACT_EXECUTIVE()) ||
                          s == constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        if (!hasStanding) revert NotAuthorized();

        disputeId = disputes.length;
        disputes.push(Dispute({
            disputeHash: disputeHash,
            petitioner: msg.sender,
            status: DisputeStatus.Voting,
            rulingHash: bytes32(0),
            yesVotes: 0,
            noVotes: 0,
            filedAt: block.timestamp
        }));

        emit DisputeFiled(disputeId, msg.sender);
    }

    /// @notice Vote on a dispute.
    function voteOnDispute(uint256 disputeId, bool support) external onlyJustice {
        _recordActivity();
        if (disputeId >= disputes.length) revert InvalidDispute();
        if (disputes[disputeId].status != DisputeStatus.Voting) revert NotInStatus();
        if (disputeVoted[disputeId][msg.sender]) revert AlreadyVoted();

        disputeVoted[disputeId][msg.sender] = true;
        if (support) {
            disputes[disputeId].yesVotes++;
        } else {
            disputes[disputeId].noVotes++;
        }

        emit DisputeVoteCast(disputeId, msg.sender, support);
    }

    /// @notice Finalize a dispute with a ruling hash. Only justices can finalize.
    function finalizeDispute(uint256 disputeId, bytes32 rulingHash) external onlyJustice {
        _recordActivity();
        if (disputeId >= disputes.length) revert InvalidDispute();
        Dispute storage dispute = disputes[disputeId];
        if (dispute.status != DisputeStatus.Voting) revert NotInStatus();

        uint256 totalVotes = dispute.yesVotes + dispute.noVotes;
        if (totalVotes < _effectiveQuorum()) revert QuorumNotMet();

        dispute.rulingHash = rulingHash;
        dispute.status = DisputeStatus.Resolved;

        emit DisputeResolved(disputeId, rulingHash);
    }

    // ─── Fact Certification ──────────────────────────────────────────────

    /// @notice Vote on a fact certification (vacancy, incapacity, etc.).
    ///         No quorum required — deadline-based. After PARAM_FACT_CERT_PERIOD,
    ///         majority of votes cast wins. This avoids deadlock when certifying
    ///         justice incapacity at low court membership.
    /// @param factHash Hash identifying the fact being certified.
    /// @param support True to certify, false to oppose.
    function voteOnFact(bytes32 factHash, bool support) external onlyJustice {
        _recordActivity();
        if (certifiedFacts[factHash]) revert FactAlreadyCertified();
        uint256 round = factCertRound[factHash];
        if (factVotedInRound[factHash][round][msg.sender]) revert AlreadyVoted();

        // First vote starts the certification period
        if (factCertStarted[factHash] == 0) {
            factCertStarted[factHash] = block.timestamp;
        }

        factVotedInRound[factHash][round][msg.sender] = true;
        if (support) {
            factYesVotesInRound[factHash][round]++;
        } else {
            factNoVotesInRound[factHash][round]++;
        }

        emit FactVoteCast(factHash, msg.sender);
    }

    /// @notice Finalize fact certification after the voting period. Anyone can call.
    /// @param factHash The fact hash to finalize.
    function finalizeFactCertification(bytes32 factHash) external {
        if (certifiedFacts[factHash]) revert FactAlreadyCertified();
        if (factCertStarted[factHash] == 0) revert FactCertPeriodNotElapsed();

        uint256 period = constitution.getParameter(constitution.PARAM_FACT_CERT_PERIOD());
        if (block.timestamp < factCertStarted[factHash] + period) revert FactCertPeriodNotElapsed();

        uint256 round = factCertRound[factHash];
        uint256 yes = factYesVotesInRound[factHash][round];
        uint256 no = factNoVotesInRound[factHash][round];

        // Majority of votes cast wins (no quorum — intentional for incapacity certification)
        if (yes > no) {
            certifiedFacts[factHash] = true;
            emit FactCertified(factHash, block.timestamp);
        } else {
            // Votes preserved in round mapping; new round opens for retry
            factCertStarted[factHash] = 0;
            factCertRound[factHash]++;
            emit FactCertificationFailed(factHash, round);
        }
    }

    // ─── Court Liveness (Art. V.8) ─────────────────────────────────────
    //     Two-tier recovery: fast path (7d) triggered by Crown/PM/10% Parliament;
    //     slow path (14d) permissionless inactivity fallback.

    /// @notice Trigger a liveness challenge (fast path). Callable by the monarch,
    ///         the PM, or Crown contract.
    function challengeCourtLiveness() external {
        address pm = constitution.getRole(constitution.ROLE_PRIME_MINISTER());
        address monarchAddr = constitution.getRole(constitution.ROLE_MONARCH());
        address s = msg.sender;
        bool authorized = (s == pm) ||
                          (s == monarchAddr) ||
                          s == constitution.getContract(constitution.CONTRACT_CROWN());
        if (!authorized) revert NotAuthorized();
        if (livenessDeadline != 0) revert LivenessChallengeActive();

        uint256 period = constitution.getParameter(constitution.PARAM_COURT_LIVENESS_PERIOD());
        livenessDeadline = block.timestamp + period;
        emit LivenessChallenged(livenessDeadline);
    }

    /// @notice Petition for a liveness challenge. Active members of either chamber
    ///         can petition. Once 10% of a single chamber's effective members have
    ///         petitioned, the challenge auto-activates.
    function petitionCourtLiveness() external {
        if (livenessDeadline != 0) revert LivenessChallengeActive();
        if (hasLivenessPetitioned[livenessChallengeRound][msg.sender]) revert AlreadyPetitioned();

        address parlAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        Parliament parliament = Parliament(parlAddr);

        bool isMajlis = parliament.isActiveMajlisMember(msg.sender);
        bool isSenate = parliament.isActiveSenateMember(msg.sender);
        if (!isMajlis && !isSenate) revert NotParliamentMember();

        hasLivenessPetitioned[livenessChallengeRound][msg.sender] = true;
        emit LivenessPetitionCast(msg.sender);

        if (isMajlis) {
            majlisLivenessPetitions++;
            uint256 threshold = (parliament.effectiveMajlisMemberCount() + 9) / 10;
            if (majlisLivenessPetitions >= threshold) {
                uint256 period = constitution.getParameter(constitution.PARAM_COURT_LIVENESS_PERIOD());
                livenessDeadline = block.timestamp + period;
                emit LivenessChallenged(livenessDeadline);
            }
        } else {
            senateLivenessPetitions++;
            uint256 threshold = (parliament.effectiveSenateMemberCount() + 9) / 10;
            if (senateLivenessPetitions >= threshold) {
                uint256 period = constitution.getParameter(constitution.PARAM_COURT_LIVENESS_PERIOD());
                livenessDeadline = block.timestamp + period;
                emit LivenessChallenged(livenessDeadline);
            }
        }
    }

    /// @notice Vacate a justice seat under emergency conditions. Anyone can call.
    ///         Two trigger conditions (either suffices):
    ///         1. Liveness challenge expired (7d fast path)
    ///         2. Court inactivity timeout (14d slow path)
    /// @param seat The seat to vacate.
    function emergencyVacateSeat(uint256 seat) external {
        if (seat >= 12 || !justices[seat].active) revert NotActiveJustice(address(0));

        bool livenessExpired = livenessDeadline != 0 && block.timestamp >= livenessDeadline;
        uint256 inactivityPeriod = constitution.getParameter(constitution.PARAM_COURT_INACTIVITY_PERIOD());
        bool inactivityTimeout = lastCourtActivity != 0 && block.timestamp >= lastCourtActivity + inactivityPeriod;

        if (!livenessExpired && !inactivityTimeout) revert NeitherLivenessConditionMet();

        _removeJustice(seat);
        emit EmergencyVacated(seat);
    }

    /// @notice Allow any active justice to record court activity without a pending matter.
    ///         Resets the inactivity timer and clears any active liveness challenge.
    function checkIn() external onlyJustice {
        _recordActivity();
        emit JusticeCheckedIn(msg.sender);
    }

    // ─── Generic Judicial Execute ───────────────────────────────────────
    //     The Court can call any gated function on any registered governance
    //     contract through this entry point, provided justices have collectively
    //     certified the exact action via fact certification.
    //     factHash = keccak256(abi.encodePacked("JUDICIAL_ORDER", target, data))

    error InvalidTarget();
    error ExecutionFailed();
    error FactNotCertified();

    /// @notice Execute a judicial order on a registered governance contract.
    ///         Requires fact certification of the exact action. Only active justices
    ///         can trigger execution (collective decision, individual accountability).
    /// @param target The registered governance contract to call.
    /// @param data The encoded function call.
    function executeJudicialOrder(address target, bytes calldata data) external onlyJustice {
        bytes32 factHash = keccak256(abi.encodePacked("JUDICIAL_ORDER", target, data));
        if (!certifiedFacts[factHash]) revert FactNotCertified();
        if (!_isRegisteredContract(target)) revert InvalidTarget();
        // Consume fact cert to prevent replay
        certifiedFacts[factHash] = false;
        (bool success,) = target.call(data);
        if (!success) revert ExecutionFailed();
    }

    /// @dev Check if an address is a registered governance contract.
    function _isRegisteredContract(address target) internal view returns (bool) {
        return target == address(constitution) ||
               target == constitution.getContract(constitution.CONTRACT_CITIZEN_REGISTRY()) ||
               target == constitution.getContract(constitution.CONTRACT_CROWN()) ||
               target == constitution.getContract(constitution.CONTRACT_PARLIAMENT()) ||
               target == constitution.getContract(constitution.CONTRACT_EXECUTIVE()) ||
               target == constitution.getContract(constitution.CONTRACT_ELECTION()) ||
               target == constitution.getContract(constitution.CONTRACT_REFERENDUM()) ||
               target == constitution.getContract(constitution.CONTRACT_BUDGET()) ||
               target == constitution.getContract(constitution.CONTRACT_PROVINCIAL_COUNCIL());
    }

    // ─── View Functions ──────────────────────────────────────────────────

    function reviewCount() external view returns (uint256) { return reviews.length; }
    function disputeCount() external view returns (uint256) { return disputes.length; }

    function getReviewStatus(uint256 reviewId) external view returns (ReviewStatus) {
        if (reviewId >= reviews.length) revert InvalidReview();
        return reviews[reviewId].status;
    }

    function getDisputeStatus(uint256 disputeId) external view returns (DisputeStatus) {
        if (disputeId >= disputes.length) revert InvalidDispute();
        return disputes[disputeId].status;
    }

    function isFactCertified(bytes32 factHash) external view returns (bool) {
        return certifiedFacts[factHash];
    }

    // ─── Internal ────────────────────────────────────────────────────────

    /// @dev Verify that the caller is Parliament executing a Senate governance action.
    ///      Justice confirmation/rejection is a Senate power per Art. V.3.
    function _requireSenateAction() internal view {
        address parliamentAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        if (!Parliament(parliamentAddr).executingSenateAction()) revert NotAuthorized();
    }

    /// @dev Effective quorum: min(PARAM_COURT_QUORUM, activeJusticeCount).
    ///      Prevents deadlock when court is below full strength.
    function _effectiveQuorum() internal view returns (uint256) {
        if (activeJusticeCount == 0) revert NoActiveJustices();
        uint256 paramQuorum = constitution.getParameter(constitution.PARAM_COURT_QUORUM());
        return paramQuorum < activeJusticeCount ? paramQuorum : activeJusticeCount;
    }

    function _seatJustice(address justice, uint256 seat) internal {
        if (isActiveJustice[justice]) revert AlreadyJustice(justice);
        if (justices[seat].active) revert SeatOccupied(seat);
        uint256 termLength = constitution.getParameter(constitution.PARAM_JUSTICE_TERM());
        justices[seat] = Justice({
            addr: justice,
            termStart: block.timestamp,
            termEnd: block.timestamp + termLength,
            active: true
        });
        isActiveJustice[justice] = true;
        justiceSeat[justice] = seat;
        hasServed[justice] = true;
        // Reset inactivity timer when first justice is seated (initialization or recovery)
        if (activeJusticeCount == 0) {
            lastCourtActivity = block.timestamp;
            livenessDeadline = 0; // Clear stale challenge from prior mass-vacancy
        }
        activeJusticeCount++;

        emit JusticeAppointed(justice, seat, block.timestamp + termLength);
        emit JusticeSeated(seat, justice);
    }

    /// @dev Check if Crown is suspended via staticcall (avoids circular import).
    function _isCrownSuspended() internal view returns (bool) {
        address crownAddr = constitution.getContract(constitution.CONTRACT_CROWN());
        if (crownAddr.code.length == 0) return false;
        (bool s, bytes memory d) = crownAddr.staticcall(abi.encodeWithSignature("suspended()"));
        return s && d.length >= 32 && abi.decode(d, (bool));
    }

    /// @dev Record court activity: update timestamp, reset any active liveness challenge.
    function _recordActivity() internal {
        lastCourtActivity = block.timestamp;
        if (livenessDeadline != 0) {
            livenessDeadline = 0;
        }
        if (majlisLivenessPetitions > 0 || senateLivenessPetitions > 0) {
            majlisLivenessPetitions = 0;
            senateLivenessPetitions = 0;
            livenessChallengeRound++;
        }
    }

    function _removeJustice(uint256 seat) internal {
        Justice storage j = justices[seat];
        address addr = j.addr;
        isActiveJustice[addr] = false;
        delete justiceSeat[addr];
        j.active = false;
        activeJusticeCount--;

        emit JusticeRemoved(addr, seat);
    }
}
