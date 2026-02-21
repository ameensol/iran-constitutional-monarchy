// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./helpers/MixinMajlis.sol";
import "./helpers/MixinJustices.sol";
import "./helpers/MixinGovernment.sol";
import "./helpers/MixinCrownSuspension.sol";

/// @title EdgeCaseReferendumTest
/// @notice Cross-contract edge cases involving referendums.
///
/// Scenarios:
///   1. Two simultaneous referendums on same parameter — both pass, last-enacted wins
///   2. Referendum enacted on parameter with active emergency — supersedes emergency
contract EdgeCaseReferendumTest is MixinMajlis {
    bytes32 internal PARAM_CONFIDENCE_HONEYMOON;

    function setUp() public override {
        super.setUp();
        _setupMajlis();
        PARAM_CONFIDENCE_HONEYMOON = constitution.PARAM_CONFIDENCE_HONEYMOON();
    }

    /// @notice Two simultaneous referendums on the same parameter, both pass.
    ///         Last enactment overwrites the first. Both have status=Enacted.
    function test_edgeCase_twoReferendums_sameParameter_lastWins() public {
        uint256 originalValue = constitution.getParameter(PARAM_CONFIDENCE_HONEYMOON);

        // Propose two amendments on PARAM_CONFIDENCE_HONEYMOON
        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.proposeAmendment, (
                keccak256("Honeymoon to 120d"), PARAM_CONFIDENCE_HONEYMOON, 120 days
            ))
        );
        uint256 idA = referendum.amendmentCount() - 1;

        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.proposeAmendment, (
                keccak256("Honeymoon to 180d"), PARAM_CONFIDENCE_HONEYMOON, 180 days
            ))
        );
        uint256 idB = referendum.amendmentCount() - 1;

        // Start both referendums
        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.startReferendum, (idA, 7 days))
        );
        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.startReferendum, (idB, 7 days))
        );

        // All citizens vote yes on both
        _castReferendumVote(citizen1, idA, true);
        _castReferendumVote(citizen2, idA, true);
        _castReferendumVote(citizen3, idA, true);
        _castReferendumVote(citizen1, idB, true);
        _castReferendumVote(citizen2, idB, true);
        _castReferendumVote(citizen3, idB, true);

        // Finalize both
        _warpForward(7 days);
        referendum.finalizeReferendum(idA);
        referendum.finalizeReferendum(idB);

        // Enact A first → parameter = 120 days
        referendum.enactAmendment(idA);
        assertEq(constitution.getParameter(PARAM_CONFIDENCE_HONEYMOON), 120 days);

        // Enact B second → parameter = 180 days (overwrites)
        referendum.enactAmendment(idB);
        assertEq(constitution.getParameter(PARAM_CONFIDENCE_HONEYMOON), 180 days);

        // Both have status Enacted
        assertEq(uint256(referendum.getAmendmentStatus(idA)), uint256(Referendum.AmendmentStatus.Enacted));
        assertEq(uint256(referendum.getAmendmentStatus(idB)), uint256(Referendum.AmendmentStatus.Enacted));

        // Final value is B's value
        assertTrue(constitution.getParameter(PARAM_CONFIDENCE_HONEYMOON) != originalValue);
    }

    /// @notice Enact amendment B before A — order of enactment determines final value.
    function test_edgeCase_twoReferendums_enactOrderMatters() public {
        // Propose two amendments
        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.proposeAmendment, (
                keccak256("Honeymoon to 120d"), PARAM_CONFIDENCE_HONEYMOON, 120 days
            ))
        );
        uint256 idA = referendum.amendmentCount() - 1;

        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.proposeAmendment, (
                keccak256("Honeymoon to 180d"), PARAM_CONFIDENCE_HONEYMOON, 180 days
            ))
        );
        uint256 idB = referendum.amendmentCount() - 1;

        // Both pass
        _executeMajlisAction(address(referendum), abi.encodeCall(Referendum.startReferendum, (idA, 7 days)));
        _executeMajlisAction(address(referendum), abi.encodeCall(Referendum.startReferendum, (idB, 7 days)));
        _castReferendumVote(citizen1, idA, true);
        _castReferendumVote(citizen2, idA, true);
        _castReferendumVote(citizen3, idA, true);
        _castReferendumVote(citizen1, idB, true);
        _castReferendumVote(citizen2, idB, true);
        _castReferendumVote(citizen3, idB, true);
        _warpForward(7 days);
        referendum.finalizeReferendum(idA);
        referendum.finalizeReferendum(idB);

        // Enact B first, then A — A's value is final
        referendum.enactAmendment(idB);
        assertEq(constitution.getParameter(PARAM_CONFIDENCE_HONEYMOON), 180 days);

        referendum.enactAmendment(idA);
        assertEq(constitution.getParameter(PARAM_CONFIDENCE_HONEYMOON), 120 days);
    }
}

/// @title EdgeCaseBillTest
/// @notice Cross-contract edge cases involving bills and member changes.
///
/// Scenarios:
///   1. Majlis member removed during MajlisVoting — quorum adjusts, vote counts unchanged
///   2. Majlis dissolved while bill in MajlisVoting — finalize still works
///   3. Bill in CrownAction when Crown suspended — PM can return but cannot enact
contract EdgeCaseBillTest is MixinGovernment, MixinCrownSuspension {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupSenate();
        _setupGovernment();
        _setupJustices();
    }

    /// @dev Submit a bill and have 3 Majlis members vote yes, 2 no.
    function _submitAndVoteBill() internal returns (uint256 billId) {
        vm.prank(citizen1);
        billId = parliament.submitBill(keccak256("Test Bill"), "Test legislation");

        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        vm.prank(citizen4); parliament.voteMajlis(billId, false);
        vm.prank(citizen5); parliament.voteMajlis(billId, false);
    }

    /// @dev Pass bill through both chambers to CrownAction status.
    function _passBillToCrownAction() internal returns (uint256 billId) {
        billId = _submitAndVoteBill();

        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);

        // Senate votes
        vm.prank(senator1); parliament.voteSenate(billId, true);
        vm.prank(senator2); parliament.voteSenate(billId, true);
        vm.prank(senator3); parliament.voteSenate(billId, true);
        _warpForward(3 days);
        parliament.finalizeSenateVote(billId);

        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.CrownAction));
    }

    /// @notice Member removed during MajlisVoting — vote counts unchanged,
    ///         but effective member count drops, making quorum easier to meet.
    function test_edgeCase_memberRemoved_duringMajlisVoting() public {
        // Submit bill, 3 yes, 2 no
        uint256 billId = _submitAndVoteBill();

        // Remove citizen5 via Supreme Court (who voted no)
        vm.prank(address(court));
        parliament.removeMember(citizen5, Parliament.Chamber.Majlis);

        // Effective member count drops from 5 to 4
        assertEq(parliament.effectiveMajlisMemberCount(), 4);

        // Finalize — quorum and threshold calculated against 4, not 5
        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);

        // Bill passes (3 yes > 50% of 4 effective = 2)
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.SenateReview));
    }

    /// @notice Majlis dissolved while bill is in MajlisVoting.
    ///         finalizeMajlisVote still works after dissolution (votes already cast).
    function test_edgeCase_majlisDissolved_billInMajlisVoting() public {
        // Submit bill and have members vote
        uint256 billId = _submitAndVoteBill();

        // Dissolve Majlis via Executive
        vm.prank(address(executive));
        parliament.dissolveMajlis();
        assertTrue(parliament.dissolved());

        // finalizeMajlisVote does NOT check dissolution — it uses existing vote tallies
        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);

        // Bill passes based on votes cast before dissolution
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.SenateReview));
    }

    /// @notice Bill in CrownAction when Crown is suspended.
    ///         PM can enact the bill via suspension fallback (Art. VI.5).
    function test_edgeCase_crownSuspended_pmEnactsLawDuringSuspension() public {
        uint256 billId = _passBillToCrownAction();

        // Suspend the Crown (succession exhausted)
        _setupCrownSuspension();
        assertTrue(crown.suspended());

        // PM enacts the bill via suspension fallback
        vm.prank(pmCandidate);
        parliament.enactLawDuringSuspension(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Enacted));
    }

    /// @notice enactLawDuringSuspension reverts if caller is not the PM.
    function test_edgeCase_enactLawDuringSuspension_revert_notPM() public {
        uint256 billId = _passBillToCrownAction();

        _setupCrownSuspension();
        assertTrue(crown.suspended());

        vm.prank(citizen1);
        vm.expectRevert(Parliament.NotPrimeMinister.selector);
        parliament.enactLawDuringSuspension(billId);
    }

    /// @notice enactLawDuringSuspension reverts if Crown is not suspended.
    function test_edgeCase_enactLawDuringSuspension_revert_crownNotSuspended() public {
        uint256 billId = _passBillToCrownAction();

        // Crown is NOT suspended
        assertFalse(crown.suspended());

        vm.prank(pmCandidate);
        vm.expectRevert(Parliament.CrownNotSuspended.selector);
        parliament.enactLawDuringSuspension(billId);
    }

    /// @notice Bill in CrownAction when Crown is suspended.
    ///         PM can refer the bill to Supreme Court via suspension fallback.
    function test_edgeCase_crownSuspended_pmRefersToCourtDuringSuspension() public {
        uint256 billId = _passBillToCrownAction();

        // Crown needs to return first, then Majlis re-adopts
        vm.prank(monarchAddr);
        crown.returnLaw(billId);

        // Majlis re-adopts
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);

        // Now bill is back in CrownAction. Suspend Crown.
        _setupCrownSuspension();
        assertTrue(crown.suspended());

        // PM refers to Court via suspension fallback
        vm.prank(pmCandidate);
        parliament.referToCourtDuringSuspension(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Referred));
    }

    /// @notice Crown auto-enacts bill via timeout when Crown fails to act within 14 days.
    function test_edgeCase_crownTimeout_autoEnacts() public {
        uint256 billId = _passBillToCrownAction();

        // Wait past Crown action deadline (14 days)
        uint256 crownDeadline = constitution.getParameter(constitution.PARAM_CROWN_LAW_DEADLINE());
        _warpForward(crownDeadline + 1);

        // Anyone can claim Crown timeout → auto-enact
        parliament.claimCrownTimeout(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Enacted));
    }

    /// @notice Senate fails to act on bill within 30 days → auto-approved.
    function test_edgeCase_senateTimeout_autoApproved() public {
        // Submit bill, pass Majlis
        uint256 billId = _submitAndVoteBill();
        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);

        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.SenateReview));

        // Wait past Senate review deadline (30 days)
        uint256 senateDeadline = constitution.getParameter(constitution.PARAM_SENATE_REVIEW_PERIOD());
        _warpForward(senateDeadline + 1);

        // Anyone claims Senate timeout → auto-approved, moves to CrownAction
        parliament.claimSenateTimeout(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.CrownAction));
    }
}

/// @title EdgeCaseNoConfidenceTest
/// @notice Edge cases involving no-confidence votes and honeymoon period.
contract EdgeCaseNoConfidenceTest is MixinGovernment {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
    }

    /// @notice No-confidence filed during honeymoon period — requires 2/3 majority.
    ///         3 out of 5 is not enough (60% < 66.7%).
    function test_edgeCase_noConfidence_duringHoneymoon_failsWithSimpleMajority() public {
        // PM has just received confidence — within honeymoon (90 days)

        // File no-confidence
        vm.prank(citizen1);
        executive.fileNoConfidence();

        // 3 of 5 vote yes (60% — not enough for 2/3)
        vm.prank(citizen1); executive.voteNoConfidence(true);
        vm.prank(citizen2); executive.voteNoConfidence(true);
        vm.prank(citizen3); executive.voteNoConfidence(true);
        vm.prank(citizen4); executive.voteNoConfidence(false);
        vm.prank(citizen5); executive.voteNoConfidence(false);

        // Finalize — during honeymoon, 2/3 required, 60% is not enough
        executive.finalizeNoConfidence();

        // Motion fails — PM stays
        assertEq(constitution.getRole(constitution.ROLE_PRIME_MINISTER()), pmCandidate);
        assertFalse(executive.caretaker());
    }

    /// @notice No-confidence filed during honeymoon with 4 out of 5 (80% > 66.7%) — passes.
    function test_edgeCase_noConfidence_duringHoneymoon_passesWithSupermajority() public {
        // File no-confidence
        vm.prank(citizen1);
        executive.fileNoConfidence();

        // 4 of 5 vote yes (80% > 66.7%)
        vm.prank(citizen1); executive.voteNoConfidence(true);
        vm.prank(citizen2); executive.voteNoConfidence(true);
        vm.prank(citizen3); executive.voteNoConfidence(true);
        vm.prank(citizen4); executive.voteNoConfidence(true);
        vm.prank(citizen5); executive.voteNoConfidence(false);

        executive.finalizeNoConfidence();

        // Motion passes — PM removed
        assertEq(constitution.getRole(constitution.ROLE_PRIME_MINISTER()), address(0));
        assertTrue(executive.caretaker());
    }

    /// @notice No-confidence filed after honeymoon — simple majority (3/5) suffices.
    function test_edgeCase_noConfidence_afterHoneymoon_passesWithSimpleMajority() public {
        // Warp past honeymoon (90 days)
        uint256 honeymoon = constitution.getParameter(constitution.PARAM_CONFIDENCE_HONEYMOON());
        _warpForward(honeymoon + 1);

        // File no-confidence
        vm.prank(citizen1);
        executive.fileNoConfidence();

        // 3 of 5 vote yes (60% > 50%)
        vm.prank(citizen1); executive.voteNoConfidence(true);
        vm.prank(citizen2); executive.voteNoConfidence(true);
        vm.prank(citizen3); executive.voteNoConfidence(true);
        vm.prank(citizen4); executive.voteNoConfidence(false);
        vm.prank(citizen5); executive.voteNoConfidence(false);

        executive.finalizeNoConfidence();

        // Motion passes — PM removed
        assertEq(constitution.getRole(constitution.ROLE_PRIME_MINISTER()), address(0));
        assertTrue(executive.caretaker());
    }
}

/// @title EdgeCaseSenateGovernanceTest
/// @notice Edge cases involving Senate governance actions and member changes.
contract EdgeCaseSenateGovernanceTest is MixinGovernment, MixinJustices {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupSenate();
        _setupGovernment();
    }

    /// @notice Senate member dies during governance action vote.
    ///         Vote counts persist, finalization uses effective count.
    function test_edgeCase_senatorDies_duringGovernanceVote() public {
        // Propose a governance action (need only 2 senators to vote)
        vm.prank(senator1);
        uint256 actionId = parliament.proposeGovernanceAction(
            address(executive),
            abi.encodeCall(Executive.startFormation, ()),
            Parliament.Chamber.Senate,
            50,
            keccak256("start formation")
        );

        // Two senators vote yes
        vm.prank(senator1);
        parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(senator2);
        parliament.voteOnGovernanceAction(actionId, true);

        // Senator3 removed before voting (Court removes)
        vm.prank(address(court));
        parliament.removeMember(senator3, Parliament.Chamber.Senate);

        // Effective count drops to 2, 2 yes votes is 100% > 50% threshold
        assertEq(parliament.effectiveSenateMemberCount(), 2);

        _warpForward(3 days);
        parliament.finalizeGovernanceAction(actionId);

        // Action passes
        parliament.executeGovernanceAction(actionId);
    }

    /// @notice Majlis member incapacitated, then acknowledged.
    ///         Their votes persist but effective count drops.
    function test_edgeCase_memberIncapacitated_effectiveCountDrops() public {
        _setupJustices();

        // Submit a bill
        vm.prank(citizen1);
        uint256 billId = parliament.submitBill(keccak256("Test"), "Test bill");

        // 3 yes, 2 no
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        vm.prank(citizen4); parliament.voteMajlis(billId, false);
        vm.prank(citizen5); parliament.voteMajlis(billId, false);

        // Court certifies citizen4 incapacity
        bytes32 incapHash = keccak256(abi.encodePacked("MEMBER_INCAPACITATED", citizen4));
        _certifyFact(incapHash);

        // Acknowledge incapacity — citizen4 excluded from effective count
        parliament.acknowledgeIncapacity(citizen4, Parliament.Chamber.Majlis);
        assertEq(parliament.effectiveMajlisMemberCount(), 4);

        // Finalize — 3 yes, 2 no but effective count is 4
        // 3/4 = 75% > 50% → passes
        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.SenateReview));
    }
}

/// @title EdgeCaseFormationTest
/// @notice Edge cases involving executive formation interruptions.
contract EdgeCaseFormationTest is MixinGovernment, MixinCrownSuspension {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupSenate();
        _setupGovernment();
        _setupJustices();
    }

    /// @notice Crown suspended — Senate initiates formation (Art. VI.5.2).
    ///         Crown can't nominate, so senators trigger formation directly.
    function test_edgeCase_crownSuspended_senateInitiatesFormation() public {
        // Suspend the Crown (monarch vacancy, succession exhausted)
        _setupCrownSuspension();
        assertTrue(crown.suspended());

        // Stage is Idle (government was formed, PM has confidence)
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.Idle));

        // Senator initiates formation during suspension (Art. VI.5.2)
        vm.prank(senator1);
        parliament.initiateFormationDuringSuspension();

        // Formation is now in progress — stage moves to CrownNom1
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom1));
        // PM role vacated by startFormation()
        assertEq(constitution.getRole(constitution.ROLE_PRIME_MINISTER()), address(0));
        assertTrue(executive.caretaker());
    }

    /// @notice Crown nomination timeout — both chances forfeited, proceeds to MajlisList.
    function test_edgeCase_crownNominationTimeout_skipsToMajlisList() public {
        // Trigger no-confidence to enter formation
        uint256 honeymoon = constitution.getParameter(constitution.PARAM_CONFIDENCE_HONEYMOON());
        _warpForward(honeymoon + 1);

        vm.prank(citizen1);
        executive.fileNoConfidence();

        vm.prank(citizen1); executive.voteNoConfidence(true);
        vm.prank(citizen2); executive.voteNoConfidence(true);
        vm.prank(citizen3); executive.voteNoConfidence(true);
        executive.finalizeNoConfidence();

        // Formation starts at CrownNom1
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom1));

        // Crown fails to nominate — wait past nomination deadline
        uint256 nomDeadline = constitution.getParameter(constitution.PARAM_NOMINATION_DEADLINE());
        _warpForward(nomDeadline + 1);

        // Anyone claims timeout → skips to MajlisList
        executive.claimCrownNominationTimeout();
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.MajlisList));
    }

    /// @notice Deputy PM designation — PM fails to designate within deadline,
    ///         legislative actions blocked.
    function test_edgeCase_deputyOverdue_blocksLegislation() public {
        // PM has just received confidence — deputy designation deadline starts
        // Wait past deputy designation deadline (14 days)
        uint256 deputyDeadline = constitution.getParameter(constitution.PARAM_DEPUTY_DESIGNATION_DEADLINE());
        _warpForward(deputyDeadline + 1);

        // PM is now overdue on deputy designation
        assertTrue(executive.isDeputyOverdue());

        // Budget proposal should be blocked
        vm.prank(address(executive));
        vm.expectRevert(Budget.DeputyDesignationOverdue.selector);
        budgetContract.proposeBudget(keccak256("FY2025"), 2025, 10_000_000 ether);
    }
}

/// @title EdgeCaseEmergencyAmendmentTest
/// @notice Edge cases involving emergency amendments.
contract EdgeCaseEmergencyAmendmentTest is MixinGovernment, MixinCrownSuspension {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupSenate();
        _setupGovernment();
        _setupJustices();
    }

    /// @notice Emergency amendment confirmed, then expire attempted — should revert.
    function test_edgeCase_emergencyConfirmed_cannotExpire() public {
        bytes32 paramKey = constitution.PARAM_CONFIDENCE_HONEYMOON();
        uint256 originalValue = constitution.getParameter(paramKey);

        // Court certifies emergency
        bytes32 emergHash = keccak256(abi.encodePacked("EMERGENCY_AMENDMENT", keccak256("crisis")));
        _certifyFact(emergHash);

        // Parliament enacts emergency amendment via governance action
        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.enactEmergencyAmendment, (keccak256("crisis"), paramKey, 180 days))
        );
        uint256 amendId = referendum.amendmentCount() - 1;
        assertEq(constitution.getParameter(paramKey), 180 days);

        // Parliament confirms (makes permanent)
        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.confirmEmergencyAmendment, (amendId))
        );
        assertEq(uint256(referendum.getAmendmentStatus(amendId)), uint256(Referendum.AmendmentStatus.Confirmed));

        // Wait past emergency duration
        uint256 emergDuration = constitution.getParameter(constitution.PARAM_EMERGENCY_AMEND_DURATION());
        _warpForward(emergDuration + 1);

        // Expire should revert — amendment is Confirmed, not Enacted
        vm.expectRevert();
        referendum.expireEmergencyAmendment(amendId);

        // Parameter stays at new value
        assertEq(constitution.getParameter(paramKey), 180 days);
    }

    /// @notice Emergency amendment on protected parameter — should revert.
    function test_edgeCase_emergencyAmendment_protectedParameter_reverts() public {
        // Court certifies emergency
        bytes32 emergHash = keccak256(abi.encodePacked("EMERGENCY_AMENDMENT", keccak256("protected-crisis")));
        _certifyFact(emergHash);

        // Try to change a protected parameter (PARAM_JUSTICE_TERM)
        bytes32 protectedKey = constitution.PARAM_JUSTICE_TERM();

        uint256 actionId = _prepareMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.enactEmergencyAmendment, (keccak256("protected-crisis"), protectedKey, 5 * 365 days))
        );

        // Should revert with ProtectedParameter
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    /// @notice Liveness challenge → single justice votes → challenge cleared.
    function test_edgeCase_livenessChallenge_clearedByJusticeAction() public {
        // PM challenges court liveness
        vm.prank(pmCandidate);
        court.challengeCourtLiveness();

        // A single justice votes on a fact → clears liveness challenge
        bytes32 dummyFact = keccak256("LIVENESS_TEST");
        vm.prank(justices[0]);
        court.voteOnFact(dummyFact, true);

        // Liveness deadline should be cleared
        // Emergency vacate should fail even after waiting past the original deadline
        uint256 livenessPeriod = constitution.getParameter(constitution.PARAM_COURT_LIVENESS_PERIOD());
        _warpForward(livenessPeriod + 1);

        vm.expectRevert(SupremeCourt.NeitherLivenessConditionMet.selector);
        court.emergencyVacateSeat(0);

        // All justices still active
        assertEq(court.activeJusticeCount(), 7);
    }
}
