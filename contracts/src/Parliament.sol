// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Constitution.sol";
import "./Crown.sol";
import "./Executive.sol";
import "./Election.sol";
import "./SupremeCourt.sol";
import "./ProvincialCouncil.sol";

/// @title Parliament
/// @notice Bicameral legislature: Majlis (lower house) and Senate (upper house).
///         Implements Part III of the Constitution — legislative process, member
///         management, and bill state machine.
/// @dev Bills follow a state machine:
///      Introduced → MajlisVoting → SenateReview → CrownAction → Enacted/Returned/Referred
///      Senate cannot originate legislation. Budget bills have special handling.
contract Parliament {
    // ─── Enums ───────────────────────────────────────────────────────────

    enum Chamber { Majlis, Senate }

    enum BillStatus {
        Introduced,         // 0 — Bill submitted by Majlis member
        MajlisVoting,       // 1 — Majlis is voting
        SenateReview,       // 2 — Senate is reviewing
        SenateObjected,     // 3 — Senate objected → back to Majlis for override
        MajlisOverride,     // 4 — Majlis re-voting with absolute majority
        CrownAction,        // 5 — Sent to Crown for enactment/return/referral
        Enacted,            // 6 — Signed into law
        Returned,           // 7 — Returned by Crown, pending re-adoption
        Referred,           // 8 — Referred to Supreme Court
        Vetoed,             // 9 — Declared unconstitutional by Court
        Rejected            // 10 — Rejected by Majlis vote
    }

    // ─── Structs ─────────────────────────────────────────────────────────

    struct Bill {
        bytes32 contentHash;
        string description;
        address sponsor;
        BillStatus status;
        uint256 majlisYes;
        uint256 majlisNo;
        uint256 senateYes;
        uint256 senateNo;
        uint256 submittedAt;
        uint256 senateDeadline;
        uint256 votingStarted; // Timestamp when current voting phase began
        uint256 voteRound;     // Incremented to clear votes without looping
        uint256 crownActionDeadline; // Deadline for Crown to act on bill
        bool isBudget;
        bool crownReturned; // Crown already used return power
    }

    struct VacancyProposal {
        address member;        // Member whose seat may be declared vacant
        Chamber chamber;       // Which chamber
        uint256 yesVotes;
        uint256 noVotes;
        uint256 votingStart;
        uint256 voteRound;     // For round-based vote tracking
        bool resolved;
    }

    // ─── Errors ──────────────────────────────────────────────────────────

    error NotMajlisMember();
    error NotSenateMember();
    error NotAuthorized();
    error EmptyContent();
    error BillNotInStatus(uint256 billId, BillStatus expected);
    error AlreadyVoted(uint256 billId, address voter);
    error AlreadyMember(address member);
    error NotActiveMember(address member);
    error MajlisDissolved();
    error CrownSenatorCapExceeded();
    error ZeroAddress();
    error InvalidBillId();
    error QuorumNotMet();
    error VotingPeriodNotElapsed();
    error DeadlineNotExpired();
    error SenateReviewNotExpired();
    error CaretakerModeActive();
    error CrownNotSuspended();
    error NotPrimeMinister();
    error TermNotExpired();
    error SenateNonRenewable(address member);
    error NotDissolved();
    error DissolutionElectionDeadlineNotReached();
    error DissolutionElectionAlreadyTriggered();
    error NoVacancies();
    error ByElectionDeadlineNotReached();
    error ByElectionAlreadyTriggered();
    error StaggerAlreadyInitialized();
    error AlreadyIncapacitated();
    error IncapacityNotCertified();
    error VacancyAlreadyProposed();
    error InvalidVacancyId();
    error VacancyAlreadyResolved();
    error VacancyVotingNotElapsed();
    error AlreadyVotedOnVacancy(uint256 vacancyId, address voter);

    // ─── Events ──────────────────────────────────────────────────────────

    event MemberSeated(address indexed member, Chamber chamber);
    event MemberRemoved(address indexed member, Chamber chamber);
    event BillSubmitted(uint256 indexed billId, address indexed sponsor, bytes32 contentHash);
    event BillVoteCast(uint256 indexed billId, address indexed voter, bool support, Chamber chamber);
    event BillStatusChanged(uint256 indexed billId, BillStatus oldStatus, BillStatus newStatus);
    event MajlisDissolution(uint256 timestamp);
    event MajlisRestored(uint256 timestamp);
    event DissolutionElectionTriggered(uint256 electionId);
    event ByElectionTriggered(Chamber chamber, uint256 electionId);
    event SenateStaggerInitialized(uint256 senatorCount, uint256 timestamp);
    event IncapacityAcknowledged(address indexed member, Chamber chamber);
    event VacancyProposed(uint256 indexed vacancyId, address indexed member, Chamber chamber);
    event VacancyVoteCast(uint256 indexed vacancyId, address indexed voter, bool support);
    event VacancyDeclared(uint256 indexed vacancyId, address indexed member, Chamber chamber);
    event VacancyRejected(uint256 indexed vacancyId, address indexed member);

    // ─── State ───────────────────────────────────────────────────────────

    Constitution public constitution;

    /// @notice Majlis members.
    mapping(address => bool) public isMajlisMember;
    uint256 public majlisMemberCount;

    /// @notice Senate members.
    mapping(address => bool) public isSenateMember;
    uint256 public senateMemberCount;

    /// @notice Number of Crown-appointed senators.
    uint256 public crownSenatorCount;

    /// @notice Track which senators were Crown-appointed (for count decrement on removal).
    mapping(address => bool) public isCrownSenator;

    /// @notice Bills.
    Bill[] internal bills;

    /// @notice Track who has voted on each bill (billId → voteRound → voter → voted).
    /// @dev Round-based: incrementing voteRound effectively clears all votes without looping.
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasVoted;

    /// @notice When each member was seated (for term expiry tracking).
    mapping(address => uint256) public seatTimestamp;

    /// @notice Tracks senators who have served a full term (non-renewability).
    mapping(address => bool) public hasPreviousSenateTerm;

    /// @notice Whether the Majlis is currently dissolved.
    bool public dissolved;

    /// @notice Timestamp when the Majlis was dissolved (for election deadline enforcement).
    uint256 public dissolvedAt;

    /// @notice Whether a dissolution election has already been triggered.
    bool public dissolutionElectionTriggered;

    /// @notice By-election vacancy tracking (Art. VIII.8).
    uint256 public majlisVacancyCount;
    uint256 public senateVacancyCount;
    uint256 public lastMajlisVacancyAt;
    uint256 public lastSenateVacancyAt;
    bool public byElectionTriggeredMajlis;
    bool public byElectionTriggeredSenate;

    /// @notice Individual Senate term endpoints (Art. III.4.3 staggering).
    mapping(address => uint256) public senateTermEnd;

    /// @notice Whether one-time Senate stagger initialization has been performed.
    bool public senateStaggerInitialized;

    /// @notice Which province each senator represents (0 = Crown-appointed or unspecified).
    mapping(address => uint8) public senatorProvince;

    /// @notice Court-certified incapacity tracking (Art. III.9).
    mapping(address => bool) public isIncapacitated;
    uint256 public incapacitatedMajlisCount;
    uint256 public incapacitatedSenateCount;

    /// @notice Which province each Majlis member represents.
    mapping(address => uint8) public majlisMemberProvince;

    /// @notice Counter for multi-province dissolution elections (decremented as each seats).
    uint256 public pendingMajlisElections;

    /// @notice Per-province Majlis vacancy tracking for province-scoped by-elections.
    mapping(uint8 => uint256) public provinceMajlisVacancies;
    mapping(uint8 => bool) public byElectionTriggeredForProvince;
    mapping(uint8 => uint256) public lastVacancyAtForProvince;

    /// @notice Vacancy proposals (Art. III.9).
    VacancyProposal[] public vacancyProposals;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasVotedOnVacancy;
    mapping(address => bool) public hasActiveVacancyProposal;

    // ─── Constructor ─────────────────────────────────────────────────────

    constructor(address _constitution) {
        if (_constitution == address(0)) revert ZeroAddress();
        constitution = Constitution(_constitution);
    }

    // ─── Active Member Checks (Self-Enforcing Terms) ────────────────────

    /// @notice Check if an address is an active Majlis member (seated AND term not expired).
    ///         Terms are self-enforcing: an expired member cannot act even if expireMember()
    ///         has not been called. expireMember() remains as a cleanup function.
    function isActiveMajlisMember(address member) public view returns (bool) {
        if (!isMajlisMember[member]) return false;
        if (isIncapacitated[member]) return false;
        uint256 termLength = constitution.getParameter(constitution.PARAM_MAJLIS_TERM());
        return block.timestamp < seatTimestamp[member] + termLength;
    }

    /// @notice Check if an address is an active Senate member (seated AND term not expired).
    ///         Uses individual senateTermEnd if set (post-stagger-initialization),
    ///         otherwise falls back to seatTimestamp + PARAM_SENATE_TERM.
    function isActiveSenateMember(address member) public view returns (bool) {
        if (!isSenateMember[member]) return false;
        if (isIncapacitated[member]) return false;
        if (senateTermEnd[member] != 0) {
            return block.timestamp < senateTermEnd[member];
        }
        uint256 termLength = constitution.getParameter(constitution.PARAM_SENATE_TERM());
        return block.timestamp < seatTimestamp[member] + termLength;
    }

    // ─── Modifiers ───────────────────────────────────────────────────────

    modifier onlyMajlisMember() {
        if (!isActiveMajlisMember(msg.sender)) revert NotMajlisMember();
        if (dissolved) revert MajlisDissolved();
        _;
    }

    modifier onlySenateMember() {
        if (!isActiveSenateMember(msg.sender)) revert NotSenateMember();
        _;
    }

    modifier onlyCrown() {
        if (msg.sender != constitution.getContract(constitution.CONTRACT_CROWN())) revert NotAuthorized();
        _;
    }

    modifier onlyElection() {
        if (msg.sender != constitution.getContract(constitution.CONTRACT_ELECTION())) revert NotAuthorized();
        _;
    }

    modifier onlyProvincialCouncil() {
        if (msg.sender != constitution.getContract(constitution.CONTRACT_PROVINCIAL_COUNCIL())) revert NotAuthorized();
        _;
    }

    modifier onlySupremeCourt() {
        if (msg.sender != constitution.getContract(constitution.CONTRACT_SUPREME_COURT())) revert NotAuthorized();
        _;
    }

    modifier onlyCrownOrExecutive() {
        address s = msg.sender;
        if (s != constitution.getContract(constitution.CONTRACT_CROWN()) &&
            s != constitution.getContract(constitution.CONTRACT_EXECUTIVE())) revert NotAuthorized();
        _;
    }

    modifier billExists(uint256 billId) {
        if (billId >= bills.length) revert InvalidBillId();
        _;
    }

    modifier billInStatus(uint256 billId, BillStatus expected) {
        if (bills[billId].status != expected) {
            revert BillNotInStatus(billId, expected);
        }
        _;
    }

    // ─── Member Management ───────────────────────────────────────────────

    /// @notice Seat a member in a chamber. Called by Election contract or Crown (for senators).
    /// @param member The member address.
    /// @param chamber Majlis or Senate.
    function seatMember(address member, Chamber chamber) external onlyElection {
        if (member == address(0)) revert ZeroAddress();

        if (chamber == Chamber.Majlis) {
            if (isMajlisMember[member]) revert AlreadyMember(member);
            isMajlisMember[member] = true;
            majlisMemberCount++;
            // Decrement vacancy count if filling a by-election seat
            if (majlisVacancyCount > 0) majlisVacancyCount--;
        } else {
            if (isSenateMember[member]) revert AlreadyMember(member);
            // Enforce Senate non-renewability for consecutive terms
            if (hasPreviousSenateTerm[member]) revert SenateNonRenewable(member);
            isSenateMember[member] = true;
            senateMemberCount++;
            if (senateVacancyCount > 0) senateVacancyCount--;
            // Set individual term endpoint for stagger support
            senateTermEnd[member] = block.timestamp + constitution.getParameter(constitution.PARAM_SENATE_TERM());
        }

        seatTimestamp[member] = block.timestamp;
        emit MemberSeated(member, chamber);
    }

    /// @notice Seat a senator with province tracking. Called by ProvincialCouncil
    ///         when seating senators elected through the two-tier pipeline.
    /// @param member The senator address.
    /// @param provinceId The province this senator represents.
    function seatSenatorWithProvince(address member, uint8 provinceId) external onlyProvincialCouncil {
        if (member == address(0)) revert ZeroAddress();
        if (isSenateMember[member]) revert AlreadyMember(member);
        if (hasPreviousSenateTerm[member]) revert SenateNonRenewable(member);

        isSenateMember[member] = true;
        senateMemberCount++;
        if (senateVacancyCount > 0) senateVacancyCount--;
        senateTermEnd[member] = block.timestamp + constitution.getParameter(constitution.PARAM_SENATE_TERM());
        senatorProvince[member] = provinceId;

        seatTimestamp[member] = block.timestamp;
        emit MemberSeated(member, Chamber.Senate);
    }

    /// @notice Seat a Crown-appointed senator, enforcing the 10% cap.
    /// @param member The senator address.
    function seatCrownSenator(address member) external onlyCrown {
        if (member == address(0)) revert ZeroAddress();
        if (isSenateMember[member]) revert AlreadyMember(member);
        if (hasPreviousSenateTerm[member]) revert SenateNonRenewable(member);

        // Enforce 10% cap: after adding this senator, Crown senators must be ≤ 10% of total
        uint256 newTotal = senateMemberCount + 1;
        uint256 maxCrown = (newTotal * constitution.getParameter(constitution.PARAM_SENATE_CROWN_PCT())) / 100;
        if (crownSenatorCount + 1 > maxCrown) revert CrownSenatorCapExceeded();

        isSenateMember[member] = true;
        senateMemberCount++;
        crownSenatorCount++;
        isCrownSenator[member] = true;
        seatTimestamp[member] = block.timestamp;
        senateTermEnd[member] = block.timestamp + constitution.getParameter(constitution.PARAM_SENATE_TERM());

        emit MemberSeated(member, Chamber.Senate);
    }

    /// @notice Seat a Majlis member with province tracking. Called by Election contract
    ///         after a province-scoped Majlis election.
    /// @param member The member address.
    /// @param provinceId The province this member represents.
    function seatMajlisMemberWithProvince(address member, uint8 provinceId) external onlyElection {
        if (member == address(0)) revert ZeroAddress();
        if (isMajlisMember[member]) revert AlreadyMember(member);

        isMajlisMember[member] = true;
        majlisMemberCount++;
        majlisMemberProvince[member] = provinceId;
        if (majlisVacancyCount > 0) majlisVacancyCount--;
        if (provinceMajlisVacancies[provinceId] > 0) provinceMajlisVacancies[provinceId]--;

        seatTimestamp[member] = block.timestamp;
        emit MemberSeated(member, Chamber.Majlis);
    }

    /// @notice Notify Parliament that one province's Majlis election has been seated.
    ///         When all pending elections are seated, restores the Majlis if dissolved.
    function majlisElectionSeated() external onlyElection {
        if (pendingMajlisElections > 0) {
            pendingMajlisElections--;
        }
        if (pendingMajlisElections == 0 && dissolved) {
            dissolved = false;
            dissolvedAt = 0;
            dissolutionElectionTriggered = false;
            majlisVacancyCount = 0;
            byElectionTriggeredMajlis = false;
            emit MajlisRestored(block.timestamp);
        }
    }

    /// @notice Remove a member from a chamber (recall, incapacity, etc.).
    ///         Triggers by-election vacancy tracking for mid-term removals (Art. VIII.8).
    function removeMember(address member, Chamber chamber) external onlySupremeCourt {
        _removeMemberInternal(member, chamber);
    }

    /// @dev Internal removal logic shared by removeMember() and finalizeVacancy().
    ///      Art. VIII.8.4: no by-election when remaining term < 6 months.
    function _removeMemberInternal(address member, Chamber chamber) internal {
        // Clear incapacity state on removal to prevent counter desync
        if (isIncapacitated[member]) {
            isIncapacitated[member] = false;
            if (chamber == Chamber.Majlis) {
                incapacitatedMajlisCount--;
            } else {
                incapacitatedSenateCount--;
            }
        }
        if (chamber == Chamber.Majlis) {
            if (!isMajlisMember[member]) revert NotActiveMember(member);
            uint8 memberProv = majlisMemberProvince[member];
            isMajlisMember[member] = false;
            majlisMemberCount--;
            // Track vacancy for by-election (skip if < 6 months remain per Art. VIII.8.4)
            uint256 termEnd = seatTimestamp[member] + constitution.getParameter(constitution.PARAM_MAJLIS_TERM());
            if (termEnd > block.timestamp && termEnd - block.timestamp >= 180 days) {
                majlisVacancyCount++;
                lastMajlisVacancyAt = block.timestamp;
                byElectionTriggeredMajlis = false;
                // Province-scoped vacancy tracking
                if (memberProv != 0) {
                    provinceMajlisVacancies[memberProv]++;
                    lastVacancyAtForProvince[memberProv] = block.timestamp;
                    byElectionTriggeredForProvince[memberProv] = false;
                }
            }
        } else {
            if (!isSenateMember[member]) revert NotActiveMember(member);
            isSenateMember[member] = false;
            senateMemberCount--;
            // Track vacancy for by-election (skip if < 6 months remain per Art. VIII.8.4)
            uint256 termEnd = senateTermEnd[member] != 0
                ? senateTermEnd[member]
                : seatTimestamp[member] + constitution.getParameter(constitution.PARAM_SENATE_TERM());
            if (termEnd > block.timestamp && termEnd - block.timestamp >= 180 days) {
                senateVacancyCount++;
                lastSenateVacancyAt = block.timestamp;
                byElectionTriggeredSenate = false;
            }
        }

        // Mark senators as having served for non-renewability, decrement Crown count
        if (chamber == Chamber.Senate) {
            hasPreviousSenateTerm[member] = true;
            if (isCrownSenator[member]) {
                crownSenatorCount--;
                isCrownSenator[member] = false;
            }
        }

        emit MemberRemoved(member, chamber);
    }

    /// @notice Expire a member whose term has ended. Anyone can call.
    /// @param member The member address.
    /// @param chamber Which chamber to check.
    function expireMember(address member, Chamber chamber) external {
        // Clear incapacity state on expiry to prevent counter desync
        if (isIncapacitated[member]) {
            isIncapacitated[member] = false;
            if (chamber == Chamber.Majlis) {
                incapacitatedMajlisCount--;
            } else {
                incapacitatedSenateCount--;
            }
        }
        if (chamber == Chamber.Majlis) {
            if (!isMajlisMember[member]) revert NotActiveMember(member);
            uint256 termLength = constitution.getParameter(constitution.PARAM_MAJLIS_TERM());
            if (block.timestamp < seatTimestamp[member] + termLength) revert TermNotExpired();
            isMajlisMember[member] = false;
            majlisMemberCount--;
        } else {
            if (!isSenateMember[member]) revert NotActiveMember(member);
            // Use individual senateTermEnd if set, otherwise fall back to seatTimestamp + term
            if (senateTermEnd[member] != 0) {
                if (block.timestamp < senateTermEnd[member]) revert TermNotExpired();
            } else {
                uint256 termLength = constitution.getParameter(constitution.PARAM_SENATE_TERM());
                if (block.timestamp < seatTimestamp[member] + termLength) revert TermNotExpired();
            }
            isSenateMember[member] = false;
            senateMemberCount--;
            hasPreviousSenateTerm[member] = true;
            if (isCrownSenator[member]) {
                crownSenatorCount--;
                isCrownSenator[member] = false;
            }
        }

        emit MemberRemoved(member, chamber);
    }

    /// @notice Check if a member's term has expired.
    function isTermExpired(address member, Chamber chamber) external view returns (bool) {
        if (chamber == Chamber.Majlis) {
            if (!isMajlisMember[member]) return false;
            uint256 termLength = constitution.getParameter(constitution.PARAM_MAJLIS_TERM());
            return block.timestamp >= seatTimestamp[member] + termLength;
        } else {
            if (!isSenateMember[member]) return false;
            if (senateTermEnd[member] != 0) {
                return block.timestamp >= senateTermEnd[member];
            }
            uint256 termLength = constitution.getParameter(constitution.PARAM_SENATE_TERM());
            return block.timestamp >= seatTimestamp[member] + termLength;
        }
    }

    // ─── Legislative Process ─────────────────────────────────────────────

    /// @notice Submit a bill. Only Majlis members can originate legislation (Art. III.5).
    /// @param contentHash Hash of the bill's content.
    /// @param description Brief description of the bill.
    /// @return billId The ID of the new bill.
    function submitBill(bytes32 contentHash, string calldata description) external onlyMajlisMember returns (uint256 billId) {
        if (contentHash == bytes32(0)) revert EmptyContent();
        // Caretaker government cannot introduce new legislation (except budget bills)
        address execAddr = constitution.getContract(constitution.CONTRACT_EXECUTIVE());
        if (execAddr != address(0) && execAddr.code.length > 0 && Executive(execAddr).isCaretaker()) revert CaretakerModeActive();

        billId = bills.length;
        bills.push();
        Bill storage bill = bills[billId];
        bill.contentHash = contentHash;
        bill.description = description;
        bill.sponsor = msg.sender;
        bill.status = BillStatus.Introduced;
        bill.submittedAt = block.timestamp;

        emit BillSubmitted(billId, msg.sender, contentHash);
        _changeStatus(billId, BillStatus.MajlisVoting);
    }

    /// @notice Submit a budget bill. Same as submitBill but flagged as budget.
    function submitBudgetBill(bytes32 contentHash, string calldata description) external onlyMajlisMember returns (uint256 billId) {
        if (contentHash == bytes32(0)) revert EmptyContent();

        billId = bills.length;
        bills.push();
        Bill storage bill = bills[billId];
        bill.contentHash = contentHash;
        bill.description = description;
        bill.sponsor = msg.sender;
        bill.status = BillStatus.Introduced;
        bill.submittedAt = block.timestamp;
        bill.isBudget = true;

        emit BillSubmitted(billId, msg.sender, contentHash);
        _changeStatus(billId, BillStatus.MajlisVoting);
    }

    /// @notice Cast a vote in the Majlis on a bill.
    function voteMajlis(uint256 billId, bool support)
        external
        onlyMajlisMember
        billExists(billId)
    {
        Bill storage bill = bills[billId];
        // Allow voting during MajlisVoting, MajlisOverride, or when bill is Returned
        if (bill.status != BillStatus.MajlisVoting &&
            bill.status != BillStatus.MajlisOverride &&
            bill.status != BillStatus.Returned) {
            revert BillNotInStatus(billId, BillStatus.MajlisVoting);
        }
        uint256 round = bill.voteRound;
        if (hasVoted[billId][round][msg.sender]) revert AlreadyVoted(billId, msg.sender);

        hasVoted[billId][round][msg.sender] = true;
        if (support) {
            bill.majlisYes++;
        } else {
            bill.majlisNo++;
        }

        emit BillVoteCast(billId, msg.sender, support, Chamber.Majlis);
    }

    /// @notice Finalize the Majlis vote. Anyone can call this to tally.
    /// @dev Checks quorum, minimum voting period, and required threshold.
    function finalizeMajlisVote(uint256 billId)
        external
        billExists(billId)
    {
        Bill storage bill = bills[billId];

        // Enforce minimum voting period
        uint256 minPeriod = constitution.getParameter(constitution.PARAM_MIN_VOTING_PERIOD());
        if (block.timestamp < bill.votingStarted + minPeriod) revert VotingPeriodNotElapsed();

        // Enforce quorum: votes cast must be >= quorum % of effective members
        // (Art. III.9.3: incapacitated members excluded from quorum calculations)
        uint256 effMajlis = effectiveMajlisMemberCount();
        if (effMajlis == 0) revert QuorumNotMet();
        uint256 quorumPct = constitution.getParameter(constitution.PARAM_MAJLIS_QUORUM());

        if (bill.status == BillStatus.MajlisVoting) {
            uint256 totalVotes = bill.majlisYes + bill.majlisNo;
            if (totalVotes * 100 < quorumPct * effMajlis) revert QuorumNotMet();
            if (bill.majlisYes > bill.majlisNo) {
                _changeStatus(billId, BillStatus.SenateReview);
                bill.senateDeadline = block.timestamp + constitution.getParameter(
                    constitution.PARAM_SENATE_REVIEW_PERIOD()
                );
            } else {
                _changeStatus(billId, BillStatus.Rejected);
            }
        } else if (bill.status == BillStatus.MajlisOverride) {
            uint256 totalVotes = bill.majlisYes + bill.majlisNo;
            if (totalVotes * 100 < quorumPct * effMajlis) revert QuorumNotMet();
            // Override requires absolute majority of effective Majlis members
            if (bill.majlisYes > effMajlis / 2) {
                _changeStatus(billId, BillStatus.CrownAction);
            } else {
                _changeStatus(billId, BillStatus.Rejected);
            }
        } else if (bill.status == BillStatus.Returned) {
            uint256 totalVotes = bill.majlisYes + bill.majlisNo;
            if (totalVotes * 100 < quorumPct * effMajlis) revert QuorumNotMet();
            if (bill.majlisYes > bill.majlisNo) {
                _changeStatus(billId, BillStatus.CrownAction);
            } else {
                _changeStatus(billId, BillStatus.Rejected);
            }
        } else {
            revert BillNotInStatus(billId, BillStatus.MajlisVoting);
        }
    }

    /// @notice Cast a vote in the Senate on a bill.
    function voteSenate(uint256 billId, bool support)
        external
        onlySenateMember
        billExists(billId)
        billInStatus(billId, BillStatus.SenateReview)
    {
        Bill storage bill = bills[billId];
        uint256 round = bill.voteRound;
        if (hasVoted[billId][round][msg.sender]) revert AlreadyVoted(billId, msg.sender);

        hasVoted[billId][round][msg.sender] = true;
        if (support) {
            bill.senateYes++;
        } else {
            bill.senateNo++;
        }

        emit BillVoteCast(billId, msg.sender, support, Chamber.Senate);
    }

    /// @notice Finalize the Senate vote on a bill.
    function finalizeSenateVote(uint256 billId)
        external
        billExists(billId)
        billInStatus(billId, BillStatus.SenateReview)
    {
        Bill storage bill = bills[billId];

        // Enforce minimum voting period
        uint256 minPeriod = constitution.getParameter(constitution.PARAM_MIN_VOTING_PERIOD());
        if (block.timestamp < bill.votingStarted + minPeriod) revert VotingPeriodNotElapsed();

        // Enforce quorum (Art. III.9.3: incapacitated members excluded)
        uint256 effSenate = effectiveSenateMemberCount();
        if (effSenate == 0) revert QuorumNotMet();
        uint256 quorumPct = constitution.getParameter(constitution.PARAM_SENATE_QUORUM());
        uint256 totalVotes = bill.senateYes + bill.senateNo;
        if (totalVotes * 100 < quorumPct * effSenate) revert QuorumNotMet();

        if (bill.senateYes > bill.senateNo) {
            _changeStatus(billId, BillStatus.CrownAction);
        } else {
            _changeStatus(billId, BillStatus.SenateObjected);
        }
    }

    /// @notice Claim Senate timeout — if Senate hasn't acted within the review period,
    ///         the bill is deemed approved and moves to Crown.
    function claimSenateTimeout(uint256 billId)
        external
        billExists(billId)
        billInStatus(billId, BillStatus.SenateReview)
    {
        Bill storage bill = bills[billId];
        if (block.timestamp < bill.senateDeadline) revert SenateReviewNotExpired();
        _changeStatus(billId, BillStatus.CrownAction);
    }

    /// @notice Claim Crown timeout — if Crown hasn't acted within the deadline,
    ///         the bill is automatically enacted (Crown inaction = assent per Art. II.5).
    function claimCrownTimeout(uint256 billId)
        external
        billExists(billId)
        billInStatus(billId, BillStatus.CrownAction)
    {
        Bill storage bill = bills[billId];
        if (block.timestamp < bill.crownActionDeadline) revert DeadlineNotExpired();
        _changeStatus(billId, BillStatus.Enacted);
    }

    /// @notice Start Majlis override vote after Senate objection.
    function startMajlisOverride(uint256 billId)
        external
        onlyMajlisMember
        billExists(billId)
        billInStatus(billId, BillStatus.SenateObjected)
    {
        // Reset Majlis vote counts for override — increment round to clear votes
        Bill storage bill = bills[billId];
        bill.majlisYes = 0;
        bill.majlisNo = 0;
        bill.voteRound++;
        _changeStatus(billId, BillStatus.MajlisOverride);
    }

    // ─── Crown Action Interface ──────────────────────────────────────────

    /// @notice Mark a bill as enacted (called by Crown or auto-executed after deadline).
    function markEnacted(uint256 billId)
        external
        onlyCrown
        billExists(billId)
        billInStatus(billId, BillStatus.CrownAction)
    {
        _changeStatus(billId, BillStatus.Enacted);
    }

    /// @notice Mark a bill as returned by Crown.
    function markReturned(uint256 billId)
        external
        onlyCrown
        billExists(billId)
        billInStatus(billId, BillStatus.CrownAction)
    {
        Bill storage bill = bills[billId];
        if (bill.crownReturned) {
            // Crown can't return twice — after re-adoption, Crown must enact or refer
            revert BillNotInStatus(billId, BillStatus.CrownAction);
        }
        bill.crownReturned = true; // Set flag at return, not re-adoption
        bill.majlisYes = 0;
        bill.majlisNo = 0;
        bill.voteRound++;
        _changeStatus(billId, BillStatus.Returned);
    }

    /// @notice Mark a bill as referred to Supreme Court.
    ///         Per Art. II.5.3, Crown may only refer a re-adopted bill (after returning it first).
    function markReferred(uint256 billId)
        external
        onlyCrown
        billExists(billId)
        billInStatus(billId, BillStatus.CrownAction)
    {
        if (!bills[billId].crownReturned) revert BillNotInStatus(billId, BillStatus.Returned);
        _changeStatus(billId, BillStatus.Referred);
    }

    /// @notice Mark a bill as constitutional by the Court — enacts the law.
    ///         When the Supreme Court finds a referred bill constitutional,
    ///         it becomes law (the Crown has exhausted its options).
    function markConstitutional(uint256 billId)
        external
        onlySupremeCourt
        billExists(billId)
        billInStatus(billId, BillStatus.Referred)
    {
        _changeStatus(billId, BillStatus.Enacted);
    }

    /// @notice Mark a bill as vetoed (unconstitutional) by the Court.
    function markVetoed(uint256 billId)
        external
        onlySupremeCourt
        billExists(billId)
        billInStatus(billId, BillStatus.Referred)
    {
        _changeStatus(billId, BillStatus.Vetoed);
    }

    // ─── Dissolution ─────────────────────────────────────────────────────

    /// @notice Dissolve the Majlis. Called by authorized contracts.
    function dissolveMajlis() external onlyCrownOrExecutive {
        dissolved = true;
        dissolvedAt = block.timestamp;
        emit MajlisDissolution(block.timestamp);
    }

    /// @notice Restore the Majlis after new elections. Idempotent — safe to call
    ///         even when Majlis is not dissolved. Kept for backward compatibility
    ///         with non-province-scoped callers. Province-scoped elections use
    ///         majlisElectionSeated() instead.
    function restoreMajlis() external onlyElection {
        if (dissolved) {
            dissolved = false;
            dissolvedAt = 0;
            dissolutionElectionTriggered = false;
            // General election fills all seats — reset vacancy tracking
            majlisVacancyCount = 0;
            byElectionTriggeredMajlis = false;
            pendingMajlisElections = 0;
            emit MajlisRestored(block.timestamp);
        }
    }

    // ─── Senate Stagger Initialization (Art. III.4.3) ──────────────────

    /// @notice One-time initialization of Senate term staggering (Art. III.4.3).
    ///         Assigns 2/4/6yr initial terms by prevrandao lottery to create three
    ///         natural cohorts. After initialization, new senators get fresh 6yr terms.
    /// @param senators All currently seated senators.
    function initializeSenateStagger(address[] calldata senators) external onlyCrown {
        if (senateStaggerInitialized) revert StaggerAlreadyInitialized();
        senateStaggerInitialized = true;

        for (uint256 i = 0; i < senators.length; i++) {
            if (!isSenateMember[senators[i]]) revert NotActiveMember(senators[i]);
            uint256 cohort = uint256(keccak256(abi.encodePacked(block.prevrandao, senators[i]))) % 3;
            if (cohort == 0) {
                senateTermEnd[senators[i]] = block.timestamp + 2 * 365 days;
            } else if (cohort == 1) {
                senateTermEnd[senators[i]] = block.timestamp + 4 * 365 days;
            } else {
                senateTermEnd[senators[i]] = block.timestamp + 6 * 365 days;
            }
        }

        emit SenateStaggerInitialized(senators.length, block.timestamp);
    }

    /// @notice Enforce Art. VIII.7.1: new elections must be called within 60 days of
    ///         dissolution. Anyone can call after the deadline to auto-start Majlis elections
    ///         for all provinces. Majlis is restored when all provincial elections are seated.
    function claimDissolutionElectionTimeout() external {
        if (!dissolved) revert NotDissolved();
        if (dissolutionElectionTriggered) revert DissolutionElectionAlreadyTriggered();
        uint256 deadline = constitution.getParameter(constitution.PARAM_DISSOLUTION_ELECTION_DEADLINE());
        if (block.timestamp < dissolvedAt + deadline) revert DissolutionElectionDeadlineNotReached();

        dissolutionElectionTriggered = true;

        address electionAddr = constitution.getContract(constitution.CONTRACT_ELECTION());
        address pcAddr = constitution.getContract(constitution.CONTRACT_PROVINCIAL_COUNCIL());
        uint256 provCount = ProvincialCouncil(pcAddr).provinceCount();
        pendingMajlisElections = provCount;

        for (uint256 i = 1; i <= provCount; i++) {
            uint256 electionId = Election(electionAddr).startMajlisElection(uint8(i));
            emit DissolutionElectionTriggered(electionId);
        }
    }

    // ─── By-Elections (Art. VIII.8) ──────────────────────────────────────

    /// @notice Enforce Art. VIII.8: by-election must be called within 90 days of a mid-term
    ///         vacancy. Anyone can call after the deadline to auto-start elections.
    ///         Majlis by-elections are province-scoped: only provinces with vacancies get elections.
    /// @param chamber Which chamber has the vacancy.
    function claimByElectionTimeout(Chamber chamber) external {
        if (chamber == Chamber.Majlis) {
            if (majlisVacancyCount == 0) revert NoVacancies();
            if (byElectionTriggeredMajlis) revert ByElectionAlreadyTriggered();
            uint256 deadline = constitution.getParameter(constitution.PARAM_BY_ELECTION_DEADLINE());
            if (block.timestamp < lastMajlisVacancyAt + deadline) revert ByElectionDeadlineNotReached();

            byElectionTriggeredMajlis = true;
            address electionAddr = constitution.getContract(constitution.CONTRACT_ELECTION());
            address pcAddr = constitution.getContract(constitution.CONTRACT_PROVINCIAL_COUNCIL());
            uint256 provCount = ProvincialCouncil(pcAddr).provinceCount();

            for (uint256 i = 1; i <= provCount; i++) {
                uint8 pId = uint8(i);
                if (provinceMajlisVacancies[pId] > 0 && !byElectionTriggeredForProvince[pId]) {
                    byElectionTriggeredForProvince[pId] = true;
                    pendingMajlisElections++;
                    uint256 electionId = Election(electionAddr).startMajlisElection(pId);
                    emit ByElectionTriggered(Chamber.Majlis, electionId);
                }
            }
        } else {
            if (senateVacancyCount == 0) revert NoVacancies();
            if (byElectionTriggeredSenate) revert ByElectionAlreadyTriggered();
            uint256 deadline = constitution.getParameter(constitution.PARAM_BY_ELECTION_DEADLINE());
            if (block.timestamp < lastSenateVacancyAt + deadline) revert ByElectionDeadlineNotReached();

            byElectionTriggeredSenate = true;
            address electionAddr = constitution.getContract(constitution.CONTRACT_ELECTION());
            uint256 electionId = Election(electionAddr).startElection(Election.ElectionType.Senate);
            emit ByElectionTriggered(Chamber.Senate, electionId);
        }
    }

    // ─── Incapacity + Vacancy Declaration (Art. III.9) ──────────────────

    /// @notice Acknowledge Court-certified incapacity of a member. Anyone can call.
    ///         Immediately excludes the member from quorum calculations and prevents
    ///         them from acting, while they still formally hold their seat.
    /// @param member The incapacitated member.
    /// @param chamber Which chamber.
    function acknowledgeIncapacity(address member, Chamber chamber) external {
        if (chamber == Chamber.Majlis) {
            if (!isMajlisMember[member]) revert NotActiveMember(member);
        } else {
            if (!isSenateMember[member]) revert NotActiveMember(member);
        }
        if (isIncapacitated[member]) revert AlreadyIncapacitated();

        // Verify Court certification
        address courtAddr = constitution.getContract(constitution.CONTRACT_SUPREME_COURT());
        bytes32 factHash = keccak256(abi.encodePacked("MEMBER_INCAPACITATED", member));
        if (!SupremeCourt(courtAddr).isFactCertified(factHash)) revert IncapacityNotCertified();

        isIncapacitated[member] = true;
        if (chamber == Chamber.Majlis) {
            incapacitatedMajlisCount++;
        } else {
            incapacitatedSenateCount++;
        }

        emit IncapacityAcknowledged(member, chamber);
    }

    /// @notice Propose to declare a member's seat vacant. Any active member of the
    ///         same chamber may propose. Target is excluded from voting and denominator.
    /// @param member The member whose seat may be declared vacant.
    /// @param chamber Which chamber.
    /// @return vacancyId The ID of the vacancy proposal.
    function proposeVacancy(address member, Chamber chamber) external returns (uint256 vacancyId) {
        if (chamber == Chamber.Majlis) {
            if (!isActiveMajlisMember(msg.sender)) revert NotMajlisMember();
            if (!isMajlisMember[member]) revert NotActiveMember(member);
        } else {
            if (!isActiveSenateMember(msg.sender)) revert NotSenateMember();
            if (!isSenateMember[member]) revert NotActiveMember(member);
        }
        if (hasActiveVacancyProposal[member]) revert VacancyAlreadyProposed();

        vacancyId = vacancyProposals.length;
        hasActiveVacancyProposal[member] = true;
        vacancyProposals.push(VacancyProposal({
            member: member,
            chamber: chamber,
            yesVotes: 0,
            noVotes: 0,
            votingStart: block.timestamp,
            voteRound: 0,
            resolved: false
        }));

        emit VacancyProposed(vacancyId, member, chamber);
    }

    /// @notice Vote on a vacancy proposal. Only active members of the same chamber,
    ///         excluding the target member.
    /// @param vacancyId The vacancy proposal ID.
    /// @param support True for yes, false for no.
    function voteOnVacancy(uint256 vacancyId, bool support) external {
        if (vacancyId >= vacancyProposals.length) revert InvalidVacancyId();
        VacancyProposal storage v = vacancyProposals[vacancyId];
        if (v.resolved) revert VacancyAlreadyResolved();
        if (msg.sender == v.member) revert NotAuthorized(); // Target cannot vote

        if (v.chamber == Chamber.Majlis) {
            if (!isActiveMajlisMember(msg.sender)) revert NotMajlisMember();
        } else {
            if (!isActiveSenateMember(msg.sender)) revert NotSenateMember();
        }

        if (hasVotedOnVacancy[vacancyId][v.voteRound][msg.sender]) {
            revert AlreadyVotedOnVacancy(vacancyId, msg.sender);
        }

        hasVotedOnVacancy[vacancyId][v.voteRound][msg.sender] = true;
        if (support) {
            v.yesVotes++;
        } else {
            v.noVotes++;
        }

        emit VacancyVoteCast(vacancyId, msg.sender, support);
    }

    /// @notice Finalize a vacancy proposal. Anyone can call after the voting period.
    ///         Simple majority of active members (excluding target) required.
    /// @param vacancyId The vacancy proposal ID.
    function finalizeVacancy(uint256 vacancyId) external {
        if (vacancyId >= vacancyProposals.length) revert InvalidVacancyId();
        VacancyProposal storage v = vacancyProposals[vacancyId];
        if (v.resolved) revert VacancyAlreadyResolved();

        uint256 votePeriod = constitution.getParameter(constitution.PARAM_VACANCY_VOTE_PERIOD());
        if (block.timestamp < v.votingStart + votePeriod) revert VacancyVotingNotElapsed();

        v.resolved = true;
        hasActiveVacancyProposal[v.member] = false;

        // Simple majority of votes cast (target excluded from denominator)
        if (v.yesVotes > v.noVotes && v.yesVotes > 0) {
            _removeMemberInternal(v.member, v.chamber);
            emit VacancyDeclared(vacancyId, v.member, v.chamber);
        } else {
            emit VacancyRejected(vacancyId, v.member);
        }
    }

    /// @notice Get effective Majlis member count (total minus incapacitated).
    ///         Used for quorum and threshold calculations.
    function effectiveMajlisMemberCount() public view returns (uint256) {
        return majlisMemberCount - incapacitatedMajlisCount;
    }

    /// @notice Get effective Senate member count (total minus incapacitated).
    function effectiveSenateMemberCount() public view returns (uint256) {
        return senateMemberCount - incapacitatedSenateCount;
    }

    /// @notice Get the total number of vacancy proposals.
    function vacancyProposalCount() external view returns (uint256) {
        return vacancyProposals.length;
    }

    // ─── Crown Suspension Fallback (Art. VI.5.2) ────────────────────────

    /// @notice During Crown suspension, the PM exercises the Crown's legislative
    ///         return power per Art. VI.5.2.
    /// @param billId The bill to return to Majlis for reconsideration.
    function returnLawDuringSuspension(uint256 billId)
        external
        billExists(billId)
        billInStatus(billId, BillStatus.CrownAction)
    {
        // Caller must be the PM
        address pm = constitution.getRole(constitution.ROLE_PRIME_MINISTER());
        if (msg.sender != pm) revert NotPrimeMinister();

        // Crown must be suspended
        address crownAddr = constitution.getContract(constitution.CONTRACT_CROWN());
        if (!Crown(crownAddr).suspended()) revert CrownNotSuspended();

        Bill storage bill = bills[billId];
        if (bill.crownReturned) {
            revert BillNotInStatus(billId, BillStatus.CrownAction);
        }
        bill.crownReturned = true;
        bill.majlisYes = 0;
        bill.majlisNo = 0;
        bill.voteRound++;
        _changeStatus(billId, BillStatus.Returned);
    }

    /// @notice During Crown suspension, the PM may refer a returned-and-readopted
    ///         bill to the Supreme Court (exercising the Crown's referral power).
    function referToCourtDuringSuspension(uint256 billId)
        external
        billExists(billId)
        billInStatus(billId, BillStatus.CrownAction)
    {
        address pm = constitution.getRole(constitution.ROLE_PRIME_MINISTER());
        if (msg.sender != pm) revert NotPrimeMinister();

        address crownAddr = constitution.getContract(constitution.CONTRACT_CROWN());
        if (!Crown(crownAddr).suspended()) revert CrownNotSuspended();

        if (!bills[billId].crownReturned) revert BillNotInStatus(billId, BillStatus.Returned);
        _changeStatus(billId, BillStatus.Referred);
    }

    /// @notice During Crown suspension, the PM may enact a bill into law
    ///         (exercising the Crown's enactment power per Art. VI.5).
    /// @param billId The bill ID.
    function enactLawDuringSuspension(uint256 billId)
        external
        billExists(billId)
        billInStatus(billId, BillStatus.CrownAction)
    {
        address pm = constitution.getRole(constitution.ROLE_PRIME_MINISTER());
        if (msg.sender != pm) revert NotPrimeMinister();

        address crownAddr = constitution.getContract(constitution.CONTRACT_CROWN());
        if (!Crown(crownAddr).suspended()) revert CrownNotSuspended();

        _changeStatus(billId, BillStatus.Enacted);
    }

    /// @notice During Crown suspension, the Senate initiates executive formation
    ///         per Art. VI.5.2. Any Senate member may call.
    function initiateFormationDuringSuspension() external {
        if (!isActiveSenateMember(msg.sender)) revert NotSenateMember();

        // Crown must be suspended
        address crownAddr = constitution.getContract(constitution.CONTRACT_CROWN());
        if (!Crown(crownAddr).suspended()) revert CrownNotSuspended();

        // Trigger formation on Executive
        address execAddr = constitution.getContract(constitution.CONTRACT_EXECUTIVE());
        Executive(execAddr).startFormation();
    }

    // ─── Governance Action Mechanism ──────────────────────────────────────
    //     Generic propose-vote-execute pattern for parliamentary collective decisions.
    //     Instead of per-function wrappers for each onlyParliament-gated function
    //     on other contracts, Parliament uses this mechanism to reach them all.

    enum ActionStatus { Voting, Passed, Failed, Executed }

    struct GovernanceAction {
        address target;          // Registered governance contract to call
        bytes data;              // Encoded function call (target.call(data))
        bytes32 descriptionHash; // Hash of proposal description
        Chamber chamber;         // Which chamber votes (Majlis or Senate)
        uint256 threshold;       // Required majority percentage (50, 67, 75)
        uint256 yesVotes;
        uint256 noVotes;
        uint256 votingStart;
        uint256 voteRound;
        ActionStatus status;
        address proposer;
    }

    error InvalidAction();
    error ActionNotPassed();
    error InvalidTarget();
    error ExecutionFailed();
    error InvalidThreshold();

    event GovernanceActionProposed(uint256 indexed actionId, address target, address proposer, Chamber chamber);
    event GovernanceActionVoteCast(uint256 indexed actionId, address indexed voter, bool support);
    event GovernanceActionFinalized(uint256 indexed actionId, ActionStatus status);
    event GovernanceActionExecuted(uint256 indexed actionId);

    GovernanceAction[] internal governanceActions;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasVotedOnAction;

    /// @notice True while a Senate governance action is being executed.
    ///         Allows target contracts to verify the calling chamber.
    bool public executingSenateAction;

    /// @notice True while a Majlis governance action is being executed.
    bool public executingMajlisAction;

    /// @notice Propose a governance action — a call to a registered governance contract.
    /// @param target The target contract address (must be registered).
    /// @param data The encoded function call.
    /// @param chamber Which chamber votes (Majlis or Senate).
    /// @param threshold Required majority percentage (50, 67, or 75).
    /// @param descriptionHash Hash of the proposal description.
    /// @return actionId The ID of the proposed action.
    function proposeGovernanceAction(
        address target,
        bytes calldata data,
        Chamber chamber,
        uint256 threshold,
        bytes32 descriptionHash
    ) external returns (uint256 actionId) {
        // Proposer must be active member of the specified chamber
        if (chamber == Chamber.Majlis) {
            if (!isActiveMajlisMember(msg.sender)) revert NotMajlisMember();
            if (dissolved) revert MajlisDissolved();
        } else {
            if (!isActiveSenateMember(msg.sender)) revert NotSenateMember();
        }
        if (!_isRegisteredContract(target)) revert InvalidTarget();
        if (threshold != 50 && threshold != 67 && threshold != 75) revert InvalidThreshold();

        actionId = governanceActions.length;
        governanceActions.push();
        GovernanceAction storage a = governanceActions[actionId];
        a.target = target;
        a.data = data;
        a.descriptionHash = descriptionHash;
        a.chamber = chamber;
        a.threshold = threshold;
        a.votingStart = block.timestamp;
        a.status = ActionStatus.Voting;
        a.proposer = msg.sender;

        emit GovernanceActionProposed(actionId, target, msg.sender, chamber);
    }

    /// @notice Vote on a governance action.
    /// @param actionId The action ID.
    /// @param support True for yes, false for no.
    function voteOnGovernanceAction(uint256 actionId, bool support) external {
        if (actionId >= governanceActions.length) revert InvalidAction();
        GovernanceAction storage a = governanceActions[actionId];
        if (a.status != ActionStatus.Voting) revert InvalidAction();

        if (a.chamber == Chamber.Majlis) {
            if (!isActiveMajlisMember(msg.sender)) revert NotMajlisMember();
            if (dissolved) revert MajlisDissolved();
        } else {
            if (!isActiveSenateMember(msg.sender)) revert NotSenateMember();
        }

        uint256 round = a.voteRound;
        if (hasVotedOnAction[actionId][round][msg.sender]) revert AlreadyVoted(actionId, msg.sender);

        hasVotedOnAction[actionId][round][msg.sender] = true;
        if (support) {
            a.yesVotes++;
        } else {
            a.noVotes++;
        }

        emit GovernanceActionVoteCast(actionId, msg.sender, support);
    }

    /// @notice Finalize a governance action after the minimum voting period.
    /// @param actionId The action ID.
    function finalizeGovernanceAction(uint256 actionId) external {
        if (actionId >= governanceActions.length) revert InvalidAction();
        GovernanceAction storage a = governanceActions[actionId];
        if (a.status != ActionStatus.Voting) revert InvalidAction();

        uint256 minPeriod = constitution.getParameter(constitution.PARAM_MIN_VOTING_PERIOD());
        if (block.timestamp < a.votingStart + minPeriod) revert VotingPeriodNotElapsed();

        // Enforce quorum
        uint256 effectiveCount;
        uint256 quorumPct;
        if (a.chamber == Chamber.Majlis) {
            effectiveCount = effectiveMajlisMemberCount();
            quorumPct = constitution.getParameter(constitution.PARAM_MAJLIS_QUORUM());
        } else {
            effectiveCount = effectiveSenateMemberCount();
            quorumPct = constitution.getParameter(constitution.PARAM_SENATE_QUORUM());
        }
        uint256 totalVotes = a.yesVotes + a.noVotes;
        if (totalVotes * 100 < quorumPct * effectiveCount) revert QuorumNotMet();

        // Check if threshold is met (yesVotes > threshold% of effective members)
        if (a.yesVotes * 100 > a.threshold * effectiveCount) {
            a.status = ActionStatus.Passed;
        } else {
            a.status = ActionStatus.Failed;
        }

        emit GovernanceActionFinalized(actionId, a.status);
    }

    /// @notice Execute a passed governance action. Anyone can call.
    /// @param actionId The action ID.
    function executeGovernanceAction(uint256 actionId) external {
        if (actionId >= governanceActions.length) revert InvalidAction();
        GovernanceAction storage a = governanceActions[actionId];
        if (a.status != ActionStatus.Passed) revert ActionNotPassed();

        a.status = ActionStatus.Executed;

        // Set chamber flag so target contracts can verify which chamber is acting
        if (a.chamber == Chamber.Senate) {
            executingSenateAction = true;
        } else {
            executingMajlisAction = true;
        }

        (bool success,) = a.target.call(a.data);

        executingSenateAction = false;
        executingMajlisAction = false;

        if (!success) revert ExecutionFailed();

        emit GovernanceActionExecuted(actionId);
    }

    /// @notice Get the total number of governance actions.
    function governanceActionCount() external view returns (uint256) {
        return governanceActions.length;
    }

    /// @dev Check if an address is a registered governance contract.
    function _isRegisteredContract(address target) internal view returns (bool) {
        return target == address(constitution) ||
               target == constitution.getContract(constitution.CONTRACT_CITIZEN_REGISTRY()) ||
               target == constitution.getContract(constitution.CONTRACT_CROWN()) ||
               target == constitution.getContract(constitution.CONTRACT_EXECUTIVE()) ||
               target == constitution.getContract(constitution.CONTRACT_SUPREME_COURT()) ||
               target == constitution.getContract(constitution.CONTRACT_ELECTION()) ||
               target == constitution.getContract(constitution.CONTRACT_REFERENDUM()) ||
               target == constitution.getContract(constitution.CONTRACT_BUDGET()) ||
               target == constitution.getContract(constitution.CONTRACT_PROVINCIAL_COUNCIL());
    }

    // ─── View Functions ──────────────────────────────────────────────────

    /// @notice Get the total number of bills.
    function billCount() external view returns (uint256) {
        return bills.length;
    }

    /// @notice Get a bill's status.
    function getBillStatus(uint256 billId) external view returns (BillStatus) {
        if (billId >= bills.length) revert InvalidBillId();
        return bills[billId].status;
    }

    /// @notice Get bill vote counts.
    function getBillVotes(uint256 billId)
        external
        view
        returns (uint256 majYes, uint256 majNo, uint256 senYes, uint256 senNo)
    {
        if (billId >= bills.length) revert InvalidBillId();
        Bill storage bill = bills[billId];
        return (bill.majlisYes, bill.majlisNo, bill.senateYes, bill.senateNo);
    }

    // ─── Internal ────────────────────────────────────────────────────────

    function _changeStatus(uint256 billId, BillStatus newStatus) internal {
        BillStatus oldStatus = bills[billId].status;
        bills[billId].status = newStatus;

        // Record voting start timestamp for quorum/period checks
        if (newStatus == BillStatus.MajlisVoting ||
            newStatus == BillStatus.MajlisOverride ||
            newStatus == BillStatus.Returned ||
            newStatus == BillStatus.SenateReview) {
            bills[billId].votingStarted = block.timestamp;
        }

        // Set Crown action deadline when bill reaches CrownAction
        if (newStatus == BillStatus.CrownAction) {
            bills[billId].crownActionDeadline = block.timestamp +
                constitution.getParameter(constitution.PARAM_CROWN_LAW_DEADLINE());
        }

        emit BillStatusChanged(billId, oldStatus, newStatus);
    }
}
