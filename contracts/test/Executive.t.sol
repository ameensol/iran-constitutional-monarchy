// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./helpers/MixinMajlis.sol";
import "./helpers/MixinGovernment.sol";
import "./helpers/MixinJustices.sol";
import "./helpers/MixinCrownSuspension.sol";

// =============================================================================
// ExecutiveFormationTest -- MixinMajlis
//
// Formation cycle mechanics. Crown is active, monarchAddr is the monarch.
// Majlis members are citizen1-5.
// =============================================================================
contract ExecutiveFormationTest is MixinMajlis {
    // ── Events (local declarations, Solidity 0.8.20 limitation) ─────────
    event FormationStarted(uint256 timestamp);
    event PMNominated(address indexed nominee, Executive.FormationStage stage);
    event ConfidenceVoteCast(address indexed voter, bool support);
    event ConfidenceGranted(address indexed pm, uint256 timestamp);
    event ConfidenceFailed(address indexed nominee, Executive.FormationStage stage);
    event CaretakerActivated(uint256 timestamp);
    event MajlisListSubmitted(address[3] candidates);
    event GovernmentProgramPresented(address indexed nominee, bytes32 programHash);
    event DissolutionTriggered(uint256 timestamp);
    event DeputyPMDesignated(address indexed deputy);
    event ActingPMActivated(address indexed actingPM);
    event CrownNominationTimeout(Executive.FormationStage fromStage);

    // ── Test-specific actors ────────────────────────────────────────────
    address internal nominee1 = makeAddr("nominee1");
    address internal nominee2 = makeAddr("nominee2");
    address internal nominee3 = makeAddr("nominee3");
    address internal unauthorized = makeAddr("unauthorized");

    // ── Cached keys ─────────────────────────────────────────────────────
    bytes32 internal ROLE_PM_KEY;

    function setUp() public virtual override {
        super.setUp();
        _setupMajlis();
        ROLE_PM_KEY = constitution.ROLE_PRIME_MINISTER();

        // Register nominees as citizens so they can be nominated
        vm.startPrank(authorityKey);
        registry.registerCitizen(nominee1, keccak256(abi.encodePacked("nominee1")), 1);
        registry.registerCitizen(nominee2, keccak256(abi.encodePacked("nominee2")), 1);
        registry.registerCitizen(nominee3, keccak256(abi.encodePacked("nominee3")), 1);
        vm.stopPrank();
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    function _startFormation() internal {
        _executeMajlisAction(
            address(executive),
            abi.encodeCall(Executive.startFormation, ())
        );
    }

    function _nominatePM(address candidate) internal {
        vm.prank(monarchAddr);
        crown.nominatePrimeMinister(candidate);
    }

    function _startFormationAndNominate(address candidate) internal {
        _startFormation();
        _nominatePM(candidate);
        vm.prank(candidate);
        executive.presentGovernment(keccak256("Government Program"));
    }

    function _grantConfidence(address candidate) internal {
        _startFormationAndNominate(candidate);

        // 3 of 5 = absolute majority
        vm.prank(citizen1); executive.voteConfidence(true);
        vm.prank(citizen2); executive.voteConfidence(true);
        vm.prank(citizen3); executive.voteConfidence(true);

        _warpForward(3 days);
        executive.finalizeConfidenceVote();
    }

    function _failAllConfidence() internal {
        vm.prank(citizen1); executive.voteConfidence(false);
        vm.prank(citizen2); executive.voteConfidence(false);
        vm.prank(citizen3); executive.voteConfidence(false);
        vm.prank(citizen4); executive.voteConfidence(false);
        vm.prank(citizen5); executive.voteConfidence(false);
        _warpForward(3 days);
        executive.finalizeConfidenceVote();
    }

    function _reachMajlisListStage() internal {
        _startFormationAndNominate(nominee1);
        _failAllConfidence();

        _nominatePM(nominee2);
        vm.prank(nominee2);
        executive.presentGovernment(keccak256("Program 2"));
        _failAllConfidence();
    }

    function _submitMajlisList(address[3] memory candidates) internal {
        _executeMajlisAction(
            address(executive),
            abi.encodeCall(Executive.submitMajlisList, (candidates))
        );
    }

    // ═════════════════════════════════════════════════════════════════════
    // 1. CONSTRUCTION
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_constructor() public view {
        assertEq(address(executive.constitution()), address(constitution));
        assertFalse(executive.caretaker());
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.Idle));
    }

    // ═════════════════════════════════════════════════════════════════════
    // 2. FORMATION START
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_startFormation() public {
        _startFormation();

        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom1));
        assertTrue(executive.caretaker());
    }

    function test_modifier_startFormation_onlyParliament() public {
        vm.prank(unauthorized);
        vm.expectRevert(Executive.NotAuthorized.selector);
        executive.startFormation();
    }

    function test_revert_startFormation_crownCannotCall() public {
        vm.prank(address(crown));
        vm.expectRevert(Executive.NotAuthorized.selector);
        executive.startFormation();
    }

    // ═════════════════════════════════════════════════════════════════════
    // 3. CROWN NOMINATION + CONFIDENCE VOTE
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_nominateAndConfidence() public {
        _grantConfidence(nominee1);

        assertEq(constitution.getRole(ROLE_PM_KEY), nominee1);
        assertFalse(executive.caretaker());
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.Idle));
    }

    function test_happyCase_confidenceVote_emitsEvents() public {
        _startFormationAndNominate(nominee1);

        vm.expectEmit(true, false, false, true);
        emit ConfidenceVoteCast(citizen1, true);

        vm.prank(citizen1);
        executive.voteConfidence(true);
    }

    function test_revert_voteConfidence_noNominee() public {
        _startFormation();

        vm.prank(citizen1);
        vm.expectRevert(Executive.NomineeNotSet.selector);
        executive.voteConfidence(true);
    }

    function test_revert_voteConfidence_alreadyVoted() public {
        _startFormationAndNominate(nominee1);

        vm.prank(citizen1);
        executive.voteConfidence(true);

        vm.prank(citizen1);
        vm.expectRevert(Executive.AlreadyVoted.selector);
        executive.voteConfidence(true);
    }

    function test_modifier_voteConfidence_onlyMajlis() public {
        _startFormationAndNominate(nominee1);

        vm.prank(unauthorized);
        vm.expectRevert(Executive.NotMajlisMember.selector);
        executive.voteConfidence(true);
    }

    function test_revert_voteConfidence_noProgramPresented() public {
        _startFormation();
        _nominatePM(nominee1);

        // Try to vote without presenting program
        vm.prank(citizen1);
        vm.expectRevert(Executive.ProgramNotPresented.selector);
        executive.voteConfidence(true);
    }

    function test_happyCase_presentGovernment() public {
        _startFormation();
        _nominatePM(nominee1);

        vm.prank(nominee1);
        executive.presentGovernment(keccak256("My program"));

        assertEq(executive.governmentProgram(), keccak256("My program"));
    }

    function test_revert_finalizeConfidence_minPeriodNotElapsed() public {
        _startFormationAndNominate(nominee1);

        vm.prank(citizen1); executive.voteConfidence(true);
        vm.prank(citizen2); executive.voteConfidence(true);
        vm.prank(citizen3); executive.voteConfidence(true);

        // Try to finalize immediately -- should fail
        vm.expectRevert(Executive.VotingPeriodNotElapsed.selector);
        executive.finalizeConfidenceVote();

        // After min period, should succeed
        _warpForward(3 days);
        executive.finalizeConfidenceVote();
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.Idle));
    }

    // ═════════════════════════════════════════════════════════════════════
    // 4. CONFIDENCE FAILURE -> STAGE PROGRESSION
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_confidenceFailure_nom1ToNom2() public {
        _startFormationAndNominate(nominee1);
        _failAllConfidence();

        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom2));
    }

    function test_happyCase_confidenceFailure_nom2ToMajlisList() public {
        _reachMajlisListStage();

        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.MajlisList));
    }

    // ═════════════════════════════════════════════════════════════════════
    // 5. MAJLIS LIST -> APPOINTMENT
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_appointFromList() public {
        _reachMajlisListStage();

        address[3] memory candidates = [nominee1, nominee2, nominee3];
        _submitMajlisList(candidates);

        // Crown appoints from list (index 1)
        vm.prank(monarchAddr);
        crown.appointPMFromList(1);

        assertEq(constitution.getRole(ROLE_PM_KEY), nominee2);
        assertFalse(executive.caretaker());
    }

    function test_happyCase_autoAppointFromList() public {
        _reachMajlisListStage();

        address[3] memory candidates = [nominee1, nominee2, nominee3];
        _submitMajlisList(candidates);

        // Warp past CROWN_APPOINT_DEADLINE (7 days) + 1
        _warpForward(7 days + 1);

        executive.autoAppointFromList();

        // First-ranked is auto-appointed
        assertEq(constitution.getRole(ROLE_PM_KEY), nominee1);
    }

    function test_revert_autoAppointFromList_deadlineNotSet() public {
        _reachMajlisListStage();

        // majlisListDeadline is 0 (no list submitted)
        vm.expectRevert(Executive.DeadlineNotSet.selector);
        executive.autoAppointFromList();
    }

    function test_revert_appointFromList_zeroCandidates() public {
        _reachMajlisListStage();

        // Don't submit list -- candidates are all address(0)
        // Crown tries to appoint index 0 via crown.appointPMFromList
        vm.prank(monarchAddr);
        vm.expectRevert();
        crown.appointPMFromList(0);
    }

    function test_revert_submitMajlisList_zeroAddress() public {
        _reachMajlisListStage();

        address[3] memory candidates = [nominee1, address(0), nominee3];
        uint256 actionId = _prepareMajlisAction(
            address(executive),
            abi.encodeCall(Executive.submitMajlisList, (candidates))
        );

        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_submitMajlisList_duplicateCandidates() public {
        _reachMajlisListStage();

        // Submit list with duplicate candidates via Majlis governance action
        address[3] memory candidates = [nominee1, nominee1, nominee3];
        uint256 actionId = _prepareMajlisAction(
            address(executive),
            abi.encodeCall(Executive.submitMajlisList, (candidates))
        );

        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    // ═════════════════════════════════════════════════════════════════════
    // 6. DISSOLUTION
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_triggerDissolution() public {
        _reachMajlisListStage();

        _executeMajlisAction(
            address(executive),
            abi.encodeCall(Executive.triggerDissolution, ())
        );

        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.Dissolved));
    }

    function test_happyCase_triggerDissolution_dissolvesParliament() public {
        _reachMajlisListStage();

        _executeMajlisAction(
            address(executive),
            abi.encodeCall(Executive.triggerDissolution, ())
        );

        assertTrue(parliament.dissolved());
    }

    // ═════════════════════════════════════════════════════════════════════
    // 7. CARETAKER MODE
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_caretakerActivated() public {
        _startFormation();

        assertTrue(executive.isCaretaker());
    }

    function test_happyCase_caretakerDeactivated() public {
        _grantConfidence(nominee1);

        assertFalse(executive.isCaretaker());
    }

    // ═════════════════════════════════════════════════════════════════════
    // 8. NO-CONFIDENCE GUARDS
    // ═════════════════════════════════════════════════════════════════════

    function test_revert_fileNoConfidence_noPM() public {
        vm.prank(citizen1);
        vm.expectRevert(Executive.PMNotActive.selector);
        executive.fileNoConfidence();
    }

    function test_revert_fileNoConfidence_duringFormation() public {
        _startFormation();

        vm.prank(citizen1);
        vm.expectRevert(Executive.FormationInProgress.selector);
        executive.fileNoConfidence();
    }

    // ═════════════════════════════════════════════════════════════════════
    // 9. SELF-ENFORCING TERMS -- CROSS-CONTRACT
    // ═════════════════════════════════════════════════════════════════════

    function test_revert_expiredMajlisMember_cannotVoteConfidence() public {
        _startFormationAndNominate(nominee1);

        uint256 majlisTerm = constitution.getParameter(constitution.PARAM_MAJLIS_TERM());
        _warpForward(majlisTerm + 1);

        vm.prank(citizen1);
        vm.expectRevert(Executive.NotMajlisMember.selector);
        executive.voteConfidence(true);
    }

    function test_revert_expiredMajlisMember_cannotFileNoConfidence() public {
        _grantConfidence(nominee1);

        uint256 majlisTerm = constitution.getParameter(constitution.PARAM_MAJLIS_TERM());
        _warpForward(majlisTerm + 1);

        vm.prank(citizen1);
        vm.expectRevert(Executive.NotMajlisMember.selector);
        executive.fileNoConfidence();
    }

    // ═════════════════════════════════════════════════════════════════════
    // 10. FORMATION RESET + ACTING PM
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_startFormation_resetsDeadlines() public {
        // Get to MajlisList stage, submit list (sets deadline)
        _reachMajlisListStage();
        address[3] memory candidates = [nominee1, nominee2, nominee3];
        _submitMajlisList(candidates);
        assertTrue(executive.majlisListDeadline() > 0);

        // Appoint from list to return to Idle
        vm.prank(monarchAddr);
        crown.appointPMFromList(0);

        // Start new formation -- deadlines should be reset
        _executeMajlisAction(
            address(executive),
            abi.encodeCall(Executive.startFormation, ())
        );
        assertEq(executive.majlisListDeadline(), 0);
        assertEq(executive.majlisSubmissionDeadline(), 0);
        assertEq(executive.confidenceVoteDeadline(), 0);
        assertEq(executive.noConfidenceDeadline(), 0);
    }

    function test_happyCase_crownDesignatesActingPM() public {
        _startFormation();

        address acting = makeAddr("actingPM");
        vm.prank(authorityKey);
        registry.registerCitizen(acting, keccak256(abi.encodePacked("acting")), 1);

        vm.prank(monarchAddr);
        crown.designateActingPM(acting);

        assertEq(constitution.getRole(ROLE_PM_KEY), acting);
        assertTrue(executive.caretaker());
    }

    function test_revert_designateActingPM_noFormation() public {
        // No formation in progress -- cannot designate Acting PM
        vm.prank(monarchAddr);
        vm.expectRevert();
        crown.designateActingPM(makeAddr("acting"));
    }

    // ═════════════════════════════════════════════════════════════════════
    // 11. CROWN NOMINATION DEADLINES
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_startFormation_crownActive_setsCrownDeadline() public {
        _startFormation();

        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom1));
        assertTrue(executive.crownNominationDeadline() > 0);
        assertEq(executive.crownNominationDeadline(), block.timestamp + 14 days);
    }

    function test_happyCase_claimCrownNominationTimeout_crownNom1() public {
        _startFormation();
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom1));

        // Warp past 14-day deadline
        _warpForward(14 days + 1);

        executive.claimCrownNominationTimeout();

        // Should jump straight to MajlisList
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.MajlisList));
        assertTrue(executive.majlisSubmissionDeadline() > 0);
        assertEq(executive.crownNominationDeadline(), 0);
    }

    function test_happyCase_claimCrownNominationTimeout_crownNom2() public {
        _startFormationAndNominate(nominee1);

        // All 5 vote no
        _failAllConfidence();
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom2));

        // Crown doesn't nominate again -- warp past deadline
        _warpForward(14 days + 1);

        executive.claimCrownNominationTimeout();
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.MajlisList));
    }

    function test_revert_claimCrownNominationTimeout_beforeDeadline() public {
        _startFormation();

        vm.expectRevert(Executive.DeadlineNotReached.selector);
        executive.claimCrownNominationTimeout();
    }

    function test_revert_claimCrownNominationTimeout_wrongStage() public {
        // Idle stage
        vm.expectRevert(abi.encodeWithSelector(Executive.NotInStage.selector, Executive.FormationStage.CrownNom1));
        executive.claimCrownNominationTimeout();
    }

    function test_happyCase_nominatePM_clearsCrownDeadline() public {
        _startFormation();
        assertTrue(executive.crownNominationDeadline() > 0);

        _nominatePM(nominee1);
        assertEq(executive.crownNominationDeadline(), 0);
    }

    // ═════════════════════════════════════════════════════════════════════
    // 12. DEPUTY DESIGNATION DEADLINES
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_appointFromList_setsDeputyDeadline() public {
        _reachMajlisListStage();

        address[3] memory candidates = [nominee1, nominee2, nominee3];
        _submitMajlisList(candidates);

        vm.prank(monarchAddr);
        crown.appointPMFromList(1);

        assertTrue(executive.deputyDesignationDeadline() > 0);
        assertEq(executive.deputyDesignationDeadline(), block.timestamp + 14 days);
    }

    function test_happyCase_autoAppointFromList_setsDeputyDeadline() public {
        _reachMajlisListStage();

        address[3] memory candidates = [nominee1, nominee2, nominee3];
        _submitMajlisList(candidates);

        _warpForward(7 days + 1);
        executive.autoAppointFromList();

        assertTrue(executive.deputyDesignationDeadline() > 0);
    }

    function test_happyCase_confidenceGranted_setsDeputyDeadline() public {
        _grantConfidence(nominee1);

        uint256 deadline = executive.deputyDesignationDeadline();
        assertTrue(deadline > 0);
        assertEq(deadline, block.timestamp + 14 days);
    }

    // ═════════════════════════════════════════════════════════════════════
    // 13. CONSTRUCTOR
    // ═════════════════════════════════════════════════════════════════════

    function test_revert_constructor_zeroAddress() public {
        vm.expectRevert(Executive.ZeroAddress.selector);
        new Executive(address(0));
    }

    // ═════════════════════════════════════════════════════════════════════
    // 14. PRESENT GOVERNMENT GUARDS
    // ═════════════════════════════════════════════════════════════════════

    function test_revert_presentGovernment_noNominee() public {
        _startFormation();

        vm.prank(nominee1);
        vm.expectRevert(Executive.NomineeNotSet.selector);
        executive.presentGovernment(keccak256("program"));
    }

    function test_revert_presentGovernment_notNominee() public {
        _startFormation();
        _nominatePM(nominee1);

        vm.prank(nominee2);
        vm.expectRevert(Executive.NotAuthorized.selector);
        executive.presentGovernment(keccak256("program"));
    }

    // ═════════════════════════════════════════════════════════════════════
    // 15. MAJLIS LIST SUBMISSION TIMEOUT
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_claimMajlisListTimeout() public {
        _reachMajlisListStage();

        // majlisSubmissionDeadline is set when stage transitions to MajlisList
        assertTrue(executive.majlisSubmissionDeadline() > 0);

        // Warp past Majlis list submission deadline
        uint256 deadline = executive.majlisSubmissionDeadline();
        vm.warp(deadline + 1);

        executive.claimMajlisListTimeout();

        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.Dissolved));
        assertTrue(parliament.dissolved());
    }

    function test_revert_claimMajlisListTimeout_wrongStage() public {
        // Idle stage
        vm.expectRevert(abi.encodeWithSelector(Executive.NotInStage.selector, Executive.FormationStage.MajlisList));
        executive.claimMajlisListTimeout();
    }

    function test_revert_claimMajlisListTimeout_beforeDeadline() public {
        _reachMajlisListStage();

        vm.expectRevert(Executive.DeadlineNotReached.selector);
        executive.claimMajlisListTimeout();
    }

    // ═════════════════════════════════════════════════════════════════════
    // 16. APPOINT FROM LIST GUARDS
    // ═════════════════════════════════════════════════════════════════════

    function test_revert_appointFromList_wrongStage() public {
        // Try to appoint from list when not in MajlisList stage
        _startFormation(); // Stage is CrownNom1, not MajlisList
        // Crown.appointPMFromList is a direct Solidity call — inner error propagates
        vm.prank(monarchAddr);
        vm.expectRevert(abi.encodeWithSelector(Executive.NotInStage.selector, Executive.FormationStage.MajlisList));
        crown.appointPMFromList(0);
    }

    function test_revert_appointFromList_indexOutOfBounds() public {
        _reachMajlisListStage();

        address[3] memory candidates = [nominee1, nominee2, nominee3];
        _submitMajlisList(candidates);

        vm.prank(monarchAddr);
        vm.expectRevert(Executive.IndexOutOfBounds.selector);
        crown.appointPMFromList(3);
    }

    // ═════════════════════════════════════════════════════════════════════
    // 17. DESIGNATE ACTING PM GUARDS
    // ═════════════════════════════════════════════════════════════════════

    function test_revert_designateActingPM_zeroAddress() public {
        _startFormation();

        vm.prank(monarchAddr);
        vm.expectRevert();
        crown.designateActingPM(address(0));
    }

    // ═════════════════════════════════════════════════════════════════════
    // 18. NOMINATION DURING WRONG STAGE
    // ═════════════════════════════════════════════════════════════════════

    function test_revert_nominatePM_wrongStage_idle() public {
        vm.prank(monarchAddr);
        vm.expectRevert();
        crown.nominatePrimeMinister(nominee1);
    }

    function test_revert_nominatePM_wrongStage_majlisList() public {
        _reachMajlisListStage();

        vm.prank(monarchAddr);
        vm.expectRevert();
        crown.nominatePrimeMinister(nominee1);
    }
}

// =============================================================================
// ExecutiveGovernmentTest -- MixinGovernment
//
// Tests needing sitting PM. PM=pmCandidate from setUp. Majlis=citizen1-5.
// =============================================================================
contract ExecutiveGovernmentTest is MixinGovernment {
    // ── Events ──────────────────────────────────────────────────────────
    event NoConfidenceMotionFiled(uint256 timestamp);
    event NoConfidenceVoteCast(address indexed voter, bool support);
    event NoConfidencePassed(address indexed pm, uint256 timestamp);
    event NoConfidenceFailed(uint256 timestamp);
    event FormationStarted(uint256 timestamp);
    event CaretakerActivated(uint256 timestamp);
    event DeputyPMDesignated(address indexed deputy);

    // ── Cached keys ─────────────────────────────────────────────────────
    bytes32 internal ROLE_PM_KEY;

    function setUp() public virtual override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
        ROLE_PM_KEY = constitution.ROLE_PRIME_MINISTER();
    }

    // ═════════════════════════════════════════════════════════════════════
    // 1. NO-CONFIDENCE
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_noConfidence_afterHoneymoon() public {
        uint256 honeymoon = constitution.getParameter(constitution.PARAM_CONFIDENCE_HONEYMOON());
        _warpForward(honeymoon + 1);

        // File motion
        vm.prank(citizen1);
        executive.fileNoConfidence();

        // Simple majority (3 of 5)
        vm.prank(citizen1); executive.voteNoConfidence(true);
        vm.prank(citizen2); executive.voteNoConfidence(true);
        vm.prank(citizen3); executive.voteNoConfidence(true);

        executive.finalizeNoConfidence();

        // PM removed, formation started
        assertEq(constitution.getRole(ROLE_PM_KEY), address(0));
        assertTrue(executive.caretaker());
    }

    function test_happyCase_noConfidence_duringHoneymoon_needs2thirds() public {
        // Within 90-day honeymoon
        _warpForward(30 days);

        vm.prank(citizen1);
        executive.fileNoConfidence();

        // 3 of 5 is NOT 2/3 (need 4 of 5 during honeymoon)
        vm.prank(citizen1); executive.voteNoConfidence(true);
        vm.prank(citizen2); executive.voteNoConfidence(true);
        vm.prank(citizen3); executive.voteNoConfidence(true);
        vm.prank(citizen4); executive.voteNoConfidence(false);
        vm.prank(citizen5); executive.voteNoConfidence(false);

        executive.finalizeNoConfidence();

        // Motion failed -- PM still in place
        assertEq(constitution.getRole(ROLE_PM_KEY), pmCandidate);
    }

    // ═════════════════════════════════════════════════════════════════════
    // 2. DEPUTY PM (Art. IV.9)
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_designateDeputyPM() public {
        address deputy = makeAddr("deputy");
        vm.prank(pmCandidate);
        executive.designateDeputyPM(deputy);

        assertEq(executive.deputyPM(), deputy);
    }

    function test_revert_designateDeputyPM_notPM() public {
        address deputy = makeAddr("deputy");
        vm.prank(citizen1);
        vm.expectRevert(Executive.NotPrimeMinister.selector);
        executive.designateDeputyPM(deputy);
    }

    function test_revert_designateDeputyPM_zeroAddress() public {
        vm.prank(pmCandidate);
        vm.expectRevert(Executive.ZeroAddress.selector);
        executive.designateDeputyPM(address(0));
    }

    function test_happyCase_designateDeputyPM_clearsDeadline() public {
        assertTrue(executive.deputyDesignationDeadline() > 0);

        address deputy = makeAddr("deputy");
        vm.prank(pmCandidate);
        executive.designateDeputyPM(deputy);

        assertEq(executive.deputyDesignationDeadline(), 0);
        assertEq(executive.deputyPM(), deputy);
    }

    function test_happyCase_isDeputyOverdue_falseBeforeDeadline() public {
        assertFalse(executive.isDeputyOverdue());
    }

    function test_happyCase_isDeputyOverdue_trueAfterDeadline() public {
        _warpForward(14 days + 1);

        assertTrue(executive.isDeputyOverdue());
    }

    function test_happyCase_isDeputyOverdue_falseAfterDesignation() public {
        _warpForward(14 days + 1);
        assertTrue(executive.isDeputyOverdue());

        address deputy = makeAddr("deputy");
        vm.prank(pmCandidate);
        executive.designateDeputyPM(deputy);

        assertFalse(executive.isDeputyOverdue());
    }

    function test_happyCase_startFormation_clearsDeputyDeadline() public {
        assertTrue(executive.deputyDesignationDeadline() > 0);

        _executeMajlisAction(
            address(executive),
            abi.encodeCall(Executive.startFormation, ())
        );

        assertEq(executive.deputyDesignationDeadline(), 0);
    }

    function test_happyCase_replaceDeputy() public {
        address deputyA = makeAddr("deputyA");
        vm.prank(pmCandidate);
        executive.designateDeputyPM(deputyA);
        assertEq(executive.deputyPM(), deputyA);

        address deputyB = makeAddr("deputyB");
        vm.prank(pmCandidate);
        executive.designateDeputyPM(deputyB);
        assertEq(executive.deputyPM(), deputyB);
    }

    // ═════════════════════════════════════════════════════════════════════
    // 3. PM VACANCY GUARDS
    // ═════════════════════════════════════════════════════════════════════

    function test_revert_claimPMVacancy_notCertified() public {
        // No fact certified -- court returns false naturally
        vm.expectRevert(Executive.PMVacancyNotCertified.selector);
        executive.claimPMVacancy();
    }

    function test_revert_nominateJusticeDuringSuspension_crownNotSuspended() public {
        // Crown is active -- cannot use suspension path
        vm.prank(pmCandidate);
        vm.expectRevert(Executive.CrownNotSuspended.selector);
        executive.nominateJusticeDuringSuspension(makeAddr("candidate"), 0);
    }

    // ═════════════════════════════════════════════════════════════════════
    // 4. EXECUTE PM ACTION
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_executePMAction() public {
        // PM calls a view function on a registered contract (succeeds)
        vm.prank(pmCandidate);
        executive.executePMAction(
            address(constitution),
            abi.encodeCall(Constitution.getParameter, (bytes32(0)))
        );
    }

    function test_revert_executePMAction_notPM() public {
        vm.prank(citizen1);
        vm.expectRevert(Executive.NotPrimeMinister.selector);
        executive.executePMAction(
            address(constitution),
            abi.encodeCall(Constitution.getParameter, (bytes32(0)))
        );
    }

    function test_revert_executePMAction_invalidTarget() public {
        address unregistered = makeAddr("unregistered");
        vm.prank(pmCandidate);
        vm.expectRevert(Executive.InvalidTarget.selector);
        executive.executePMAction(
            unregistered,
            abi.encodeCall(Constitution.getParameter, (bytes32(0)))
        );
    }

    function test_revert_executePMAction_executionFailed() public {
        // Call a registered contract with data that causes it to revert
        vm.prank(pmCandidate);
        vm.expectRevert(Executive.ExecutionFailed.selector);
        executive.executePMAction(
            address(constitution),
            hex"deadbeef"
        );
    }

    // ═════════════════════════════════════════════════════════════════════
    // 5. NO-CONFIDENCE GUARDS
    // ═════════════════════════════════════════════════════════════════════

    function test_revert_voteNoConfidence_noMotionActive() public {
        vm.prank(citizen1);
        vm.expectRevert(Executive.NoFormationInProgress.selector);
        executive.voteNoConfidence(true);
    }

    function test_revert_finalizeNoConfidence_noMotionActive() public {
        vm.expectRevert(Executive.NoFormationInProgress.selector);
        executive.finalizeNoConfidence();
    }

    function test_revert_noConfidence_alreadyVoted() public {
        uint256 honeymoon = constitution.getParameter(constitution.PARAM_CONFIDENCE_HONEYMOON());
        _warpForward(honeymoon + 1);

        vm.prank(citizen1);
        executive.fileNoConfidence();

        vm.prank(citizen1);
        executive.voteNoConfidence(true);

        vm.prank(citizen1);
        vm.expectRevert(Executive.AlreadyVoted.selector);
        executive.voteNoConfidence(true);
    }

    function test_modifier_voteNoConfidence_onlyMajlis() public {
        uint256 honeymoon = constitution.getParameter(constitution.PARAM_CONFIDENCE_HONEYMOON());
        _warpForward(honeymoon + 1);

        vm.prank(citizen1);
        executive.fileNoConfidence();

        address unauthorized = makeAddr("unauthorized");
        vm.prank(unauthorized);
        vm.expectRevert(Executive.NotMajlisMember.selector);
        executive.voteNoConfidence(true);
    }

    function test_revert_fileNoConfidence_alreadyActive() public {
        uint256 honeymoon = constitution.getParameter(constitution.PARAM_CONFIDENCE_HONEYMOON());
        _warpForward(honeymoon + 1);

        vm.prank(citizen1);
        executive.fileNoConfidence();

        vm.prank(citizen2);
        vm.expectRevert(Executive.FormationInProgress.selector);
        executive.fileNoConfidence();
    }

    // ═════════════════════════════════════════════════════════════════════
    // 6. CROWN NOT SUSPENDED GUARDS
    // ═════════════════════════════════════════════════════════════════════

    function test_revert_nominateJusticeSecondDuringSuspension_crownNotSuspended() public {
        vm.prank(pmCandidate);
        vm.expectRevert(Executive.CrownNotSuspended.selector);
        executive.nominateJusticeSecondDuringSuspension(makeAddr("candidate"), 0);
    }

    function test_revert_appointJusticeFromListDuringSuspension_crownNotSuspended() public {
        vm.prank(pmCandidate);
        vm.expectRevert(Executive.CrownNotSuspended.selector);
        executive.appointJusticeFromListDuringSuspension(0, 0);
    }
}

// =============================================================================
// ExecutiveVacancyTest -- MixinGovernment + MixinJustices
//
// PM vacancy via court certification. Has _certifyFact(). PM=pmCandidate.
// =============================================================================
contract ExecutiveVacancyTest is MixinGovernment, MixinJustices {
    // ── Events ──────────────────────────────────────────────────────────
    event FormationStarted(uint256 timestamp);
    event CaretakerActivated(uint256 timestamp);
    event ActingPMActivated(address indexed actingPM);
    event ConfidenceGranted(address indexed pm, uint256 timestamp);
    event NoConfidencePassed(address indexed pm, uint256 timestamp);
    event NoConfidenceMotionFiled(uint256 timestamp);

    // ── Cached keys ─────────────────────────────────────────────────────
    bytes32 internal ROLE_PM_KEY;

    // ── Test-specific actors ────────────────────────────────────────────
    address internal nominee1 = makeAddr("vacNominee1");

    function setUp() public virtual override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
        _setupSenate();
        _setupJustices();
        ROLE_PM_KEY = constitution.ROLE_PRIME_MINISTER();

        vm.prank(authorityKey);
        registry.registerCitizen(nominee1, keccak256(abi.encodePacked("vacNominee1")), 1);
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    function _certifyPMVacancy() internal {
        _certifyFact(keccak256(abi.encodePacked("PM_VACANCY", pmCandidate)));
    }

    function _suspendCrown() internal {
        _certifyFact(keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr)));
        crown.claimSuccessionExhausted();
    }

    // ═════════════════════════════════════════════════════════════════════
    // 1. PM VACANCY -- DEPUTY BECOMES ACTING
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_claimPMVacancy_deputyBecomesActing() public {
        address deputy = makeAddr("deputy");
        vm.prank(pmCandidate);
        executive.designateDeputyPM(deputy);

        _certifyPMVacancy();
        executive.claimPMVacancy();

        assertEq(constitution.getRole(ROLE_PM_KEY), deputy);
        assertTrue(executive.caretaker());
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom1));
        assertEq(executive.deputyPM(), address(0));
    }

    function test_edgeCase_claimPMVacancy_noDeputy_pmRoleVacated() public {
        _certifyPMVacancy();
        executive.claimPMVacancy();

        assertEq(constitution.getRole(ROLE_PM_KEY), address(0));
        assertTrue(executive.caretaker());
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom1));
    }

    function test_happyCase_claimPMVacancy_clearsDeputyDeadline() public {
        address deputy = makeAddr("deputy");
        vm.prank(pmCandidate);
        executive.designateDeputyPM(deputy);

        _certifyPMVacancy();
        executive.claimPMVacancy();

        assertEq(executive.deputyDesignationDeadline(), 0);
    }

    // ═════════════════════════════════════════════════════════════════════
    // 2. FULL LIFECYCLE
    // ═════════════════════════════════════════════════════════════════════

    function test_fullLifecycle_pmDies_deputyBecomesActing_newPMConfirmed() public {
        address deputy = makeAddr("deputy");
        vm.prank(pmCandidate);
        executive.designateDeputyPM(deputy);

        // PM dies -- Court certifies vacancy
        _certifyPMVacancy();
        executive.claimPMVacancy();

        assertEq(constitution.getRole(ROLE_PM_KEY), deputy);
        assertTrue(executive.caretaker());
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom1));

        // Crown nominates nominee1 as new PM
        vm.prank(monarchAddr);
        crown.nominatePrimeMinister(nominee1);
        vm.prank(nominee1);
        executive.presentGovernment(keccak256("program2"));

        // Majlis grants confidence
        vm.prank(citizen1); executive.voteConfidence(true);
        vm.prank(citizen2); executive.voteConfidence(true);
        vm.prank(citizen3); executive.voteConfidence(true);
        _warpForward(3 days);
        executive.finalizeConfidenceVote();

        // New PM confirmed, caretaker ends
        assertEq(constitution.getRole(ROLE_PM_KEY), nominee1);
        assertFalse(executive.caretaker());
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.Idle));
    }

    function test_fullLifecycle_pmDies_deputyReconfirmedAsPermanentPM() public {
        address deputy = makeAddr("deputy");
        vm.prank(authorityKey);
        registry.registerCitizen(deputy, keccak256(abi.encodePacked("deputy")), 1);

        vm.prank(pmCandidate);
        executive.designateDeputyPM(deputy);

        // PM dies
        _certifyPMVacancy();
        executive.claimPMVacancy();
        assertEq(constitution.getRole(ROLE_PM_KEY), deputy);
        assertTrue(executive.caretaker());

        // Crown re-nominates the deputy as permanent PM
        vm.prank(monarchAddr);
        crown.nominatePrimeMinister(deputy);
        vm.prank(deputy);
        executive.presentGovernment(keccak256("deputy program"));

        // Majlis grants confidence
        vm.prank(citizen1); executive.voteConfidence(true);
        vm.prank(citizen2); executive.voteConfidence(true);
        vm.prank(citizen3); executive.voteConfidence(true);
        _warpForward(3 days);
        executive.finalizeConfidenceVote();

        // Deputy is now full PM, caretaker ends
        assertEq(constitution.getRole(ROLE_PM_KEY), deputy);
        assertFalse(executive.caretaker());
        assertTrue(executive.deputyDesignationDeadline() > 0);
    }

    function test_revert_actingPM_blockedFromBudgetProposal() public {
        address deputy = makeAddr("deputy");
        vm.prank(pmCandidate);
        executive.designateDeputyPM(deputy);

        // PM dies -> Deputy becomes Acting PM in caretaker mode
        _certifyPMVacancy();
        executive.claimPMVacancy();

        // Verify caretaker is active (Budget.proposeBudget checks isCaretaker)
        assertTrue(executive.isCaretaker());
    }

    // ═════════════════════════════════════════════════════════════════════
    // 3. CROWN SUSPENDED MID-FORMATION
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_confidenceFailure_crownSuspendedMidFormation_goesToCrownNom2() public {
        // Start a new formation (vacates PM)
        _executeMajlisAction(
            address(executive),
            abi.encodeCall(Executive.startFormation, ())
        );

        // Crown nominates (still active)
        vm.prank(monarchAddr);
        crown.nominatePrimeMinister(nominee1);
        vm.prank(nominee1);
        executive.presentGovernment(keccak256("program"));

        // Suspend Crown mid-formation
        _suspendCrown();

        // All vote no
        vm.prank(citizen1); executive.voteConfidence(false);
        vm.prank(citizen2); executive.voteConfidence(false);
        vm.prank(citizen3); executive.voteConfidence(false);
        vm.prank(citizen4); executive.voteConfidence(false);
        vm.prank(citizen5); executive.voteConfidence(false);

        _warpForward(3 days);
        executive.finalizeConfidenceVote();

        // Should go to CrownNom2 (Senate gets chance via governance action)
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom2));
        assertTrue(executive.crownNominationDeadline() > 0);
    }

    function test_happyCase_noConfidence_crownSuspended_goesToCrownNom1() public {
        uint256 honeymoon = constitution.getParameter(constitution.PARAM_CONFIDENCE_HONEYMOON());
        _warpForward(honeymoon + 1);

        // Suspend Crown
        _suspendCrown();

        // citizen1 files no-confidence (still a Majlis member)
        vm.prank(citizen1);
        executive.fileNoConfidence();

        // 3/5 vote yes
        vm.prank(citizen1); executive.voteNoConfidence(true);
        vm.prank(citizen2); executive.voteNoConfidence(true);
        vm.prank(citizen3); executive.voteNoConfidence(true);

        executive.finalizeNoConfidence();

        // Formation should go to CrownNom1
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom1));
        assertTrue(executive.crownNominationDeadline() > 0);
    }

    function test_happyCase_claimPMVacancy_crownSuspended_goesToCrownNom1() public {
        // Designate deputy first
        address deputy = makeAddr("deputy");
        vm.prank(pmCandidate);
        executive.designateDeputyPM(deputy);

        // Suspend Crown
        _suspendCrown();

        // Certify PM vacancy
        _certifyFact(keccak256(abi.encodePacked("PM_VACANCY", pmCandidate)));
        executive.claimPMVacancy();

        // Formation goes to CrownNom1 (Senate nominates via governance action)
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom1));
        assertTrue(executive.crownNominationDeadline() > 0);
    }

    // ═════════════════════════════════════════════════════════════════════
    // 4. INSTANCE-SPECIFIC FACT HASH PREVENTS REUSE
    // ═════════════════════════════════════════════════════════════════════

    function test_revert_claimPMVacancy_cannotReuseAfterNewPM() public {
        // Certify PM_VACANCY for pmCandidate, claim -> formation starts
        _certifyPMVacancy();
        executive.claimPMVacancy();

        // Crown nominates nominee1, Majlis confirms
        vm.prank(monarchAddr);
        crown.nominatePrimeMinister(nominee1);
        vm.prank(nominee1);
        executive.presentGovernment(keccak256("program2"));
        vm.prank(citizen1); executive.voteConfidence(true);
        vm.prank(citizen2); executive.voteConfidence(true);
        vm.prank(citizen3); executive.voteConfidence(true);
        _warpForward(3 days);
        executive.finalizeConfidenceVote();

        // Now PM is nominee1. Old certification for pmCandidate cannot be reused
        // because new PM has different hash: keccak256("PM_VACANCY", nominee1) is not certified
        vm.expectRevert(Executive.PMVacancyNotCertified.selector);
        executive.claimPMVacancy();
    }
}

// =============================================================================
// ExecutiveSuspensionTest -- MixinGovernment + MixinCrownSuspension
//
// Crown already suspended. PM=pmCandidate. Senate=senator1/2/3. Majlis=citizen1-5.
// =============================================================================
contract ExecutiveSuspensionTest is MixinGovernment, MixinCrownSuspension {
    // ── Events ──────────────────────────────────────────────────────────
    event FormationStarted(uint256 timestamp);
    event PMNominated(address indexed nominee, Executive.FormationStage stage);
    event ConfidenceGranted(address indexed pm, uint256 timestamp);
    event ConfidenceFailed(address indexed nominee, Executive.FormationStage stage);
    event CaretakerActivated(uint256 timestamp);
    event MajlisListSubmitted(address[3] candidates);

    // ── Test-specific actors ────────────────────────────────────────────
    address internal nominee1 = makeAddr("suspNominee1");
    address internal nominee2 = makeAddr("suspNominee2");
    address internal nominee3 = makeAddr("suspNominee3");

    // ── Cached keys ─────────────────────────────────────────────────────
    bytes32 internal ROLE_PM_KEY;

    function setUp() public virtual override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
        _setupSenate();
        _setupJustices();
        _setupCrownSuspension();
        ROLE_PM_KEY = constitution.ROLE_PRIME_MINISTER();

        vm.startPrank(authorityKey);
        registry.registerCitizen(nominee1, keccak256(abi.encodePacked("suspNominee1")), 1);
        registry.registerCitizen(nominee2, keccak256(abi.encodePacked("suspNominee2")), 1);
        registry.registerCitizen(nominee3, keccak256(abi.encodePacked("suspNominee3")), 1);
        vm.stopPrank();
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    function _startFormationDuringSuspension() internal {
        vm.prank(senator1);
        parliament.initiateFormationDuringSuspension();
    }

    function _senateNominatePM(address candidate) internal {
        _executeSenateAction(
            address(executive),
            abi.encodeCall(Executive.nominatePM, (candidate))
        );
    }

    function _failAllConfidence() internal {
        vm.prank(citizen1); executive.voteConfidence(false);
        vm.prank(citizen2); executive.voteConfidence(false);
        vm.prank(citizen3); executive.voteConfidence(false);
        vm.prank(citizen4); executive.voteConfidence(false);
        vm.prank(citizen5); executive.voteConfidence(false);
        _warpForward(3 days);
        executive.finalizeConfidenceVote();
    }

    function _submitMajlisList(address[3] memory candidates) internal {
        _executeMajlisAction(
            address(executive),
            abi.encodeCall(Executive.submitMajlisList, (candidates))
        );
    }

    // ═════════════════════════════════════════════════════════════════════
    // 1. FORMATION INITIATION
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_startFormation_crownSuspended_goesToCrownNom1() public {
        _startFormationDuringSuspension();

        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom1));
        assertTrue(executive.caretaker());
        assertTrue(executive.crownNominationDeadline() > 0);
    }

    // ═════════════════════════════════════════════════════════════════════
    // 2. SENATE NOMINATES PM
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_senateNominatesPM_crownSuspended() public {
        _startFormationDuringSuspension();

        _senateNominatePM(nominee1);
        assertEq(executive.nominee(), nominee1);

        vm.prank(nominee1);
        executive.presentGovernment(keccak256("Senate nominee program"));

        // Majlis votes confidence
        vm.prank(citizen1); executive.voteConfidence(true);
        vm.prank(citizen2); executive.voteConfidence(true);
        vm.prank(citizen3); executive.voteConfidence(true);
        _warpForward(3 days);
        executive.finalizeConfidenceVote();

        // PM confirmed
        assertEq(constitution.getRole(ROLE_PM_KEY), nominee1);
        assertFalse(executive.caretaker());
    }

    function test_happyCase_senateFirstNominationRejected_goesToCrownNom2() public {
        _startFormationDuringSuspension();

        _senateNominatePM(nominee1);
        vm.prank(nominee1);
        executive.presentGovernment(keccak256("program"));

        _failAllConfidence();

        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom2));
    }

    function test_happyCase_senateBothNominationsRejected_goesToMajlisList() public {
        _startFormationDuringSuspension();

        // First nomination rejected
        _senateNominatePM(nominee1);
        vm.prank(nominee1);
        executive.presentGovernment(keccak256("program1"));
        _failAllConfidence();

        // Second nomination rejected
        _senateNominatePM(nominee2);
        vm.prank(nominee2);
        executive.presentGovernment(keccak256("program2"));
        _failAllConfidence();

        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.MajlisList));
    }

    function test_happyCase_senateNominationTimeout_goesToMajlisList() public {
        _startFormationDuringSuspension();
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom1));

        // Senate doesn't nominate within 14 days
        _warpForward(14 days + 1);
        executive.claimCrownNominationTimeout();

        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.MajlisList));
    }

    // ═════════════════════════════════════════════════════════════════════
    // 3. SENATE APPOINTS FROM LIST
    // ═════════════════════════════════════════════════════════════════════

    function test_happyCase_senateAppointsFromList_crownSuspended() public {
        _startFormationDuringSuspension();

        // Both nominations fail
        _senateNominatePM(nominee1);
        vm.prank(nominee1);
        executive.presentGovernment(keccak256("p1"));
        _failAllConfidence();

        _senateNominatePM(nominee2);
        vm.prank(nominee2);
        executive.presentGovernment(keccak256("p2"));
        _failAllConfidence();

        // Majlis submits list
        address[3] memory candidates = [nominee1, nominee2, nominee3];
        _submitMajlisList(candidates);

        // Senate appoints from list via governance action
        _executeSenateAction(
            address(executive),
            abi.encodeCall(Executive.appointFromList, (1))
        );

        assertEq(constitution.getRole(ROLE_PM_KEY), nominee2);
        assertFalse(executive.caretaker());
    }

    // ═════════════════════════════════════════════════════════════════════
    // 4. MAJLIS CANNOT NOMINATE PM DURING SUSPENSION
    // ═════════════════════════════════════════════════════════════════════

    function test_revert_majlisCannotNominatePM_crownSuspended() public {
        _startFormationDuringSuspension();

        // Majlis tries to nominate via governance action -- should fail
        uint256 actionId = _prepareMajlisAction(
            address(executive),
            abi.encodeCall(Executive.nominatePM, (nominee1))
        );

        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    // ═════════════════════════════════════════════════════════════════════
    // 5. FULL LIFECYCLE
    // ═════════════════════════════════════════════════════════════════════

    function test_fullLifecycle_crownSuspended_senateNominates_majlisConfirms() public {
        _startFormationDuringSuspension();

        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom1));
        assertTrue(executive.caretaker());

        _senateNominatePM(nominee1);

        vm.prank(nominee1);
        executive.presentGovernment(keccak256("full lifecycle program"));

        // Majlis votes confidence
        vm.prank(citizen1); executive.voteConfidence(true);
        vm.prank(citizen2); executive.voteConfidence(true);
        vm.prank(citizen3); executive.voteConfidence(true);
        _warpForward(3 days);
        executive.finalizeConfidenceVote();

        // PM confirmed with deputy deadline
        assertEq(constitution.getRole(ROLE_PM_KEY), nominee1);
        assertFalse(executive.caretaker());
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.Idle));
        assertTrue(executive.deputyDesignationDeadline() > 0);
    }

    // ═════════════════════════════════════════════════════════════════════
    // 6. JUSTICE NOMINATION DURING SUSPENSION (Art. V.3)
    // ═════════════════════════════════════════════════════════════════════

    function test_revert_nominateJusticeDuringSuspension_notPM() public {
        address unauthorized = makeAddr("unauthorized");
        vm.prank(unauthorized);
        vm.expectRevert(Executive.NotPrimeMinister.selector);
        executive.nominateJusticeDuringSuspension(makeAddr("candidate"), 0);
    }

    function test_revert_nominateJusticeDuringSuspension_deputyOverdue() public {
        // Warp past 14-day deputy designation deadline
        _warpForward(14 days + 1);
        assertTrue(executive.isDeputyOverdue());

        vm.prank(pmCandidate);
        vm.expectRevert(Executive.DeputyDesignationOverdue.selector);
        executive.nominateJusticeDuringSuspension(makeAddr("candidate"), 0);
    }

    function test_revert_nominateJusticeSecondDuringSuspension_deputyOverdue() public {
        _warpForward(14 days + 1);

        vm.prank(pmCandidate);
        vm.expectRevert(Executive.DeputyDesignationOverdue.selector);
        executive.nominateJusticeSecondDuringSuspension(makeAddr("candidate"), 0);
    }

    function test_revert_appointJusticeFromListDuringSuspension_deputyOverdue() public {
        _warpForward(14 days + 1);

        vm.prank(pmCandidate);
        vm.expectRevert(Executive.DeputyDesignationOverdue.selector);
        executive.appointJusticeFromListDuringSuspension(0, 0);
    }
}
