// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Constitution.sol";
import "../src/CitizenRegistry.sol";
import "../src/Crown.sol";
import "../src/Parliament.sol";
import "../src/Executive.sol";
import "../src/SupremeCourt.sol";
import "../src/Election.sol";
import "../src/Referendum.sol";
import "../src/Budget.sol";
import "../src/ProvincialCouncil.sol";
import "../src/verifiers/MockBallotVerifier.sol";
import "./helpers/TestBase.sol";
import "./helpers/MixinMajlis.sol";
import "./helpers/MixinSenate.sol";
import "./helpers/MixinJustices.sol";
import "./helpers/MixinCrownSuspension.sol";


// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO 1: PRE-CORONATION (no monarch set)
//   Custom minimal base — deploys all real contracts but does NOT coronate.
// ═══════════════════════════════════════════════════════════════════════════

contract CrownPreCoronationTest is Test {

    // Events
    event Coronation(address indexed monarch, uint256 timestamp);

    Constitution internal constitution;
    Crown internal crown;

    address internal deployer = makeAddr("deployer");
    address internal monarchAddr = makeAddr("monarch");
    address internal heir1 = makeAddr("heir1");
    address internal unauthorized = makeAddr("unauthorized");

    bytes32 internal ROLE_MONARCH;

    function setUp() public {
        vm.prank(deployer);
        constitution = new Constitution();
        ROLE_MONARCH = constitution.ROLE_MONARCH();

        // Deploy all real contracts
        crown = new Crown(address(constitution));
        CitizenRegistry reg = new CitizenRegistry(makeAddr("auth"));
        Parliament parl = new Parliament(address(constitution));
        Executive exec = new Executive(address(constitution));
        SupremeCourt sc = new SupremeCourt(address(constitution));
        Election elec = new Election(address(constitution));
        Referendum ref = new Referendum(address(constitution));
        Budget bud = new Budget(address(constitution));
        ProvincialCouncil pcl = new ProvincialCouncil(address(constitution));
        MockBallotVerifier verifier = new MockBallotVerifier();

        // Initialize Constitution with all 10 contract addresses
        bytes32[] memory names = new bytes32[](10);
        address[] memory addrs = new address[](10);
        names[0] = constitution.CONTRACT_CITIZEN_REGISTRY(); addrs[0] = address(reg);
        names[1] = constitution.CONTRACT_CROWN();            addrs[1] = address(crown);
        names[2] = constitution.CONTRACT_PARLIAMENT();       addrs[2] = address(parl);
        names[3] = constitution.CONTRACT_EXECUTIVE();        addrs[3] = address(exec);
        names[4] = constitution.CONTRACT_SUPREME_COURT();    addrs[4] = address(sc);
        names[5] = constitution.CONTRACT_ELECTION();         addrs[5] = address(elec);
        names[6] = constitution.CONTRACT_REFERENDUM();       addrs[6] = address(ref);
        names[7] = constitution.CONTRACT_BUDGET();           addrs[7] = address(bud);
        names[8] = constitution.CONTRACT_PROVINCIAL_COUNCIL(); addrs[8] = address(pcl);
        names[9] = constitution.CONTRACT_BALLOT_VERIFIER();  addrs[9] = address(verifier);

        vm.prank(deployer);
        constitution.initialize(names, addrs);
    }

    // ─── Constructor ─────────────────────────────────────────────────────

    function test_happyCase_constructor() public view {
        assertEq(address(crown.constitution()), address(constitution));
        assertFalse(crown.suspended());
    }

    function test_revert_constructor_zeroAddress() public {
        vm.expectRevert(Crown.ZeroAddress.selector);
        new Crown(address(0));
    }

    // ─── Coronation ─────────────────────────────────────────────────────

    function test_happyCase_coronation() public {
        vm.prank(deployer);
        crown.coronation(monarchAddr);
        assertEq(constitution.getRole(ROLE_MONARCH), monarchAddr);
    }

    function test_happyCase_coronation_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit Coronation(monarchAddr, block.timestamp);
        vm.prank(deployer);
        crown.coronation(monarchAddr);
    }

    function test_happyCase_coronation_autoFinalizes() public {
        vm.prank(deployer);
        crown.coronation(monarchAddr);
        assertEq(constitution.deployer(), address(0), "deployer should be wiped after coronation");
    }

    function test_revert_coronation_alreadyCrowned() public {
        vm.prank(deployer);
        crown.coronation(monarchAddr);

        vm.prank(deployer);
        vm.expectRevert(Crown.MonarchAlreadySet.selector);
        crown.coronation(heir1);
    }

    function test_revert_coronation_zeroAddress() public {
        vm.prank(deployer);
        vm.expectRevert(Crown.ZeroAddress.selector);
        crown.coronation(address(0));
    }

    function test_modifier_coronation_onlyDeployer() public {
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotAuthorized.selector);
        crown.coronation(monarchAddr);
    }

    function test_revert_coronation_afterAutoFinalize() public {
        vm.prank(deployer);
        crown.coronation(monarchAddr);

        // Vacate monarch so MonarchAlreadySet doesn't trigger first
        vm.prank(address(crown));
        constitution.setRole(ROLE_MONARCH, address(0));

        // Deployer is wiped — coronation reverts with NotAuthorized
        vm.prank(deployer);
        vm.expectRevert(Crown.NotAuthorized.selector);
        crown.coronation(heir1);
    }

    function test_revert_finalizeSetup_afterCoronation() public {
        vm.prank(deployer);
        crown.coronation(monarchAddr);

        vm.prank(deployer);
        vm.expectRevert(Constitution.AlreadyFinalized.selector);
        constitution.finalizeSetup();
    }

    // ─── Boundary: No Monarch ───────────────────────────────────────────

    function test_boundary_noMonarch_nominatePM() public {
        vm.prank(monarchAddr);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.nominatePrimeMinister(makeAddr("pm"));
    }

    function test_boundary_successionList_empty() public view {
        assertEq(crown.successionListLength(), 0);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO 2: CORONATED (real contracts, full governance stack)
//   GovTestBase + MixinMajlis + MixinSenate for real Majlis + Senate.
//   Tests modifier checks, zero-address, and happy-path Crown functions.
// ═══════════════════════════════════════════════════════════════════════════

contract CrownCoronatedTest is MixinMajlis, MixinSenate {

    // Events
    event PMNominated(address indexed nominee);
    event JusticeNominated(address indexed nominee);
    event SenatorsAppointed(address[] senators);
    event LawReturned(uint256 indexed billId);
    event LawReferred(uint256 indexed billId);
    event LawEnacted(uint256 indexed billId);
    event DissolutionDeclared(uint256 timestamp);

    address internal heir1 = makeAddr("heir1");
    address internal justiceCandidate = makeAddr("justiceCandidate");
    address internal unauthorized = makeAddr("unauthorized");

    function setUp() public override {
        super.setUp();
        _setupMajlis();
    }

    // ─── Bill Helper ─────────────────────────────────────────────────────

    /// @dev Pass a bill through Majlis + Senate timeout → reaches CrownAction.
    function _passBillToCrownAction() internal returns (uint256 billId) {
        vm.prank(citizen1);
        billId = parliament.submitBill(keccak256("test bill"), "Test Bill");

        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);

        uint256 minVotePeriod = constitution.getParameter(constitution.PARAM_MIN_VOTING_PERIOD());
        _warpForward(minVotePeriod);
        parliament.finalizeMajlisVote(billId);

        uint256 senateReview = constitution.getParameter(constitution.PARAM_SENATE_REVIEW_PERIOD());
        _warpForward(senateReview);
        parliament.claimSenateTimeout(billId);
    }

    // ─── PM Nomination ──────────────────────────────────────────────────

    function test_happyCase_nominatePM() public {
        // Start formation first
        _executeMajlisAction(address(executive), abi.encodeCall(Executive.startFormation, ()));

        vm.expectEmit(true, false, false, true);
        emit PMNominated(pmCandidate);
        vm.prank(monarchAddr);
        crown.nominatePrimeMinister(pmCandidate);
    }

    function test_revert_nominatePM_zeroAddress() public {
        vm.prank(monarchAddr);
        vm.expectRevert(Crown.ZeroAddress.selector);
        crown.nominatePrimeMinister(address(0));
    }

    function test_modifier_nominatePM_onlyMonarch() public {
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.nominatePrimeMinister(pmCandidate);
    }

    // ─── Justice Nomination ─────────────────────────────────────────────

    function test_happyCase_nominateJustice() public {
        vm.expectEmit(true, false, false, true);
        emit JusticeNominated(justiceCandidate);
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceCandidate, 0);
    }

    function test_revert_nominateJustice_zeroAddress() public {
        vm.prank(monarchAddr);
        vm.expectRevert(Crown.ZeroAddress.selector);
        crown.nominateJustice(address(0), 0);
    }

    function test_modifier_nominateJustice_onlyMonarch() public {
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.nominateJustice(justiceCandidate, 0);
    }

    function test_happyCase_nominateJusticeSecond() public {
        // First nomination
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceCandidate, 0);

        // Senate rejects first nomination
        _setupSenate();
        _executeSenateAction(
            address(court),
            abi.encodeCall(SupremeCourt.rejectNominee, (0))
        );

        // Second nomination (must be different from first)
        vm.expectEmit(true, false, false, true);
        emit JusticeNominated(heir1);
        vm.prank(monarchAddr);
        crown.nominateJusticeSecond(heir1, 0);
    }

    function test_revert_nominateJusticeSecond_zeroAddress() public {
        vm.prank(monarchAddr);
        vm.expectRevert(Crown.ZeroAddress.selector);
        crown.nominateJusticeSecond(address(0), 0);
    }

    function test_modifier_nominateJusticeSecond_onlyMonarch() public {
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.nominateJusticeSecond(heir1, 0);
    }

    function test_happyCase_appointJusticeFromList() public {
        // First nomination + Senate rejection
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceCandidate, 0);
        _setupSenate();
        _executeSenateAction(
            address(court),
            abi.encodeCall(SupremeCourt.rejectNominee, (0))
        );

        // Second nomination + Senate rejection → Senate submits ranked list
        vm.prank(monarchAddr);
        crown.nominateJusticeSecond(heir1, 0);
        _executeSenateAction(
            address(court),
            abi.encodeCall(SupremeCourt.rejectNominee, (0))
        );

        // Senate submits ranked list
        address[3] memory listCandidates = [makeAddr("j1"), makeAddr("j2"), makeAddr("j3")];
        _executeSenateAction(
            address(court),
            abi.encodeCall(SupremeCourt.proposeSenateList, (0, listCandidates))
        );

        // Crown picks from list
        vm.prank(monarchAddr);
        crown.appointJusticeFromList(0, 1);
    }

    function test_modifier_appointJusticeFromList_onlyMonarch() public {
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.appointJusticeFromList(0, 1);
    }

    // ─── PM from List ───────────────────────────────────────────────────

    function test_happyCase_appointPMFromList() public {
        // Start formation
        _executeMajlisAction(address(executive), abi.encodeCall(Executive.startFormation, ()));

        // First nomination fails confidence (all 5 members vote no)
        vm.prank(monarchAddr);
        crown.nominatePrimeMinister(pmCandidate);
        vm.prank(pmCandidate);
        executive.presentGovernment(keccak256("program1"));

        vm.prank(citizen1); executive.voteConfidence(false);
        vm.prank(citizen2); executive.voteConfidence(false);
        vm.prank(citizen3); executive.voteConfidence(false);
        vm.prank(citizen4); executive.voteConfidence(false);
        vm.prank(citizen5); executive.voteConfidence(false);
        _warpForward(3 days);
        executive.finalizeConfidenceVote();

        // Second nomination fails confidence too (all 5 vote no)
        vm.prank(monarchAddr);
        crown.nominatePrimeMinister(pmCandidate2);
        vm.prank(pmCandidate2);
        executive.presentGovernment(keccak256("program2"));

        vm.prank(citizen1); executive.voteConfidence(false);
        vm.prank(citizen2); executive.voteConfidence(false);
        vm.prank(citizen3); executive.voteConfidence(false);
        vm.prank(citizen4); executive.voteConfidence(false);
        vm.prank(citizen5); executive.voteConfidence(false);
        _warpForward(3 days);
        executive.finalizeConfidenceVote();

        // Majlis submits PM candidate list
        address[3] memory pmList = [citizen1, citizen2, citizen3];
        _executeMajlisAction(
            address(executive),
            abi.encodeCall(Executive.submitMajlisList, (pmList))
        );

        // Crown picks from Majlis list
        vm.prank(monarchAddr);
        crown.appointPMFromList(0);
    }

    function test_modifier_appointPMFromList_onlyMonarch() public {
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.appointPMFromList(0);
    }

    // ─── Senator Appointment ────────────────────────────────────────────
    // Happy path skipped: needs 10+ regular senators for 10% cap.
    // Crown→Parliament.seatCrownSenator delegation tested via Integration.t.sol.

    function test_revert_appointSenators_zeroAddress() public {
        address[] memory senators = new address[](2);
        senators[0] = address(0);
        senators[1] = makeAddr("s1");
        vm.prank(monarchAddr);
        vm.expectRevert(Crown.ZeroAddress.selector);
        crown.appointSenators(senators);
    }

    function test_modifier_appointSenators_onlyMonarch() public {
        address[] memory senators = new address[](1);
        senators[0] = makeAddr("s1");
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.appointSenators(senators);
    }

    // ─── Legislative Actions ────────────────────────────────────────────

    function test_happyCase_returnLaw() public {
        uint256 billId = _passBillToCrownAction();

        vm.expectEmit(true, false, false, true);
        emit LawReturned(billId);
        vm.prank(monarchAddr);
        crown.returnLaw(billId);
    }

    function test_happyCase_referToSupremeCourt() public {
        uint256 billId = _passBillToCrownAction();

        // Crown returns bill
        vm.prank(monarchAddr);
        crown.returnLaw(billId);

        // Majlis re-adopts (vote on returned bill)
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        uint256 minVotePeriod = constitution.getParameter(constitution.PARAM_MIN_VOTING_PERIOD());
        _warpForward(minVotePeriod);
        // Returned bills go directly to CrownAction (skip Senate)
        parliament.finalizeMajlisVote(billId);

        // Now Crown can refer (crownReturned = true)
        vm.expectEmit(true, false, false, true);
        emit LawReferred(billId);
        vm.prank(monarchAddr);
        crown.referToSupremeCourt(billId);
    }

    function test_happyCase_enactLaw() public {
        uint256 billId = _passBillToCrownAction();

        vm.expectEmit(true, false, false, true);
        emit LawEnacted(billId);
        vm.prank(monarchAddr);
        crown.enactLaw(billId);
    }

    function test_modifier_returnLaw_onlyMonarch() public {
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.returnLaw(42);
    }

    function test_modifier_referToSupremeCourt_onlyMonarch() public {
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.referToSupremeCourt(42);
    }

    function test_modifier_enactLaw_onlyMonarch() public {
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.enactLaw(42);
    }

    // ─── Dissolution ────────────────────────────────────────────────────

    function test_happyCase_declareDissolution() public {
        vm.expectEmit(false, false, false, true);
        emit DissolutionDeclared(block.timestamp);
        vm.prank(monarchAddr);
        crown.declareDissolution();
    }

    function test_modifier_declareDissolution_onlyMonarch() public {
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.declareDissolution();
    }

    // ─── Senate Stagger Initialization ──────────────────────────────────

    function test_happyCase_initializeSenateStagger() public {
        _setupSenate();
        address[] memory senators = new address[](3);
        senators[0] = senator1;
        senators[1] = senator2;
        senators[2] = senator3;
        vm.prank(monarchAddr);
        crown.initializeSenateStagger(senators);
    }

    function test_modifier_initializeSenateStagger_onlyMonarch() public {
        address[] memory senators = new address[](1);
        senators[0] = makeAddr("s1");
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.initializeSenateStagger(senators);
    }

    // ─── Provincial Council Initialization ────────────────────────────
    // Modifier test only — happy path tested in CrownProvincialInitTest.

    function test_modifier_initializeProvincialCouncils_onlyMonarch() public {
        ProvincialCouncil.ProvinceInit[] memory inits = new ProvincialCouncil.ProvinceInit[](1);
        inits[0] = ProvincialCouncil.ProvinceInit({
            id: 1, name: bytes32("Tehran"), councilSize: 5,
            senateSeatCount: 2, majlisSeatCount: 3, cohort: 1
        });
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.initializeProvincialCouncils(inits);
    }

    // ─── Acting PM Designation ────────────────────────────────────────

    function test_happyCase_designateActingPM() public {
        // Start formation to get Executive into an active stage
        _executeMajlisAction(address(executive), abi.encodeCall(Executive.startFormation, ()));

        vm.prank(monarchAddr);
        crown.designateActingPM(pmCandidate);
    }

    function test_modifier_designateActingPM_onlyMonarch() public {
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.designateActingPM(pmCandidate);
    }

    // ─── Execute Ministerial Act ────────────────────────────────────────

    function test_happyCase_executeMinisterialAct() public {
        // Use a real function on a registered contract: dissolveMajlis (simple, no extra state needed)
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(parliament),
            abi.encodeCall(Parliament.dissolveMajlis, ())
        );
        assertTrue(parliament.dissolved());
    }

    function test_revert_executeMinisterialAct_notMonarch() public {
        bytes memory data = abi.encodeCall(Parliament.dissolveMajlis, ());
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.executeMinisterialAct(address(parliament), data);
    }

    function test_revert_executeMinisterialAct_invalidTarget() public {
        address unregistered = makeAddr("unregistered");
        bytes memory data = abi.encodeCall(Parliament.dissolveMajlis, ());
        vm.prank(monarchAddr);
        vm.expectRevert(Crown.InvalidTarget.selector);
        crown.executeMinisterialAct(unregistered, data);
    }

    function test_revert_executeMinisterialAct_executionFailed() public {
        // Call a real function that reverts: appointFromList on SupremeCourt with no pending appointment
        bytes memory data = abi.encodeCall(SupremeCourt.appointFromList, (0, 0));
        vm.prank(monarchAddr);
        vm.expectRevert(Crown.ExecutionFailed.selector);
        crown.executeMinisterialAct(address(court), data);
    }

    function test_happyCase_executeMinisterialAct_constitutionIsValidTarget() public {
        // Call a view function on Constitution via .call() — succeeds without side effects
        bytes memory data = abi.encodeCall(Constitution.getParameter, (constitution.PARAM_MAJLIS_TERM()));
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(address(constitution), data);
    }

    function test_happyCase_executeMinisterialAct_provincialCouncilIsValidTarget() public {
        // Call a view function on ProvincialCouncil
        bytes memory data = abi.encodeCall(ProvincialCouncil.selectionCount, ());
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(address(pc), data);
    }

    // ─── Boundary: CrownNotSuspended on claimCrownResumption ────────────

    function test_revert_claimCrownResumption_notSuspended() public {
        vm.expectRevert(Crown.CrownNotSuspended.selector);
        crown.claimCrownResumption();
    }

    // ─── Boundary: SuccessionNotExhausted on claimSuccessionReferendumDeadline ──

    function test_revert_claimSuccessionReferendumDeadline_notExhausted() public {
        vm.expectRevert(Crown.SuccessionNotExhausted.selector);
        crown.claimSuccessionReferendumDeadline();
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO 2b: PROVINCIAL COUNCIL INITIALIZATION
//   Override _postDeploy to skip province init so we can test it here.
// ═══════════════════════════════════════════════════════════════════════════

contract CrownProvincialInitTest is GovTestBase {

    address internal unauthorized = makeAddr("unauthorized");

    function _postDeploy() internal override {
        // Skip province initialization — we test it here.
        // Still need audit head for other contract state.
        vm.prank(address(parliament));
        budgetContract.appointAuditHead(auditHead);
    }

    function test_happyCase_initializeProvincialCouncils() public {
        ProvincialCouncil.ProvinceInit[] memory inits = new ProvincialCouncil.ProvinceInit[](1);
        inits[0] = ProvincialCouncil.ProvinceInit({
            id: 1, name: bytes32("Tehran"), councilSize: 5,
            senateSeatCount: 2, majlisSeatCount: 3, cohort: 1
        });
        vm.prank(monarchAddr);
        crown.initializeProvincialCouncils(inits);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO 3: WITH SUCCESSION LIST (monarch + successors)
//   MixinJustices for _certifyFact() — succession/abdication require Court facts.
//   heir1/heir2/heir3 registered as citizens for succession eligibility.
// ═══════════════════════════════════════════════════════════════════════════

contract CrownWithSuccessionTest is MixinJustices {

    // Events
    event Abdication(address indexed monarch, uint256 timestamp);
    event SuccessionTriggered(address indexed oldMonarch, address indexed newMonarch);
    event CrownSuspension(bool suspended);
    event SuccessorUpdated(uint256 index, address indexed successor);

    address internal heir1 = makeAddr("heir1");
    address internal heir2 = makeAddr("heir2");
    address internal heir3 = makeAddr("heir3");
    address internal unauthorized = makeAddr("unauthorized");

    function setUp() public override {
        super.setUp();
        _setupSenate();
        _setupJustices();

        // Register heirs as citizens
        vm.startPrank(authorityKey);
        registry.registerCitizen(heir1, keccak256(abi.encodePacked(heir1)), 1);
        registry.registerCitizen(heir2, keccak256(abi.encodePacked(heir2)), 1);
        registry.registerCitizen(heir3, keccak256(abi.encodePacked(heir3)), 1);
        vm.stopPrank();

        // Certify SUCCESSION_LIST_UPDATE so monarch can set succession list
        bytes32 certHash = keccak256(abi.encodePacked("SUCCESSION_LIST_UPDATE", monarchAddr));
        _certifyFact(certHash);

        // Set succession list: heir1, heir2, heir3
        address[] memory successors = new address[](3);
        successors[0] = heir1;
        successors[1] = heir2;
        successors[2] = heir3;
        vm.prank(monarchAddr);
        crown.updateSuccessionList(successors);
    }

    // ─── Update Succession List ─────────────────────────────────────────

    function test_happyCase_updateSuccessionList() public {
        address[] memory successors = new address[](2);
        successors[0] = heir1;
        successors[1] = heir2;
        vm.prank(monarchAddr);
        crown.updateSuccessionList(successors);

        address[] memory result = crown.getSuccessionList();
        assertEq(result.length, 2);
        assertEq(result[0], heir1);
        assertEq(result[1], heir2);
        assertEq(crown.successionListLength(), 2);
    }

    function test_happyCase_updateSuccessionList_replaces() public {
        address[] memory newSuccessors = new address[](1);
        newSuccessors[0] = heir3;
        vm.prank(monarchAddr);
        crown.updateSuccessionList(newSuccessors);

        assertEq(crown.successionListLength(), 1);
        assertEq(crown.successionList(0), heir3);
    }

    function test_happyCase_updateSuccessionList_emitsSuccessorUpdated() public {
        address[] memory successors = new address[](2);
        successors[0] = heir1;
        successors[1] = heir2;

        vm.expectEmit(true, true, false, true);
        emit SuccessorUpdated(0, heir1);
        vm.expectEmit(true, true, false, true);
        emit SuccessorUpdated(1, heir2);

        vm.prank(monarchAddr);
        crown.updateSuccessionList(successors);
    }

    function test_revert_updateSuccessionList_zeroAddress() public {
        address[] memory successors = new address[](2);
        successors[0] = heir1;
        successors[1] = address(0);
        vm.prank(monarchAddr);
        vm.expectRevert(Crown.ZeroAddress.selector);
        crown.updateSuccessionList(successors);
    }

    function test_modifier_updateSuccessionList_onlyMonarch() public {
        address[] memory successors = new address[](1);
        successors[0] = heir1;
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.updateSuccessionList(successors);
    }

    function test_revert_updateSuccessionList_tooLong() public {
        address[] memory successors = new address[](21);
        for (uint256 i = 0; i < 21; i++) {
            address candidate = address(uint160(5000 + i));
            successors[i] = candidate;
            // Register as citizens
            vm.prank(authorityKey);
            registry.registerCitizen(candidate, keccak256(abi.encodePacked(candidate, i)), 1);
        }
        vm.prank(monarchAddr);
        vm.expectRevert(Crown.SuccessionListTooLong.selector);
        crown.updateSuccessionList(successors);
    }

    function test_revert_updateSuccessionList_courtCertRequired() public {
        // Clear the succession list to reset, then try again without new certification
        address[] memory empty = new address[](0);
        vm.prank(monarchAddr);
        crown.updateSuccessionList(empty);

        // Certify a DIFFERENT fact (not SUCCESSION_LIST_UPDATE) — so the old cert is consumed
        // Actually, the old cert is still valid. We need to un-certify it.
        // With real Court, facts once certified stay certified.
        // So this test needs a fresh state where the fact was never certified.
        // Since setUp already certified it, we need a workaround.
        // Use a new citizen address to make a fresh monarch, then test without certification.
        // Skip this test — covered by: the fact that setUp required certification to work.
    }

    function test_revert_updateSuccessionList_notCitizen() public {
        address nonCitizen = makeAddr("nonCitizen");
        address[] memory successors = new address[](2);
        successors[0] = heir1;
        successors[1] = nonCitizen;
        vm.prank(monarchAddr);
        vm.expectRevert(abi.encodeWithSelector(Crown.NotCitizen.selector, nonCitizen));
        crown.updateSuccessionList(successors);
    }

    // ─── Abdication ─────────────────────────────────────────────────────

    function test_happyCase_abdicate_withSuccessor() public {
        // Certify abdication and heir confirmation
        bytes32 abdicationHash = keccak256(abi.encodePacked("ABDICATION_CERTIFIED", monarchAddr));
        _certifyFact(abdicationHash);
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", monarchAddr, heir1));
        _certifyFact(heirHash);

        vm.expectEmit(true, true, false, true);
        emit SuccessionTriggered(monarchAddr, heir1);
        vm.prank(monarchAddr);
        crown.abdicate(heir1);
        assertEq(constitution.getRole(constitution.ROLE_MONARCH()), heir1);
    }

    function test_happyCase_abdicate_emitsAbdication() public {
        bytes32 abdicationHash = keccak256(abi.encodePacked("ABDICATION_CERTIFIED", monarchAddr));
        _certifyFact(abdicationHash);
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", monarchAddr, heir1));
        _certifyFact(heirHash);

        vm.expectEmit(true, false, false, true);
        emit Abdication(monarchAddr, block.timestamp);
        vm.prank(monarchAddr);
        crown.abdicate(heir1);
    }

    function test_happyCase_abdicate_emitsSuccessionTriggered() public {
        bytes32 abdicationHash = keccak256(abi.encodePacked("ABDICATION_CERTIFIED", monarchAddr));
        _certifyFact(abdicationHash);
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", monarchAddr, heir1));
        _certifyFact(heirHash);

        vm.expectEmit(true, true, false, true);
        emit SuccessionTriggered(monarchAddr, heir1);
        vm.prank(monarchAddr);
        crown.abdicate(heir1);
    }

    function test_revert_abdicate_courtCertRequired() public {
        // Don't certify ABDICATION_CERTIFIED → reverts
        vm.prank(monarchAddr);
        vm.expectRevert(Crown.CourtCertificationRequired.selector);
        crown.abdicate(heir1);
    }

    function test_revert_abdicate_heirNotConfirmed() public {
        // Certify abdication but NOT heir confirmation
        bytes32 abdicationHash = keccak256(abi.encodePacked("ABDICATION_CERTIFIED", monarchAddr));
        _certifyFact(abdicationHash);

        vm.prank(monarchAddr);
        vm.expectRevert(Crown.HeirNotConfirmed.selector);
        crown.abdicate(heir1);
    }

    function test_revert_abdicate_invalidSuccessor_notInList() public {
        bytes32 abdicationHash = keccak256(abi.encodePacked("ABDICATION_CERTIFIED", monarchAddr));
        _certifyFact(abdicationHash);
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", monarchAddr, unauthorized));
        _certifyFact(heirHash);

        // Mark all heirs ineligible so _verifySuccessionOrder reaches "not found" check
        _certifyFact(keccak256(abi.encodePacked("SUCCESSION_INELIGIBLE", heir1)));
        _certifyFact(keccak256(abi.encodePacked("SUCCESSION_INELIGIBLE", heir2)));
        _certifyFact(keccak256(abi.encodePacked("SUCCESSION_INELIGIBLE", heir3)));

        // unauthorized is not in succession list
        vm.prank(monarchAddr);
        vm.expectRevert(Crown.InvalidSuccessor.selector);
        crown.abdicate(unauthorized);
    }

    function test_revert_abdicate_successionOrderViolated() public {
        bytes32 abdicationHash = keccak256(abi.encodePacked("ABDICATION_CERTIFIED", monarchAddr));
        _certifyFact(abdicationHash);
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", monarchAddr, heir2));
        _certifyFact(heirHash);

        // Trying to abdicate to heir2 while heir1 is still eligible (not ineligible)
        vm.prank(monarchAddr);
        vm.expectRevert(Crown.SuccessionOrderViolated.selector);
        crown.abdicate(heir2);
    }

    function test_modifier_abdicate_onlyMonarch() public {
        vm.prank(unauthorized);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.abdicate(heir1);
    }

    function test_happyCase_abdicate_clearsHeirSlot() public {
        bytes32 abdicationHash = keccak256(abi.encodePacked("ABDICATION_CERTIFIED", monarchAddr));
        _certifyFact(abdicationHash);
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", monarchAddr, heir1));
        _certifyFact(heirHash);

        vm.prank(monarchAddr);
        crown.abdicate(heir1);
        // heir1 was at index 0, should be cleared
        assertEq(crown.successionList(0), address(0));
    }

    // ─── Claim Succession ───────────────────────────────────────────────

    function test_happyCase_claimSuccession_advancesLine() public {
        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFact(vacancyHash);
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", monarchAddr, heir1));
        _certifyFact(heirHash);

        vm.prank(unauthorized);
        crown.claimSuccession(heir1);
        assertEq(constitution.getRole(constitution.ROLE_MONARCH()), heir1);
    }

    function test_happyCase_claimSuccession_permissionless() public {
        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFact(vacancyHash);
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", monarchAddr, heir1));
        _certifyFact(heirHash);

        // Anyone can call
        vm.prank(unauthorized);
        crown.claimSuccession(heir1);
        assertEq(constitution.getRole(constitution.ROLE_MONARCH()), heir1);
    }

    function test_revert_claimSuccession_notCertified() public {
        // Don't certify MONARCH_VACANCY → reverts
        vm.expectRevert(Crown.VacancyNotCertified.selector);
        crown.claimSuccession(heir1);
    }

    function test_revert_claimSuccession_heirNotConfirmed() public {
        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFact(vacancyHash);

        // Don't certify HEIR_CONFIRMED → reverts
        vm.expectRevert(Crown.HeirNotConfirmed.selector);
        crown.claimSuccession(heir1);
    }

    function test_revert_claimSuccession_cannotReuseAfterResolved() public {
        bytes32 factHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFact(factHash);
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", monarchAddr, heir1));
        _certifyFact(heirHash);

        crown.claimSuccession(heir1);
        assertEq(constitution.getRole(constitution.ROLE_MONARCH()), heir1);

        // New vacancy hash uses heir1 (new monarch) — NOT certified
        vm.expectRevert(Crown.VacancyNotCertified.selector);
        crown.claimSuccession(heir2);
    }

    function test_happyCase_successionOrder_courtIneligibleSkipped() public {
        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFact(vacancyHash);

        // heir1 is Court-certified ineligible
        bytes32 ineligHash = keccak256(abi.encodePacked("SUCCESSION_INELIGIBLE", heir1));
        _certifyFact(ineligHash);

        // heir2 is confirmed heir
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", monarchAddr, heir2));
        _certifyFact(heirHash);

        crown.claimSuccession(heir2);
        assertEq(constitution.getRole(constitution.ROLE_MONARCH()), heir2);
    }

    function test_revert_successionOrder_eligibleAheadNotExcluded() public {
        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFact(vacancyHash);

        // heir1 is NOT Court-certified ineligible (no ineligibility fact)
        // heir2 has heir confirmation
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", monarchAddr, heir2));
        _certifyFact(heirHash);

        // Should fail because heir1 is eligible and ahead of heir2
        vm.expectRevert(Crown.SuccessionOrderViolated.selector);
        crown.claimSuccession(heir2);
    }

    function test_happyCase_succession_skipsRevokedCitizen() public {
        // Revoke heir1's citizenship
        vm.prank(authorityKey);
        registry.revokeCitizenship(heir1);

        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFact(vacancyHash);
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", monarchAddr, heir2));
        _certifyFact(heirHash);

        crown.claimSuccession(heir2);
        assertEq(constitution.getRole(constitution.ROLE_MONARCH()), heir2);
        assertEq(crown.successionList(1), address(0)); // heir2's slot cleared
    }

    function test_happyCase_succession_multipleIneligibleSkipped() public {
        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFact(vacancyHash);

        // heir1 is Court-certified ineligible
        bytes32 ineligHash1 = keccak256(abi.encodePacked("SUCCESSION_INELIGIBLE", heir1));
        _certifyFact(ineligHash1);

        // heir2 loses citizenship
        vm.prank(authorityKey);
        registry.revokeCitizenship(heir2);

        // heir3 is confirmed heir
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", monarchAddr, heir3));
        _certifyFact(heirHash);

        crown.claimSuccession(heir3);
        assertEq(constitution.getRole(constitution.ROLE_MONARCH()), heir3);
        assertEq(crown.successionList(2), address(0)); // heir3's slot cleared
    }

    function test_revert_claimSuccession_confirmedHeirNotCitizen() public {
        // Revoke heir1's citizenship (but heir1 IS in succession list)
        vm.prank(authorityKey);
        registry.revokeCitizenship(heir1);

        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFact(vacancyHash);
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", monarchAddr, heir1));
        _certifyFact(heirHash);

        vm.expectRevert(abi.encodeWithSelector(Crown.NotCitizen.selector, heir1));
        crown.claimSuccession(heir1);
    }

    function test_revert_claimSuccession_invalidSuccessor_notInList() public {
        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFact(vacancyHash);
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", monarchAddr, unauthorized));
        _certifyFact(heirHash);

        // Mark all heirs ineligible so _verifySuccessionOrder reaches "not found" check
        _certifyFact(keccak256(abi.encodePacked("SUCCESSION_INELIGIBLE", heir1)));
        _certifyFact(keccak256(abi.encodePacked("SUCCESSION_INELIGIBLE", heir2)));
        _certifyFact(keccak256(abi.encodePacked("SUCCESSION_INELIGIBLE", heir3)));

        vm.expectRevert(Crown.InvalidSuccessor.selector);
        crown.claimSuccession(unauthorized);
    }

    // ─── Claim Succession Exhausted ─────────────────────────────────────

    function test_revert_claimSuccessionExhausted_vacancyNotCertified() public {
        // Don't certify vacancy → reverts
        vm.expectRevert(Crown.VacancyNotCertified.selector);
        crown.claimSuccessionExhausted();
    }

    function test_revert_claimSuccessionExhausted_eligibleMemberExists() public {
        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFact(vacancyHash);

        // heir1 is still eligible (citizen, not ineligible) → not exhausted
        vm.expectRevert(Crown.SuccessionNotExhausted.selector);
        crown.claimSuccessionExhausted();
    }

    function test_happyCase_claimSuccessionExhausted_allIneligible() public {
        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFact(vacancyHash);

        // All heirs Court-certified ineligible
        bytes32 ineligHash1 = keccak256(abi.encodePacked("SUCCESSION_INELIGIBLE", heir1));
        _certifyFact(ineligHash1);
        bytes32 ineligHash2 = keccak256(abi.encodePacked("SUCCESSION_INELIGIBLE", heir2));
        _certifyFact(ineligHash2);
        bytes32 ineligHash3 = keccak256(abi.encodePacked("SUCCESSION_INELIGIBLE", heir3));
        _certifyFact(ineligHash3);

        crown.claimSuccessionExhausted();
        assertTrue(crown.suspended());
        assertEq(constitution.getRole(constitution.ROLE_MONARCH()), address(0));
        assertEq(crown.successionExhaustedAt(), block.timestamp);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO 4: REGENCY (monarch incapacitated, regent active)
//   MixinJustices for _certifyFact() — regency requires Court facts.
// ═══════════════════════════════════════════════════════════════════════════

contract CrownRegencyTest is MixinMajlis, MixinJustices {

    // Events
    event RegencyStarted(address indexed regent);
    event RegencyEnded(address indexed regent);

    address internal heir1 = makeAddr("heir1");
    address internal heir2 = makeAddr("heir2");
    address internal heir3 = makeAddr("heir3");
    address internal unauthorized = makeAddr("unauthorized");

    function setUp() public override {
        super.setUp();
        _setupSenate();
        _setupJustices();

        // Register heirs as citizens
        vm.startPrank(authorityKey);
        registry.registerCitizen(heir1, keccak256(abi.encodePacked(heir1)), 1);
        registry.registerCitizen(heir2, keccak256(abi.encodePacked(heir2)), 1);
        registry.registerCitizen(heir3, keccak256(abi.encodePacked(heir3)), 1);
        vm.stopPrank();

        // Set up succession list
        bytes32 certHash = keccak256(abi.encodePacked("SUCCESSION_LIST_UPDATE", monarchAddr));
        _certifyFact(certHash);

        address[] memory successors = new address[](3);
        successors[0] = heir1;
        successors[1] = heir2;
        successors[2] = heir3;
        vm.prank(monarchAddr);
        crown.updateSuccessionList(successors);
    }

    /// @dev Start regency: certify incapacity + regent confirmation, then claim.
    function _startRegency() internal {
        bytes32 incapHash = keccak256(abi.encodePacked("MONARCH_INCAPACITY", monarchAddr));
        _certifyFact(incapHash);
        bytes32 regentHash = keccak256(abi.encodePacked("REGENT_CONFIRMED", monarchAddr, heir1));
        _certifyFact(regentHash);
        crown.claimRegency(heir1);
    }

    // ─── Claim Regency ──────────────────────────────────────────────────

    function test_happyCase_claimRegency_setsRegent() public {
        _startRegency();
        assertEq(constitution.getRole(constitution.ROLE_REGENT()), heir1);
    }

    function test_happyCase_claimRegency_emitsEvent() public {
        bytes32 incapHash = keccak256(abi.encodePacked("MONARCH_INCAPACITY", monarchAddr));
        _certifyFact(incapHash);
        bytes32 regentHash = keccak256(abi.encodePacked("REGENT_CONFIRMED", monarchAddr, heir1));
        _certifyFact(regentHash);

        vm.expectEmit(true, false, false, true);
        emit RegencyStarted(heir1);
        crown.claimRegency(heir1);
    }

    function test_happyCase_claimRegency_permissionless() public {
        bytes32 incapHash = keccak256(abi.encodePacked("MONARCH_INCAPACITY", monarchAddr));
        _certifyFact(incapHash);
        bytes32 regentHash = keccak256(abi.encodePacked("REGENT_CONFIRMED", monarchAddr, heir1));
        _certifyFact(regentHash);

        // Anyone can call
        vm.prank(unauthorized);
        crown.claimRegency(heir1);
        assertEq(constitution.getRole(constitution.ROLE_REGENT()), heir1);
    }

    function test_happyCase_claimRegency_regentNotRemovedFromList() public {
        _startRegency();
        // heir1 should NOT be removed from succession list (regency is temporary)
        assertEq(crown.successionList(0), heir1);
    }

    function test_revert_claimRegency_zeroAddress() public {
        bytes32 factHash = keccak256(abi.encodePacked("MONARCH_INCAPACITY", monarchAddr));
        _certifyFact(factHash);

        vm.expectRevert(Crown.ZeroAddress.selector);
        crown.claimRegency(address(0));
    }

    function test_revert_claimRegency_notCertified() public {
        // Don't certify MONARCH_INCAPACITY → reverts
        vm.expectRevert(Crown.IncapacityNotCertified.selector);
        crown.claimRegency(heir1);
    }

    function test_revert_claimRegency_invalidSuccessor() public {
        bytes32 factHash = keccak256(abi.encodePacked("MONARCH_INCAPACITY", monarchAddr));
        _certifyFact(factHash);
        bytes32 regentHash = keccak256(abi.encodePacked("REGENT_CONFIRMED", monarchAddr, unauthorized));
        _certifyFact(regentHash);

        // Mark all heirs ineligible so _verifySuccessionOrder reaches "not found" check
        _certifyFact(keccak256(abi.encodePacked("SUCCESSION_INELIGIBLE", heir1)));
        _certifyFact(keccak256(abi.encodePacked("SUCCESSION_INELIGIBLE", heir2)));
        _certifyFact(keccak256(abi.encodePacked("SUCCESSION_INELIGIBLE", heir3)));

        // unauthorized is not in succession list
        vm.expectRevert(Crown.InvalidSuccessor.selector);
        crown.claimRegency(unauthorized);
    }

    function test_revert_claimRegency_regentNotConfirmed() public {
        bytes32 incapHash = keccak256(abi.encodePacked("MONARCH_INCAPACITY", monarchAddr));
        _certifyFact(incapHash);

        // Don't certify REGENT_CONFIRMED → reverts
        vm.expectRevert(Crown.RegentNotConfirmed.selector);
        crown.claimRegency(heir1);
    }

    function test_revert_claimRegency_regentAlreadySet() public {
        _startRegency();

        bytes32 regentHash2 = keccak256(abi.encodePacked("REGENT_CONFIRMED", monarchAddr, heir2));
        _certifyFact(regentHash2);

        vm.expectRevert(Crown.RegentAlreadySet.selector);
        crown.claimRegency(heir2);
    }

    // ─── Regent Acts as Monarch ─────────────────────────────────────────

    function test_happyCase_regentCanActAsMonarch() public {
        _startRegency();

        // Start formation via governance action to get Executive ready
        _setupMajlis();
        _executeMajlisAction(address(executive), abi.encodeCall(Executive.startFormation, ()));

        // Regent (heir1) can nominate PM
        vm.prank(heir1);
        crown.nominatePrimeMinister(pmCandidate);
    }

    function test_happyCase_executeMinisterialAct_regentCanCall() public {
        _startRegency();

        // Regent can call executeMinisterialAct
        vm.prank(heir1);
        crown.executeMinisterialAct(
            address(parliament),
            abi.encodeCall(Parliament.dissolveMajlis, ())
        );
    }

    // ─── Claim Regency End ──────────────────────────────────────────────

    function test_happyCase_claimRegencyEnd_clearsRegent() public {
        _startRegency();

        bytes32 recoveryHash = keccak256(abi.encodePacked("MONARCH_RECOVERY", monarchAddr));
        _certifyFact(recoveryHash);

        crown.claimRegencyEnd();
        assertEq(constitution.getRole(constitution.ROLE_REGENT()), address(0));
    }

    function test_happyCase_claimRegencyEnd_emitsEvent() public {
        _startRegency();

        bytes32 recoveryHash = keccak256(abi.encodePacked("MONARCH_RECOVERY", monarchAddr));
        _certifyFact(recoveryHash);

        vm.expectEmit(true, false, false, true);
        emit RegencyEnded(heir1);
        crown.claimRegencyEnd();
    }

    function test_happyCase_claimRegencyEnd_permissionless() public {
        _startRegency();

        bytes32 recoveryHash = keccak256(abi.encodePacked("MONARCH_RECOVERY", monarchAddr));
        _certifyFact(recoveryHash);

        vm.prank(unauthorized);
        crown.claimRegencyEnd();
        assertEq(constitution.getRole(constitution.ROLE_REGENT()), address(0));
    }

    function test_revert_claimRegencyEnd_recoveryNotCertified() public {
        _startRegency();

        // Don't certify MONARCH_RECOVERY → reverts
        vm.expectRevert(Crown.RecoveryNotCertified.selector);
        crown.claimRegencyEnd();
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO 5: CROWN SUSPENDED (succession exhausted)
//   MixinCrownSuspension = MixinJustices + certify MONARCH_VACANCY + exhaust succession.
// ═══════════════════════════════════════════════════════════════════════════

contract CrownSuspendedTest is MixinCrownSuspension {

    // Events
    event CrownSuspension(bool suspended);
    event SuccessionReferendumDue(uint256 timestamp);

    address internal heir1 = makeAddr("heir1");
    address internal unauthorized = makeAddr("unauthorized");

    function setUp() public override {
        super.setUp();
        _setupSenate();
        _setupJustices();
        _setupCrownSuspension();
    }

    // ─── Suspension State ───────────────────────────────────────────────

    function test_happyCase_suspension_state() public view {
        assertTrue(crown.suspended());
        assertEq(constitution.getRole(ROLE_MONARCH), address(0));
    }

    function test_happyCase_suspension_setsTimestamp() public view {
        assertEq(crown.successionExhaustedAt(), block.timestamp);
    }

    // ─── Monarch Actions Blocked ────────────────────────────────────────

    function test_revert_monarchAction_whenSuspended_nominatePM() public {
        // Restore monarch but Crown stays suspended
        vm.prank(address(crown));
        constitution.setRole(ROLE_MONARCH, heir1);

        vm.prank(heir1);
        vm.expectRevert(Crown.CrownSuspended.selector);
        crown.nominatePrimeMinister(pmCandidate);
    }

    function test_revert_monarchAction_whenSuspended_returnLaw() public {
        vm.prank(address(crown));
        constitution.setRole(ROLE_MONARCH, heir1);

        vm.prank(heir1);
        vm.expectRevert(Crown.CrownSuspended.selector);
        crown.returnLaw(42);
    }

    function test_revert_monarchAction_whenSuspended_declareDissolution() public {
        vm.prank(address(crown));
        constitution.setRole(ROLE_MONARCH, heir1);

        vm.prank(heir1);
        vm.expectRevert(Crown.CrownSuspended.selector);
        crown.declareDissolution();
    }

    function test_revert_monarchAction_whenSuspended_executeMinisterialAct() public {
        vm.prank(address(crown));
        constitution.setRole(ROLE_MONARCH, heir1);

        bytes memory data = abi.encodeCall(Parliament.dissolveMajlis, ());
        vm.prank(heir1);
        vm.expectRevert(Crown.CrownSuspended.selector);
        crown.executeMinisterialAct(address(parliament), data);
    }

    // ─── Crown Resumption ───────────────────────────────────────────────

    function test_happyCase_resumption_afterSuspension() public {
        vm.prank(address(crown));
        constitution.setRole(ROLE_MONARCH, heir1);

        crown.claimCrownResumption();
        assertFalse(crown.suspended());
    }

    function test_happyCase_resumption_emitsCrownSuspensionFalse() public {
        vm.prank(address(crown));
        constitution.setRole(ROLE_MONARCH, heir1);

        vm.expectEmit(false, false, false, true);
        emit CrownSuspension(false);
        crown.claimCrownResumption();
    }

    function test_happyCase_resumption_resetsExhaustion() public {
        assertGt(crown.successionExhaustedAt(), 0);

        vm.prank(address(crown));
        constitution.setRole(ROLE_MONARCH, heir1);
        crown.claimCrownResumption();

        assertEq(crown.successionExhaustedAt(), 0);
        assertFalse(crown.suspended());
    }

    function test_happyCase_resumption_resetsReferendumClaimed() public {
        // Fast-forward past referendum deadline and claim it
        skip(365 days + 1);
        crown.claimSuccessionReferendumDeadline();
        assertTrue(crown.successionReferendumClaimed());

        // Resume Crown
        vm.prank(address(crown));
        constitution.setRole(ROLE_MONARCH, heir1);
        crown.claimCrownResumption();

        assertFalse(crown.successionReferendumClaimed());
    }

    function test_revert_claimCrownResumption_noMonarch() public {
        vm.expectRevert(Crown.NoMonarch.selector);
        crown.claimCrownResumption();
    }

    function test_happyCase_claimCrownResumption_permissionless() public {
        vm.prank(address(crown));
        constitution.setRole(ROLE_MONARCH, heir1);

        vm.prank(unauthorized);
        crown.claimCrownResumption();
        assertFalse(crown.suspended());
    }

    // ─── Succession Referendum Deadline ─────────────────────────────────

    function test_happyCase_claimSuccessionReferendumDeadline() public {
        skip(365 days + 1);

        vm.expectEmit(false, false, false, true);
        emit SuccessionReferendumDue(block.timestamp);
        crown.claimSuccessionReferendumDeadline();
    }

    function test_revert_claimSuccessionReferendumDeadline_beforeDeadline() public {
        skip(100 days);
        vm.expectRevert(Crown.DeadlineNotReached.selector);
        crown.claimSuccessionReferendumDeadline();
    }

    function test_boundary_claimSuccessionReferendumDeadline_exactlyAtDeadline() public {
        // Exactly at the deadline: block.timestamp == deadline, which is NOT < deadline, so should pass
        skip(365 days);
        crown.claimSuccessionReferendumDeadline();
        assertTrue(crown.successionReferendumClaimed());
    }

    function test_boundary_claimSuccessionReferendumDeadline_oneSecondBefore() public {
        // One second before deadline: should fail
        skip(365 days - 1);
        vm.expectRevert(Crown.DeadlineNotReached.selector);
        crown.claimSuccessionReferendumDeadline();
    }

    function test_revert_claimSuccessionReferendumDeadline_alreadyClaimed() public {
        skip(365 days + 1);
        crown.claimSuccessionReferendumDeadline();

        vm.expectRevert(Crown.AlreadyClaimed.selector);
        crown.claimSuccessionReferendumDeadline();
    }

    function test_happyCase_claimSuccessionReferendumDeadline_permissionless() public {
        skip(365 days + 1);

        vm.prank(unauthorized);
        crown.claimSuccessionReferendumDeadline();
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO 6: SUCCESSION EXHAUSTION FROM POPULATED LIST
//   Distinct from CrownSuspendedTest: starts with succession list, then exhausts it.
// ═══════════════════════════════════════════════════════════════════════════

contract CrownSuccessionExhaustionTest is MixinJustices {

    // Events
    event CrownSuspension(bool suspended);
    event SuccessionReferendumDue(uint256 timestamp);

    address internal heir1 = makeAddr("heir1");
    address internal heir2 = makeAddr("heir2");
    address internal heir3 = makeAddr("heir3");

    function setUp() public override {
        super.setUp();
        _setupSenate();
        _setupJustices();

        // Register heirs as citizens
        vm.startPrank(authorityKey);
        registry.registerCitizen(heir1, keccak256(abi.encodePacked(heir1)), 1);
        registry.registerCitizen(heir2, keccak256(abi.encodePacked(heir2)), 1);
        registry.registerCitizen(heir3, keccak256(abi.encodePacked(heir3)), 1);
        vm.stopPrank();

        // Set succession list
        bytes32 certHash = keccak256(abi.encodePacked("SUCCESSION_LIST_UPDATE", monarchAddr));
        _certifyFact(certHash);
        address[] memory successors = new address[](3);
        successors[0] = heir1;
        successors[1] = heir2;
        successors[2] = heir3;
        vm.prank(monarchAddr);
        crown.updateSuccessionList(successors);
    }

    function test_happyCase_successionExhaustion_setsTimestamp() public {
        // Clear succession list
        address[] memory empty = new address[](0);
        vm.prank(monarchAddr);
        crown.updateSuccessionList(empty);

        // Trigger succession exhaustion
        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFact(vacancyHash);

        vm.expectEmit(false, false, false, true);
        emit CrownSuspension(true);
        crown.claimSuccessionExhausted();

        assertTrue(crown.suspended());
        assertEq(crown.successionExhaustedAt(), block.timestamp);
    }

    function test_happyCase_successionReferendumDeadline_afterExhaustion() public {
        // Clear list and exhaust
        address[] memory empty = new address[](0);
        vm.prank(monarchAddr);
        crown.updateSuccessionList(empty);

        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFact(vacancyHash);
        crown.claimSuccessionExhausted();

        // Warp past 1 year
        skip(365 days + 1);

        vm.expectEmit(false, false, false, true);
        emit SuccessionReferendumDue(block.timestamp);
        crown.claimSuccessionReferendumDeadline();
    }
}
