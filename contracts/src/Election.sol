// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Constitution.sol";
import "./Parliament.sol";
import "./ProvincialCouncil.sol";
import "./CitizenRegistry.sol";
import "./IIdentityVerifier.sol";
import "./verifiers/IBallotVerifier.sol";

/// @title Election
/// @notice Election cycles for Majlis and ProvincialCouncil. Candidate registration,
///         ballot casting with ZK passport proof verification (Groth16), tallying, and
///         member seating. Implements Part VIII of the Constitution.
/// @dev Ballot casting verifies a Groth16 ZK proof (citizenship, age >= 18, CSCA key hash,
///      per-election nullifier). Candidate registration uses CitizenRegistry for eligibility.
contract Election {
    // ─── Enums ───────────────────────────────────────────────────────────

    enum ElectionType { Majlis, Senate, ProvincialCouncil }
    enum ElectionPhase { Registration, Voting, Tallied, Seated }

    // ─── Structs ─────────────────────────────────────────────────────────

    struct ElectionData {
        ElectionType electionType;
        ElectionPhase phase;
        uint256 registrationStart;
        uint256 registrationEnd;
        uint256 votingStart;
        uint256 votingEnd;
        uint256 candidateCount;
        uint256 totalVotes;
        bool seated;
        uint8 provinceId;  // 0 for national elections, 1-31 for provincial
        uint256 seatDeadline; // Deadline for Crown to seat winners before permissionless timeout
    }

    struct Candidate {
        address addr;
        bytes32 partyHash;     // Hash identifying the party/platform
        uint256 voteCount;
        bool registered;
    }

    struct ProofPoints {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    // ─── Errors ──────────────────────────────────────────────────────────

    error NotAuthorized();
    error ZeroAddress();
    error InvalidElection();
    error NotInPhase(ElectionPhase expected);
    error RegistrationPeriodEnded();
    error RegistrationNotEnded();
    error VotingNotOpen();
    error AlreadyRegistered(address candidate);
    error AlreadyVoted(uint256 nullifier);
    error NotCitizen(address voter);
    error InvalidCandidate();
    error InvalidProof();
    error InvalidElectionBinding();
    error ElectionNotTallied();
    error NoCandidates();
    error SeatMemberFailed();
    error WrongProvince();
    error InvalidProvince();
    error MajlisElectionMustUseProvince();
    error DeadlineNotReached();

    // ─── Events ──────────────────────────────────────────────────────────

    event ElectionCreated(uint256 indexed electionId, ElectionType electionType);
    event CandidateRegistered(uint256 indexed electionId, address indexed candidate, bytes32 partyHash);
    event BallotCast(uint256 indexed electionId, uint256 indexed nullifier, uint256 candidateIndex);
    event ElectionTallied(uint256 indexed electionId, uint256 totalVotes);
    event MembersSeated(uint256 indexed electionId, uint256 memberCount);

    // ─── State ───────────────────────────────────────────────────────────

    Constitution public constitution;

    /// @notice All elections.
    ElectionData[] public elections;

    /// @notice Candidates per election: electionId → candidateIndex → Candidate.
    mapping(uint256 => mapping(uint256 => Candidate)) public candidates;

    /// @notice Track which addresses are candidates: electionId → addr → bool.
    mapping(uint256 => mapping(address => bool)) public isCandidate;

    /// @notice Track which nullifiers have been used: electionId → nullifier → bool.
    mapping(uint256 => mapping(uint256 => bool)) public nullifierUsed;

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

    modifier onlyCrown() {
        if (msg.sender != constitution.getContract(constitution.CONTRACT_CROWN())) revert NotAuthorized();
        _;
    }

    // ─── Election Lifecycle ─────────────────────────────────────────────

    /// @notice Start a new election cycle. Called by authorized contracts.
    ///         Majlis elections must use startMajlisElection(provinceId) instead.
    /// @param electionType Senate only (Majlis reverts).
    /// @return electionId The ID of the new election.
    function startElection(ElectionType electionType) external onlyParliament returns (uint256 electionId) {
        if (electionType == ElectionType.Majlis) revert MajlisElectionMustUseProvince();

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        uint256 votePeriod = constitution.getParameter(constitution.PARAM_ELECTION_VOTE_PERIOD());

        electionId = elections.length;
        elections.push(ElectionData({
            electionType: electionType,
            phase: ElectionPhase.Registration,
            registrationStart: block.timestamp,
            registrationEnd: block.timestamp + regPeriod,
            votingStart: block.timestamp + regPeriod,
            votingEnd: block.timestamp + regPeriod + votePeriod,
            candidateCount: 0,
            totalVotes: 0,
            seated: false,
            provinceId: 0,
            seatDeadline: 0
        }));

        emit ElectionCreated(electionId, electionType);
    }

    /// @notice Start a province-scoped Majlis election.
    /// @param provinceId The province (1-31).
    /// @return electionId The ID of the new election.
    function startMajlisElection(uint8 provinceId) external onlyParliament returns (uint256 electionId) {
        if (provinceId == 0 || provinceId > 31) revert InvalidProvince();
        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        uint256 votePeriod = constitution.getParameter(constitution.PARAM_ELECTION_VOTE_PERIOD());

        electionId = elections.length;
        elections.push(ElectionData({
            electionType: ElectionType.Majlis,
            phase: ElectionPhase.Registration,
            registrationStart: block.timestamp,
            registrationEnd: block.timestamp + regPeriod,
            votingStart: block.timestamp + regPeriod,
            votingEnd: block.timestamp + regPeriod + votePeriod,
            candidateCount: 0,
            totalVotes: 0,
            seated: false,
            provinceId: provinceId,
            seatDeadline: 0
        }));

        emit ElectionCreated(electionId, ElectionType.Majlis);
    }

    /// @notice Start a provincial council election for a specific province.
    /// @param provinceId The province (1-31).
    /// @return electionId The ID of the new election.
    function startProvincialElection(uint8 provinceId) external onlyCrown returns (uint256 electionId) {
        if (provinceId == 0 || provinceId > 31) revert InvalidProvince();
        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        uint256 votePeriod = constitution.getParameter(constitution.PARAM_ELECTION_VOTE_PERIOD());

        electionId = elections.length;
        elections.push(ElectionData({
            electionType: ElectionType.ProvincialCouncil,
            phase: ElectionPhase.Registration,
            registrationStart: block.timestamp,
            registrationEnd: block.timestamp + regPeriod,
            votingStart: block.timestamp + regPeriod,
            votingEnd: block.timestamp + regPeriod + votePeriod,
            candidateCount: 0,
            totalVotes: 0,
            seated: false,
            provinceId: provinceId,
            seatDeadline: 0
        }));

        emit ElectionCreated(electionId, ElectionType.ProvincialCouncil);
    }

    /// @notice Register as a candidate in an election.
    /// @param electionId The election ID.
    /// @param partyHash Hash identifying party/platform.
    function registerCandidate(uint256 electionId, bytes32 partyHash) external {
        if (electionId >= elections.length) revert InvalidElection();
        ElectionData storage e = elections[electionId];
        if (e.phase != ElectionPhase.Registration) revert NotInPhase(ElectionPhase.Registration);
        if (block.timestamp > e.registrationEnd) revert RegistrationPeriodEnded();
        if (isCandidate[electionId][msg.sender]) revert AlreadyRegistered(msg.sender);

        // Must be a registered citizen
        address registryAddr = constitution.getContract(constitution.CONTRACT_CITIZEN_REGISTRY());
        if (registryAddr == address(0) || registryAddr.code.length == 0) revert NotCitizen(msg.sender);
        if (!IIdentityVerifier(registryAddr).isCitizen(msg.sender)) revert NotCitizen(msg.sender);

        // For province-scoped elections, candidate must be from the correct province
        if (e.provinceId != 0) {
            if (CitizenRegistry(registryAddr).citizenProvince(msg.sender) != e.provinceId) revert WrongProvince();
        }

        uint256 idx = e.candidateCount;
        candidates[electionId][idx] = Candidate({
            addr: msg.sender,
            partyHash: partyHash,
            voteCount: 0,
            registered: true
        });
        isCandidate[electionId][msg.sender] = true;
        e.candidateCount++;

        emit CandidateRegistered(electionId, msg.sender, partyHash);
    }

    /// @notice Advance election from Registration to Voting phase.
    ///         Anyone can call after the registration period ends.
    /// @param electionId The election ID.
    function openVoting(uint256 electionId) external {
        if (electionId >= elections.length) revert InvalidElection();
        ElectionData storage e = elections[electionId];
        if (e.phase != ElectionPhase.Registration) revert NotInPhase(ElectionPhase.Registration);
        if (block.timestamp < e.registrationEnd) revert RegistrationNotEnded();
        if (e.candidateCount == 0) revert NoCandidates();

        e.phase = ElectionPhase.Voting;
    }

    /// @notice Cast a ballot in an election using a ZK proof.
    ///         The proof demonstrates citizenship eligibility without revealing identity.
    /// @param electionId The election ID.
    /// @param candidateIndex The index of the candidate to vote for.
    /// @param proof Groth16 proof points (a, b, c).
    /// @param pubSignals 23 public signals from the ZK circuit.
    function castBallot(
        uint256 electionId,
        uint256 candidateIndex,
        ProofPoints calldata proof,
        uint256[23] calldata pubSignals
    ) external {
        if (electionId >= elections.length) revert InvalidElection();
        ElectionData storage e = elections[electionId];
        if (e.phase != ElectionPhase.Voting) revert NotInPhase(ElectionPhase.Voting);
        if (block.timestamp > e.votingEnd) revert VotingNotOpen();
        if (candidateIndex >= e.candidateCount) revert InvalidCandidate();

        // Extract nullifier and check for double-voting
        uint256 nullifier = pubSignals[0];
        if (nullifierUsed[electionId][nullifier]) revert AlreadyVoted(nullifier);

        // Verify election binding: proof must be for this election and candidate
        if (pubSignals[9] != electionId) revert InvalidElectionBinding();
        if (pubSignals[10] != candidateIndex) revert InvalidElectionBinding();

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

        // For province-scoped elections, verify province from proof
        if (e.provinceId != 0) {
            if (pubSignals[11] != e.provinceId) revert WrongProvince();
        }

        // Verify ZK proof
        address verifierAddr = constitution.getContract(constitution.CONTRACT_BALLOT_VERIFIER());
        if (!IBallotVerifier(verifierAddr).verifyProof(proof.a, proof.b, proof.c, pubSignals)) {
            revert InvalidProof();
        }

        // Record vote
        nullifierUsed[electionId][nullifier] = true;
        candidates[electionId][candidateIndex].voteCount++;
        e.totalVotes++;

        emit BallotCast(electionId, nullifier, candidateIndex);
    }

    /// @notice Tally votes and determine results. Anyone can call after voting ends.
    /// @param electionId The election ID.
    function tallyVotes(uint256 electionId) external {
        if (electionId >= elections.length) revert InvalidElection();
        ElectionData storage e = elections[electionId];
        if (e.phase != ElectionPhase.Voting) revert NotInPhase(ElectionPhase.Voting);
        if (block.timestamp < e.votingEnd) revert VotingNotOpen();

        e.phase = ElectionPhase.Tallied;
        uint256 deadline = constitution.getParameter(constitution.PARAM_CROWN_SEAT_DEADLINE());
        e.seatDeadline = block.timestamp + deadline;

        emit ElectionTallied(electionId, e.totalVotes);
    }

    /// @notice Seat elected members based on vote tallies. Crown triggers seating but
    ///         winners are determined automatically by vote count — the Crown cannot
    ///         choose who to seat.
    /// @param electionId The election ID.
    function seatMembers(uint256 electionId) external onlyCrown {
        if (electionId >= elections.length) revert InvalidElection();
        ElectionData storage e = elections[electionId];
        if (e.phase != ElectionPhase.Tallied) revert ElectionNotTallied();

        // Look up seat count from ProvincialCouncil based on election type
        uint256 seatCount = _lookupSeatCount(e);

        // CEI: update state before external calls
        e.seated = true;
        e.phase = ElectionPhase.Seated;

        // Determine top N candidates by vote count
        uint256 n = seatCount;
        if (n > e.candidateCount) n = e.candidateCount;
        if (n == 0) revert NoCandidates();
        uint256[] memory topIndices = _topNCandidates(electionId, e.candidateCount, n);

        _seatWinners(electionId, e, topIndices);

        emit MembersSeated(electionId, n);
    }

    /// @notice Permissionless seat timeout: anyone can seat the top N candidates by vote count
    ///         after the Crown fails to act within the seating deadline.
    ///         Seat count is looked up from ProvincialCouncil at claim time.
    /// @param electionId The election ID.
    function claimSeatTimeout(uint256 electionId) external {
        if (electionId >= elections.length) revert InvalidElection();
        ElectionData storage e = elections[electionId];
        if (e.phase != ElectionPhase.Tallied) revert ElectionNotTallied();
        if (block.timestamp < e.seatDeadline) revert DeadlineNotReached();

        // Look up seat count from ProvincialCouncil based on election type
        uint256 seatCount = _lookupSeatCount(e);

        // CEI: update state before external calls
        e.seated = true;
        e.phase = ElectionPhase.Seated;

        // Determine top N candidates by vote count
        uint256 n = seatCount;
        if (n > e.candidateCount) n = e.candidateCount;
        uint256[] memory topIndices = _topNCandidates(electionId, e.candidateCount, n);

        // Seat the winners
        _seatWinners(electionId, e, topIndices);

        emit MembersSeated(electionId, n);
    }

    /// @dev Look up the number of seats to fill based on election type and province.
    function _lookupSeatCount(ElectionData storage e) internal view returns (uint256) {
        address pcAddr = constitution.getContract(constitution.CONTRACT_PROVINCIAL_COUNCIL());
        if (e.electionType == ElectionType.Majlis) {
            return ProvincialCouncil(pcAddr).getMajlisSeatCount(e.provinceId);
        } else if (e.electionType == ElectionType.ProvincialCouncil) {
            (, uint256 councilSize,,,,) = ProvincialCouncil(pcAddr).getProvince(e.provinceId);
            return councilSize;
        } else {
            // Senate elections go through ProvincialCouncil, not Election
            // Fallback: seat all candidates
            return e.candidateCount;
        }
    }

    /// @dev Find the top N candidates by vote count. Returns sorted indices (descending by votes).
    ///      Uses simple selection: for each of the N slots, scan all candidates to find the
    ///      highest-voted one not yet selected. O(N * candidateCount) — acceptable for elections.
    function _topNCandidates(uint256 electionId, uint256 candidateCount, uint256 n)
        internal view returns (uint256[] memory)
    {
        uint256[] memory topIndices = new uint256[](n);
        bool[] memory selected = new bool[](candidateCount);

        for (uint256 i = 0; i < n; i++) {
            uint256 bestIdx = 0;
            uint256 bestVotes = 0;
            bool found = false;
            for (uint256 j = 0; j < candidateCount; j++) {
                if (selected[j]) continue;
                uint256 votes = candidates[electionId][j].voteCount;
                if (!found || votes > bestVotes || (votes == bestVotes && j < bestIdx)) {
                    bestIdx = j;
                    bestVotes = votes;
                    found = true;
                }
            }
            topIndices[i] = bestIdx;
            selected[bestIdx] = true;
        }
        return topIndices;
    }

    /// @dev Seat winners from an array of candidate indices. Shared logic between
    ///      seatMembers (Crown) and claimSeatTimeout (permissionless).
    function _seatWinners(uint256 electionId, ElectionData storage e, uint256[] memory winnerIndices) internal {
        if (e.electionType == ElectionType.ProvincialCouncil) {
            address pcAddr = constitution.getContract(constitution.CONTRACT_PROVINCIAL_COUNCIL());
            if (pcAddr == address(0) || pcAddr.code.length == 0) revert SeatMemberFailed();

            for (uint256 i = 0; i < winnerIndices.length; i++) {
                if (winnerIndices[i] >= e.candidateCount) revert InvalidCandidate();
                address winner = candidates[electionId][winnerIndices[i]].addr;
                ProvincialCouncil(pcAddr).seatCouncilMember(winner, e.provinceId);
            }
        } else if (e.electionType == ElectionType.Majlis) {
            address parliamentAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
            if (parliamentAddr == address(0) || parliamentAddr.code.length == 0) revert SeatMemberFailed();

            for (uint256 i = 0; i < winnerIndices.length; i++) {
                if (winnerIndices[i] >= e.candidateCount) revert InvalidCandidate();
                address winner = candidates[electionId][winnerIndices[i]].addr;
                Parliament(parliamentAddr).seatMajlisMemberWithProvince(winner, e.provinceId);
            }
            Parliament(parliamentAddr).majlisElectionSeated();
        } else {
            address parliamentAddr = constitution.getContract(constitution.CONTRACT_PARLIAMENT());
            if (parliamentAddr == address(0) || parliamentAddr.code.length == 0) revert SeatMemberFailed();

            for (uint256 i = 0; i < winnerIndices.length; i++) {
                if (winnerIndices[i] >= e.candidateCount) revert InvalidCandidate();
                address winner = candidates[electionId][winnerIndices[i]].addr;
                Parliament(parliamentAddr).seatMember(winner, Parliament.Chamber.Senate);
            }
        }
    }

    // ─── View Functions ──────────────────────────────────────────────────

    /// @notice Get the total number of elections.
    function electionCount() external view returns (uint256) {
        return elections.length;
    }

    /// @notice Get a candidate's vote count.
    function getCandidateVotes(uint256 electionId, uint256 candidateIndex) external view returns (uint256) {
        if (electionId >= elections.length) revert InvalidElection();
        if (candidateIndex >= elections[electionId].candidateCount) revert InvalidCandidate();
        return candidates[electionId][candidateIndex].voteCount;
    }

    /// @notice Get a candidate's address.
    function getCandidateAddr(uint256 electionId, uint256 candidateIndex) external view returns (address) {
        if (electionId >= elections.length) revert InvalidElection();
        if (candidateIndex >= elections[electionId].candidateCount) revert InvalidCandidate();
        return candidates[electionId][candidateIndex].addr;
    }

    /// @notice Get election phase.
    function getElectionPhase(uint256 electionId) external view returns (ElectionPhase) {
        if (electionId >= elections.length) revert InvalidElection();
        return elections[electionId].phase;
    }

    /// @notice Get election core data (type, phase, province, seated).
    function getElection(uint256 electionId) external view returns (
        ElectionType electionType, ElectionPhase phase, uint8 provinceId, bool seated
    ) {
        if (electionId >= elections.length) revert InvalidElection();
        ElectionData storage e = elections[electionId];
        return (e.electionType, e.phase, e.provinceId, e.seated);
    }

    /// @notice Get election timing data.
    function getElectionTiming(uint256 electionId) external view returns (
        uint256 registrationStart, uint256 registrationEnd,
        uint256 votingStart, uint256 votingEnd, uint256 seatDeadline
    ) {
        if (electionId >= elections.length) revert InvalidElection();
        ElectionData storage e = elections[electionId];
        return (e.registrationStart, e.registrationEnd, e.votingStart, e.votingEnd, e.seatDeadline);
    }

    /// @notice Get election vote counts.
    function getElectionCounts(uint256 electionId) external view returns (
        uint256 candidateCount, uint256 totalVotes
    ) {
        if (electionId >= elections.length) revert InvalidElection();
        ElectionData storage e = elections[electionId];
        return (e.candidateCount, e.totalVotes);
    }

    /// @notice Check if a nullifier has been used in an election.
    /// @param electionId The election ID.
    /// @param nullifier The nullifier to check.
    /// @return True if the nullifier has been used.
    function isNullifierUsed(uint256 electionId, uint256 nullifier) external view returns (bool) {
        return nullifierUsed[electionId][nullifier];
    }

    // ─── Internal Helpers ──────────────────────────────────────────────────

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
