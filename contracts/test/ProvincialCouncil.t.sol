// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./helpers/TestBase.sol";
import "./helpers/MixinMajlis.sol";
import "./helpers/MixinJustices.sol";

/// @title ProvincialCouncilInitTest
/// @notice Tests for initializeProvinces — needs provinces NOT yet initialized.
///         Overrides _postDeploy() to skip province initialization.
contract ProvincialCouncilInitTest is GovTestBase {
    event ProvinceInitialized(uint8 indexed provinceId, bytes32 name, uint256 councilSize, uint256 senateSeatCount, uint256 majlisSeatCount, uint8 cohort);

    /// @dev Skip province initialization so we can test it ourselves.
    function _postDeploy() internal override {
        // Intentionally empty — no province init, no province assignments, no audit head
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. CONSTRUCTION
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_constructor() public view {
        assertEq(address(pc.constitution()), address(constitution));
        assertFalse(pc.provincesInitialized());
        assertEq(pc.selectionCount(), 0);
    }

    function test_revert_constructor_zeroAddress() public {
        vm.expectRevert(ProvincialCouncil.ZeroAddress.selector);
        new ProvincialCouncil(address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. PROVINCE INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════

    function _makeInits(uint8 count) internal pure returns (ProvincialCouncil.ProvinceInit[] memory inits) {
        inits = new ProvincialCouncil.ProvinceInit[](count);
    }

    function test_happyCase_initializeProvinces() public {
        ProvincialCouncil.ProvinceInit[] memory inits = _makeInits(3);
        inits[0] = ProvincialCouncil.ProvinceInit(1, bytes32("TEHRAN"),  15, 5, 200, 0);
        inits[1] = ProvincialCouncil.ProvinceInit(2, bytes32("ISFAHAN"), 15, 3, 60,  1);
        inits[2] = ProvincialCouncil.ProvinceInit(3, bytes32("FARS"),    15, 2, 30,  2);

        vm.prank(monarchAddr);
        crown.initializeProvincialCouncils(inits);

        assertTrue(pc.provincesInitialized());
        assertEq(pc.provinceCount(), 3);

        (bytes32 name, uint256 councilSize, uint256 senateSeatCount, uint256 majlisSeatCount, uint256 currentCount, uint8 cohort)
            = pc.getProvince(1);
        assertEq(name, bytes32("TEHRAN"));
        assertEq(councilSize, 15);
        assertEq(senateSeatCount, 5);
        assertEq(majlisSeatCount, 200);
        assertEq(currentCount, 0);
        assertEq(cohort, 0);
    }

    function test_happyCase_initializeProvinces_emitsEvents() public {
        ProvincialCouncil.ProvinceInit[] memory inits = _makeInits(1);
        inits[0] = ProvincialCouncil.ProvinceInit(1, bytes32("TEHRAN"), 15, 5, 10, 0);

        vm.expectEmit(true, false, false, true);
        emit ProvinceInitialized(1, bytes32("TEHRAN"), 15, 5, 10, 0);

        vm.prank(monarchAddr);
        crown.initializeProvincialCouncils(inits);
    }

    function test_revert_initializeProvinces_alreadyInitialized() public {
        ProvincialCouncil.ProvinceInit[] memory inits = _makeInits(1);
        inits[0] = ProvincialCouncil.ProvinceInit(1, bytes32("TEHRAN"), 5, 1, 10, 0);

        vm.prank(monarchAddr);
        crown.initializeProvincialCouncils(inits);

        vm.prank(monarchAddr);
        vm.expectRevert(ProvincialCouncil.ProvincesAlreadyInitialized.selector);
        crown.initializeProvincialCouncils(inits);
    }

    function test_revert_initializeProvinces_invalidProvinceId() public {
        ProvincialCouncil.ProvinceInit[] memory inits = _makeInits(1);
        inits[0] = ProvincialCouncil.ProvinceInit(0, bytes32("INVALID"), 15, 1, 10, 0);

        vm.prank(monarchAddr);
        vm.expectRevert(ProvincialCouncil.InvalidProvince.selector);
        crown.initializeProvincialCouncils(inits);
    }

    function test_modifier_initializeProvinces_onlyCrown() public {
        ProvincialCouncil.ProvinceInit[] memory inits = _makeInits(0);

        address unauthorized = makeAddr("unauthorized");
        vm.prank(unauthorized);
        vm.expectRevert(ProvincialCouncil.NotAuthorized.selector);
        pc.initializeProvinces(inits);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. BOUNDARY — PROVINCE IDs
    // ═══════════════════════════════════════════════════════════════════════

    function test_boundary_province31() public {
        ProvincialCouncil.ProvinceInit[] memory inits = _makeInits(1);
        inits[0] = ProvincialCouncil.ProvinceInit(31, bytes32("KERMANSHAH"), 15, 2, 5, 2);

        vm.prank(monarchAddr);
        crown.initializeProvincialCouncils(inits);

        (bytes32 name,,,,, uint8 cohort) = pc.getProvince(31);
        assertEq(name, bytes32("KERMANSHAH"));
        assertEq(cohort, 2);
    }

    function test_boundary_provinceId32_reverts() public {
        ProvincialCouncil.ProvinceInit[] memory inits = _makeInits(1);
        inits[0] = ProvincialCouncil.ProvinceInit(32, bytes32("INVALID"), 15, 1, 5, 0);

        vm.prank(monarchAddr);
        vm.expectRevert(ProvincialCouncil.InvalidProvince.selector);
        crown.initializeProvincialCouncils(inits);
    }

    function test_revert_initializeProvinces_duplicateProvinceId() public {
        ProvincialCouncil.ProvinceInit[] memory inits = _makeInits(2);
        inits[0] = ProvincialCouncil.ProvinceInit(1, bytes32("TEHRAN"), 15, 5, 200, 0);
        inits[1] = ProvincialCouncil.ProvinceInit(1, bytes32("DUPLICATE"), 10, 3, 100, 1);

        vm.prank(monarchAddr);
        vm.expectRevert(ProvincialCouncil.AlreadyInitialized.selector);
        crown.initializeProvincialCouncils(inits);
    }
}

/// @title ProvincialCouncilTest
/// @notice Tests for council membership, senate selection, seating, timeout, reapportionment.
///         Provinces initialized via GovTestBase. Council members seated via real provincial elections.
contract ProvincialCouncilTest is GovTestBase {
    event CouncilMemberSeated(address indexed member, uint8 indexed provinceId);
    event SenateSelectionStarted(uint256 indexed selectionId, uint8 indexed provinceId);
    event SenateCandidateRegistered(uint256 indexed selectionId, address indexed candidate);
    event SenateVoteCast(uint256 indexed selectionId, address indexed voter);
    event SenateSelectionSeated(uint256 indexed selectionId, uint256 seatedCount);

    // Additional citizens for senate candidacy (province 1)
    address internal senCand1;
    address internal senCand2;
    address internal senCand3;

    function setUp() public override {
        super.setUp();

        // Register 3 additional citizens in province 1 for senate candidacy
        senCand1 = makeAddr("senCand1");
        senCand2 = makeAddr("senCand2");
        senCand3 = makeAddr("senCand3");
        vm.startPrank(authorityKey);
        registry.registerCitizen(senCand1, keccak256(abi.encodePacked(senCand1)), 1);
        registry.registerCitizen(senCand2, keccak256(abi.encodePacked(senCand2)), 1);
        registry.registerCitizen(senCand3, keccak256(abi.encodePacked(senCand3)), 1);
        vm.stopPrank();
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    /// @dev Run a real provincial election and seat winners as council members.
    function _electAndSeatCouncil(uint8 prov, address[] memory candidates) internal {
        // Crown starts provincial election
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.startProvincialElection, (prov))
        );
        uint256 elId = election.electionCount() - 1;

        // Candidates register
        for (uint256 i = 0; i < candidates.length; i++) {
            vm.prank(candidates[i]);
            election.registerCandidate(elId, keccak256(abi.encodePacked("PC-Party", i)));
        }

        // Warp past registration, open voting
        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        _warpForward(regPeriod);
        election.openVoting(elId);

        // Each candidate votes for themselves
        for (uint256 i = 0; i < candidates.length; i++) {
            _castBallotWithProvince(candidates[i], elId, i, prov);
        }

        // Warp past voting, tally
        uint256 votePeriod = constitution.getParameter(constitution.PARAM_ELECTION_VOTE_PERIOD());
        _warpForward(votePeriod);
        election.tallyVotes(elId);

        // Crown seats winners (determined by vote tally)
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.seatMembers, (elId))
        );
    }

    /// @dev Seat citizen1-3 as province 1 council members via real election.
    function _seatThreeCouncilMembers() internal {
        address[] memory cands = new address[](3);
        cands[0] = citizen1;
        cands[1] = citizen2;
        cands[2] = citizen3;
        _electAndSeatCouncil(1, cands);
    }

    /// @dev Run full senate selection for province 1 with senCand1+senCand2 as candidates.
    ///      Assumes council members are already seated. Returns selectionId.
    function _runFullSenateSelection() internal returns (uint256 selId) {
        _seatThreeCouncilMembers();

        // Crown starts senate selection
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        selId = pc.selectionCount() - 1;

        // Register candidates
        vm.prank(senCand1);
        pc.registerSenateCandidate(selId);
        vm.prank(senCand2);
        pc.registerSenateCandidate(selId);

        // Warp past registration
        uint256 regPeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_REG_PERIOD());
        _warpForward(regPeriod);

        // Council members vote
        vm.prank(citizen1);
        pc.castSenateVote(selId, 0); // vote for senCand1
        vm.prank(citizen2);
        pc.castSenateVote(selId, 0); // vote for senCand1
        vm.prank(citizen3);
        pc.castSenateVote(selId, 1); // vote for senCand2

        // Warp past voting
        uint256 votePeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_VOTE_PERIOD());
        _warpForward(votePeriod);

        // Tally
        pc.tallySenateSelection(selId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. COUNCIL MEMBERSHIP
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_seatCouncilMember() public {
        address[] memory cands = new address[](1);
        cands[0] = citizen1;
        _electAndSeatCouncil(1, cands);

        assertTrue(pc.isCouncilMember(1, citizen1));
        assertEq(pc.memberProvince(citizen1), 1);
        (, , , , uint256 currentCount, ) = pc.getProvince(1);
        assertEq(currentCount, 1);
    }

    function test_happyCase_seatCouncilMember_emitsEvent() public {
        // Start provincial election
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.startProvincialElection, (1))
        );
        uint256 elId = election.electionCount() - 1;

        vm.prank(citizen1);
        election.registerCandidate(elId, keccak256("Party0"));

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        _warpForward(regPeriod);
        election.openVoting(elId);

        _castBallotWithProvince(citizen1, elId, 0, 1);

        uint256 votePeriod = constitution.getParameter(constitution.PARAM_ELECTION_VOTE_PERIOD());
        _warpForward(votePeriod);
        election.tallyVotes(elId);

        // Expect the CouncilMemberSeated event
        vm.expectEmit(true, true, false, false);
        emit CouncilMemberSeated(citizen1, 1);

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.seatMembers, (elId))
        );
    }

    function test_revert_seatCouncilMember_alreadyMember() public {
        // Seat citizen1 first
        address[] memory cands = new address[](1);
        cands[0] = citizen1;
        _electAndSeatCouncil(1, cands);

        // Try to seat again via another election
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.startProvincialElection, (1))
        );
        uint256 elId2 = election.electionCount() - 1;

        vm.prank(citizen1);
        election.registerCandidate(elId2, keccak256("Party-redo"));

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        _warpForward(regPeriod);
        election.openVoting(elId2);

        _castBallotWithProvince(citizen1, elId2, 0, 1);

        uint256 votePeriod = constitution.getParameter(constitution.PARAM_ELECTION_VOTE_PERIOD());
        _warpForward(votePeriod);
        election.tallyVotes(elId2);

        vm.prank(monarchAddr);
        vm.expectRevert(); // AlreadyCouncilMember bubbles up via executeMinisterialAct
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.seatMembers, (elId2))
        );
    }

    function test_revert_seatCouncilMember_councilFull() public {
        // Province 1 has councilSize=5 in GovTestBase. Seat all 5, then try a 6th.
        address[] memory cands = new address[](5);
        cands[0] = citizen1;
        cands[1] = citizen2;
        cands[2] = citizen3;
        cands[3] = citizen4;
        cands[4] = citizen5;
        _electAndSeatCouncil(1, cands);

        // Try to seat a 6th
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.startProvincialElection, (1))
        );
        uint256 elId2 = election.electionCount() - 1;

        vm.prank(senCand1);
        election.registerCandidate(elId2, keccak256("Party-6th"));

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        _warpForward(regPeriod);
        election.openVoting(elId2);

        _castBallotWithProvince(senCand1, elId2, 0, 1);

        uint256 votePeriod = constitution.getParameter(constitution.PARAM_ELECTION_VOTE_PERIOD());
        _warpForward(votePeriod);
        election.tallyVotes(elId2);

        vm.prank(monarchAddr);
        vm.expectRevert(); // CouncilFull bubbles up
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.seatMembers, (elId2))
        );
    }

    function test_modifier_seatCouncilMember_onlyElection() public {
        address unauthorized = makeAddr("unauthorized");
        vm.prank(unauthorized);
        vm.expectRevert(ProvincialCouncil.NotAuthorized.selector);
        pc.seatCouncilMember(citizen1, 1);
    }

    // removeCouncilMember happy path + revert tests moved to ProvincialCouncilJudicialTest
    // (requires real executeJudicialOrder path via MixinJustices)

    function test_modifier_removeCouncilMember_onlySupremeCourt() public {
        address unauthorized = makeAddr("unauthorized");
        vm.prank(unauthorized);
        vm.expectRevert(ProvincialCouncil.NotAuthorized.selector);
        pc.removeCouncilMember(citizen1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. ACTIVE MEMBER / TERM EXPIRY
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_isActiveCouncilMember() public {
        address[] memory cands = new address[](1);
        cands[0] = citizen1;
        _electAndSeatCouncil(1, cands);

        assertTrue(pc.isActiveCouncilMember(citizen1));
    }

    function test_happyCase_isActiveCouncilMember_expiredTerm() public {
        address[] memory cands = new address[](1);
        cands[0] = citizen1;
        _electAndSeatCouncil(1, cands);

        // Warp past 4-year term
        _warpForward(4 * 365 days);

        assertFalse(pc.isActiveCouncilMember(citizen1));
    }

    function test_happyCase_isActiveCouncilMember_notMember() public view {
        assertFalse(pc.isActiveCouncilMember(citizen1));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. SENATE SELECTION LIFECYCLE
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_startSenateSelection() public {
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );

        assertEq(pc.selectionCount(), 1);
    }

    function test_happyCase_startSenateSelection_emitsEvent() public {
        vm.expectEmit(true, true, false, false);
        emit SenateSelectionStarted(0, 1);

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
    }

    function test_revert_startSenateSelection_provinceNotInitialized() public {
        // Province 4 doesn't exist
        vm.prank(monarchAddr);
        vm.expectRevert(); // ProvinceNotInitialized
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (4))
        );
    }

    function test_modifier_startSenateSelection_onlyCrown() public {
        address unauthorized = makeAddr("unauthorized");
        vm.prank(unauthorized);
        vm.expectRevert(ProvincialCouncil.NotAuthorized.selector);
        pc.startSenateSelection(1);
    }

    function test_happyCase_registerSenateCandidate() public {
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        vm.prank(senCand1);
        pc.registerSenateCandidate(selId);

        assertTrue(pc.isSelectionCandidate(selId, senCand1));
        assertEq(pc.getSelectionCandidateAddr(selId, 0), senCand1);
    }

    function test_happyCase_registerSenateCandidate_emitsEvent() public {
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        vm.expectEmit(true, true, false, false);
        emit SenateCandidateRegistered(selId, senCand1);

        vm.prank(senCand1);
        pc.registerSenateCandidate(selId);
    }

    function test_revert_registerSenateCandidate_wrongProvince() public {
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        // citizen6 is province 2
        vm.prank(citizen6);
        vm.expectRevert(ProvincialCouncil.WrongProvince.selector);
        pc.registerSenateCandidate(selId);
    }

    function test_revert_registerSenateCandidate_alreadyRegistered() public {
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        vm.prank(senCand1);
        pc.registerSenateCandidate(selId);

        vm.prank(senCand1);
        vm.expectRevert(abi.encodeWithSelector(ProvincialCouncil.AlreadyRegistered.selector, senCand1));
        pc.registerSenateCandidate(selId);
    }

    function test_revert_registerSenateCandidate_registrationEnded() public {
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_REG_PERIOD());
        _warpForward(regPeriod + 1);

        vm.prank(senCand1);
        vm.expectRevert(ProvincialCouncil.RegistrationNotOpen.selector);
        pc.registerSenateCandidate(selId);
    }

    function test_happyCase_castSenateVote() public {
        _seatThreeCouncilMembers();

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        vm.prank(senCand1);
        pc.registerSenateCandidate(selId);

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_REG_PERIOD());
        _warpForward(regPeriod);

        vm.prank(citizen1);
        pc.castSenateVote(selId, 0);

        assertTrue(pc.hasVotedInSelection(selId, citizen1));
        assertEq(pc.getSelectionCandidateVotes(selId, 0), 1);
    }

    function test_happyCase_castSenateVote_emitsEvent() public {
        _seatThreeCouncilMembers();

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        vm.prank(senCand1);
        pc.registerSenateCandidate(selId);

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_REG_PERIOD());
        _warpForward(regPeriod);

        vm.expectEmit(true, true, false, false);
        emit SenateVoteCast(selId, citizen1);

        vm.prank(citizen1);
        pc.castSenateVote(selId, 0);
    }

    function test_revert_castSenateVote_notCouncilMember() public {
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        vm.prank(senCand1);
        pc.registerSenateCandidate(selId);

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_REG_PERIOD());
        _warpForward(regPeriod);

        // senCand1 is a citizen but not a council member
        vm.prank(senCand1);
        vm.expectRevert(ProvincialCouncil.NotCouncilMember.selector);
        pc.castSenateVote(selId, 0);
    }

    function test_revert_castSenateVote_wrongProvinceCouncilMember() public {
        // Seat council member in province 2
        address[] memory isfahanCands = new address[](1);
        isfahanCands[0] = citizen6;
        _electAndSeatCouncil(2, isfahanCands);

        // Start selection in province 1
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        vm.prank(senCand1);
        pc.registerSenateCandidate(selId);

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_REG_PERIOD());
        _warpForward(regPeriod);

        // Province 2 council member tries to vote in province 1 selection
        vm.prank(citizen6);
        vm.expectRevert(ProvincialCouncil.WrongProvince.selector);
        pc.castSenateVote(selId, 0);
    }

    function test_revert_castSenateVote_alreadyVoted() public {
        _seatThreeCouncilMembers();

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        vm.prank(senCand1);
        pc.registerSenateCandidate(selId);

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_REG_PERIOD());
        _warpForward(regPeriod);

        vm.prank(citizen1);
        pc.castSenateVote(selId, 0);

        vm.prank(citizen1);
        vm.expectRevert(abi.encodeWithSelector(ProvincialCouncil.AlreadyVoted.selector, citizen1));
        pc.castSenateVote(selId, 0);
    }

    function test_revert_castSenateVote_votingEnded() public {
        _seatThreeCouncilMembers();

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        vm.prank(senCand1);
        pc.registerSenateCandidate(selId);

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_REG_PERIOD());
        uint256 votePeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_VOTE_PERIOD());
        _warpForward(regPeriod + votePeriod + 1);

        vm.prank(citizen1);
        vm.expectRevert(ProvincialCouncil.VotingNotOpen.selector);
        pc.castSenateVote(selId, 0);
    }

    function test_revert_castSenateVote_expiredCouncilMember() public {
        // Seat council members
        _seatThreeCouncilMembers();

        // Advance to just before term expires (4 years - 5 days)
        uint256 councilTerm = constitution.getParameter(constitution.PARAM_COUNCIL_TERM());
        _warpForward(councilTerm - 5 days);

        // Start a selection (reg period = 14 days, so voting starts after term expires)
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        vm.prank(senCand1);
        pc.registerSenateCandidate(selId);

        // Advance to voting period (14 days later — now past council term)
        uint256 regPeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_REG_PERIOD());
        _warpForward(regPeriod);

        // citizen1's term has expired, so this should revert
        vm.prank(citizen1);
        vm.expectRevert(ProvincialCouncil.NotCouncilMember.selector);
        pc.castSenateVote(selId, 0);
    }

    function test_revert_castSenateVote_invalidCandidate() public {
        _seatThreeCouncilMembers();

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        vm.prank(senCand1);
        pc.registerSenateCandidate(selId);

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_REG_PERIOD());
        _warpForward(regPeriod);

        vm.prank(citizen1);
        vm.expectRevert(ProvincialCouncil.InvalidCandidate.selector);
        pc.castSenateVote(selId, 99);
    }

    function test_revert_registerSenateCandidate_invalidSelection() public {
        vm.prank(senCand1);
        vm.expectRevert(ProvincialCouncil.InvalidSelection.selector);
        pc.registerSenateCandidate(999);
    }

    function test_revert_registerSenateCandidate_notCitizen() public {
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        address nonCitizen = makeAddr("nonCitizen");
        vm.prank(nonCitizen);
        vm.expectRevert(abi.encodeWithSelector(ProvincialCouncil.NotCitizen.selector, nonCitizen));
        pc.registerSenateCandidate(selId);
    }

    function test_revert_openSenateVoting_registrationNotEnded() public {
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        vm.prank(senCand1);
        pc.registerSenateCandidate(selId);

        // Try immediately — registration not ended
        vm.expectRevert(ProvincialCouncil.RegistrationNotEnded.selector);
        pc.openSenateVoting(selId);
    }

    function test_revert_openSenateVoting_noCandidates() public {
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        // Warp past registration with no candidates
        uint256 regPeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_REG_PERIOD());
        _warpForward(regPeriod);

        vm.expectRevert(ProvincialCouncil.NoCandidates.selector);
        pc.openSenateVoting(selId);
    }

    function test_revert_castSenateVote_beforeVotingStarts() public {
        _seatThreeCouncilMembers();

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        vm.prank(senCand1);
        pc.registerSenateCandidate(selId);

        // Don't warp — still in registration period
        vm.prank(citizen1);
        vm.expectRevert(ProvincialCouncil.VotingNotOpen.selector);
        pc.castSenateVote(selId, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. TALLY AND SEAT
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_tallySenateSelection() public {
        uint256 selId = _runFullSenateSelection();

        (, bool tallied, bool seated,) = pc.getSelection(selId);
        assertTrue(tallied);
        assertFalse(seated);
        assertEq(pc.getSelectionCandidateVotes(selId, 0), 2); // senCand1
        assertEq(pc.getSelectionCandidateVotes(selId, 1), 1); // senCand2
    }

    function test_revert_tallySenateSelection_alreadyTallied() public {
        uint256 selId = _runFullSenateSelection();

        // Already tallied in _runFullSenateSelection
        vm.expectRevert(ProvincialCouncil.SelectionAlreadyTallied.selector);
        pc.tallySenateSelection(selId);
    }

    function test_revert_tallySenateSelection_tooEarly() public {
        _seatThreeCouncilMembers();

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        vm.prank(senCand1);
        pc.registerSenateCandidate(selId);

        // Don't advance past voting end
        vm.expectRevert(ProvincialCouncil.VotingNotOpen.selector);
        pc.tallySenateSelection(selId);
    }

    function test_happyCase_seatSelectedSenators() public {
        uint256 selId = _runFullSenateSelection();

        // Crown seats winners (determined by vote tally)
        // Province 1 has senateSeatCount=3, 2 candidates → seats both
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.seatSelectedSenators, (selId))
        );

        (,, bool seated,) = pc.getSelection(selId);
        assertTrue(seated);

        // Verify both senators are seated (top 2 by vote count)
        assertTrue(parliament.isSenateMember(senCand1));
        assertTrue(parliament.isSenateMember(senCand2));
    }

    function test_happyCase_seatSelectedSenators_emitsEvent() public {
        uint256 selId = _runFullSenateSelection();

        // Province 1 has senateSeatCount=3, 2 candidates → seats 2
        vm.expectEmit(true, false, false, true);
        emit SenateSelectionSeated(selId, 2);

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.seatSelectedSenators, (selId))
        );
    }

    function test_revert_seatSelectedSenators_notTallied() public {
        _seatThreeCouncilMembers();

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        vm.prank(monarchAddr);
        vm.expectRevert(); // SelectionNotTallied
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.seatSelectedSenators, (selId))
        );
    }

    function test_revert_seatSelectedSenators_alreadySeated() public {
        uint256 selId = _runFullSenateSelection();

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.seatSelectedSenators, (selId))
        );

        vm.prank(monarchAddr);
        vm.expectRevert(); // SelectionAlreadySeated
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.seatSelectedSenators, (selId))
        );
    }

    function test_modifier_seatSelectedSenators_onlyCrown() public {
        uint256 selId = _runFullSenateSelection();

        address unauthorized = makeAddr("unauthorized");
        vm.prank(unauthorized);
        vm.expectRevert(ProvincialCouncil.NotAuthorized.selector);
        pc.seatSelectedSenators(selId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 7. VIEW FUNCTIONS AND EDGE CASES
    // ═══════════════════════════════════════════════════════════════════════

    function test_revert_getSelection_invalidSelection() public {
        vm.expectRevert(ProvincialCouncil.InvalidSelection.selector);
        pc.getSelection(999);
    }

    function test_revert_getSelectionCandidateVotes_invalidSelection() public {
        vm.expectRevert(ProvincialCouncil.InvalidSelection.selector);
        pc.getSelectionCandidateVotes(999, 0);
    }

    function test_revert_getSelectionCandidateVotes_invalidCandidate() public {
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );

        vm.expectRevert(ProvincialCouncil.InvalidCandidate.selector);
        pc.getSelectionCandidateVotes(0, 0);
    }

    function test_revert_getSelectionCandidateAddr_invalidSelection() public {
        vm.expectRevert(ProvincialCouncil.InvalidSelection.selector);
        pc.getSelectionCandidateAddr(999, 0);
    }

    function test_revert_getSelectionCandidateAddr_invalidCandidate() public {
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );

        vm.expectRevert(ProvincialCouncil.InvalidCandidate.selector);
        pc.getSelectionCandidateAddr(0, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 8. MAJLIS SEAT REAPPORTIONMENT
    // ═══════════════════════════════════════════════════════════════════════

    // updateMajlisSeatAllocation tests moved to ProvincialCouncilMajlisTest (requires Majlis for governance actions)

    // ═══════════════════════════════════════════════════════════════════════
    // 9. PERMISSIONLESS SENATOR SEAT TIMEOUT
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_claimSenatorSeatTimeout() public {
        uint256 selId = _runFullSenateSelection();

        // Advance past seat deadline
        uint256 seatDeadline = constitution.getParameter(constitution.PARAM_CROWN_SEAT_DEADLINE());
        _warpForward(seatDeadline);

        // Anyone can call
        address unauthorized = makeAddr("unauthorized");
        vm.prank(unauthorized);
        pc.claimSenatorSeatTimeout(selId);

        // Verify seated
        (,, bool seated,) = pc.getSelection(selId);
        assertTrue(seated);

        // Top candidates should be seated: senCand1 had 2 votes, senCand2 had 1 vote
        // Province 1 has 3 senate seats but only 2 candidates, so both get seated
        assertTrue(parliament.isSenateMember(senCand1));
        assertTrue(parliament.isSenateMember(senCand2));
    }

    function test_revert_claimSenatorSeatTimeout_tooEarly() public {
        uint256 selId = _runFullSenateSelection();

        // Try immediately — deadline not reached
        address unauthorized = makeAddr("unauthorized");
        vm.prank(unauthorized);
        vm.expectRevert(ProvincialCouncil.DeadlineNotReached.selector);
        pc.claimSenatorSeatTimeout(selId);
    }

    function test_revert_claimSenatorSeatTimeout_alreadySeated() public {
        uint256 selId = _runFullSenateSelection();

        // Crown seats normally (winners by vote tally)
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.seatSelectedSenators, (selId))
        );

        // Try timeout
        uint256 seatDeadline = constitution.getParameter(constitution.PARAM_CROWN_SEAT_DEADLINE());
        _warpForward(seatDeadline);

        address unauthorized = makeAddr("unauthorized");
        vm.prank(unauthorized);
        vm.expectRevert(ProvincialCouncil.SelectionAlreadySeated.selector);
        pc.claimSenatorSeatTimeout(selId);
    }

    function test_revert_claimSenatorSeatTimeout_notTallied() public {
        _seatThreeCouncilMembers();

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (1))
        );
        uint256 selId = pc.selectionCount() - 1;

        address unauthorized = makeAddr("unauthorized");
        vm.prank(unauthorized);
        vm.expectRevert(ProvincialCouncil.SelectionNotTallied.selector);
        pc.claimSenatorSeatTimeout(selId);
    }

    function test_boundary_claimSenatorSeatTimeout_exactlyAtDeadline() public {
        uint256 selId = _runFullSenateSelection();

        (,,, uint256 seatDeadline) = pc.getSelection(selId);
        vm.warp(seatDeadline);

        pc.claimSenatorSeatTimeout(selId);

        (,, bool seated,) = pc.getSelection(selId);
        assertTrue(seated);
    }

    function test_boundary_claimSenatorSeatTimeout_oneSecondBefore() public {
        uint256 selId = _runFullSenateSelection();

        (,,, uint256 seatDeadline) = pc.getSelection(selId);
        vm.warp(seatDeadline - 1);

        vm.expectRevert(ProvincialCouncil.DeadlineNotReached.selector);
        pc.claimSenatorSeatTimeout(selId);
    }
}

/// @title ProvincialCouncilMajlisTest
/// @notice Tests for updateMajlisSeatAllocation (Parliament-gated — requires Majlis governance action).
contract ProvincialCouncilMajlisTest is MixinMajlis {

    function setUp() public override {
        super.setUp();
        _setupMajlis();
    }

    function test_happyCase_updateMajlisSeatAllocation() public {
        // GovTestBase provinces: TEHRAN=200, ISFAHAN=60, FARS=30, total=290
        uint8[] memory ids = new uint8[](3);
        uint256[] memory newCounts = new uint256[](3);
        ids[0] = 1; newCounts[0] = 150; // Tehran: 200 -> 150
        ids[1] = 2; newCounts[1] = 80;  // Isfahan: 60 -> 80
        ids[2] = 3; newCounts[2] = 60;  // Fars: 30 -> 60
        // Total: 150 + 80 + 60 = 290

        _executeMajlisAction(
            address(pc),
            abi.encodeCall(ProvincialCouncil.updateMajlisSeatAllocation, (ids, newCounts))
        );

        assertEq(pc.getMajlisSeatCount(1), 150);
        assertEq(pc.getMajlisSeatCount(2), 80);
        assertEq(pc.getMajlisSeatCount(3), 60);
    }

    function test_revert_updateMajlisSeatAllocation_totalMismatch() public {
        uint8[] memory ids = new uint8[](3);
        uint256[] memory newCounts = new uint256[](3);
        ids[0] = 1; newCounts[0] = 100;
        ids[1] = 2; newCounts[1] = 80;
        ids[2] = 3; newCounts[2] = 60; // Total: 240 != 290

        uint256 actionId = _prepareMajlisAction(
            address(pc),
            abi.encodeCall(ProvincialCouncil.updateMajlisSeatAllocation, (ids, newCounts))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_updateMajlisSeatAllocation_arrayLengthMismatch() public {
        uint8[] memory ids = new uint8[](2);
        uint256[] memory newCounts = new uint256[](3);
        ids[0] = 1; ids[1] = 2;
        newCounts[0] = 200; newCounts[1] = 60; newCounts[2] = 30;

        uint256 actionId = _prepareMajlisAction(
            address(pc),
            abi.encodeCall(ProvincialCouncil.updateMajlisSeatAllocation, (ids, newCounts))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_updateMajlisSeatAllocation_provinceNotInitialized() public {
        uint8[] memory ids = new uint8[](1);
        uint256[] memory newCounts = new uint256[](1);
        ids[0] = 4; // Province 4 doesn't exist
        newCounts[0] = 290;

        uint256 actionId = _prepareMajlisAction(
            address(pc),
            abi.encodeCall(ProvincialCouncil.updateMajlisSeatAllocation, (ids, newCounts))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_modifier_updateMajlisSeatAllocation_onlyParliament() public {
        uint8[] memory ids = new uint8[](0);
        uint256[] memory newCounts = new uint256[](0);

        address unauthorized = makeAddr("unauthorized");
        vm.prank(unauthorized);
        vm.expectRevert(ProvincialCouncil.NotAuthorized.selector);
        pc.updateMajlisSeatAllocation(ids, newCounts);
    }
}

/// @title ProvincialCouncilJudicialTest
/// @notice Tests for removeCouncilMember via real SupremeCourt.executeJudicialOrder() path.
///         Requires justices (MixinJustices) for fact certification + judicial order execution.
contract ProvincialCouncilJudicialTest is MixinJustices {

    function setUp() public override {
        super.setUp();
        _setupSenate();
        _setupJustices();
    }

    /// @dev Seat citizen1-3 as province 1 council members via real provincial election.
    function _seatThreeCouncilMembers() internal {
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.startProvincialElection, (1))
        );
        uint256 elId = election.electionCount() - 1;

        vm.prank(citizen1);
        election.registerCandidate(elId, keccak256("PC-0"));
        vm.prank(citizen2);
        election.registerCandidate(elId, keccak256("PC-1"));
        vm.prank(citizen3);
        election.registerCandidate(elId, keccak256("PC-2"));

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        _warpForward(regPeriod);
        election.openVoting(elId);

        _castBallotWithProvince(citizen1, elId, 0, 1);
        _castBallotWithProvince(citizen2, elId, 1, 1);
        _castBallotWithProvince(citizen3, elId, 2, 1);

        uint256 votePeriod = constitution.getParameter(constitution.PARAM_ELECTION_VOTE_PERIOD());
        _warpForward(votePeriod);
        election.tallyVotes(elId);

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.seatMembers, (elId))
        );
    }

    /// @dev Execute a judicial order via real path: certify fact + justice executes.
    function _executeJudicialOrder(address target, bytes memory data) internal {
        bytes32 factHash = keccak256(abi.encodePacked("JUDICIAL_ORDER", target, data));
        _certifyFact(factHash);

        vm.prank(justices[0]);
        court.executeJudicialOrder(target, data);
    }

    function test_happyCase_removeCouncilMember() public {
        _seatThreeCouncilMembers();

        // SupremeCourt removes citizen1 via real judicial order path
        _executeJudicialOrder(
            address(pc),
            abi.encodeCall(ProvincialCouncil.removeCouncilMember, (citizen1))
        );

        assertFalse(pc.isCouncilMember(1, citizen1));
        (, , , , uint256 currentCount, ) = pc.getProvince(1);
        assertEq(currentCount, 2);
    }

    function test_revert_removeCouncilMember_notMember() public {
        // citizen1 is not a council member — inner revert wraps as ExecutionFailed
        bytes memory data = abi.encodeCall(ProvincialCouncil.removeCouncilMember, (citizen1));
        bytes32 factHash = keccak256(abi.encodePacked("JUDICIAL_ORDER", address(pc), data));
        _certifyFact(factHash);

        vm.prank(justices[0]);
        vm.expectRevert(SupremeCourt.ExecutionFailed.selector);
        court.executeJudicialOrder(address(pc), data);
    }
}
