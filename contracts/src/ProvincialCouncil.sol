// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Constitution.sol";
import "./Parliament.sol";
import "./CitizenRegistry.sol";
import "./IIdentityVerifier.sol";

/// @title ProvincialCouncil
/// @notice Provincial councils for the two-tier Senate selection pipeline.
///         Citizens elect provincial council members via Election.sol. Council
///         members then elect senators for their province. This continues the
///         1906 Constitution's vision of provincial anjumans (Arts. 90-93) and
///         the Shah's White Revolution principle of decentralization.
/// @dev Senate pipeline only — no local governance functions (budget, regulation).
///      Province-based stagger cohorts (A/B/C) control Senate renewal by thirds.
contract ProvincialCouncil {
    // ─── Structs ─────────────────────────────────────────────────────────

    struct Province {
        uint8 id;
        bytes32 name;
        uint256 councilSize;       // Number of council seats (15 per province)
        uint256 senateSeatCount;   // Senate seats allocated to this province
        uint256 majlisSeatCount;   // Majlis seats allocated to this province
        uint256 currentCouncilCount;
        uint8 staggerCohort;       // 0=A, 1=B, 2=C
        bool initialized;
    }

    struct SenateSelection {
        uint8 provinceId;
        uint256 registrationStart;
        uint256 registrationEnd;
        uint256 votingStart;
        uint256 votingEnd;
        uint256 candidateCount;
        uint256 totalVotes;
        bool tallied;
        bool seated;
        uint256 seatDeadline; // Deadline for Crown to seat winners before permissionless timeout
    }

    struct SenateCandidate {
        address addr;
        uint256 voteCount;
    }

    struct ProvinceInit {
        uint8 id;
        bytes32 name;
        uint256 councilSize;
        uint256 senateSeatCount;
        uint256 majlisSeatCount;
        uint8 cohort;
    }

    // ─── Errors ──────────────────────────────────────────────────────────

    error NotAuthorized();
    error ZeroAddress();
    error AlreadyInitialized();
    error ProvinceNotInitialized();
    error InvalidProvince();
    error ArrayLengthMismatch();
    error NotCouncilMember();
    error AlreadyCouncilMember();
    error CouncilFull();
    error NotCitizen(address citizen);
    error WrongProvince();
    error InvalidSelection();
    error RegistrationNotOpen();
    error RegistrationNotEnded();
    error VotingNotOpen();
    error AlreadyRegistered(address candidate);
    error AlreadyVoted(address voter);
    error InvalidCandidate();
    error SelectionNotTallied();
    error SelectionAlreadyTallied();
    error SelectionAlreadySeated();
    error NoCandidates();
    error ProvincesAlreadyInitialized();
    error SeatMemberFailed();
    error TotalSeatsMismatch();
    error DeadlineNotReached();

    // ─── Events ──────────────────────────────────────────────────────────

    event ProvinceInitialized(uint8 indexed provinceId, bytes32 name, uint256 councilSize, uint256 senateSeatCount, uint256 majlisSeatCount, uint8 cohort);
    event MajlisSeatAllocationUpdated(uint8 indexed provinceId, uint256 oldCount, uint256 newCount);
    event CouncilMemberSeated(address indexed member, uint8 indexed provinceId);
    event CouncilMemberRemoved(address indexed member, uint8 indexed provinceId);
    event SenateSelectionStarted(uint256 indexed selectionId, uint8 indexed provinceId);
    event SenateCandidateRegistered(uint256 indexed selectionId, address indexed candidate);
    event SenateVoteCast(uint256 indexed selectionId, address indexed voter);
    event SenateSelectionTallied(uint256 indexed selectionId, uint256 totalVotes);
    event SenateSelectionSeated(uint256 indexed selectionId, uint256 seatedCount);

    // ─── State ───────────────────────────────────────────────────────────

    Constitution public constitution;

    /// @notice Whether provinces have been initialized (one-time operation).
    bool public provincesInitialized;

    /// @notice Province data: provinceId → Province.
    mapping(uint8 => Province) public provinces;

    /// @notice Total number of initialized provinces.
    uint256 public provinceCount;

    /// @notice Council membership: provinceId → member → bool.
    mapping(uint8 => mapping(address => bool)) public isCouncilMember;

    /// @notice When each council member was seated (for term enforcement).
    mapping(address => uint256) public councilSeatTimestamp;

    /// @notice Which province a council member belongs to.
    mapping(address => uint8) public memberProvince;

    /// @notice Senate selections.
    SenateSelection[] internal senateSelections;

    /// @notice Candidates per selection: selectionId → candidateIndex → SenateCandidate.
    mapping(uint256 => mapping(uint256 => SenateCandidate)) public selectionCandidates;

    /// @notice Track which addresses are candidates: selectionId → addr → bool.
    mapping(uint256 => mapping(address => bool)) public isSelectionCandidate;

    /// @notice Track which council members have voted: selectionId → addr → bool.
    mapping(uint256 => mapping(address => bool)) public hasVotedInSelection;

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

    modifier onlyElection() {
        if (msg.sender != constitution.getContract(constitution.CONTRACT_ELECTION())) revert NotAuthorized();
        _;
    }

    modifier onlyParliament() {
        if (msg.sender != constitution.getContract(constitution.CONTRACT_PARLIAMENT())) revert NotAuthorized();
        _;
    }

    modifier onlySupremeCourt() {
        if (msg.sender != constitution.getContract(constitution.CONTRACT_SUPREME_COURT())) revert NotAuthorized();
        _;
    }

    // ─── Province Setup ──────────────────────────────────────────────────

    /// @notice Initialize all provinces. One-time operation.
    /// @param inits Array of province initialization data.
    function initializeProvinces(ProvinceInit[] calldata inits) external onlyCrown {
        if (provincesInitialized) revert ProvincesAlreadyInitialized();

        for (uint256 i = 0; i < inits.length; i++) {
            ProvinceInit calldata p = inits[i];
            if (p.id == 0 || p.id > 31) revert InvalidProvince();
            if (provinces[p.id].initialized) revert AlreadyInitialized();

            provinces[p.id] = Province({
                id: p.id,
                name: p.name,
                councilSize: p.councilSize,
                senateSeatCount: p.senateSeatCount,
                majlisSeatCount: p.majlisSeatCount,
                currentCouncilCount: 0,
                staggerCohort: p.cohort,
                initialized: true
            });

            emit ProvinceInitialized(p.id, p.name, p.councilSize, p.senateSeatCount, p.majlisSeatCount, p.cohort);
        }

        provinceCount = inits.length;
        provincesInitialized = true;
    }

    // ─── Council Membership ──────────────────────────────────────────────

    /// @notice Seat a council member. Called by Election contract after provincial election.
    /// @param member The council member address.
    /// @param provinceId The province this member represents.
    function seatCouncilMember(address member, uint8 provinceId) external onlyElection {
        if (member == address(0)) revert ZeroAddress();
        if (!provinces[provinceId].initialized) revert ProvinceNotInitialized();
        if (isCouncilMember[provinceId][member]) revert AlreadyCouncilMember();
        if (provinces[provinceId].currentCouncilCount >= provinces[provinceId].councilSize) revert CouncilFull();

        isCouncilMember[provinceId][member] = true;
        councilSeatTimestamp[member] = block.timestamp;
        memberProvince[member] = provinceId;
        provinces[provinceId].currentCouncilCount++;

        emit CouncilMemberSeated(member, provinceId);
    }

    /// @notice Remove a council member. Called by authorized contracts.
    /// @param member The council member to remove.
    function removeCouncilMember(address member) external onlySupremeCourt {
        uint8 provinceId = memberProvince[member];
        if (!isCouncilMember[provinceId][member]) revert NotCouncilMember();

        isCouncilMember[provinceId][member] = false;
        provinces[provinceId].currentCouncilCount--;

        emit CouncilMemberRemoved(member, provinceId);
    }

    /// @notice Check if an address is an active council member (seated AND term not expired).
    ///         Terms are self-enforcing: expired members cannot vote in senate selections.
    /// @param member The address to check.
    /// @return True if active council member.
    function isActiveCouncilMember(address member) public view returns (bool) {
        uint8 provinceId = memberProvince[member];
        if (!isCouncilMember[provinceId][member]) return false;
        uint256 termLength = constitution.getParameter(constitution.PARAM_COUNCIL_TERM());
        return block.timestamp < councilSeatTimestamp[member] + termLength;
    }

    // ─── Senate Selection Pipeline ────────────────────────────────────────

    /// @notice Start a senate selection for a province. Called by authorized contracts.
    /// @param provinceId The province conducting the selection.
    /// @return selectionId The ID of the new selection.
    function startSenateSelection(uint8 provinceId) external onlyCrown returns (uint256 selectionId) {
        if (!provinces[provinceId].initialized) revert ProvinceNotInitialized();

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_REG_PERIOD());
        uint256 votePeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_VOTE_PERIOD());

        selectionId = senateSelections.length;
        senateSelections.push(SenateSelection({
            provinceId: provinceId,
            registrationStart: block.timestamp,
            registrationEnd: block.timestamp + regPeriod,
            votingStart: block.timestamp + regPeriod,
            votingEnd: block.timestamp + regPeriod + votePeriod,
            candidateCount: 0,
            totalVotes: 0,
            tallied: false,
            seated: false,
            seatDeadline: 0
        }));

        emit SenateSelectionStarted(selectionId, provinceId);
    }

    /// @notice Register as a senate candidate. Any citizen of the province can run.
    /// @param selectionId The selection ID.
    function registerSenateCandidate(uint256 selectionId) external {
        if (selectionId >= senateSelections.length) revert InvalidSelection();
        SenateSelection storage s = senateSelections[selectionId];
        if (block.timestamp > s.registrationEnd) revert RegistrationNotOpen();
        if (isSelectionCandidate[selectionId][msg.sender]) revert AlreadyRegistered(msg.sender);

        // Must be a registered citizen of this province
        address registryAddr = constitution.getContract(constitution.CONTRACT_CITIZEN_REGISTRY());
        if (registryAddr == address(0) || registryAddr.code.length == 0) revert NotCitizen(msg.sender);
        if (!IIdentityVerifier(registryAddr).isCitizen(msg.sender)) revert NotCitizen(msg.sender);
        if (CitizenRegistry(registryAddr).citizenProvince(msg.sender) != s.provinceId) revert WrongProvince();

        uint256 idx = s.candidateCount;
        selectionCandidates[selectionId][idx] = SenateCandidate({
            addr: msg.sender,
            voteCount: 0
        });
        isSelectionCandidate[selectionId][msg.sender] = true;
        s.candidateCount++;

        emit SenateCandidateRegistered(selectionId, msg.sender);
    }

    /// @notice Open voting after registration ends. Anyone can call.
    /// @param selectionId The selection ID.
    function openSenateVoting(uint256 selectionId) external {
        if (selectionId >= senateSelections.length) revert InvalidSelection();
        SenateSelection storage s = senateSelections[selectionId];
        if (block.timestamp < s.registrationEnd) revert RegistrationNotEnded();
        if (s.candidateCount == 0) revert NoCandidates();
        // Voting is time-based, no explicit phase transition needed
    }

    /// @notice Cast a vote in a senate selection. ONLY active council members of the province.
    /// @param selectionId The selection ID.
    /// @param candidateIndex The index of the candidate to vote for.
    function castSenateVote(uint256 selectionId, uint256 candidateIndex) external {
        if (selectionId >= senateSelections.length) revert InvalidSelection();
        SenateSelection storage s = senateSelections[selectionId];
        if (block.timestamp < s.registrationEnd) revert VotingNotOpen();
        if (block.timestamp > s.votingEnd) revert VotingNotOpen();
        if (candidateIndex >= s.candidateCount) revert InvalidCandidate();
        if (hasVotedInSelection[selectionId][msg.sender]) revert AlreadyVoted(msg.sender);

        // Must be an active council member of the same province
        if (!isActiveCouncilMember(msg.sender)) revert NotCouncilMember();
        if (memberProvince[msg.sender] != s.provinceId) revert WrongProvince();

        hasVotedInSelection[selectionId][msg.sender] = true;
        selectionCandidates[selectionId][candidateIndex].voteCount++;
        s.totalVotes++;

        emit SenateVoteCast(selectionId, msg.sender);
    }

    /// @notice Tally senate selection results. Anyone can call after voting ends.
    /// @param selectionId The selection ID.
    function tallySenateSelection(uint256 selectionId) external {
        if (selectionId >= senateSelections.length) revert InvalidSelection();
        SenateSelection storage s = senateSelections[selectionId];
        if (block.timestamp < s.votingEnd) revert VotingNotOpen();
        if (s.tallied) revert SelectionAlreadyTallied();

        s.tallied = true;
        uint256 deadline = constitution.getParameter(constitution.PARAM_CROWN_SEAT_DEADLINE());
        s.seatDeadline = block.timestamp + deadline;
        emit SenateSelectionTallied(selectionId, s.totalVotes);
    }

    /// @notice Seat selected senators in Parliament based on vote tallies. Crown triggers
    ///         seating but winners are determined automatically by vote count.
    /// @param selectionId The selection ID.
    function seatSelectedSenators(uint256 selectionId) external onlyCrown {
        if (selectionId >= senateSelections.length) revert InvalidSelection();
        SenateSelection storage s = senateSelections[selectionId];
        if (!s.tallied) revert SelectionNotTallied();
        if (s.seated) revert SelectionAlreadySeated();

        uint256 seatCount = provinces[s.provinceId].senateSeatCount;
        uint256 n = seatCount;
        if (n > s.candidateCount) n = s.candidateCount;
        if (n == 0) revert NoCandidates();

        s.seated = true;

        // Find top N candidates by vote count (same logic as claimSenatorSeatTimeout)
        uint256[] memory topIndices = new uint256[](n);
        bool[] memory selected = new bool[](s.candidateCount);

        for (uint256 i = 0; i < n; i++) {
            uint256 bestIdx = 0;
            uint256 bestVotes = 0;
            bool found = false;
            for (uint256 j = 0; j < s.candidateCount; j++) {
                if (selected[j]) continue;
                uint256 votes = selectionCandidates[selectionId][j].voteCount;
                if (!found || votes > bestVotes || (votes == bestVotes && j < bestIdx)) {
                    bestIdx = j;
                    bestVotes = votes;
                    found = true;
                }
            }
            topIndices[i] = bestIdx;
            selected[bestIdx] = true;
        }

        // Seat the winners in Parliament
        address parliamentAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        if (parliamentAddr == address(0) || parliamentAddr.code.length == 0) revert SeatMemberFailed();

        for (uint256 i = 0; i < n; i++) {
            address winner = selectionCandidates[selectionId][topIndices[i]].addr;
            Parliament(parliamentAddr).seatSenatorWithProvince(winner, s.provinceId);
        }

        emit SenateSelectionSeated(selectionId, n);
    }

    /// @notice Permissionless senator seat timeout: anyone can seat the top N candidates
    ///         by vote count after the Crown fails to act within the seating deadline.
    /// @param selectionId The selection ID.
    function claimSenatorSeatTimeout(uint256 selectionId) external {
        if (selectionId >= senateSelections.length) revert InvalidSelection();
        SenateSelection storage s = senateSelections[selectionId];
        if (!s.tallied) revert SelectionNotTallied();
        if (s.seated) revert SelectionAlreadySeated();
        if (block.timestamp < s.seatDeadline) revert DeadlineNotReached();

        uint256 seatCount = provinces[s.provinceId].senateSeatCount;

        s.seated = true;

        // Find top N candidates by vote count
        uint256 n = seatCount;
        if (n > s.candidateCount) n = s.candidateCount;

        // Selection sort: for each of the N slots, find the highest-voted candidate not yet selected
        uint256[] memory topIndices = new uint256[](n);
        bool[] memory selected = new bool[](s.candidateCount);

        for (uint256 i = 0; i < n; i++) {
            uint256 bestIdx = 0;
            uint256 bestVotes = 0;
            bool found = false;
            for (uint256 j = 0; j < s.candidateCount; j++) {
                if (selected[j]) continue;
                uint256 votes = selectionCandidates[selectionId][j].voteCount;
                if (!found || votes > bestVotes || (votes == bestVotes && j < bestIdx)) {
                    bestIdx = j;
                    bestVotes = votes;
                    found = true;
                }
            }
            topIndices[i] = bestIdx;
            selected[bestIdx] = true;
        }

        // Seat the winners in Parliament
        address parliamentAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
        if (parliamentAddr == address(0) || parliamentAddr.code.length == 0) revert SeatMemberFailed();

        for (uint256 i = 0; i < n; i++) {
            address winner = selectionCandidates[selectionId][topIndices[i]].addr;
            Parliament(parliamentAddr).seatSenatorWithProvince(winner, s.provinceId);
        }

        emit SenateSelectionSeated(selectionId, n);
    }

    // ─── View Functions ──────────────────────────────────────────────────

    /// @notice Get the total number of senate selections.
    function selectionCount() external view returns (uint256) {
        return senateSelections.length;
    }

    /// @notice Get senate selection core data.
    function getSelection(uint256 selectionId) external view returns (
        uint8 provinceId, bool tallied, bool seated, uint256 seatDeadline
    ) {
        if (selectionId >= senateSelections.length) revert InvalidSelection();
        SenateSelection storage s = senateSelections[selectionId];
        return (s.provinceId, s.tallied, s.seated, s.seatDeadline);
    }

    /// @notice Get a candidate's vote count in a selection.
    function getSelectionCandidateVotes(uint256 selectionId, uint256 candidateIndex)
        external view returns (uint256)
    {
        if (selectionId >= senateSelections.length) revert InvalidSelection();
        if (candidateIndex >= senateSelections[selectionId].candidateCount) revert InvalidCandidate();
        return selectionCandidates[selectionId][candidateIndex].voteCount;
    }

    /// @notice Get a candidate's address in a selection.
    function getSelectionCandidateAddr(uint256 selectionId, uint256 candidateIndex)
        external view returns (address)
    {
        if (selectionId >= senateSelections.length) revert InvalidSelection();
        if (candidateIndex >= senateSelections[selectionId].candidateCount) revert InvalidCandidate();
        return selectionCandidates[selectionId][candidateIndex].addr;
    }

    /// @notice Get province info.
    function getProvince(uint8 provinceId) external view returns (
        bytes32 name,
        uint256 councilSize,
        uint256 senateSeatCount,
        uint256 majlisSeatCount,
        uint256 currentCouncilCount,
        uint8 staggerCohort
    ) {
        Province storage p = provinces[provinceId];
        return (p.name, p.councilSize, p.senateSeatCount, p.majlisSeatCount, p.currentCouncilCount, p.staggerCohort);
    }

    /// @notice Get the Majlis seat count for a province.
    function getMajlisSeatCount(uint8 provinceId) external view returns (uint256) {
        return provinces[provinceId].majlisSeatCount;
    }

    /// @notice Update Majlis seat allocation across provinces (reapportionment).
    ///         Callable by Parliament via governance action after a reapportionment bill.
    ///         Total must match PARAM_TOTAL_MAJLIS_SEATS.
    /// @param ids Province IDs to update.
    /// @param newCounts New Majlis seat counts for each province.
    function updateMajlisSeatAllocation(uint8[] calldata ids, uint256[] calldata newCounts) external onlyParliament {
        if (ids.length != newCounts.length) revert ArrayLengthMismatch();

        uint256 totalSeats = constitution.getParameter(constitution.PARAM_TOTAL_MAJLIS_SEATS());
        uint256 sum;
        for (uint256 i = 0; i < ids.length; i++) {
            if (!provinces[ids[i]].initialized) revert ProvinceNotInitialized();
            sum += newCounts[i];
        }
        if (sum != totalSeats) revert TotalSeatsMismatch();

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 oldCount = provinces[ids[i]].majlisSeatCount;
            provinces[ids[i]].majlisSeatCount = newCounts[i];
            emit MajlisSeatAllocationUpdated(ids[i], oldCount, newCounts[i]);
        }
    }
}
