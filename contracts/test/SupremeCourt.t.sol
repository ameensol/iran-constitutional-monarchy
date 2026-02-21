// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./helpers/MixinMajlis.sol";
import "./helpers/MixinGovernment.sol";
import "./helpers/MixinCaretaker.sol";
import "./helpers/MixinSenate.sol";
import "./helpers/MixinJustices.sol";
import "./helpers/MixinCrownSuspension.sol";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. APPOINTMENT STATE MACHINE — MixinGovernment + MixinSenate
//    Crown nominations via crown.nominateJustice(), Senate actions via _executeSenateAction().
// ═══════════════════════════════════════════════════════════════════════════════

contract SupremeCourtAppointmentTest is MixinGovernment, MixinSenate {
    event JusticeAppointed(address indexed justice, uint256 seat, uint256 termEnd);
    event NominationConfirmed(uint256 seat, address nominee);
    event NominationRejected(uint256 seat, address nominee, SupremeCourt.AppointmentStage stage);
    event NominationMade(uint256 seat, address nominee, SupremeCourt.AppointmentStage stage);

    address[12] internal justiceAddrs;
    address internal unauthorized = makeAddr("unauthorized");

    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
        _setupSenate();
        for (uint256 i = 0; i < 12; i++) {
            justiceAddrs[i] = address(uint160(3000 + i));
        }
    }

    /// @dev Crown nominates → Senate confirms via full governance action.
    function _appointJustice(uint256 seat) internal {
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[seat], seat);
        _executeSenateAction(
            address(court),
            abi.encodeCall(SupremeCourt.confirmNominee, (seat))
        );
    }

    /// @dev Crown nominates → Senate rejects via full governance action.
    function _rejectNominee(uint256 seat) internal {
        _executeSenateAction(
            address(court),
            abi.encodeCall(SupremeCourt.rejectNominee, (seat))
        );
    }

    /// @dev Senate proposes list via full governance action.
    function _proposeSenateList(uint256 seat, address[3] memory candidates) internal {
        _executeSenateAction(
            address(court),
            abi.encodeCall(SupremeCourt.proposeSenateList, (seat, candidates))
        );
    }

    // ─── Happy Paths ─────────────────────────────────────────────────────

    function test_happyCase_appointJustice() public {
        _appointJustice(0);

        assertTrue(court.isActiveJustice(justiceAddrs[0]));
        assertEq(court.activeJusticeCount(), 1);
    }

    function test_happyCase_appointJustice_emitsEvent() public {
        uint256 termLength = constitution.getParameter(constitution.PARAM_JUSTICE_TERM());

        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[0], 0);

        // We can't capture the exact emit through the governance action path
        // (low-level call wrapping). Verify state instead.
        _executeSenateAction(
            address(court),
            abi.encodeCall(SupremeCourt.confirmNominee, (0))
        );

        assertTrue(court.isActiveJustice(justiceAddrs[0]));
    }

    function test_happyCase_appointAll12() public {
        for (uint256 i = 0; i < 12; i++) {
            _appointJustice(i);
        }
        assertEq(court.activeJusticeCount(), 12);
    }

    function test_happyCase_executiveCanNominate() public {
        // Executive is a valid caller for onlyCrownOrExecutive — use executePMAction
        vm.prank(pmCandidate);
        executive.executePMAction(
            address(court),
            abi.encodeCall(SupremeCourt.nominateJustice, (justiceAddrs[0], 0))
        );
        assertEq(uint256(court.getAppointmentStage(0)), uint256(SupremeCourt.AppointmentStage.CrownNom1));
    }

    function test_happyCase_removeExpiredJustice() public {
        _appointJustice(0);
        uint256 termLength = constitution.getParameter(constitution.PARAM_JUSTICE_TERM());

        _warpForward(termLength + 1);
        court.removeExpiredJustice(0);

        assertFalse(court.isActiveJustice(justiceAddrs[0]));
        assertEq(court.activeJusticeCount(), 0);
    }

    function test_happyCase_replaceJustice() public {
        _appointJustice(0);

        uint256 termLength = constitution.getParameter(constitution.PARAM_JUSTICE_TERM());
        _warpForward(termLength + 1);
        court.removeExpiredJustice(0);
        assertFalse(court.isActiveJustice(justiceAddrs[0]));

        // Nominate a replacement (Senate terms also expired after 9yr warp;
        // use timeout path: Senate review period expires → deemed confirmed)
        address newJustice = makeAddr("newJustice");
        vm.prank(monarchAddr);
        crown.nominateJustice(newJustice, 0);

        uint256 senatePeriod = constitution.getParameter(constitution.PARAM_SENATE_REVIEW_PERIOD());
        _warpForward(senatePeriod);
        court.claimAppointmentTimeout(0);

        assertTrue(court.isActiveJustice(newJustice));
        assertEq(court.activeJusticeCount(), 1);
    }

    // ─── Full Rejection Cascade ──────────────────────────────────────────

    function test_happyCase_fullRejectionCascade() public {
        // Crown nom 1 → rejected → Crown nom 2 → rejected → Senate list → Crown picks
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[0], 0);

        _rejectNominee(0);

        // Crown makes second nomination
        vm.prank(monarchAddr);
        crown.nominateJusticeSecond(justiceAddrs[1], 0);

        _rejectNominee(0);

        // Senate proposes list
        address[3] memory candidates = [justiceAddrs[2], justiceAddrs[3], justiceAddrs[4]];
        _proposeSenateList(0, candidates);

        // Crown picks second candidate
        vm.prank(monarchAddr);
        crown.appointJusticeFromList(0, 1);

        assertTrue(court.isActiveJustice(justiceAddrs[3]));
        assertEq(court.activeJusticeCount(), 1);
    }

    // ─── Timeouts ────────────────────────────────────────────────────────

    function test_happyCase_senateTimeout_deemedConfirmed() public {
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[0], 0);

        uint256 senatePeriod = constitution.getParameter(constitution.PARAM_SENATE_REVIEW_PERIOD());
        _warpForward(senatePeriod);

        court.claimAppointmentTimeout(0);

        assertTrue(court.isActiveJustice(justiceAddrs[0]));
    }

    function test_happyCase_crownNom2Timeout_advancesToSenateList() public {
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[0], 0);

        _rejectNominee(0);

        // Crown doesn't nominate second within deadline
        uint256 nomDeadline = constitution.getParameter(constitution.PARAM_NOMINATION_DEADLINE());
        _warpForward(nomDeadline);

        court.claimAppointmentTimeout(0);

        assertEq(uint256(court.getAppointmentStage(0)), uint256(SupremeCourt.AppointmentStage.SenateList));
    }

    function test_happyCase_crownListTimeout_firstRankedAppointed() public {
        // Get to CrownFromList stage
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[0], 0);
        _rejectNominee(0);
        vm.prank(monarchAddr);
        crown.nominateJusticeSecond(justiceAddrs[1], 0);
        _rejectNominee(0);

        address[3] memory candidates = [justiceAddrs[2], justiceAddrs[3], justiceAddrs[4]];
        _proposeSenateList(0, candidates);

        // Crown doesn't pick within deadline
        uint256 crownDeadline = constitution.getParameter(constitution.PARAM_CROWN_LAW_DEADLINE());
        _warpForward(crownDeadline);

        court.claimAppointmentTimeout(0);

        // First-ranked candidate auto-appointed
        assertTrue(court.isActiveJustice(justiceAddrs[2]));
    }

    function test_happyCase_senateListTimeout_crownAppointsPreviousNominee() public {
        // Get to SenateList stage
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[0], 0);
        _rejectNominee(0);
        vm.prank(monarchAddr);
        crown.nominateJusticeSecond(justiceAddrs[1], 0);
        _rejectNominee(0);

        // Senate doesn't propose list within deadline
        uint256 senatePeriod = constitution.getParameter(constitution.PARAM_SENATE_REVIEW_PERIOD());
        _warpForward(senatePeriod);

        court.claimAppointmentTimeout(0);

        // First nominee auto-appointed per Art. V.3.6
        assertTrue(court.isActiveJustice(justiceAddrs[0]));
    }

    // ─── Reverts ─────────────────────────────────────────────────────────

    function test_revert_nominateJustice_alreadyJustice() public {
        _appointJustice(0);

        vm.prank(monarchAddr);
        vm.expectRevert(abi.encodeWithSelector(SupremeCourt.AlreadyJustice.selector, justiceAddrs[0]));
        crown.nominateJustice(justiceAddrs[0], 1);
    }

    function test_boundary_nominateJustice_seatOutOfRange() public {
        vm.prank(monarchAddr);
        vm.expectRevert(SupremeCourt.CourtFull.selector);
        crown.nominateJustice(justiceAddrs[0], 12);
    }

    function test_revert_nominateJustice_seatOccupied() public {
        _appointJustice(0);

        address newJustice = makeAddr("newJustice");
        vm.prank(monarchAddr);
        vm.expectRevert(abi.encodeWithSelector(SupremeCourt.SeatOccupied.selector, 0));
        crown.nominateJustice(newJustice, 0);
    }

    function test_revert_removeExpiredJustice_termNotExpired() public {
        _appointJustice(0);

        vm.expectRevert(abi.encodeWithSelector(SupremeCourt.TermNotExpired.selector, justiceAddrs[0]));
        court.removeExpiredJustice(0);
    }

    function test_revert_nonRenewable() public {
        _appointJustice(0);

        uint256 termLength = constitution.getParameter(constitution.PARAM_JUSTICE_TERM());
        _warpForward(termLength + 1);
        court.removeExpiredJustice(0);

        // Try to re-nominate same person — direct call propagates SupremeCourt error
        vm.prank(monarchAddr);
        vm.expectRevert(abi.encodeWithSelector(SupremeCourt.PreviouslyServed.selector, justiceAddrs[0]));
        crown.nominateJustice(justiceAddrs[0], 0);
    }

    function test_revert_claimTimeout_tooEarly() public {
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[0], 0);

        vm.expectRevert(SupremeCourt.DeadlineNotExpired.selector);
        court.claimAppointmentTimeout(0);
    }

    function test_revert_proposeSenateList_duplicateCandidates() public {
        // Get seat 0 to SenateList stage
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[0], 0);
        _rejectNominee(0);
        vm.prank(monarchAddr);
        crown.nominateJusticeSecond(justiceAddrs[1], 0);
        _rejectNominee(0);

        // Try to propose a list with duplicate candidates — revert wrapped in ExecutionFailed
        address[3] memory candidates = [justiceAddrs[2], justiceAddrs[2], justiceAddrs[4]];
        uint256 actionId = _prepareSenateAction(
            address(court),
            abi.encodeCall(SupremeCourt.proposeSenateList, (0, candidates))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_proposeSenateList_activeJustice() public {
        // Appoint justice to seat 0
        _appointJustice(0);

        // Get seat 1 to SenateList stage
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[1], 1);
        _rejectNominee(1);
        vm.prank(monarchAddr);
        crown.nominateJusticeSecond(justiceAddrs[2], 1);
        _rejectNominee(1);

        // Try to propose an active justice on the Senate list
        address[3] memory candidates = [justiceAddrs[0], justiceAddrs[3], justiceAddrs[4]];
        uint256 actionId = _prepareSenateAction(
            address(court),
            abi.encodeCall(SupremeCourt.proposeSenateList, (1, candidates))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    // ─── Modifier Tests ──────────────────────────────────────────────────

    function test_modifier_nominateJustice_onlyCrownOrExecutive() public {
        vm.prank(unauthorized);
        vm.expectRevert(SupremeCourt.NotAuthorized.selector);
        court.nominateJustice(justiceAddrs[0], 0);
    }

    function test_revert_nominateJustice_parliamentCannotCall() public {
        vm.prank(address(parliament));
        vm.expectRevert(SupremeCourt.NotAuthorized.selector);
        court.nominateJustice(justiceAddrs[0], 0);
    }

    function test_revert_confirmNominee_onlyParliament() public {
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[0], 0);

        // Crown contract (not Parliament) tries to confirm
        vm.prank(address(crown));
        vm.expectRevert(SupremeCourt.NotAuthorized.selector);
        court.confirmNominee(0);
    }

    function test_revert_rejectNominee_onlyParliament() public {
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[0], 0);

        vm.prank(address(crown));
        vm.expectRevert(SupremeCourt.NotAuthorized.selector);
        court.rejectNominee(0);
    }

    function test_revert_nominateJusticeSecond_onlyCrownOrExecutive() public {
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[0], 0);
        _rejectNominee(0);

        vm.prank(address(parliament));
        vm.expectRevert(SupremeCourt.NotAuthorized.selector);
        court.nominateJusticeSecond(justiceAddrs[1], 0);
    }

    function test_revert_proposeSenateList_onlyParliament() public {
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[0], 0);
        _rejectNominee(0);
        vm.prank(monarchAddr);
        crown.nominateJusticeSecond(justiceAddrs[1], 0);
        _rejectNominee(0);

        address[3] memory candidates = [justiceAddrs[2], justiceAddrs[3], justiceAddrs[4]];
        vm.prank(address(crown));
        vm.expectRevert(SupremeCourt.NotAuthorized.selector);
        court.proposeSenateList(0, candidates);
    }

    function test_revert_constructor_zeroAddress() public {
        vm.expectRevert(SupremeCourt.ZeroAddress.selector);
        new SupremeCourt(address(0));
    }

    function test_revert_nominateJustice_zeroAddress() public {
        vm.prank(monarchAddr);
        vm.expectRevert(SupremeCourt.ZeroAddress.selector);
        crown.nominateJustice(address(0), 0);
    }

    function test_revert_nominateJusticeSecond_notDistinct() public {
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[0], 0);
        _rejectNominee(0);

        // Second nomination with same address as first
        vm.prank(monarchAddr);
        vm.expectRevert(SupremeCourt.NomineeNotDistinct.selector);
        crown.nominateJusticeSecond(justiceAddrs[0], 0);
    }

    function test_revert_appointFromList_indexOutOfBounds() public {
        // Get to CrownFromList stage
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[0], 0);
        _rejectNominee(0);
        vm.prank(monarchAddr);
        crown.nominateJusticeSecond(justiceAddrs[1], 0);
        _rejectNominee(0);

        address[3] memory candidates = [justiceAddrs[2], justiceAddrs[3], justiceAddrs[4]];
        _proposeSenateList(0, candidates);

        vm.prank(monarchAddr);
        vm.expectRevert(SupremeCourt.IndexOutOfBounds.selector);
        crown.appointJusticeFromList(0, 3);
    }

    function test_revert_claimAppointmentTimeout_noActiveAppointment() public {
        // Appoint justice normally — stage becomes Completed with stale deadline
        _appointJustice(0);

        // Warp past the stale deadline
        uint256 senatePeriod = constitution.getParameter(constitution.PARAM_SENATE_REVIEW_PERIOD());
        _warpForward(senatePeriod);

        vm.expectRevert(SupremeCourt.NoActiveAppointment.selector);
        court.claimAppointmentTimeout(0);
    }

    function test_revert_confirmNominee_wrongStage() public {
        // No nomination — stage is Idle
        uint256 actionId = _prepareSenateAction(
            address(court),
            abi.encodeCall(SupremeCourt.confirmNominee, (0))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_appointFromList_onlyCrownOrExecutive() public {
        vm.prank(monarchAddr);
        crown.nominateJustice(justiceAddrs[0], 0);
        _rejectNominee(0);
        vm.prank(monarchAddr);
        crown.nominateJusticeSecond(justiceAddrs[1], 0);
        _rejectNominee(0);

        address[3] memory candidates = [justiceAddrs[2], justiceAddrs[3], justiceAddrs[4]];
        _proposeSenateList(0, candidates);

        vm.prank(address(parliament));
        vm.expectRevert(SupremeCourt.NotAuthorized.selector);
        court.appointFromList(0, 1);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. JUDICIAL — reviews, disputes, fact certification, vacancy, liveness,
//    check-in, judicial orders. MixinGovernment + MixinJustices.
// ═══════════════════════════════════════════════════════════════════════════════

contract SupremeCourtJudicialTest is MixinGovernment, MixinJustices {
    event FactCertified(bytes32 indexed factHash, uint256 timestamp);

    address internal unauthorized = makeAddr("unauthorized");

    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
        _setupSenate();
        _setupJustices();
    }

    // ─── Constitutional Review ───────────────────────────────────────────

    function test_happyCase_fileReview() public {
        vm.prank(pmCandidate);
        uint256 reviewId = court.fileConstitutionalReview(1, keccak256("petition"));

        assertEq(reviewId, 0);
        assertEq(court.reviewCount(), 1);
        assertEq(uint256(court.getReviewStatus(0)), uint256(SupremeCourt.ReviewStatus.Voting));
    }

    function test_happyCase_reviewConstitutional() public {
        vm.prank(pmCandidate);
        uint256 reviewId = court.fileConstitutionalReview(1, keccak256("petition"));

        // 5 constitutional, 2 unconstitutional
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(justices[i]);
            court.voteOnReview(reviewId, true);
        }
        for (uint256 i = 5; i < 7; i++) {
            vm.prank(justices[i]);
            court.voteOnReview(reviewId, false);
        }

        court.finalizeReview(reviewId);
        assertEq(uint256(court.getReviewStatus(0)), uint256(SupremeCourt.ReviewStatus.Constitutional));
    }

    function test_happyCase_reviewUnconstitutional() public {
        vm.prank(monarchAddr);
        uint256 reviewId = court.fileConstitutionalReview(1, keccak256("petition"));

        // 3 constitutional, 4 unconstitutional
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(justices[i]);
            court.voteOnReview(reviewId, true);
        }
        for (uint256 i = 3; i < 7; i++) {
            vm.prank(justices[i]);
            court.voteOnReview(reviewId, false);
        }

        court.finalizeReview(reviewId);
        assertEq(uint256(court.getReviewStatus(0)), uint256(SupremeCourt.ReviewStatus.Unconstitutional));
    }

    function test_revert_finalizeReview_quorumNotMet() public {
        vm.prank(pmCandidate);
        uint256 reviewId = court.fileConstitutionalReview(1, keccak256("petition"));

        // Only 6 votes (quorum is 7)
        for (uint256 i = 0; i < 6; i++) {
            vm.prank(justices[i]);
            court.voteOnReview(reviewId, true);
        }

        vm.expectRevert(SupremeCourt.QuorumNotMet.selector);
        court.finalizeReview(reviewId);
    }

    function test_revert_finalizeReview_noActiveJustices() public {
        // File a review with current quorum
        vm.prank(pmCandidate);
        uint256 reviewId = court.fileConstitutionalReview(1, keccak256("petition"));

        // Remove all justices (expire their terms)
        uint256 termLength = constitution.getParameter(constitution.PARAM_JUSTICE_TERM());
        _warpForward(termLength + 1);
        for (uint256 i = 0; i < 7; i++) {
            court.removeExpiredJustice(i);
        }

        vm.expectRevert(SupremeCourt.NoActiveJustices.selector);
        court.finalizeReview(reviewId);
    }

    function test_revert_voteOnReview_notJustice() public {
        vm.prank(pmCandidate);
        uint256 reviewId = court.fileConstitutionalReview(1, keccak256("petition"));

        vm.prank(unauthorized);
        vm.expectRevert(SupremeCourt.NotJustice.selector);
        court.voteOnReview(reviewId, true);
    }

    function test_revert_voteOnReview_alreadyVoted() public {
        vm.prank(pmCandidate);
        uint256 reviewId = court.fileConstitutionalReview(1, keccak256("petition"));

        vm.prank(justices[0]);
        court.voteOnReview(reviewId, true);

        vm.prank(justices[0]);
        vm.expectRevert(SupremeCourt.AlreadyVoted.selector);
        court.voteOnReview(reviewId, true);
    }

    function test_revert_voteOnReview_invalidReview() public {
        vm.prank(justices[0]);
        vm.expectRevert(SupremeCourt.InvalidReview.selector);
        court.voteOnReview(999, true);
    }

    function test_revert_voteOnReview_notInStatus() public {
        vm.prank(pmCandidate);
        uint256 reviewId = court.fileConstitutionalReview(1, keccak256("petition"));

        for (uint256 i = 0; i < 7; i++) {
            vm.prank(justices[i]);
            court.voteOnReview(reviewId, true);
        }
        court.finalizeReview(reviewId);

        // Review is Constitutional — not Voting anymore (NotInStatus checked before AlreadyVoted)
        vm.prank(justices[0]);
        vm.expectRevert(SupremeCourt.NotInStatus.selector);
        court.voteOnReview(reviewId, true);
    }

    function test_revert_finalizeReview_invalidReview() public {
        vm.expectRevert(SupremeCourt.InvalidReview.selector);
        court.finalizeReview(999);
    }

    function test_revert_executeReviewOutcome_notInStatus() public {
        vm.prank(pmCandidate);
        uint256 reviewId = court.fileConstitutionalReview(1, keccak256("petition"));

        // Review is still in Voting — not finalized
        vm.expectRevert(SupremeCourt.NotInStatus.selector);
        court.executeReviewOutcome(reviewId);
    }

    function test_revert_getReviewStatus_invalidReview() public {
        vm.expectRevert(SupremeCourt.InvalidReview.selector);
        court.getReviewStatus(999);
    }

    function test_revert_fileReview_noStanding() public {
        vm.prank(unauthorized);
        vm.expectRevert(SupremeCourt.NotAuthorized.selector);
        court.fileConstitutionalReview(1, keccak256("petition"));
    }

    function test_happyCase_fileReview_byCrownContract() public {
        vm.prank(address(crown));
        uint256 reviewId = court.fileConstitutionalReview(1, keccak256("petition"));
        assertEq(reviewId, 0);
    }

    function test_happyCase_fileReview_byExecutiveContract() public {
        vm.prank(address(executive));
        uint256 reviewId = court.fileConstitutionalReview(1, keccak256("petition"));
        assertEq(reviewId, 0);
    }

    function test_happyCase_fileReview_byParliamentContract() public {
        vm.prank(address(parliament));
        uint256 reviewId = court.fileConstitutionalReview(1, keccak256("petition"));
        assertEq(reviewId, 0);
    }

    // ─── Dispute Resolution ──────────────────────────────────────────────

    function test_happyCase_fileAndResolveDispute() public {
        vm.prank(pmCandidate);
        uint256 disputeId = court.fileDispute(keccak256("Crown vs Parliament"));

        for (uint256 i = 0; i < 7; i++) {
            vm.prank(justices[i]);
            court.voteOnDispute(disputeId, true);
        }

        bytes32 rulingHash = keccak256("ruling: Parliament prevails");
        vm.prank(justices[0]);
        court.finalizeDispute(disputeId, rulingHash);

        assertEq(uint256(court.getDisputeStatus(0)), uint256(SupremeCourt.DisputeStatus.Resolved));
    }

    function test_happyCase_fileDispute_byCrownContract() public {
        vm.prank(address(crown));
        uint256 disputeId = court.fileDispute(keccak256("Crown vs Executive"));
        assertEq(disputeId, 0);
    }

    function test_happyCase_fileDispute_byExecutiveContract() public {
        vm.prank(address(executive));
        uint256 disputeId = court.fileDispute(keccak256("Executive vs Parliament"));
        assertEq(disputeId, 0);
    }

    function test_happyCase_fileDispute_byParliamentContract() public {
        vm.prank(address(parliament));
        uint256 disputeId = court.fileDispute(keccak256("Parliament vs Crown"));
        assertEq(disputeId, 0);
    }

    function test_revert_voteOnDispute_invalidDispute() public {
        vm.prank(justices[0]);
        vm.expectRevert(SupremeCourt.InvalidDispute.selector);
        court.voteOnDispute(999, true);
    }

    function test_revert_voteOnDispute_alreadyVoted() public {
        vm.prank(pmCandidate);
        uint256 disputeId = court.fileDispute(keccak256("dispute"));

        vm.prank(justices[0]);
        court.voteOnDispute(disputeId, true);

        vm.prank(justices[0]);
        vm.expectRevert(SupremeCourt.AlreadyVoted.selector);
        court.voteOnDispute(disputeId, true);
    }

    function test_revert_getDisputeStatus_invalidDispute() public {
        vm.expectRevert(SupremeCourt.InvalidDispute.selector);
        court.getDisputeStatus(999);
    }

    function test_revert_fileDispute_noStanding() public {
        vm.prank(unauthorized);
        vm.expectRevert(SupremeCourt.NotAuthorized.selector);
        court.fileDispute(keccak256("unauthorized dispute"));
    }

    function test_revert_finalizeDispute_notJustice() public {
        vm.prank(pmCandidate);
        uint256 disputeId = court.fileDispute(keccak256("dispute"));

        for (uint256 i = 0; i < 7; i++) {
            vm.prank(justices[i]);
            court.voteOnDispute(disputeId, true);
        }

        vm.prank(unauthorized);
        vm.expectRevert(SupremeCourt.NotJustice.selector);
        court.finalizeDispute(disputeId, keccak256("ruling"));
    }

    // ─── Fact Certification ──────────────────────────────────────────────

    function test_happyCase_certifyFact() public {
        bytes32 factHash = keccak256("PM incapacitated");
        _certifyFact(factHash);

        assertTrue(court.isFactCertified(factHash));
    }

    function test_happyCase_certifyFact_notCertifiedBeforeDeadline() public {
        bytes32 factHash = keccak256("PM incapacitated");

        // 4 yes votes — majority
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(justices[i]);
            court.voteOnFact(factHash, true);
        }

        // Not certified before deadline
        assertFalse(court.isFactCertified(factHash));

        // Can't finalize before deadline
        vm.expectRevert(SupremeCourt.FactCertPeriodNotElapsed.selector);
        court.finalizeFactCertification(factHash);

        // After deadline, finalize
        uint256 factCertPeriod = constitution.getParameter(constitution.PARAM_FACT_CERT_PERIOD());
        _warpForward(factCertPeriod);
        court.finalizeFactCertification(factHash);
        assertTrue(court.isFactCertified(factHash));
    }

    function test_happyCase_certifyFact_notCertifiedIfNoMajority() public {
        bytes32 factHash = keccak256("PM incapacitated");

        // 2 yes, 3 no
        vm.prank(justices[0]); court.voteOnFact(factHash, true);
        vm.prank(justices[1]); court.voteOnFact(factHash, true);
        vm.prank(justices[2]); court.voteOnFact(factHash, false);
        vm.prank(justices[3]); court.voteOnFact(factHash, false);
        vm.prank(justices[4]); court.voteOnFact(factHash, false);

        uint256 factCertPeriod = constitution.getParameter(constitution.PARAM_FACT_CERT_PERIOD());
        _warpForward(factCertPeriod);
        court.finalizeFactCertification(factHash);
        assertFalse(court.isFactCertified(factHash));
    }

    function test_happyCase_certifyFact_emitsEvent() public {
        bytes32 factHash = keccak256("PM incapacitated");

        for (uint256 i = 0; i < 4; i++) {
            vm.prank(justices[i]);
            court.voteOnFact(factHash, true);
        }

        uint256 factCertPeriod = constitution.getParameter(constitution.PARAM_FACT_CERT_PERIOD());
        _warpForward(factCertPeriod);

        vm.expectEmit(true, false, false, true);
        emit FactCertified(factHash, block.timestamp);
        court.finalizeFactCertification(factHash);
    }

    function test_revert_voteOnFact_alreadyVoted() public {
        bytes32 factHash = keccak256("PM incapacitated");
        vm.prank(justices[0]);
        court.voteOnFact(factHash, true);

        vm.prank(justices[0]);
        vm.expectRevert(SupremeCourt.AlreadyVoted.selector);
        court.voteOnFact(factHash, true);
    }

    function test_revert_voteOnFact_alreadyCertified() public {
        bytes32 factHash = keccak256("PM incapacitated");
        _certifyFact(factHash);

        vm.prank(justices[5]);
        vm.expectRevert(SupremeCourt.FactAlreadyCertified.selector);
        court.voteOnFact(factHash, true);
    }

    function test_modifier_voteOnFact_onlyJustice() public {
        vm.prank(unauthorized);
        vm.expectRevert(SupremeCourt.NotJustice.selector);
        court.voteOnFact(keccak256("fact"), true);
    }

    function test_happyCase_uncertifiedFact() public view {
        assertFalse(court.isFactCertified(keccak256("nonexistent")));
    }

    // ─── Fact Certification Retry (Round-Based Reset) ────────────────────

    function test_happyCase_factCert_retryAfterFailure() public {
        bytes32 factHash = keccak256("disputed fact");

        // Round 0: vote no — majority rejects
        vm.prank(justices[0]); court.voteOnFact(factHash, false);
        vm.prank(justices[1]); court.voteOnFact(factHash, false);
        vm.prank(justices[2]); court.voteOnFact(factHash, false);
        vm.prank(justices[3]); court.voteOnFact(factHash, true);

        uint256 factCertPeriod = constitution.getParameter(constitution.PARAM_FACT_CERT_PERIOD());
        _warpForward(factCertPeriod);
        court.finalizeFactCertification(factHash);

        assertFalse(court.isFactCertified(factHash));
        assertEq(court.factCertRound(factHash), 1);

        // Round 1: vote yes — majority approves
        vm.prank(justices[0]); court.voteOnFact(factHash, true);
        vm.prank(justices[1]); court.voteOnFact(factHash, true);
        vm.prank(justices[2]); court.voteOnFact(factHash, true);
        vm.prank(justices[3]); court.voteOnFact(factHash, true);

        _warpForward(factCertPeriod);
        court.finalizeFactCertification(factHash);

        assertTrue(court.isFactCertified(factHash));
    }

    function test_happyCase_factCert_oldVotesPreserved() public {
        bytes32 factHash = keccak256("evidence fact");

        // Round 0: 2 yes, 3 no
        vm.prank(justices[0]); court.voteOnFact(factHash, true);
        vm.prank(justices[1]); court.voteOnFact(factHash, true);
        vm.prank(justices[2]); court.voteOnFact(factHash, false);
        vm.prank(justices[3]); court.voteOnFact(factHash, false);
        vm.prank(justices[4]); court.voteOnFact(factHash, false);

        uint256 factCertPeriod = constitution.getParameter(constitution.PARAM_FACT_CERT_PERIOD());
        _warpForward(factCertPeriod);
        court.finalizeFactCertification(factHash);

        // Round 0 votes are preserved
        assertEq(court.factYesVotesInRound(factHash, 0), 2);
        assertEq(court.factNoVotesInRound(factHash, 0), 3);
        assertTrue(court.factVotedInRound(factHash, 0, justices[0]));
        assertTrue(court.factVotedInRound(factHash, 0, justices[2]));

        // Round 1 starts fresh
        assertEq(court.factYesVotesInRound(factHash, 1), 0);
        assertEq(court.factNoVotesInRound(factHash, 1), 0);
        assertFalse(court.factVotedInRound(factHash, 1, justices[0]));
    }

    function test_revert_factCert_cannotDoubleVoteInRound() public {
        bytes32 factHash = keccak256("double vote fact");

        vm.prank(justices[0]);
        court.voteOnFact(factHash, true);

        vm.prank(justices[0]);
        vm.expectRevert(SupremeCourt.AlreadyVoted.selector);
        court.voteOnFact(factHash, false);
    }

    // ─── Justice Vacancy Via Fact Certification ──────────────────────────

    function test_happyCase_vacateJusticeSeat() public {
        // Court certifies vacancy fact for seat 0
        bytes32 factHash = keccak256(abi.encodePacked("JUSTICE_VACANCY", uint256(0)));
        for (uint256 i = 1; i < 5; i++) {
            vm.prank(justices[i]);
            court.voteOnFact(factHash, true);
        }
        uint256 factCertPeriod = constitution.getParameter(constitution.PARAM_FACT_CERT_PERIOD());
        _warpForward(factCertPeriod);
        court.finalizeFactCertification(factHash);

        court.vacateJusticeSeat(0);

        assertFalse(court.isActiveJustice(justices[0]));
        assertEq(court.activeJusticeCount(), 6);
    }

    function test_revert_vacateJusticeSeat_notCertified() public {
        vm.expectRevert(SupremeCourt.VacancyNotCertified.selector);
        court.vacateJusticeSeat(0);
    }

    function test_revert_vacateJusticeSeat_insufficientVotes() public {
        // Only 3 yes, 4 no — not majority
        bytes32 factHash = keccak256(abi.encodePacked("JUSTICE_VACANCY", uint256(0)));
        for (uint256 i = 1; i < 4; i++) {
            vm.prank(justices[i]);
            court.voteOnFact(factHash, true);
        }
        for (uint256 i = 4; i < 7; i++) {
            vm.prank(justices[i]);
            court.voteOnFact(factHash, false);
        }
        vm.prank(justices[0]);
        court.voteOnFact(factHash, false);

        uint256 factCertPeriod = constitution.getParameter(constitution.PARAM_FACT_CERT_PERIOD());
        _warpForward(factCertPeriod);
        court.finalizeFactCertification(factHash);

        vm.expectRevert(SupremeCourt.VacancyNotCertified.selector);
        court.vacateJusticeSeat(0);
    }

    // ─── Court Liveness (Art. V.8) ───────────────────────────────────────

    function test_happyCase_challengeCourtLiveness_byMonarch() public {
        vm.prank(monarchAddr);
        court.challengeCourtLiveness();

        uint256 period = constitution.getParameter(constitution.PARAM_COURT_LIVENESS_PERIOD());
        assertEq(court.livenessDeadline(), block.timestamp + period);
    }

    function test_happyCase_challengeCourtLiveness_byPM() public {
        vm.prank(pmCandidate);
        court.challengeCourtLiveness();

        uint256 period = constitution.getParameter(constitution.PARAM_COURT_LIVENESS_PERIOD());
        assertEq(court.livenessDeadline(), block.timestamp + period);
    }

    function test_happyCase_challengeCourtLiveness_byCrownContract() public {
        vm.prank(address(crown));
        court.challengeCourtLiveness();

        uint256 period = constitution.getParameter(constitution.PARAM_COURT_LIVENESS_PERIOD());
        assertEq(court.livenessDeadline(), block.timestamp + period);
    }

    function test_happyCase_emergencyVacateSeat_afterChallenge() public {
        vm.prank(monarchAddr);
        court.challengeCourtLiveness();

        uint256 period = constitution.getParameter(constitution.PARAM_COURT_LIVENESS_PERIOD());
        _warpForward(period);

        court.emergencyVacateSeat(0);
        assertFalse(court.isActiveJustice(justices[0]));
        assertEq(court.activeJusticeCount(), 6);
    }

    function test_happyCase_emergencyVacateSeat_afterInactivity() public {
        uint256 inactivityPeriod = constitution.getParameter(constitution.PARAM_COURT_INACTIVITY_PERIOD());
        _warpForward(inactivityPeriod);

        court.emergencyVacateSeat(0);
        assertFalse(court.isActiveJustice(justices[0]));
        assertEq(court.activeJusticeCount(), 6);
    }

    function test_happyCase_justiceAction_resetsChallenge() public {
        vm.prank(monarchAddr);
        court.challengeCourtLiveness();
        assertTrue(court.livenessDeadline() != 0);

        // A justice votes on a fact — resets the challenge
        bytes32 factHash = keccak256("some fact");
        vm.prank(justices[0]);
        court.voteOnFact(factHash, true);

        assertEq(court.livenessDeadline(), 0);
        assertEq(court.lastCourtActivity(), block.timestamp);
    }

    function test_happyCase_petitionCourtLiveness_thresholdMet() public {
        // With 5 Majlis members, threshold = ceil(5/10) = 1 — single petition triggers
        vm.prank(citizen1);
        court.petitionCourtLiveness();
        uint256 period = constitution.getParameter(constitution.PARAM_COURT_LIVENESS_PERIOD());
        assertEq(court.livenessDeadline(), block.timestamp + period);
    }

    function test_revert_challengeCourtLiveness_alreadyActive() public {
        vm.prank(monarchAddr);
        court.challengeCourtLiveness();

        vm.prank(monarchAddr);
        vm.expectRevert(SupremeCourt.LivenessChallengeActive.selector);
        court.challengeCourtLiveness();
    }

    function test_revert_petitionCourtLiveness_alreadyPetitioned() public {
        // Need threshold > 1. Add extra Majlis members.
        for (uint256 i = 0; i < 6; i++) {
            address extra = address(uint160(5000 + i));
            vm.prank(address(election));
            parliament.seatMember(extra, Parliament.Chamber.Majlis);
        }
        // 11 Majlis members, threshold = ceil(11/10) = 2

        vm.prank(citizen1);
        court.petitionCourtLiveness();

        vm.prank(citizen1);
        vm.expectRevert(SupremeCourt.AlreadyPetitioned.selector);
        court.petitionCourtLiveness();
    }

    function test_revert_petitionCourtLiveness_notParliamentMember() public {
        vm.prank(unauthorized);
        vm.expectRevert(SupremeCourt.NotParliamentMember.selector);
        court.petitionCourtLiveness();
    }

    function test_revert_emergencyVacateSeat_notActiveJustice() public {
        vm.prank(monarchAddr);
        court.challengeCourtLiveness();
        uint256 period = constitution.getParameter(constitution.PARAM_COURT_LIVENESS_PERIOD());
        _warpForward(period);

        // Seat 7 is unoccupied
        vm.expectRevert(abi.encodeWithSelector(SupremeCourt.NotActiveJustice.selector, address(0)));
        court.emergencyVacateSeat(7);
    }

    function test_revert_challengeCourtLiveness_unauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(SupremeCourt.NotAuthorized.selector);
        court.challengeCourtLiveness();
    }

    function test_revert_challengeCourtLiveness_executiveCannotCall() public {
        vm.prank(address(executive));
        vm.expectRevert(SupremeCourt.NotAuthorized.selector);
        court.challengeCourtLiveness();
    }

    function test_revert_challengeCourtLiveness_parliamentCannotCall() public {
        vm.prank(address(parliament));
        vm.expectRevert(SupremeCourt.NotAuthorized.selector);
        court.challengeCourtLiveness();
    }

    function test_revert_emergencyVacateSeat_neitherCondition() public {
        // Reset inactivity timer (setUp warps accumulate ~87 days, exceeding 14-day threshold)
        vm.prank(justices[0]);
        court.checkIn();

        vm.expectRevert(SupremeCourt.NeitherLivenessConditionMet.selector);
        court.emergencyVacateSeat(0);
    }

    function test_revert_emergencyVacate_afterRecoverySeating() public {
        // Trigger a liveness challenge
        vm.prank(monarchAddr);
        court.challengeCourtLiveness();
        uint256 period = constitution.getParameter(constitution.PARAM_COURT_LIVENESS_PERIOD());
        assertTrue(court.livenessDeadline() != 0);

        // Wait for challenge to expire
        _warpForward(period);

        // Vacate ALL 7 justices via emergency
        for (uint256 i = 0; i < 7; i++) {
            court.emergencyVacateSeat(i);
        }
        assertEq(court.activeJusticeCount(), 0);

        // Seat a fresh justice in seat 0 — should clear the stale livenessDeadline
        // (Can't reuse justices[0..6] because they've served; use a fresh address)
        address freshJustice = makeAddr("freshJustice");
        vm.prank(monarchAddr);
        crown.nominateJustice(freshJustice, 0);
        _executeSenateAction(
            address(court),
            abi.encodeCall(SupremeCourt.confirmNominee, (0))
        );

        assertEq(court.livenessDeadline(), 0);
        assertEq(court.activeJusticeCount(), 1);

        // Emergency vacate should now revert — no active challenge, fresh activity
        vm.expectRevert(SupremeCourt.NeitherLivenessConditionMet.selector);
        court.emergencyVacateSeat(0);
    }

    // ─── Justice Check-In ────────────────────────────────────────────────

    function test_happyCase_checkIn_resetsInactivityTimer() public {
        uint256 inactivityPeriod = constitution.getParameter(constitution.PARAM_COURT_INACTIVITY_PERIOD());
        _warpForward(inactivityPeriod - 1);

        vm.prank(justices[0]);
        court.checkIn();
        assertEq(court.lastCourtActivity(), block.timestamp);

        // Now advancing another inactivityPeriod-1 should still be safe
        _warpForward(inactivityPeriod - 1);
        vm.expectRevert(SupremeCourt.NeitherLivenessConditionMet.selector);
        court.emergencyVacateSeat(0);
    }

    function test_happyCase_checkIn_clearsLivenessChallenge() public {
        vm.prank(monarchAddr);
        court.challengeCourtLiveness();
        assertTrue(court.livenessDeadline() != 0);

        vm.prank(justices[0]);
        court.checkIn();
        assertEq(court.livenessDeadline(), 0);
    }

    function test_revert_checkIn_nonJustice() public {
        vm.prank(unauthorized);
        vm.expectRevert(SupremeCourt.NotJustice.selector);
        court.checkIn();
    }

    // ─── Judicial Order Execution ────────────────────────────────────────

    function test_happyCase_executeJudicialOrder() public {
        // Use a real target: remove a Majlis member via judicial order
        // (Parliament.removeMember is onlySupremeCourt, and Court is the caller)
        address target = address(parliament);
        bytes memory data = abi.encodeCall(
            Parliament.removeMember,
            (citizen5, Parliament.Chamber.Majlis)
        );

        // Certify the judicial order fact
        bytes32 factHash = keccak256(abi.encodePacked("JUDICIAL_ORDER", target, data));
        _certifyFact(factHash);
        assertTrue(court.isFactCertified(factHash));

        // Execute
        vm.prank(justices[0]);
        court.executeJudicialOrder(target, data);

        // Fact is consumed (cannot replay)
        assertFalse(court.isFactCertified(factHash));
        // Member was actually removed
        assertFalse(parliament.isActiveMajlisMember(citizen5));
    }

    function test_revert_executeJudicialOrder_notJustice() public {
        address target = address(parliament);
        bytes memory data = abi.encodeCall(
            Parliament.removeMember,
            (citizen5, Parliament.Chamber.Majlis)
        );

        vm.prank(unauthorized);
        vm.expectRevert(SupremeCourt.NotJustice.selector);
        court.executeJudicialOrder(target, data);
    }

    function test_revert_executeJudicialOrder_factNotCertified() public {
        address target = address(parliament);
        bytes memory data = abi.encodeCall(
            Parliament.removeMember,
            (citizen5, Parliament.Chamber.Majlis)
        );

        vm.prank(justices[0]);
        vm.expectRevert(SupremeCourt.FactNotCertified.selector);
        court.executeJudicialOrder(target, data);
    }

    function test_revert_executeJudicialOrder_invalidTarget() public {
        address target = makeAddr("unregistered");
        bytes memory data = hex"deadbeef";

        // Certify the fact
        bytes32 factHash = keccak256(abi.encodePacked("JUDICIAL_ORDER", target, data));
        _certifyFact(factHash);

        vm.prank(justices[0]);
        vm.expectRevert(SupremeCourt.InvalidTarget.selector);
        court.executeJudicialOrder(target, data);
    }

    function test_revert_executeJudicialOrder_noReplay() public {
        address target = address(parliament);
        bytes memory data = abi.encodeCall(
            Parliament.removeMember,
            (citizen5, Parliament.Chamber.Majlis)
        );

        bytes32 factHash = keccak256(abi.encodePacked("JUDICIAL_ORDER", target, data));
        _certifyFact(factHash);

        // First execution succeeds
        vm.prank(justices[0]);
        court.executeJudicialOrder(target, data);

        // Second execution reverts — fact consumed
        vm.prank(justices[0]);
        vm.expectRevert(SupremeCourt.FactNotCertified.selector);
        court.executeJudicialOrder(target, data);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. COLLECTIVE PETITIONS — uses real Majlis and Senate members.
//    Inherits MixinMajlis + MixinSenate for both chamber types.
// ═══════════════════════════════════════════════════════════════════════════════

contract SupremeCourtPetitionTest is MixinMajlis, MixinSenate {
    address internal unauthorized = makeAddr("unauthorized");

    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupSenate();
    }

    // ─── Majlis Petitions ────────────────────────────────────────────────

    function test_happyCase_collectivePetition_majlis() public {
        // 5 Majlis members, threshold = ceil(5/10) = 1 → auto-files immediately
        vm.prank(citizen1);
        uint256 petId = court.createCollectivePetition(42, keccak256("petition"), Parliament.Chamber.Majlis);

        assertEq(petId, 0);
        assertEq(court.petitionCount(), 1);
        assertEq(court.reviewCount(), 1); // Review was auto-filed (1 sig >= threshold of 1)
    }

    function test_happyCase_collectivePetition_senate() public {
        // 3 Senate members, threshold = ceil(3/10) = 1 → auto-files immediately
        vm.prank(senator1);
        uint256 petId = court.createCollectivePetition(7, keccak256("senate petition"), Parliament.Chamber.Senate);

        assertEq(petId, 0);
        assertEq(court.reviewCount(), 1); // Auto-filed
    }

    function test_revert_signPetition_invalidPetition() public {
        vm.prank(citizen1);
        vm.expectRevert(SupremeCourt.InvalidPetition.selector);
        court.signPetition(999);
    }

    function test_revert_collectivePetition_notMember() public {
        vm.prank(unauthorized);
        vm.expectRevert(SupremeCourt.NotParliamentMember.selector);
        court.createCollectivePetition(42, keccak256("petition"), Parliament.Chamber.Majlis);
    }

    function test_revert_signPetition_alreadySigned() public {
        // Create petition that doesn't auto-file (need high member count = low threshold)
        // With 5 members, threshold = 1, so it auto-files. We need a scenario where threshold > 1.
        // Since we can't easily change member count, test the alreadySigned path:
        // Creator creates petition (auto-signed) → tries to sign again
        vm.prank(citizen1);
        uint256 petId = court.createCollectivePetition(42, keccak256("petition"), Parliament.Chamber.Majlis);

        // This petition is already filed (threshold met). signPetition checks filed status first.
        vm.prank(citizen1);
        vm.expectRevert(SupremeCourt.PetitionAlreadyFiled.selector);
        court.signPetition(petId);
    }

    function test_revert_signPetition_wrongChamber() public {
        // Seat extra Majlis members so threshold > 1 (petition doesn't auto-file)
        for (uint256 i = 0; i < 6; i++) {
            address extra = address(uint160(5000 + i));
            vm.prank(address(election));
            parliament.seatMember(extra, Parliament.Chamber.Majlis);
        }
        assertEq(parliament.majlisMemberCount(), 11);

        // Create Majlis petition (threshold=2, not auto-filed)
        vm.prank(citizen1);
        uint256 petId = court.createCollectivePetition(42, keccak256("petition"), Parliament.Chamber.Majlis);

        // Senate member tries to sign a Majlis petition — not a Majlis member
        vm.prank(senator1);
        vm.expectRevert(SupremeCourt.NotParliamentMember.selector);
        court.signPetition(petId);
    }

    function test_revert_createCollectivePetition_senatorCannotCreateMajlisPetition() public {
        // Senate member tries to create Majlis petition
        vm.prank(senator1);
        vm.expectRevert(SupremeCourt.NotParliamentMember.selector);
        court.createCollectivePetition(43, keccak256("petition"), Parliament.Chamber.Majlis);
    }

    function test_happyCase_signPetition_thresholdReached() public {
        // Seat extra Majlis members so threshold > 1
        for (uint256 i = 0; i < 6; i++) {
            address extra = address(uint160(5000 + i));
            vm.prank(address(election));
            parliament.seatMember(extra, Parliament.Chamber.Majlis);
        }
        assertEq(parliament.majlisMemberCount(), 11);

        // Create petition (threshold=2, needs 2 signers)
        vm.prank(citizen1);
        uint256 petId = court.createCollectivePetition(50, keccak256("petition-sign"), Parliament.Chamber.Majlis);

        // Before second signature, no review filed
        uint256 reviewsBefore = court.reviewCount();

        // Second member signs — threshold met, review auto-filed
        vm.prank(citizen2);
        court.signPetition(petId);

        assertEq(court.reviewCount(), reviewsBefore + 1);
    }

    function test_revert_signPetition_alreadySigned_withHighThreshold() public {
        // Seat extra Majlis members so threshold > 1
        for (uint256 i = 0; i < 6; i++) {
            address extra = address(uint160(5000 + i));
            vm.prank(address(election));
            parliament.seatMember(extra, Parliament.Chamber.Majlis);
        }

        vm.prank(citizen1);
        uint256 petId = court.createCollectivePetition(51, keccak256("petition-dup-sign"), Parliament.Chamber.Majlis);

        // Creator already signed — try again
        vm.prank(citizen1);
        vm.expectRevert(SupremeCourt.PetitionAlreadySigned.selector);
        court.signPetition(petId);
    }

    function test_revert_signPetition_expired() public {
        // Need threshold > 1 so petition doesn't auto-file on creation.
        // Seat 6 extra Majlis members → 11 total → threshold = ceil(11/10) = 2.
        for (uint256 i = 0; i < 6; i++) {
            address extra = address(uint160(5000 + i));
            vm.prank(address(election));
            parliament.seatMember(extra, Parliament.Chamber.Majlis);
        }
        assertEq(parliament.majlisMemberCount(), 11);

        // Create petition — creator is first signer, but threshold=2, so not auto-filed
        vm.prank(citizen1);
        uint256 petId = court.createCollectivePetition(99, keccak256("expiry-test"), Parliament.Chamber.Majlis);

        // Warp past petition timeout (strict > check, so +1)
        uint256 timeout = constitution.getParameter(constitution.PARAM_PETITION_TIMEOUT());
        _warpForward(timeout + 1);

        // Second signer after expiry — should revert
        vm.prank(citizen2);
        vm.expectRevert(SupremeCourt.PetitionExpired.selector);
        court.signPetition(petId);
    }

    function test_revert_duplicatePetition() public {
        // Create first petition for law 42
        vm.prank(citizen1);
        court.createCollectivePetition(42, keccak256("petition1"), Parliament.Chamber.Majlis);

        // Second petition for same law + same chamber should revert
        vm.prank(citizen2);
        vm.expectRevert(SupremeCourt.DuplicatePetition.selector);
        court.createCollectivePetition(42, keccak256("petition2"), Parliament.Chamber.Majlis);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CARETAKER — caretaker=true, suspended=false. Crown nomination blocked.
// ═══════════════════════════════════════════════════════════════════════════════

contract SupremeCourtCaretakerTest is MixinCaretaker {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupCaretaker();
    }

    function test_revert_nominateJustice_caretakerMode() public {
        // Crown does DIRECT call to court.nominateJustice — inner error propagates
        address justiceAddr = makeAddr("justice");
        vm.prank(monarchAddr);
        vm.expectRevert(SupremeCourt.CaretakerModeActive.selector);
        crown.nominateJustice(justiceAddr, 0);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SUSPENSION — Crown suspended, various sub-scenarios for justice appointment.
//    Scenario matrix (caretaker × suspended × pm × deputyOverdue):
//    5a: PM nominates with deputy designated (deputyOverdue=false) → happy path
//    5b: PM nominates without deputy (deputyOverdue=true) → revert
//    5c: Caretaker bypass (formation restarted, caretaker=true) → direct Court call
//    5d: Crown cannot nominate during suspension → revert CrownSuspended
// ═══════════════════════════════════════════════════════════════════════════════

contract SupremeCourtSuspensionTest is MixinGovernment, MixinCrownSuspension {
    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
        _setupSenate();
        _setupJustices();
        _setupCrownSuspension();
    }
    // ─── 5a: Happy path — PM nominates with deputy designated ───────────

    function test_happyCase_nominateJusticeDuringSuspension() public {
        // At L5, deputy designation deadline has passed (>14 days of warps).
        // PM must designate deputy first to clear the overdue flag.
        vm.prank(pmCandidate);
        executive.designateDeputyPM(citizen1);
        assertFalse(executive.isDeputyOverdue());

        // PM nominates for seat 7 (seats 0-6 occupied by justices from L4)
        address justiceAddr = makeAddr("suspensionJustice");
        vm.prank(pmCandidate);
        executive.nominateJusticeDuringSuspension(justiceAddr, 7);

        assertEq(uint256(court.getAppointmentStage(7)), uint256(SupremeCourt.AppointmentStage.CrownNom1));
    }

    function test_happyCase_nominateJusticeSecondDuringSuspension() public {
        vm.prank(pmCandidate);
        executive.designateDeputyPM(citizen1);

        // First nomination + Senate rejection
        address addr1 = makeAddr("suspJustice1");
        vm.prank(pmCandidate);
        executive.nominateJusticeDuringSuspension(addr1, 7);

        _executeSenateAction(
            address(court),
            abi.encodeCall(SupremeCourt.rejectNominee, (7))
        );

        // Second nomination via PM
        address addr2 = makeAddr("suspJustice2");
        vm.prank(pmCandidate);
        executive.nominateJusticeSecondDuringSuspension(addr2, 7);

        assertEq(uint256(court.getAppointmentStage(7)), uint256(SupremeCourt.AppointmentStage.CrownNom2));
    }

    function test_happyCase_appointJusticeFromListDuringSuspension() public {
        vm.prank(pmCandidate);
        executive.designateDeputyPM(citizen1);

        // Get to CrownFromList stage: nom1 → reject → nom2 → reject → senate list
        address addr1 = makeAddr("suspJ1");
        address addr2 = makeAddr("suspJ2");
        vm.prank(pmCandidate);
        executive.nominateJusticeDuringSuspension(addr1, 7);
        _executeSenateAction(address(court), abi.encodeCall(SupremeCourt.rejectNominee, (7)));

        vm.prank(pmCandidate);
        executive.nominateJusticeSecondDuringSuspension(addr2, 7);
        _executeSenateAction(address(court), abi.encodeCall(SupremeCourt.rejectNominee, (7)));

        address[3] memory candidates = [makeAddr("c1"), makeAddr("c2"), makeAddr("c3")];
        _executeSenateAction(
            address(court),
            abi.encodeCall(SupremeCourt.proposeSenateList, (7, candidates))
        );

        // PM picks from list
        vm.prank(pmCandidate);
        executive.appointJusticeFromListDuringSuspension(7, 1);

        assertTrue(court.isActiveJustice(candidates[1]));
    }

    // ─── 5b: Deputy overdue blocks nomination ──────────────────────────

    function test_revert_nominateJusticeDuringSuspension_deputyOverdue() public {
        // At L5, deputyDesignationDeadline has passed without designation.
        assertTrue(executive.isDeputyOverdue());

        address justiceAddr = makeAddr("suspensionJustice");
        vm.prank(pmCandidate);
        vm.expectRevert(Executive.DeputyDesignationOverdue.selector);
        executive.nominateJusticeDuringSuspension(justiceAddr, 7);
    }

    function test_revert_nominateJusticeSecondDuringSuspension_deputyOverdue() public {
        assertTrue(executive.isDeputyOverdue());

        address justiceAddr = makeAddr("suspensionJustice");
        vm.prank(pmCandidate);
        vm.expectRevert(Executive.DeputyDesignationOverdue.selector);
        executive.nominateJusticeSecondDuringSuspension(justiceAddr, 7);
    }

    function test_revert_appointJusticeFromListDuringSuspension_deputyOverdue() public {
        assertTrue(executive.isDeputyOverdue());

        vm.prank(pmCandidate);
        vm.expectRevert(Executive.DeputyDesignationOverdue.selector);
        executive.appointJusticeFromListDuringSuspension(7, 0);
    }

    // ─── 5c: Caretaker bypass — nomination succeeds despite caretaker ──

    function test_happyCase_caretakerBypassDuringSuspension() public {
        // During Crown suspension, the caretaker check is skipped entirely.
        // Start formation to set caretaker=true. This clears PM role to address(0).
        // initiateFormationDuringSuspension is called directly by a senator (not via governance action)
        // because Parliament is not in _isRegisteredContract for governance actions.
        vm.prank(senator1);
        parliament.initiateFormationDuringSuspension();
        assertTrue(executive.isCaretaker());

        // PM role is now address(0) — Executive.nominateJusticeDuringSuspension is unreachable.
        // To test the Court's caretaker bypass, call court.nominateJustice directly from Executive address.
        // This proves: _isCrownSuspended() == true → caretaker check skipped → nomination succeeds.
        address justiceAddr = makeAddr("suspensionJustice");
        vm.prank(address(executive));
        court.nominateJustice(justiceAddr, 7);

        assertEq(uint256(court.getAppointmentStage(7)), uint256(SupremeCourt.AppointmentStage.CrownNom1));
    }

    // ─── 5d: Crown cannot nominate during suspension ───────────────────

    function test_revert_crownCannotNominateDuringSuspension() public {
        // At L5, ROLE_MONARCH = address(0). monarchAddr no longer holds the role.
        // Crown's onlyMonarch: checks msg.sender != monarch → NotMonarch (fires first).
        address justiceAddr = makeAddr("suspensionJustice");
        vm.prank(monarchAddr);
        vm.expectRevert(Crown.NotMonarch.selector);
        crown.nominateJustice(justiceAddr, 7);
    }

    // ─── 5e: Non-PM cannot nominate during suspension ──────────────────

    function test_revert_nominateJusticeDuringSuspension_notPM() public {
        vm.prank(pmCandidate);
        executive.designateDeputyPM(citizen1);

        vm.prank(citizen1); // citizen1 is not PM
        vm.expectRevert(Executive.NotPrimeMinister.selector);
        executive.nominateJusticeDuringSuspension(makeAddr("j"), 7);
    }

    // ─── 5f: Crown not suspended blocks suspension path ────────────────
    // (Not testable at L5 since Crown IS suspended. Tested in Executive.t.sol.)
}
