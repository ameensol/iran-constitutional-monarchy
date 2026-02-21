// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./helpers/MixinMajlis.sol";

/// @title ElectionTestBase
/// @notice Shared setup for Election.sol tests.
///         Inherits GovTestBase (via MixinMajlis) for full governance stack + ballot helpers.
///         citizen1-5 are seated as Majlis members (province 1).
///         eC1-eC5 are fresh citizens in province 2 for election tests.
abstract contract ElectionTestBase is MixinMajlis {
    // Events
    event ElectionCreated(uint256 indexed electionId, Election.ElectionType electionType);
    event CandidateRegistered(uint256 indexed electionId, address indexed candidate, bytes32 partyHash);
    event BallotCast(uint256 indexed electionId, uint256 indexed nullifier, uint256 candidateIndex);
    event ElectionTallied(uint256 indexed electionId, uint256 totalVotes);
    event MembersSeated(uint256 indexed electionId, uint256 memberCount);

    // Cache
    bytes32 internal PARAM_REG_PERIOD;
    bytes32 internal PARAM_VOTE_PERIOD;

    // Additional actors
    address internal unauthorized = makeAddr("unauthorized");
    address internal nonCitizen = makeAddr("nonCitizen");

    // Election-specific test citizens in province 2
    address internal eC1;
    address internal eC2;
    address internal eC3;
    address internal eC4;
    address internal eC5;

    function setUp() public virtual override {
        super.setUp();
        _setupMajlis();

        PARAM_REG_PERIOD = constitution.PARAM_ELECTION_REG_PERIOD();
        PARAM_VOTE_PERIOD = constitution.PARAM_ELECTION_VOTE_PERIOD();

        // Register 5 fresh citizens in province 2
        eC1 = makeAddr("eC1");
        eC2 = makeAddr("eC2");
        eC3 = makeAddr("eC3");
        eC4 = makeAddr("eC4");
        eC5 = makeAddr("eC5");

        vm.startPrank(authorityKey);
        registry.registerCitizen(eC1, keccak256("eC1-id"), 2);
        registry.registerCitizen(eC2, keccak256("eC2-id"), 2);
        registry.registerCitizen(eC3, keccak256("eC3-id"), 2);
        registry.registerCitizen(eC4, keccak256("eC4-id"), 2);
        registry.registerCitizen(eC5, keccak256("eC5-id"), 2);
        vm.stopPrank();
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    /// @dev Start a province-2 Majlis election via Majlis governance action.
    function _startMajlisElection() internal returns (uint256 electionId) {
        _executeMajlisAction(
            address(election),
            abi.encodeCall(Election.startMajlisElection, (2))
        );
        electionId = election.electionCount() - 1;
    }

    /// @dev Register eC1-eC3 as candidates.
    function _registerCandidates(uint256 electionId) internal {
        vm.prank(eC1);
        election.registerCandidate(electionId, keccak256("Party A"));
        vm.prank(eC2);
        election.registerCandidate(electionId, keccak256("Party B"));
        vm.prank(eC3);
        election.registerCandidate(electionId, keccak256("Party C"));
    }

    /// @dev Advance past registration period and open voting.
    function _advanceToVoting(uint256 electionId) internal {
        uint256 regPeriod = constitution.getParameter(PARAM_REG_PERIOD);
        _warpForward(regPeriod);
        election.openVoting(electionId);
    }

    /// @dev Full election: start → register eC1-eC3 → vote → tally. Province 2.
    function _runFullElection() internal returns (uint256 electionId) {
        electionId = _startMajlisElection();
        _registerCandidates(electionId);
        _advanceToVoting(electionId);

        // Vote: eC1→candidate0, eC2→candidate0, eC3→candidate1,
        //        eC4→candidate2, eC5→candidate0
        _castBallotWithProvince(eC1, electionId, 0, 2);
        _castBallotWithProvince(eC2, electionId, 0, 2);
        _castBallotWithProvince(eC3, electionId, 1, 2);
        _castBallotWithProvince(eC4, electionId, 2, 2);
        _castBallotWithProvince(eC5, electionId, 0, 2);

        uint256 votePeriod = constitution.getParameter(PARAM_VOTE_PERIOD);
        _warpForward(votePeriod);

        election.tallyVotes(electionId);
    }

    /// @dev Seat winners via Crown ministerial act (winners determined by vote tally).
    function _seatMembers(uint256 _electionId) internal {
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.seatMembers, (_electionId))
        );
    }

    /// @dev Start a provincial election via Crown ministerial act.
    function _startProvincialElection(uint8 provinceId) internal returns (uint256 electionId) {
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.startProvincialElection, (provinceId))
        );
        electionId = election.electionCount() - 1;
    }

    function _reassignProvince(address citizen, uint8 province) internal {
        vm.prank(authorityKey);
        registry.assignProvince(citizen, province);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO 1: CONSTRUCTION & ELECTION START
// ═══════════════════════════════════════════════════════════════════════════

contract ElectionConstructionTest is ElectionTestBase {

    function test_happyCase_constructor() public view {
        assertEq(address(election.constitution()), address(constitution));
        assertTrue(election.electionCount() > 0); // _setupMajlis already ran one election
    }

    function test_revert_constructor_zeroAddress() public {
        vm.expectRevert(Election.ZeroAddress.selector);
        new Election(address(0));
    }

    // ─── Start Majlis Election ──────────────────────────────────────────

    function test_happyCase_startMajlisElection() public {
        uint256 countBefore = election.electionCount();
        uint256 id = _startMajlisElection();

        assertEq(id, countBefore);
        assertEq(election.electionCount(), countBefore + 1);
        assertEq(uint256(election.getElectionPhase(id)), uint256(Election.ElectionPhase.Registration));
        (Election.ElectionType eType,, uint8 provId,) = election.getElection(id);
        assertEq(uint256(eType), uint256(Election.ElectionType.Majlis));
        assertEq(provId, 2);
    }

    function test_happyCase_startMajlisElection_emitsEvent() public {
        uint256 nextId = election.electionCount();

        vm.recordLogs();
        _startMajlisElection();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 sig = keccak256("ElectionCreated(uint256,uint8)");
        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == sig) {
                assertEq(uint256(logs[i].topics[1]), nextId);
                found = true;
                break;
            }
        }
        assertTrue(found, "ElectionCreated event not emitted");
    }

    function test_happyCase_startMajlisElection_timing() public {
        uint256 id = _startMajlisElection();
        uint256 regPeriod = constitution.getParameter(PARAM_REG_PERIOD);
        uint256 votePeriod = constitution.getParameter(PARAM_VOTE_PERIOD);

        (uint256 regStart, uint256 regEnd, uint256 voteStart, uint256 voteEnd,) =
            election.getElectionTiming(id);
        assertEq(regStart, block.timestamp);
        assertEq(regEnd, block.timestamp + regPeriod);
        assertEq(voteStart, block.timestamp + regPeriod);
        assertEq(voteEnd, block.timestamp + regPeriod + votePeriod);
    }

    function test_happyCase_startMajlisElection_counts() public {
        uint256 id = _startMajlisElection();
        (uint256 candidateCount, uint256 totalVotes) = election.getElectionCounts(id);
        assertEq(candidateCount, 0);
        assertEq(totalVotes, 0);
    }

    // ─── Start Senate Election ──────────────────────────────────────────

    function test_happyCase_startSenateElection() public {
        uint256 countBefore = election.electionCount();

        _executeMajlisAction(
            address(election),
            abi.encodeCall(Election.startElection, (Election.ElectionType.Senate))
        );

        uint256 id = election.electionCount() - 1;
        assertEq(id, countBefore);
        (Election.ElectionType eType,,,) = election.getElection(id);
        assertEq(uint256(eType), uint256(Election.ElectionType.Senate));
    }

    // ─── Start Provincial Election ──────────────────────────────────────

    function test_happyCase_startProvincialElection() public {
        uint256 countBefore = election.electionCount();
        uint256 id = _startProvincialElection(1);

        assertEq(id, countBefore);
        (Election.ElectionType eType,, uint8 provId,) = election.getElection(id);
        assertEq(uint256(eType), uint256(Election.ElectionType.ProvincialCouncil));
        assertEq(provId, 1);
    }

    // ─── Start Election Reverts ─────────────────────────────────────────

    function test_revert_startElection_rejectsMajlis() public {
        uint256 actionId = _prepareMajlisAction(
            address(election),
            abi.encodeCall(Election.startElection, (Election.ElectionType.Majlis))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_startMajlisElection_invalidProvince0() public {
        uint256 actionId = _prepareMajlisAction(
            address(election),
            abi.encodeCall(Election.startMajlisElection, (0))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_startMajlisElection_invalidProvince32() public {
        uint256 actionId = _prepareMajlisAction(
            address(election),
            abi.encodeCall(Election.startMajlisElection, (32))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_startProvincialElection_invalidProvince0() public {
        vm.prank(monarchAddr);
        vm.expectRevert(Crown.ExecutionFailed.selector);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.startProvincialElection, (0))
        );
    }

    function test_revert_startProvincialElection_invalidProvince32() public {
        vm.prank(monarchAddr);
        vm.expectRevert(Crown.ExecutionFailed.selector);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.startProvincialElection, (32))
        );
    }

    // ─── Modifier Tests ─────────────────────────────────────────────────

    function test_modifier_startElection_onlyParliament() public {
        vm.prank(unauthorized);
        vm.expectRevert(Election.NotAuthorized.selector);
        election.startElection(Election.ElectionType.Senate);
    }

    function test_modifier_startElection_rejectsCrown() public {
        vm.prank(address(crown));
        vm.expectRevert(Election.NotAuthorized.selector);
        election.startElection(Election.ElectionType.Senate);
    }

    function test_modifier_startMajlisElection_onlyParliament() public {
        vm.prank(unauthorized);
        vm.expectRevert(Election.NotAuthorized.selector);
        election.startMajlisElection(1);
    }

    function test_modifier_startProvincialElection_onlyCrown() public {
        vm.prank(unauthorized);
        vm.expectRevert(Election.NotAuthorized.selector);
        election.startProvincialElection(1);
    }

    function test_modifier_startProvincialElection_rejectsParliament() public {
        vm.prank(address(parliament));
        vm.expectRevert(Election.NotAuthorized.selector);
        election.startProvincialElection(1);
    }

    // ─── Boundary: Invalid Election IDs ─────────────────────────────────

    function test_boundary_getCandidateVotes_invalidElection() public {
        vm.expectRevert(Election.InvalidElection.selector);
        election.getCandidateVotes(999, 0);
    }

    function test_boundary_getElectionPhase_invalidElection() public {
        vm.expectRevert(Election.InvalidElection.selector);
        election.getElectionPhase(999);
    }

    function test_boundary_getElection_invalidElection() public {
        vm.expectRevert(Election.InvalidElection.selector);
        election.getElection(999);
    }

    function test_boundary_getElectionTiming_invalidElection() public {
        vm.expectRevert(Election.InvalidElection.selector);
        election.getElectionTiming(999);
    }

    function test_boundary_getElectionCounts_invalidElection() public {
        vm.expectRevert(Election.InvalidElection.selector);
        election.getElectionCounts(999);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO 2: REGISTRATION PHASE
// ═══════════════════════════════════════════════════════════════════════════

contract ElectionRegistrationTest is ElectionTestBase {
    uint256 internal electionId;

    function setUp() public override {
        super.setUp();
        electionId = _startMajlisElection();
    }

    function test_happyCase_registerCandidate() public {
        vm.prank(eC1);
        election.registerCandidate(electionId, keccak256("Party A"));

        assertTrue(election.isCandidate(electionId, eC1));
        assertEq(election.getCandidateAddr(electionId, 0), eC1);
    }

    function test_happyCase_registerCandidate_emitsEvent() public {
        bytes32 partyHash = keccak256("Party A");
        vm.expectEmit(true, true, false, true);
        emit CandidateRegistered(electionId, eC1, partyHash);

        vm.prank(eC1);
        election.registerCandidate(electionId, partyHash);
    }

    function test_happyCase_registerMultipleCandidates() public {
        _registerCandidates(electionId);

        assertEq(election.getCandidateAddr(electionId, 0), eC1);
        assertEq(election.getCandidateAddr(electionId, 1), eC2);
        assertEq(election.getCandidateAddr(electionId, 2), eC3);
        (uint256 candidateCount,) = election.getElectionCounts(electionId);
        assertEq(candidateCount, 3);
    }

    function test_revert_registerCandidate_notCitizen() public {
        vm.prank(nonCitizen);
        vm.expectRevert(abi.encodeWithSelector(Election.NotCitizen.selector, nonCitizen));
        election.registerCandidate(electionId, keccak256("Party X"));
    }

    function test_revert_registerCandidate_alreadyRegistered() public {
        vm.prank(eC1);
        election.registerCandidate(electionId, keccak256("Party A"));

        vm.prank(eC1);
        vm.expectRevert(abi.encodeWithSelector(Election.AlreadyRegistered.selector, eC1));
        election.registerCandidate(electionId, keccak256("Party A"));
    }

    function test_revert_registerCandidate_afterRegistrationEnds() public {
        uint256 regPeriod = constitution.getParameter(PARAM_REG_PERIOD);
        _warpForward(regPeriod + 1);

        vm.prank(eC1);
        vm.expectRevert(Election.RegistrationPeriodEnded.selector);
        election.registerCandidate(electionId, keccak256("Party A"));
    }

    function test_revert_registerCandidate_invalidElection() public {
        vm.prank(eC1);
        vm.expectRevert(Election.InvalidElection.selector);
        election.registerCandidate(999, keccak256("Party A"));
    }

    function test_boundary_getCandidateAddr_invalidCandidate() public {
        vm.expectRevert(Election.InvalidCandidate.selector);
        election.getCandidateAddr(electionId, 0);
    }

    // ─── Open Voting ────────────────────────────────────────────────────

    function test_happyCase_openVoting() public {
        _registerCandidates(electionId);

        uint256 regPeriod = constitution.getParameter(PARAM_REG_PERIOD);
        _warpForward(regPeriod);

        election.openVoting(electionId);
        assertEq(uint256(election.getElectionPhase(electionId)), uint256(Election.ElectionPhase.Voting));
    }

    function test_revert_openVoting_tooEarly() public {
        _registerCandidates(electionId);

        vm.expectRevert(Election.RegistrationNotEnded.selector);
        election.openVoting(electionId);
    }

    function test_revert_openVoting_noCandidates() public {
        uint256 regPeriod = constitution.getParameter(PARAM_REG_PERIOD);
        _warpForward(regPeriod);

        vm.expectRevert(Election.NoCandidates.selector);
        election.openVoting(electionId);
    }

    function test_revert_openVoting_invalidElection() public {
        vm.expectRevert(Election.InvalidElection.selector);
        election.openVoting(999);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO 3: VOTING PHASE
// ═══════════════════════════════════════════════════════════════════════════

contract ElectionVotingTest is ElectionTestBase {
    uint256 internal electionId;

    function setUp() public override {
        super.setUp();
        electionId = _startMajlisElection();
        _registerCandidates(electionId);
        _advanceToVoting(electionId);
    }

    // ─── Cast Ballot ────────────────────────────────────────────────────

    function test_happyCase_castBallot() public {
        _castBallotWithProvince(eC1, electionId, 0, 2);

        bytes32 idHash = _identityHash(eC1);
        uint256 nullifier = uint256(keccak256(abi.encodePacked(idHash, electionId)));
        assertTrue(election.isNullifierUsed(electionId, nullifier));
        assertEq(election.getCandidateVotes(electionId, 0), 1);
    }

    function test_happyCase_castBallot_emitsEvent() public {
        bytes32 idHash = _identityHash(eC1);
        uint256 expectedNullifier = uint256(keccak256(abi.encodePacked(idHash, electionId)));

        vm.expectEmit(true, true, false, true);
        emit BallotCast(electionId, expectedNullifier, 0);

        _castBallotWithProvince(eC1, electionId, 0, 2);
    }

    function test_happyCase_multipleBallots() public {
        _castBallotWithProvince(eC1, electionId, 0, 2);
        _castBallotWithProvince(eC2, electionId, 0, 2);
        _castBallotWithProvince(eC3, electionId, 1, 2);

        assertEq(election.getCandidateVotes(electionId, 0), 2);
        assertEq(election.getCandidateVotes(electionId, 1), 1);
        assertEq(election.getCandidateVotes(electionId, 2), 0);
    }

    // ─── Cast Ballot Reverts ────────────────────────────────────────────

    function test_revert_castBallot_invalidProof_wrongCitizenship() public {
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(eC1), electionId, 0, 2);
        signals[6] = 0xDEAD;

        vm.expectRevert(Election.InvalidProof.selector);
        election.castBallot(electionId, 0, proof, signals);
    }

    function test_revert_castBallot_alreadyVoted() public {
        _castBallotWithProvince(eC1, electionId, 0, 2);

        bytes32 idHash = _identityHash(eC1);
        uint256 expectedNullifier = uint256(keccak256(abi.encodePacked(idHash, electionId)));

        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(idHash, electionId, 0, 2);

        vm.expectRevert(abi.encodeWithSelector(Election.AlreadyVoted.selector, expectedNullifier));
        election.castBallot(electionId, 0, proof, signals);
    }

    function test_revert_castBallot_invalidCandidate() public {
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(eC1), electionId, 99, 2);
        vm.expectRevert(Election.InvalidCandidate.selector);
        election.castBallot(electionId, 99, proof, signals);
    }

    function test_revert_castBallot_votingEnded() public {
        uint256 votePeriod = constitution.getParameter(PARAM_VOTE_PERIOD);
        _warpForward(votePeriod + 1);

        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(eC1), electionId, 0, 2);
        vm.expectRevert(Election.VotingNotOpen.selector);
        election.castBallot(electionId, 0, proof, signals);
    }

    function test_revert_castBallot_wrongElectionBinding() public {
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(eC1), 999, 0, 2);
        vm.expectRevert(Election.InvalidElectionBinding.selector);
        election.castBallot(electionId, 0, proof, signals);
    }

    function test_revert_castBallot_wrongCandidateBinding() public {
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(eC1), electionId, 1, 2);
        vm.expectRevert(Election.InvalidElectionBinding.selector);
        election.castBallot(electionId, 0, proof, signals);
    }

    function test_revert_castBallot_wrongCscaKeyHash() public {
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(eC1), electionId, 0, 2);
        signals[12] = 0xBEEF;

        vm.expectRevert(Election.InvalidProof.selector);
        election.castBallot(electionId, 0, proof, signals);
    }

    function test_revert_castBallot_futureCurrentDate() public {
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(eC1), electionId, 0, 2);
        signals[13] = 20990101;

        vm.expectRevert(Election.InvalidProof.selector);
        election.castBallot(electionId, 0, proof, signals);
    }

    function test_revert_castBallot_verifierRejects() public {
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(eC1), electionId, 0, 2);
        // Mock verifier to reject the proof
        address verifierAddr = constitution.getContract(constitution.CONTRACT_BALLOT_VERIFIER());
        vm.mockCall(
            verifierAddr,
            abi.encodeWithSignature("verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[23])"),
            abi.encode(false)
        );
        vm.expectRevert(Election.InvalidProof.selector);
        election.castBallot(electionId, 0, proof, signals);
    }

    function test_revert_castBallot_zeroCscaKeyHash() public {
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(eC1), electionId, 0, 2);
        // Set CSCA key hash to 0 in registry (simulating unset key)
        vm.prank(authorityKey);
        registry.setCscaKey(0, 0, 0);
        vm.expectRevert(Election.InvalidProof.selector);
        election.castBallot(electionId, 0, proof, signals);
    }

    // ─── Registration blocked in Voting phase ───────────────────────────

    function test_revert_registerCandidate_inVotingPhase() public {
        vm.prank(eC4);
        vm.expectRevert(abi.encodeWithSelector(Election.NotInPhase.selector, Election.ElectionPhase.Registration));
        election.registerCandidate(electionId, keccak256("Party D"));
    }

    // ─── Nullifier Tests ────────────────────────────────────────────────

    function test_happyCase_isNullifierUsed() public {
        bytes32 idHash = _identityHash(eC1);
        uint256 nullifier = uint256(keccak256(abi.encodePacked(idHash, electionId)));

        assertFalse(election.isNullifierUsed(electionId, nullifier));
        _castBallotWithProvince(eC1, electionId, 0, 2);
        assertTrue(election.isNullifierUsed(electionId, nullifier));
    }

    function test_happyCase_differentElections_differentNullifiers() public {
        bytes32 idHash = _identityHash(eC1);
        uint256 nullifier1 = uint256(keccak256(abi.encodePacked(idHash, electionId)));

        _castBallotWithProvince(eC1, electionId, 0, 2);
        assertTrue(election.isNullifierUsed(electionId, nullifier1));

        // Start a second election
        _executeMajlisAction(
            address(election),
            abi.encodeCall(Election.startMajlisElection, (2))
        );
        uint256 id2 = election.electionCount() - 1;

        vm.prank(eC1);
        election.registerCandidate(id2, keccak256("Party A"));
        vm.prank(eC2);
        election.registerCandidate(id2, keccak256("Party B"));

        uint256 regPeriod = constitution.getParameter(PARAM_REG_PERIOD);
        _warpForward(regPeriod);
        election.openVoting(id2);

        uint256 nullifier2 = uint256(keccak256(abi.encodePacked(idHash, id2)));
        assertTrue(nullifier1 != nullifier2);

        _castBallotWithProvince(eC1, id2, 0, 2);
        assertTrue(election.isNullifierUsed(id2, nullifier2));
    }

    // ─── Tally ──────────────────────────────────────────────────────────

    function test_revert_tallyVotes_votingNotEnded() public {
        vm.expectRevert(Election.VotingNotOpen.selector);
        election.tallyVotes(electionId);
    }

    function test_revert_castBallot_notInVotingPhase() public {
        // Start a new election but don't advance to voting
        uint256 newId = _startMajlisElection();
        _registerCandidates(newId);

        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(eC1), newId, 0, 2);
        vm.expectRevert(abi.encodeWithSelector(Election.NotInPhase.selector, Election.ElectionPhase.Voting));
        election.castBallot(newId, 0, proof, signals);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO 4: TALLIED PHASE
// ═══════════════════════════════════════════════════════════════════════════

contract ElectionTalliedTest is ElectionTestBase {
    uint256 internal electionId;

    function setUp() public override {
        super.setUp();
        electionId = _runFullElection();
    }

    // ─── Tally Results ──────────────────────────────────────────────────

    function test_happyCase_tallyVotes_phase() public view {
        assertEq(uint256(election.getElectionPhase(electionId)), uint256(Election.ElectionPhase.Tallied));
    }

    function test_happyCase_tallyVotes_voteCounts() public view {
        assertEq(election.getCandidateVotes(electionId, 0), 3); // eC1, eC2, eC5
        assertEq(election.getCandidateVotes(electionId, 1), 1); // eC3
        assertEq(election.getCandidateVotes(electionId, 2), 1); // eC4
    }

    function test_happyCase_tallyVotes_totalVotes() public view {
        (, uint256 totalVotes) = election.getElectionCounts(electionId);
        assertEq(totalVotes, 5);
    }

    function test_happyCase_tallyVotes_emitsEvent() public {
        // Need a fresh election to test event emission
        uint256 freshId = _startMajlisElection();
        _registerCandidates(freshId);
        _advanceToVoting(freshId);
        _castBallotWithProvince(eC1, freshId, 0, 2);

        uint256 votePeriod = constitution.getParameter(PARAM_VOTE_PERIOD);
        _warpForward(votePeriod);

        vm.expectEmit(true, false, false, true);
        emit ElectionTallied(freshId, 1);
        election.tallyVotes(freshId);
    }

    function test_revert_tallyVotes_notInVotingPhase() public {
        // Election is already tallied — trying to tally again fails
        vm.expectRevert(abi.encodeWithSelector(Election.NotInPhase.selector, Election.ElectionPhase.Voting));
        election.tallyVotes(electionId);
    }

    function test_revert_tallyVotes_invalidElection() public {
        vm.expectRevert(Election.InvalidElection.selector);
        election.tallyVotes(999);
    }

    // ─── Seat Members (Crown ministerial act) ───────────────────────────

    function test_happyCase_seatMembers() public {
        _seatMembers(electionId);

        assertEq(uint256(election.getElectionPhase(electionId)), uint256(Election.ElectionPhase.Seated));
        // All 3 candidates seated (province 2 has majlisSeatCount=60, 3 candidates)
        assertTrue(parliament.isMajlisMember(eC1));
        assertTrue(parliament.isMajlisMember(eC2));
        assertTrue(parliament.isMajlisMember(eC3));
    }

    function test_happyCase_seatMembers_emitsEvent() public {
        // Province 2 has majlisSeatCount=60, we have 3 candidates → seats 3
        vm.expectEmit(true, false, false, true);
        emit MembersSeated(electionId, 3);
        _seatMembers(electionId);
    }

    function test_happyCase_seatMembers_seatsTopByVotes() public {
        _seatMembers(electionId);
        assertEq(uint256(election.getElectionPhase(electionId)), uint256(Election.ElectionPhase.Seated));
        // All 3 seated, ordered by votes: eC1 (3 votes), eC2 (1), eC3 (1)
        assertTrue(parliament.isMajlisMember(eC1));
        assertTrue(parliament.isMajlisMember(eC2));
        assertTrue(parliament.isMajlisMember(eC3));
    }

    function test_revert_seatMembers_notTallied() public {
        uint256 freshId = _startMajlisElection();
        _registerCandidates(freshId);
        _advanceToVoting(freshId);

        vm.prank(monarchAddr);
        vm.expectRevert(Crown.ExecutionFailed.selector);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.seatMembers, (freshId))
        );
    }

    function test_revert_seatMembers_alreadySeated() public {
        _seatMembers(electionId);

        vm.prank(monarchAddr);
        vm.expectRevert(Crown.ExecutionFailed.selector);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.seatMembers, (electionId))
        );
    }

    function test_modifier_seatMembers_onlyCrown() public {
        vm.prank(unauthorized);
        vm.expectRevert(Election.NotAuthorized.selector);
        election.seatMembers(electionId);
    }

    function test_modifier_seatMembers_rejectsParliament() public {
        vm.prank(address(parliament));
        vm.expectRevert(Election.NotAuthorized.selector);
        election.seatMembers(electionId);
    }

    // ─── Seat Timeout ───────────────────────────────────────────────────

    function test_happyCase_claimSeatTimeout() public {
        uint256 seatDeadline = constitution.getParameter(constitution.PARAM_CROWN_SEAT_DEADLINE());
        _warpForward(seatDeadline);

        vm.prank(unauthorized);
        election.claimSeatTimeout(electionId);

        assertEq(uint256(election.getElectionPhase(electionId)), uint256(Election.ElectionPhase.Seated));
        assertTrue(parliament.isMajlisMember(eC1)); // Top candidate by votes
    }

    function test_revert_claimSeatTimeout_tooEarly() public {
        vm.prank(unauthorized);
        vm.expectRevert(Election.DeadlineNotReached.selector);
        election.claimSeatTimeout(electionId);
    }

    function test_revert_claimSeatTimeout_alreadySeated() public {
        _seatMembers(electionId);

        uint256 seatDeadline = constitution.getParameter(constitution.PARAM_CROWN_SEAT_DEADLINE());
        _warpForward(seatDeadline);

        vm.prank(unauthorized);
        vm.expectRevert(Election.ElectionNotTallied.selector);
        election.claimSeatTimeout(electionId);
    }

    function test_happyCase_claimSeatTimeout_correctWinners() public {
        // Start a new election with different vote distribution
        _executeMajlisAction(
            address(election),
            abi.encodeCall(Election.startMajlisElection, (2))
        );
        uint256 id = election.electionCount() - 1;

        vm.prank(eC1);
        election.registerCandidate(id, keccak256("Party A"));
        vm.prank(eC2);
        election.registerCandidate(id, keccak256("Party B"));
        vm.prank(eC3);
        election.registerCandidate(id, keccak256("Party C"));

        uint256 regPeriod = constitution.getParameter(PARAM_REG_PERIOD);
        _warpForward(regPeriod);
        election.openVoting(id);

        // eC2 gets 2, eC3 gets 2, eC1 gets 1
        _castBallotWithProvince(eC4, id, 1, 2);
        _castBallotWithProvince(eC5, id, 1, 2);
        _castBallotWithProvince(eC1, id, 2, 2);
        _castBallotWithProvince(eC3, id, 2, 2);
        _castBallotWithProvince(eC2, id, 0, 2);

        uint256 votePeriod = constitution.getParameter(PARAM_VOTE_PERIOD);
        _warpForward(votePeriod);
        election.tallyVotes(id);

        uint256 seatDeadline = constitution.getParameter(constitution.PARAM_CROWN_SEAT_DEADLINE());
        _warpForward(seatDeadline);

        vm.prank(unauthorized);
        election.claimSeatTimeout(id);

        assertTrue(parliament.isMajlisMember(eC1));
        assertTrue(parliament.isMajlisMember(eC2));
        assertTrue(parliament.isMajlisMember(eC3));
    }

    function test_happyCase_tallyVotes_zeroVotes() public {
        // Start fresh election, register candidates, open voting, but cast NO votes
        uint256 freshId = _startMajlisElection();
        _registerCandidates(freshId);
        _advanceToVoting(freshId);

        uint256 votePeriod = constitution.getParameter(PARAM_VOTE_PERIOD);
        _warpForward(votePeriod);

        // Tally with 0 votes — should succeed
        election.tallyVotes(freshId);
        assertEq(uint256(election.getElectionPhase(freshId)), uint256(Election.ElectionPhase.Tallied));
        (, uint256 totalVotes) = election.getElectionCounts(freshId);
        assertEq(totalVotes, 0);
    }

    function test_boundary_claimSeatTimeout_exactlyAtDeadline() public {
        (,,,, uint256 seatDeadline) = election.getElectionTiming(electionId);
        uint256 currentTime = block.timestamp;
        // Warp to exactly the deadline
        vm.warp(seatDeadline);

        vm.prank(unauthorized);
        election.claimSeatTimeout(electionId);
        assertEq(uint256(election.getElectionPhase(electionId)), uint256(Election.ElectionPhase.Seated));
    }

    function test_boundary_claimSeatTimeout_oneSecondBefore() public {
        (,,,, uint256 seatDeadline) = election.getElectionTiming(electionId);
        vm.warp(seatDeadline - 1);

        vm.prank(unauthorized);
        vm.expectRevert(Election.DeadlineNotReached.selector);
        election.claimSeatTimeout(electionId);
    }

    function test_happyCase_seatDeadline_setOnTally() public view {
        (,,,, uint256 seatDeadline) = election.getElectionTiming(electionId);
        assertGt(seatDeadline, 0);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO 5: PROVINCIAL ELECTIONS (province enforcement)
// ═══════════════════════════════════════════════════════════════════════════

contract ElectionProvincialTest is ElectionTestBase {

    function test_happyCase_provincialElection_provinceEnforcement() public {
        _reassignProvince(eC1, 1);
        _reassignProvince(eC2, 1);
        _reassignProvince(eC3, 2);

        uint256 id = _startProvincialElection(1);

        // Province 1 citizen can register
        vm.prank(eC1);
        election.registerCandidate(id, keccak256("Party A"));

        // Province 2 citizen cannot register
        vm.prank(eC3);
        vm.expectRevert(Election.WrongProvince.selector);
        election.registerCandidate(id, keccak256("Party B"));
    }

    function test_happyCase_provincialElection_voteEnforcement() public {
        _reassignProvince(eC1, 1);
        _reassignProvince(eC2, 1);
        _reassignProvince(eC3, 2);

        uint256 id = _startProvincialElection(1);

        vm.prank(eC1);
        election.registerCandidate(id, keccak256("Party A"));

        uint256 regPeriod = constitution.getParameter(PARAM_REG_PERIOD);
        _warpForward(regPeriod);
        election.openVoting(id);

        // Province 1 citizen can vote
        _castBallotWithProvince(eC2, id, 0, 1);

        // Province 2 citizen cannot vote
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(eC3), id, 0, 2);
        vm.expectRevert(Election.WrongProvince.selector);
        election.castBallot(id, 0, proof, signals);
    }

    function test_happyCase_provincialElection_seatToCouncil() public {
        _reassignProvince(eC1, 1);
        _reassignProvince(eC2, 1);
        _reassignProvince(eC4, 1);
        _reassignProvince(eC5, 1);

        uint256 id = _startProvincialElection(1);

        vm.prank(eC1);
        election.registerCandidate(id, keccak256("Party A"));

        uint256 regPeriod = constitution.getParameter(PARAM_REG_PERIOD);
        _warpForward(regPeriod);
        election.openVoting(id);

        _castBallotWithProvince(eC2, id, 0, 1);
        _castBallotWithProvince(eC4, id, 0, 1);

        uint256 votePeriod = constitution.getParameter(PARAM_VOTE_PERIOD);
        _warpForward(votePeriod);
        election.tallyVotes(id);

        _seatMembers(id);

        // Verified seated in ProvincialCouncil, not Parliament
        assertTrue(pc.isCouncilMember(1, eC1));
        assertFalse(parliament.isMajlisMember(eC1));
    }

    // ─── Province-scoped Majlis Elections ────────────────────────────────

    function test_happyCase_majlisElection_provinceEnforcement() public {
        _reassignProvince(eC1, 1);
        _reassignProvince(eC2, 1);
        _reassignProvince(eC3, 2);

        _executeMajlisAction(
            address(election),
            abi.encodeCall(Election.startMajlisElection, (1))
        );
        uint256 id = election.electionCount() - 1;

        vm.prank(eC1);
        election.registerCandidate(id, keccak256("Party A"));

        vm.prank(eC3);
        vm.expectRevert(Election.WrongProvince.selector);
        election.registerCandidate(id, keccak256("Party B"));
    }

    function test_happyCase_majlisElection_voteEnforcement() public {
        _reassignProvince(eC1, 1);
        _reassignProvince(eC2, 1);
        _reassignProvince(eC3, 2);

        _executeMajlisAction(
            address(election),
            abi.encodeCall(Election.startMajlisElection, (1))
        );
        uint256 id = election.electionCount() - 1;

        vm.prank(eC1);
        election.registerCandidate(id, keccak256("Party A"));

        uint256 regPeriod = constitution.getParameter(PARAM_REG_PERIOD);
        _warpForward(regPeriod);
        election.openVoting(id);

        _castBallotWithProvince(eC2, id, 0, 1);

        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(eC3), id, 0, 2);
        vm.expectRevert(Election.WrongProvince.selector);
        election.castBallot(id, 0, proof, signals);
    }

    function test_happyCase_majlisElection_seatWithProvince() public {
        _reassignProvince(eC1, 1);
        _reassignProvince(eC2, 1);
        _reassignProvince(eC4, 1);
        _reassignProvince(eC5, 1);

        _executeMajlisAction(
            address(election),
            abi.encodeCall(Election.startMajlisElection, (1))
        );
        uint256 id = election.electionCount() - 1;

        vm.prank(eC1);
        election.registerCandidate(id, keccak256("Party A"));

        uint256 regPeriod = constitution.getParameter(PARAM_REG_PERIOD);
        _warpForward(regPeriod);
        election.openVoting(id);

        _castBallotWithProvince(eC2, id, 0, 1);
        _castBallotWithProvince(eC4, id, 0, 1);

        uint256 votePeriod = constitution.getParameter(PARAM_VOTE_PERIOD);
        _warpForward(votePeriod);
        election.tallyVotes(id);

        _seatMembers(id);

        assertTrue(parliament.isMajlisMember(eC1));
        assertEq(parliament.majlisMemberProvince(eC1), 1);
    }
}
