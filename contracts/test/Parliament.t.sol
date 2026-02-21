// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./helpers/TestBase.sol";
import "./helpers/MixinMajlis.sol";
import "./helpers/MixinGovernment.sol";
import "./helpers/MixinCaretaker.sol";
import "./helpers/MixinSenate.sol";
import "./helpers/MixinJustices.sol";
import "./helpers/MixinCrownSuspension.sol";

// ═══════════════════════════════════════════════════════════════════════════
// ParliamentBaseTest — GovTestBase (L0)
//
// Constructor, member seating, bill lifecycle, terms, dissolution,
// stagger, by-elections, self-enforcing terms.
// Members seated ad-hoc via vm.prank(address(election)) (legitimate contract call).
// Crown actions via vm.prank(monarchAddr); crown.FUNCTION().
// Court actions via vm.prank(address(court)) (legitimate contract call).
// ═══════════════════════════════════════════════════════════════════════════
contract ParliamentBaseTest is GovTestBase {
    // Events
    event MemberSeated(address indexed member, Parliament.Chamber chamber);
    event MemberRemoved(address indexed member, Parliament.Chamber chamber);
    event BillSubmitted(uint256 indexed billId, address indexed sponsor, bytes32 contentHash);
    event BillVoteCast(uint256 indexed billId, address indexed voter, bool support, Parliament.Chamber chamber);
    event BillStatusChanged(uint256 indexed billId, Parliament.BillStatus oldStatus, Parliament.BillStatus newStatus);
    event MajlisDissolution(uint256 timestamp);
    event SenateStaggerInitialized(uint256 senatorCount, uint256 timestamp);

    // Convenience aliases
    address internal majlis1;
    address internal majlis2;
    address internal majlis3;
    address internal majlis4;
    address internal majlis5;
    address internal sen1;
    address internal sen2;
    address internal sen3;

    // Additional senators for stagger testing (need ≥9 for meaningful cohort distribution)
    address internal sen4;
    address internal sen5;
    address internal sen6;
    address internal sen7;
    address internal sen8;
    address internal sen9;

    address internal unauthorized = makeAddr("unauthorized");

    bytes32 internal constant BILL_HASH = keccak256("Tax Reform Act");
    bytes32 internal constant BUDGET_HASH = keccak256("Annual Budget 1404");
    // Pre-computed to avoid external call in abi.encodeCall consuming vm.prank
    bytes32 internal constant MAJLIS_TERM_KEY = keccak256("MAJLIS_TERM");

    function setUp() public virtual override {
        super.setUp();

        // Map actors
        majlis1 = citizen1;
        majlis2 = citizen2;
        majlis3 = citizen3;
        majlis4 = citizen4;
        majlis5 = citizen5;
        sen1 = citizen6;
        sen2 = citizen7;
        sen3 = makeAddr("sen3");
        sen4 = makeAddr("sen4");
        sen5 = makeAddr("sen5");
        sen6 = makeAddr("sen6");
        sen7 = makeAddr("sen7");
        sen8 = makeAddr("sen8");
        sen9 = makeAddr("sen9");

        // Register extra senate addresses as citizens (needed for seatMember validation)
        address[] memory extraCitizens = new address[](7);
        extraCitizens[0] = sen3;
        extraCitizens[1] = sen4;
        extraCitizens[2] = sen5;
        extraCitizens[3] = sen6;
        extraCitizens[4] = sen7;
        extraCitizens[5] = sen8;
        extraCitizens[6] = sen9;
        vm.startPrank(authorityKey);
        for (uint256 i = 0; i < extraCitizens.length; i++) {
            registry.registerCitizen(extraCitizens[i], keccak256(abi.encodePacked("extra", i)), 1);
        }
        vm.stopPrank();
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    function _seatMajlis(address member) internal {
        vm.prank(address(election));
        parliament.seatMember(member, Parliament.Chamber.Majlis);
    }

    function _seatSenate(address member) internal {
        vm.prank(address(election));
        parliament.seatMember(member, Parliament.Chamber.Senate);
    }

    function _seatCrownSenator(address senator) internal {
        address[] memory senators = new address[](1);
        senators[0] = senator;
        vm.prank(monarchAddr);
        crown.appointSenators(senators);
    }

    function _seatFullParliament() internal {
        _seatMajlis(majlis1);
        _seatMajlis(majlis2);
        _seatMajlis(majlis3);
        _seatMajlis(majlis4);
        _seatMajlis(majlis5);
        _seatSenate(sen1);
        _seatSenate(sen2);
        _seatSenate(sen3);
    }

    function _seatNineSenators() internal {
        _seatSenate(sen1);
        _seatSenate(sen2);
        _seatSenate(sen3);
        _seatSenate(sen4);
        _seatSenate(sen5);
        _seatSenate(sen6);
        _seatSenate(sen7);
        _seatSenate(sen8);
        _seatSenate(sen9);
    }

    function _getSenatorArray9() internal view returns (address[] memory) {
        address[] memory senators = new address[](9);
        senators[0] = sen1;
        senators[1] = sen2;
        senators[2] = sen3;
        senators[3] = sen4;
        senators[4] = sen5;
        senators[5] = sen6;
        senators[6] = sen7;
        senators[7] = sen8;
        senators[8] = sen9;
        return senators;
    }

    function _submitAndPassMajlis(bytes32 hash) internal returns (uint256 billId) {
        vm.prank(majlis1);
        billId = parliament.submitBill(hash, "Test bill");

        vm.prank(majlis1);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis2);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis3);
        parliament.voteMajlis(billId, true);
        // 3/5 = 60% ≥ 50% quorum

        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);
    }

    function _passSenate(uint256 billId) internal {
        vm.prank(sen1);
        parliament.voteSenate(billId, true);
        vm.prank(sen2);
        parliament.voteSenate(billId, true);
        // 2/3 = 67% ≥ 50% quorum

        _warpForward(3 days);
        parliament.finalizeSenateVote(billId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. CONSTRUCTION
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_constructor() public view {
        assertEq(address(parliament.constitution()), address(constitution));
        assertEq(parliament.majlisMemberCount(), 0);
        assertEq(parliament.senateMemberCount(), 0);
        assertFalse(parliament.dissolved());
    }

    function test_revert_constructor_zeroAddress() public {
        vm.expectRevert(Parliament.ZeroAddress.selector);
        new Parliament(address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. MEMBER SEATING
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_seatMajlisMember() public {
        _seatMajlis(majlis1);

        assertTrue(parliament.isMajlisMember(majlis1));
        assertEq(parliament.majlisMemberCount(), 1);
    }

    function test_happyCase_seatSenateMember() public {
        _seatSenate(sen1);

        assertTrue(parliament.isSenateMember(sen1));
        assertEq(parliament.senateMemberCount(), 1);
    }

    function test_happyCase_seatMember_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit MemberSeated(majlis1, Parliament.Chamber.Majlis);

        _seatMajlis(majlis1);
    }

    function test_happyCase_seatCrownSenator() public {
        // First seat 9 regular senators so 10% cap allows 1 Crown senator
        _seatNineSenators();

        // Crown appoints a senator via monarch → crown.appointSenators
        address crownSenator = makeAddr("crownSenator");
        vm.prank(authorityKey);
        registry.registerCitizen(crownSenator, keccak256("crownSen"), 1);
        _seatCrownSenator(crownSenator);

        assertTrue(parliament.isSenateMember(crownSenator));
        assertEq(parliament.crownSenatorCount(), 1);
    }

    function test_revert_seatCrownSenator_capExceeded() public {
        // Only 1 regular senator — Crown can't appoint more (10% of 2 = 0)
        _seatSenate(sen1);

        address crownSenator = makeAddr("crownSenator");
        vm.prank(authorityKey);
        registry.registerCitizen(crownSenator, keccak256("crownSen"), 1);

        address[] memory senators = new address[](1);
        senators[0] = crownSenator;
        vm.prank(monarchAddr);
        vm.expectRevert(Parliament.CrownSenatorCapExceeded.selector);
        crown.appointSenators(senators);
    }

    function test_revert_seatMember_alreadyMember() public {
        _seatMajlis(majlis1);

        vm.prank(address(election));
        vm.expectRevert(abi.encodeWithSelector(Parliament.AlreadyMember.selector, majlis1));
        parliament.seatMember(majlis1, Parliament.Chamber.Majlis);
    }

    function test_modifier_seatMember_onlyElection() public {
        vm.prank(unauthorized);
        vm.expectRevert(Parliament.NotAuthorized.selector);
        parliament.seatMember(majlis1, Parliament.Chamber.Majlis);
    }

    function test_happyCase_removeMember() public {
        _seatMajlis(majlis1);

        vm.prank(address(court));
        parliament.removeMember(majlis1, Parliament.Chamber.Majlis);

        assertFalse(parliament.isMajlisMember(majlis1));
        assertEq(parliament.majlisMemberCount(), 0);
    }

    function test_revert_removeMember_notActive() public {
        vm.prank(address(court));
        vm.expectRevert(abi.encodeWithSelector(Parliament.NotActiveMember.selector, majlis1));
        parliament.removeMember(majlis1, Parliament.Chamber.Majlis);
    }

    function test_modifier_removeMember_onlySupremeCourt() public {
        _seatMajlis(majlis1);

        vm.prank(address(election));
        vm.expectRevert(Parliament.NotAuthorized.selector);
        parliament.removeMember(majlis1, Parliament.Chamber.Majlis);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. BILL SUBMISSION
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_submitBill() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 billId = parliament.submitBill(BILL_HASH, "Tax Reform");

        assertEq(billId, 0);
        assertEq(parliament.billCount(), 1);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.MajlisVoting));
    }

    function test_happyCase_submitBill_emitsEvent() public {
        _seatFullParliament();

        vm.expectEmit(true, true, false, true);
        emit BillSubmitted(0, majlis1, BILL_HASH);

        vm.prank(majlis1);
        parliament.submitBill(BILL_HASH, "Tax Reform");
    }

    function test_revert_submitBill_emptyContent() public {
        _seatFullParliament();

        vm.prank(majlis1);
        vm.expectRevert(Parliament.EmptyContent.selector);
        parliament.submitBill(bytes32(0), "Empty");
    }

    function test_modifier_submitBill_onlyMajlis() public {
        _seatFullParliament();

        // Senator cannot submit
        vm.prank(sen1);
        vm.expectRevert(Parliament.NotMajlisMember.selector);
        parliament.submitBill(BILL_HASH, "Tax Reform");
    }

    function test_modifier_submitBill_notDissolved() public {
        _seatFullParliament();

        // Dissolve via Crown
        vm.prank(monarchAddr);
        crown.declareDissolution();

        vm.prank(majlis1);
        vm.expectRevert(Parliament.MajlisDissolved.selector);
        parliament.submitBill(BILL_HASH, "Tax Reform");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. MAJLIS VOTING
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_voteMajlis() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 billId = parliament.submitBill(BILL_HASH, "Tax Reform");

        vm.prank(majlis1);
        parliament.voteMajlis(billId, true);

        (uint256 majYes, uint256 majNo,,) = parliament.getBillVotes(billId);
        assertEq(majYes, 1);
        assertEq(majNo, 0);
    }

    function test_revert_voteMajlis_alreadyVoted() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 billId = parliament.submitBill(BILL_HASH, "Tax Reform");

        vm.prank(majlis1);
        parliament.voteMajlis(billId, true);

        vm.prank(majlis1);
        vm.expectRevert(abi.encodeWithSelector(Parliament.AlreadyVoted.selector, billId, majlis1));
        parliament.voteMajlis(billId, true);
    }

    function test_happyCase_finalizeMajlisVote_passes() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);

        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.SenateReview));
    }

    function test_happyCase_finalizeMajlisVote_fails() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 billId = parliament.submitBill(BILL_HASH, "Tax Reform");

        // 2 no, 1 yes → fails
        vm.prank(majlis1);
        parliament.voteMajlis(billId, false);
        vm.prank(majlis2);
        parliament.voteMajlis(billId, false);
        vm.prank(majlis3);
        parliament.voteMajlis(billId, true);

        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Rejected));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. SENATE REVIEW
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_senateApproves() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);

        _passSenate(billId);

        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.CrownAction));
    }

    function test_happyCase_senateObjects() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);

        // Senate objects: 2 no, 1 yes
        vm.prank(sen1);
        parliament.voteSenate(billId, false);
        vm.prank(sen2);
        parliament.voteSenate(billId, false);
        vm.prank(sen3);
        parliament.voteSenate(billId, true);

        _warpForward(3 days);
        parliament.finalizeSenateVote(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.SenateObjected));
    }

    function test_modifier_voteSenate_onlySenateMember() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);

        vm.prank(majlis1);
        vm.expectRevert(Parliament.NotSenateMember.selector);
        parliament.voteSenate(billId, true);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. SENATE TIMEOUT
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_senateTimeout() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);

        // Warp past Senate review period (30 days)
        _warpForward(30 days + 1);

        parliament.claimSenateTimeout(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.CrownAction));
    }

    function test_revert_senateTimeout_tooEarly() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);

        vm.expectRevert(Parliament.SenateReviewNotExpired.selector);
        parliament.claimSenateTimeout(billId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6b. CROWN TIMEOUT
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_claimCrownTimeout() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.CrownAction));

        // Warp past Crown deadline (14 days)
        _warpForward(14 days + 1);

        parliament.claimCrownTimeout(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Enacted));
    }

    function test_revert_claimCrownTimeout_tooEarly() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        vm.expectRevert(Parliament.DeadlineNotExpired.selector);
        parliament.claimCrownTimeout(billId);
    }

    function test_revert_claimCrownTimeout_wrongStatus() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);

        // Bill is in SenateReview, not CrownAction
        vm.expectRevert(abi.encodeWithSelector(
            Parliament.BillNotInStatus.selector,
            billId,
            Parliament.BillStatus.CrownAction
        ));
        parliament.claimCrownTimeout(billId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 7. SENATE OBJECTION → MAJLIS OVERRIDE
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_majlisOverride() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);

        // Senate objects
        vm.prank(sen1);
        parliament.voteSenate(billId, false);
        vm.prank(sen2);
        parliament.voteSenate(billId, false);
        _warpForward(3 days);
        parliament.finalizeSenateVote(billId);

        // Start override
        vm.prank(majlis1);
        parliament.startMajlisOverride(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.MajlisOverride));

        // Re-vote with absolute majority (3 of 5 = more than half)
        vm.prank(majlis1);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis2);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis3);
        parliament.voteMajlis(billId, true);

        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.CrownAction));
    }

    function test_happyCase_majlisOverride_fails() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);

        // Senate objects
        vm.prank(sen1);
        parliament.voteSenate(billId, false);
        vm.prank(sen2);
        parliament.voteSenate(billId, false);
        _warpForward(3 days);
        parliament.finalizeSenateVote(billId);

        // Start override
        vm.prank(majlis1);
        parliament.startMajlisOverride(billId);

        // Only 2 of 5 vote yes (not absolute majority)
        vm.prank(majlis1);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis2);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis3);
        parliament.voteMajlis(billId, false);

        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Rejected));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 8. CROWN ACTION
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_markEnacted() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        vm.prank(monarchAddr);
        crown.enactLaw(billId);

        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Enacted));
    }

    function test_happyCase_markReturned() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        vm.prank(monarchAddr);
        crown.returnLaw(billId);

        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Returned));
    }

    function test_happyCase_markReferred() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        // Crown must return first, then Majlis re-adopts, then Crown can refer (Art. II.5.3)
        vm.prank(monarchAddr);
        crown.returnLaw(billId);

        // Majlis re-adopts
        vm.prank(majlis1);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis2);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis3);
        parliament.voteMajlis(billId, true);
        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);

        // Now Crown can refer the re-adopted bill
        vm.prank(monarchAddr);
        crown.referToSupremeCourt(billId);

        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Referred));
    }

    function test_revert_markReferred_notReturned() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        // Crown tries to refer without returning first
        vm.prank(monarchAddr);
        vm.expectRevert(abi.encodeWithSelector(
            Parliament.BillNotInStatus.selector,
            billId,
            Parliament.BillStatus.Returned
        ));
        crown.referToSupremeCourt(billId);
    }

    function test_happyCase_markConstitutional() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        // Return → re-adopt → refer (full path to Referred status)
        vm.prank(monarchAddr);
        crown.returnLaw(billId);
        vm.prank(majlis1);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis2);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis3);
        parliament.voteMajlis(billId, true);
        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);
        vm.prank(monarchAddr);
        crown.referToSupremeCourt(billId);

        // Court finds it constitutional → Enacted
        vm.prank(address(court));
        parliament.markConstitutional(billId);

        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Enacted));
    }

    function test_happyCase_markVetoed() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        // Return → re-adopt → refer
        vm.prank(monarchAddr);
        crown.returnLaw(billId);
        vm.prank(majlis1);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis2);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis3);
        parliament.voteMajlis(billId, true);
        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);
        vm.prank(monarchAddr);
        crown.referToSupremeCourt(billId);

        // Court finds it unconstitutional → Vetoed
        vm.prank(address(court));
        parliament.markVetoed(billId);

        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Vetoed));
    }

    function test_revert_markConstitutional_wrongStatus() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        // Bill is in CrownAction, not Referred
        vm.prank(address(court));
        vm.expectRevert(abi.encodeWithSelector(
            Parliament.BillNotInStatus.selector,
            billId,
            Parliament.BillStatus.Referred
        ));
        parliament.markConstitutional(billId);
    }

    function test_modifier_markConstitutional_onlySupremeCourt() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        // Return → re-adopt → refer
        vm.prank(monarchAddr);
        crown.returnLaw(billId);
        vm.prank(majlis1);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis2);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis3);
        parliament.voteMajlis(billId, true);
        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);
        vm.prank(monarchAddr);
        crown.referToSupremeCourt(billId);

        vm.prank(unauthorized);
        vm.expectRevert(Parliament.NotAuthorized.selector);
        parliament.markConstitutional(billId);
    }

    function test_modifier_markEnacted_onlyCrown() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        vm.prank(unauthorized);
        vm.expectRevert(Parliament.NotAuthorized.selector);
        parliament.markEnacted(billId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 9. CROWN RETURN → RE-ADOPTION
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_returnAndReAdopt() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        // Crown returns
        vm.prank(monarchAddr);
        crown.returnLaw(billId);

        // Majlis re-votes
        vm.prank(majlis1);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis2);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis3);
        parliament.voteMajlis(billId, true);

        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);
        // Goes back to CrownAction with crownReturned = true
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.CrownAction));
    }

    function test_revert_returnTwice() public {
        _seatFullParliament();
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        // First return
        vm.prank(monarchAddr);
        crown.returnLaw(billId);

        // Re-adopt
        vm.prank(majlis1);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis2);
        parliament.voteMajlis(billId, true);
        vm.prank(majlis3);
        parliament.voteMajlis(billId, true);
        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);

        // Crown tries to return again — bill crownReturned=true, markReturned checks !crownReturned
        vm.prank(monarchAddr);
        vm.expectRevert(abi.encodeWithSelector(
            Parliament.BillNotInStatus.selector,
            billId,
            Parliament.BillStatus.CrownAction
        ));
        crown.returnLaw(billId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 10. DISSOLUTION
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_dissolveMajlis() public {
        vm.prank(monarchAddr);
        crown.declareDissolution();

        assertTrue(parliament.dissolved());
    }

    function test_happyCase_restoreMajlis() public {
        vm.prank(monarchAddr);
        crown.declareDissolution();

        vm.prank(address(election));
        parliament.restoreMajlis();

        assertFalse(parliament.dissolved());
    }

    function test_modifier_dissolveMajlis_onlyCrownOrExecutive() public {
        vm.prank(unauthorized);
        vm.expectRevert(Parliament.NotAuthorized.selector);
        parliament.dissolveMajlis();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BOUNDARY TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_boundary_invalidBillId() public {
        vm.expectRevert(Parliament.InvalidBillId.selector);
        parliament.getBillStatus(0);
    }

    function test_happyCase_multipleBills() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 billId1 = parliament.submitBill(BILL_HASH, "Bill 1");
        vm.prank(majlis2);
        uint256 billId2 = parliament.submitBill(keccak256("Bill 2"), "Bill 2");

        assertEq(billId1, 0);
        assertEq(billId2, 1);
        assertEq(parliament.billCount(), 2);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 13. TERM MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_expireMajlisMember() public {
        _seatFullParliament();
        assertEq(parliament.majlisMemberCount(), 5);

        uint256 majlisTerm = constitution.getParameter(MAJLIS_TERM_KEY);
        _warpForward(majlisTerm + 1);

        assertTrue(parliament.isTermExpired(majlis1, Parliament.Chamber.Majlis));

        parliament.expireMember(majlis1, Parliament.Chamber.Majlis);
        assertFalse(parliament.isMajlisMember(majlis1));
        assertEq(parliament.majlisMemberCount(), 4);
    }

    function test_happyCase_expireSenateMember() public {
        _seatFullParliament();

        uint256 senateTerm = constitution.getParameter(constitution.PARAM_SENATE_TERM());
        _warpForward(senateTerm + 1);

        assertTrue(parliament.isTermExpired(sen1, Parliament.Chamber.Senate));

        parliament.expireMember(sen1, Parliament.Chamber.Senate);
        assertFalse(parliament.isSenateMember(sen1));
        assertEq(parliament.senateMemberCount(), 2);
        // Full term expiry does NOT create a by-election vacancy
        assertEq(parliament.senateVacancyCount(), 0);
    }

    function test_revert_expireMember_termNotExpired() public {
        _seatFullParliament();

        assertFalse(parliament.isTermExpired(majlis1, Parliament.Chamber.Majlis));

        vm.expectRevert(Parliament.TermNotExpired.selector);
        parliament.expireMember(majlis1, Parliament.Chamber.Majlis);
    }

    function test_revert_expireMember_notActive() public {
        vm.expectRevert(abi.encodeWithSelector(Parliament.NotActiveMember.selector, unauthorized));
        parliament.expireMember(unauthorized, Parliament.Chamber.Majlis);
    }

    function test_happyCase_senateNonRenewability() public {
        _seatFullParliament();

        // Expire sen1's term
        uint256 senateTerm = constitution.getParameter(constitution.PARAM_SENATE_TERM());
        _warpForward(senateTerm + 1);
        parliament.expireMember(sen1, Parliament.Chamber.Senate);

        // Try to re-seat sen1 — should fail
        vm.prank(address(election));
        vm.expectRevert(abi.encodeWithSelector(Parliament.SenateNonRenewable.selector, sen1));
        parliament.seatMember(sen1, Parliament.Chamber.Senate);
    }

    function test_happyCase_senateNonRenewability_crownSenator() public {
        // Seat 9 regular senators so 10% cap allows Crown appointment
        _seatNineSenators();

        address crownSenator = makeAddr("crownSenator");
        vm.prank(authorityKey);
        registry.registerCitizen(crownSenator, keccak256("crownSen"), 1);
        _seatCrownSenator(crownSenator);
        assertEq(parliament.crownSenatorCount(), 1);

        // Remove them
        vm.prank(address(court));
        parliament.removeMember(crownSenator, Parliament.Chamber.Senate);

        assertEq(parliament.crownSenatorCount(), 0);

        // Try to re-seat as Crown senator — should fail due to non-renewability
        address[] memory senators = new address[](1);
        senators[0] = crownSenator;
        vm.prank(monarchAddr);
        vm.expectRevert(abi.encodeWithSelector(Parliament.SenateNonRenewable.selector, crownSenator));
        crown.appointSenators(senators);
    }

    function test_happyCase_majlisCanBeReseated() public {
        _seatFullParliament();

        uint256 majlisTerm = constitution.getParameter(MAJLIS_TERM_KEY);
        _warpForward(majlisTerm + 1);
        parliament.expireMember(majlis1, Parliament.Chamber.Majlis);

        // Can be re-seated (no non-renewability for Majlis)
        vm.prank(address(election));
        parliament.seatMember(majlis1, Parliament.Chamber.Majlis);
        assertTrue(parliament.isMajlisMember(majlis1));
    }

    function test_happyCase_isTermExpired_notMember() public view {
        assertFalse(parliament.isTermExpired(unauthorized, Parliament.Chamber.Majlis));
        assertFalse(parliament.isTermExpired(unauthorized, Parliament.Chamber.Senate));
    }

    function test_happyCase_senateTermEnd_setOnSeat() public {
        _seatSenate(sen1);

        uint256 senateTerm = constitution.getParameter(constitution.PARAM_SENATE_TERM());
        assertEq(parliament.senateTermEnd(sen1), block.timestamp + senateTerm);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 16. DISSOLUTION ELECTION DEADLINE (Art. VIII.7.1)
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_claimDissolutionElectionTimeout() public {
        // Dissolve the Majlis via Crown
        vm.prank(monarchAddr);
        crown.declareDissolution();
        assertTrue(parliament.dissolved());
        assertGt(parliament.dissolvedAt(), 0);

        // Warp past the 60-day deadline
        uint256 deadline = constitution.getParameter(constitution.PARAM_DISSOLUTION_ELECTION_DEADLINE());
        _warpForward(deadline);

        // Anyone can claim the timeout — Parliament calls Election.startMajlisElection for each province
        parliament.claimDissolutionElectionTimeout();
        assertEq(parliament.pendingMajlisElections(), 3);
    }

    function test_revert_claimDissolutionElectionTimeout_notDissolved() public {
        vm.expectRevert(Parliament.NotDissolved.selector);
        parliament.claimDissolutionElectionTimeout();
    }

    function test_revert_claimDissolutionElectionTimeout_tooEarly() public {
        vm.prank(monarchAddr);
        crown.declareDissolution();

        vm.expectRevert(Parliament.DissolutionElectionDeadlineNotReached.selector);
        parliament.claimDissolutionElectionTimeout();
    }

    function test_revert_claimDissolutionElectionTimeout_alreadyTriggered() public {
        vm.prank(monarchAddr);
        crown.declareDissolution();

        uint256 deadline = constitution.getParameter(constitution.PARAM_DISSOLUTION_ELECTION_DEADLINE());
        _warpForward(deadline);

        parliament.claimDissolutionElectionTimeout();

        // Try again — should fail
        vm.expectRevert(Parliament.DissolutionElectionAlreadyTriggered.selector);
        parliament.claimDissolutionElectionTimeout();
    }

    function test_happyCase_dissolveMajlis_recordsTimestamp() public {
        uint256 ts = block.timestamp;
        vm.prank(monarchAddr);
        crown.declareDissolution();
        assertEq(parliament.dissolvedAt(), ts);
    }

    function test_happyCase_restoreMajlis_clearsTimestamp() public {
        vm.prank(monarchAddr);
        crown.declareDissolution();
        assertGt(parliament.dissolvedAt(), 0);

        vm.prank(address(election));
        parliament.restoreMajlis();
        assertEq(parliament.dissolvedAt(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 17. SELF-ENFORCING TERMS
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_isActiveMajlisMember() public {
        _seatMajlis(majlis1);
        assertTrue(parliament.isActiveMajlisMember(majlis1));

        uint256 majlisTerm = constitution.getParameter(MAJLIS_TERM_KEY);
        _warpForward(majlisTerm + 1);
        assertFalse(parliament.isActiveMajlisMember(majlis1));

        // isMajlisMember still returns true (storage not cleaned up)
        assertTrue(parliament.isMajlisMember(majlis1));
    }

    function test_happyCase_isActiveSenateMember() public {
        _seatSenate(sen1);
        assertTrue(parliament.isActiveSenateMember(sen1));

        uint256 senateTerm = constitution.getParameter(constitution.PARAM_SENATE_TERM());
        _warpForward(senateTerm + 1);
        assertFalse(parliament.isActiveSenateMember(sen1));
        assertTrue(parliament.isSenateMember(sen1));
    }

    function test_revert_expiredMajlisMember_cannotVote() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 billId = parliament.submitBill(BILL_HASH, "Tax Reform");

        uint256 majlisTerm = constitution.getParameter(MAJLIS_TERM_KEY);
        _warpForward(majlisTerm + 1);

        vm.prank(majlis1);
        vm.expectRevert(Parliament.NotMajlisMember.selector);
        parliament.voteMajlis(billId, true);
    }

    function test_revert_expiredMajlisMember_cannotSubmitBill() public {
        _seatFullParliament();

        uint256 majlisTerm = constitution.getParameter(MAJLIS_TERM_KEY);
        _warpForward(majlisTerm + 1);

        vm.prank(majlis1);
        vm.expectRevert(Parliament.NotMajlisMember.selector);
        parliament.submitBill(BILL_HASH, "Tax Reform");
    }

    function test_revert_expiredSenateMember_cannotVote() public {
        _seatFullParliament();

        // Submit and pass a bill through Majlis while still active
        vm.prank(majlis1);
        uint256 billId = parliament.submitBill(BILL_HASH, "Tax Reform");
        vm.prank(majlis1); parliament.voteMajlis(billId, true);
        vm.prank(majlis2); parliament.voteMajlis(billId, true);
        vm.prank(majlis3); parliament.voteMajlis(billId, true);
        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);

        // Now expire the Senate term
        uint256 senateTerm = constitution.getParameter(constitution.PARAM_SENATE_TERM());
        _warpForward(senateTerm + 1);

        vm.prank(sen1);
        vm.expectRevert(Parliament.NotSenateMember.selector);
        parliament.voteSenate(billId, true);
    }

    function test_happyCase_isActiveMember_nonMember() public view {
        assertFalse(parliament.isActiveMajlisMember(unauthorized));
        assertFalse(parliament.isActiveSenateMember(unauthorized));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 18. BY-ELECTIONS (Art. VIII.8)
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_removeMember_tracksVacancy() public {
        _seatFullParliament();

        assertEq(parliament.majlisVacancyCount(), 0);

        // Remove a Majlis member mid-term
        vm.prank(address(court));
        parliament.removeMember(majlis1, Parliament.Chamber.Majlis);

        assertEq(parliament.majlisVacancyCount(), 1);
        assertGt(parliament.lastMajlisVacancyAt(), 0);
        assertFalse(parliament.byElectionTriggeredMajlis());
    }

    function test_happyCase_claimByElectionTimeout_majlis() public {
        // Seat Majlis members with province tracking
        vm.prank(address(election));
        parliament.seatMajlisMemberWithProvince(majlis1, 1);
        vm.prank(address(election));
        parliament.seatMajlisMemberWithProvince(majlis2, 1);
        _seatSenate(sen1);
        _seatSenate(sen2);
        _seatSenate(sen3);

        // Remove a Majlis member (province-tracked vacancy)
        vm.prank(address(court));
        parliament.removeMember(majlis1, Parliament.Chamber.Majlis);

        // Warp past 90-day deadline
        uint256 deadline = constitution.getParameter(constitution.PARAM_BY_ELECTION_DEADLINE());
        _warpForward(deadline);

        // Parliament calls Election.startMajlisElection for provinces with vacancies
        parliament.claimByElectionTimeout(Parliament.Chamber.Majlis);
        assertTrue(parliament.byElectionTriggeredMajlis());
    }

    function test_happyCase_claimByElectionTimeout_senate() public {
        _seatFullParliament();

        // Remove a Senate member
        vm.prank(address(court));
        parliament.removeMember(sen1, Parliament.Chamber.Senate);

        uint256 deadline = constitution.getParameter(constitution.PARAM_BY_ELECTION_DEADLINE());
        _warpForward(deadline);

        // Parliament calls Election.startElection(Senate)
        parliament.claimByElectionTimeout(Parliament.Chamber.Senate);
        assertTrue(parliament.byElectionTriggeredSenate());
    }

    function test_revert_claimByElectionTimeout_noVacancies() public {
        _seatFullParliament();

        vm.expectRevert(Parliament.NoVacancies.selector);
        parliament.claimByElectionTimeout(Parliament.Chamber.Majlis);
    }

    function test_revert_claimByElectionTimeout_tooEarly() public {
        _seatFullParliament();

        vm.prank(address(court));
        parliament.removeMember(majlis1, Parliament.Chamber.Majlis);

        vm.expectRevert(Parliament.ByElectionDeadlineNotReached.selector);
        parliament.claimByElectionTimeout(Parliament.Chamber.Majlis);
    }

    function test_revert_claimByElectionTimeout_alreadyTriggered() public {
        // Seat with province tracking
        vm.prank(address(election));
        parliament.seatMajlisMemberWithProvince(majlis1, 1);
        vm.prank(address(election));
        parliament.seatMajlisMemberWithProvince(majlis2, 1);
        _seatSenate(sen1);

        vm.prank(address(court));
        parliament.removeMember(majlis1, Parliament.Chamber.Majlis);

        uint256 deadline = constitution.getParameter(constitution.PARAM_BY_ELECTION_DEADLINE());
        _warpForward(deadline);

        parliament.claimByElectionTimeout(Parliament.Chamber.Majlis);

        // Second call should revert
        vm.expectRevert(Parliament.ByElectionAlreadyTriggered.selector);
        parliament.claimByElectionTimeout(Parliament.Chamber.Majlis);
    }

    function test_happyCase_seatMember_decrementsVacancy() public {
        _seatFullParliament();

        vm.prank(address(court));
        parliament.removeMember(majlis1, Parliament.Chamber.Majlis);
        assertEq(parliament.majlisVacancyCount(), 1);

        address newMember = makeAddr("newMajlis");
        vm.prank(authorityKey);
        registry.registerCitizen(newMember, keccak256("newMaj"), 1);
        vm.prank(address(election));
        parliament.seatMember(newMember, Parliament.Chamber.Majlis);
        assertEq(parliament.majlisVacancyCount(), 0);
    }

    function test_happyCase_restoreMajlis_resetsVacancies() public {
        _seatFullParliament();

        vm.prank(address(court));
        parliament.removeMember(majlis1, Parliament.Chamber.Majlis);
        assertEq(parliament.majlisVacancyCount(), 1);

        vm.prank(monarchAddr);
        crown.declareDissolution();

        vm.prank(address(election));
        parliament.restoreMajlis();
        assertEq(parliament.majlisVacancyCount(), 0);
        assertFalse(parliament.byElectionTriggeredMajlis());
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 18b. SIX-MONTH BY-ELECTION SKIP (Art. VIII.8.4)
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_removeMember_nearTermEnd_skipsVacancy() public {
        _seatMajlis(majlis1);

        // Warp to 3 months before term end (< 6 months remaining)
        uint256 termLength = constitution.getParameter(MAJLIS_TERM_KEY);
        _warpForward(termLength - 90 days);

        vm.prank(address(court));
        parliament.removeMember(majlis1, Parliament.Chamber.Majlis);

        assertEq(parliament.majlisVacancyCount(), 0);
    }

    function test_happyCase_removeMember_earlyInTerm_createsVacancy() public {
        _seatMajlis(majlis1);

        _warpForward(30 days);

        vm.prank(address(court));
        parliament.removeMember(majlis1, Parliament.Chamber.Majlis);

        assertEq(parliament.majlisVacancyCount(), 1);
    }

    function test_happyCase_removeSenator_nearTermEnd_skipsVacancy() public {
        _seatSenate(sen1);

        uint256 termLength = constitution.getParameter(constitution.PARAM_SENATE_TERM());
        _warpForward(termLength - 90 days);

        vm.prank(address(court));
        parliament.removeMember(sen1, Parliament.Chamber.Senate);

        assertEq(parliament.senateVacancyCount(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 19. SENATE STAGGER INITIALIZATION (Art. III.4.3)
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_initializeSenateStagger() public {
        _seatNineSenators();
        address[] memory senators = _getSenatorArray9();

        vm.prank(monarchAddr);
        crown.initializeSenateStagger(senators);

        assertTrue(parliament.senateStaggerInitialized());

        uint256 ts = block.timestamp;
        uint256[3] memory cohortCounts;
        for (uint256 i = 0; i < senators.length; i++) {
            uint256 termEnd = parliament.senateTermEnd(senators[i]);
            assertTrue(termEnd > 0, "senateTermEnd should be set");
            if (termEnd == ts + 2 * 365 days) cohortCounts[0]++;
            else if (termEnd == ts + 4 * 365 days) cohortCounts[1]++;
            else if (termEnd == ts + 6 * 365 days) cohortCounts[2]++;
            else revert("unexpected senateTermEnd value");
        }
        assertEq(cohortCounts[0] + cohortCounts[1] + cohortCounts[2], 9);
    }

    function test_happyCase_initializeSenateStagger_emitsEvent() public {
        _seatNineSenators();
        address[] memory senators = _getSenatorArray9();

        vm.expectEmit(false, false, false, true);
        emit SenateStaggerInitialized(9, block.timestamp);

        vm.prank(monarchAddr);
        crown.initializeSenateStagger(senators);
    }

    function test_revert_initializeSenateStagger_alreadyInitialized() public {
        _seatNineSenators();
        address[] memory senators = _getSenatorArray9();

        vm.prank(monarchAddr);
        crown.initializeSenateStagger(senators);

        vm.prank(monarchAddr);
        vm.expectRevert(Parliament.StaggerAlreadyInitialized.selector);
        crown.initializeSenateStagger(senators);
    }

    function test_revert_initializeSenateStagger_nonSenator() public {
        _seatNineSenators();
        address[] memory bad = new address[](1);
        bad[0] = unauthorized;

        vm.prank(monarchAddr);
        vm.expectRevert(abi.encodeWithSelector(Parliament.NotActiveMember.selector, unauthorized));
        crown.initializeSenateStagger(bad);
    }

    function test_modifier_initializeSenateStagger_onlyCrown() public {
        _seatNineSenators();
        address[] memory senators = _getSenatorArray9();

        vm.prank(unauthorized);
        vm.expectRevert(Parliament.NotAuthorized.selector);
        parliament.initializeSenateStagger(senators);
    }

    function test_happyCase_stagger_twoYearCohortExpires() public {
        _seatNineSenators();
        address[] memory senators = _getSenatorArray9();

        vm.prank(monarchAddr);
        crown.initializeSenateStagger(senators);

        _warpForward(2 * 365 days + 1);

        uint256 inactiveCount;
        for (uint256 i = 0; i < senators.length; i++) {
            if (!parliament.isActiveSenateMember(senators[i])) inactiveCount++;
        }

        assertTrue(inactiveCount > 0, "at least some senators should have expired at 2yr");
        assertTrue(inactiveCount < senators.length, "not all senators should have expired at 2yr");
    }

    function test_happyCase_stagger_fourYearCohortExpires() public {
        _seatNineSenators();
        address[] memory senators = _getSenatorArray9();

        vm.prank(monarchAddr);
        crown.initializeSenateStagger(senators);

        _warpForward(4 * 365 days + 1);

        uint256 inactiveCount;
        for (uint256 i = 0; i < senators.length; i++) {
            if (!parliament.isActiveSenateMember(senators[i])) inactiveCount++;
        }

        assertTrue(inactiveCount > 0, "more senators should have expired at 4yr");
    }

    function test_happyCase_stagger_sixYearAllExpire() public {
        _seatNineSenators();
        address[] memory senators = _getSenatorArray9();

        vm.prank(monarchAddr);
        crown.initializeSenateStagger(senators);

        _warpForward(6 * 365 days + 1);

        for (uint256 i = 0; i < senators.length; i++) {
            assertFalse(parliament.isActiveSenateMember(senators[i]), "all should be expired at 6yr");
        }
    }

    function test_happyCase_stagger_selfEnforcing_expiredCannotVote() public {
        _seatMajlis(majlis1);
        _seatMajlis(majlis2);
        _seatMajlis(majlis3);
        _seatNineSenators();
        address[] memory senators = _getSenatorArray9();

        vm.prank(monarchAddr);
        crown.initializeSenateStagger(senators);

        // Submit and pass a bill through Majlis
        vm.prank(majlis1);
        uint256 billId = parliament.submitBill(BILL_HASH, "Test bill");
        vm.prank(majlis1); parliament.voteMajlis(billId, true);
        vm.prank(majlis2); parliament.voteMajlis(billId, true);
        vm.prank(majlis3); parliament.voteMajlis(billId, true);
        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);

        // Warp past 6 years — all senators expired
        _warpForward(6 * 365 days + 1);

        vm.prank(sen1);
        vm.expectRevert(Parliament.NotSenateMember.selector);
        parliament.voteSenate(billId, true);
    }

    function test_happyCase_stagger_expireDoesNotCreateVacancy() public {
        _seatNineSenators();
        address[] memory senators = _getSenatorArray9();

        vm.prank(monarchAddr);
        crown.initializeSenateStagger(senators);

        assertEq(parliament.senateVacancyCount(), 0);

        _warpForward(6 * 365 days + 1);

        parliament.expireMember(sen1, Parliament.Chamber.Senate);
        assertEq(parliament.senateVacancyCount(), 0);
    }

    function test_happyCase_stagger_midTermRemovalCreatesVacancy() public {
        _seatNineSenators();
        address[] memory senators = _getSenatorArray9();

        vm.prank(monarchAddr);
        crown.initializeSenateStagger(senators);

        // Mid-term removal (not expiry) should create a vacancy
        vm.prank(address(court));
        parliament.removeMember(sen1, Parliament.Chamber.Senate);
        assertEq(parliament.senateVacancyCount(), 1);
        assertFalse(parliament.byElectionTriggeredSenate());
    }

    function test_happyCase_postInitialization_newSenatorGetsFreshTerm() public {
        _seatNineSenators();
        address[] memory senators = _getSenatorArray9();

        vm.prank(monarchAddr);
        crown.initializeSenateStagger(senators);

        // Warp 3 years, expire a 2yr-cohort senator, seat a new one
        _warpForward(3 * 365 days);

        address expiredSenator;
        for (uint256 i = 0; i < senators.length; i++) {
            if (!parliament.isActiveSenateMember(senators[i])) {
                expiredSenator = senators[i];
                break;
            }
        }
        if (expiredSenator == address(0)) return;

        parliament.expireMember(expiredSenator, Parliament.Chamber.Senate);

        address newSenator = makeAddr("newSenator");
        vm.prank(authorityKey);
        registry.registerCitizen(newSenator, keccak256("newSen"), 1);
        vm.prank(address(election));
        parliament.seatMember(newSenator, Parliament.Chamber.Senate);

        uint256 senateTerm = constitution.getParameter(constitution.PARAM_SENATE_TERM());
        assertEq(parliament.senateTermEnd(newSenator), block.timestamp + senateTerm);
        assertTrue(parliament.isActiveSenateMember(newSenator));
    }

    function test_happyCase_postInitialization_crownSenatorGetsFreshTerm() public {
        _seatNineSenators();
        address[] memory senators = _getSenatorArray9();

        vm.prank(monarchAddr);
        crown.initializeSenateStagger(senators);

        address crownSenator = makeAddr("crownSenatorStagger");
        vm.prank(authorityKey);
        registry.registerCitizen(crownSenator, keccak256("crownStagger"), 1);
        _seatCrownSenator(crownSenator);

        uint256 senateTerm = constitution.getParameter(constitution.PARAM_SENATE_TERM());
        assertEq(parliament.senateTermEnd(crownSenator), block.timestamp + senateTerm);
        assertTrue(parliament.isActiveSenateMember(crownSenator));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VACANCY DECLARATION (basic — no incapacity certification needed)
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_proposeVacancy() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 vacId = parliament.proposeVacancy(majlis3, Parliament.Chamber.Majlis);

        assertEq(vacId, 0);
        assertEq(parliament.vacancyProposalCount(), 1);
        assertTrue(parliament.hasActiveVacancyProposal(majlis3));
    }

    function test_happyCase_vacancyDeclaration_fullFlow() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 vacId = parliament.proposeVacancy(majlis3, Parliament.Chamber.Majlis);

        // Vote: 3 yes, 1 no (target majlis3 excluded)
        vm.prank(majlis1);
        parliament.voteOnVacancy(vacId, true);
        vm.prank(majlis2);
        parliament.voteOnVacancy(vacId, true);
        vm.prank(majlis4);
        parliament.voteOnVacancy(vacId, true);
        vm.prank(majlis5);
        parliament.voteOnVacancy(vacId, false);

        uint256 votePeriod = constitution.getParameter(constitution.PARAM_VACANCY_VOTE_PERIOD());
        _warpForward(votePeriod);

        parliament.finalizeVacancy(vacId);

        assertFalse(parliament.isMajlisMember(majlis3));
        assertEq(parliament.majlisMemberCount(), 4);
        assertEq(parliament.majlisVacancyCount(), 1);
    }

    function test_happyCase_vacancyRejected() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 vacId = parliament.proposeVacancy(majlis3, Parliament.Chamber.Majlis);

        // Vote: 1 yes, 3 no → rejected
        vm.prank(majlis1);
        parliament.voteOnVacancy(vacId, true);
        vm.prank(majlis2);
        parliament.voteOnVacancy(vacId, false);
        vm.prank(majlis4);
        parliament.voteOnVacancy(vacId, false);
        vm.prank(majlis5);
        parliament.voteOnVacancy(vacId, false);

        uint256 votePeriod = constitution.getParameter(constitution.PARAM_VACANCY_VOTE_PERIOD());
        _warpForward(votePeriod);

        parliament.finalizeVacancy(vacId);

        assertTrue(parliament.isMajlisMember(majlis3));
        assertEq(parliament.majlisMemberCount(), 5);
        assertFalse(parliament.hasActiveVacancyProposal(majlis3));
    }

    function test_revert_voteOnVacancy_targetCannotVote() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 vacId = parliament.proposeVacancy(majlis3, Parliament.Chamber.Majlis);

        vm.prank(majlis3);
        vm.expectRevert(Parliament.NotAuthorized.selector);
        parliament.voteOnVacancy(vacId, true);
    }

    function test_revert_finalizeVacancy_tooEarly() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 vacId = parliament.proposeVacancy(majlis3, Parliament.Chamber.Majlis);

        vm.expectRevert(Parliament.VacancyVotingNotElapsed.selector);
        parliament.finalizeVacancy(vacId);
    }

    function test_revert_proposeVacancy_duplicate() public {
        _seatFullParliament();

        vm.prank(majlis1);
        parliament.proposeVacancy(majlis3, Parliament.Chamber.Majlis);

        vm.prank(majlis2);
        vm.expectRevert(Parliament.VacancyAlreadyProposed.selector);
        parliament.proposeVacancy(majlis3, Parliament.Chamber.Majlis);
    }

    function test_happyCase_effectiveCounts_withoutIncapacity() public {
        _seatFullParliament();

        assertEq(parliament.effectiveMajlisMemberCount(), 5);
        assertEq(parliament.effectiveSenateMemberCount(), 3);
    }

    function test_happyCase_vacancyDeclaration_senate() public {
        _seatFullParliament();

        vm.prank(sen1);
        uint256 vacId = parliament.proposeVacancy(sen2, Parliament.Chamber.Senate);

        vm.prank(sen1);
        parliament.voteOnVacancy(vacId, true);
        vm.prank(sen3);
        parliament.voteOnVacancy(vacId, true);

        uint256 votePeriod = constitution.getParameter(constitution.PARAM_VACANCY_VOTE_PERIOD());
        _warpForward(votePeriod);

        parliament.finalizeVacancy(vacId);

        assertFalse(parliament.isSenateMember(sen2));
        assertEq(parliament.senateMemberCount(), 2);
        assertEq(parliament.senateVacancyCount(), 1);
    }

    // ─── Vacancy: missing boundary/revert tests ──────────────────────────

    function test_revert_voteOnVacancy_invalidId() public {
        _seatFullParliament();
        vm.prank(majlis1);
        vm.expectRevert(Parliament.InvalidVacancyId.selector);
        parliament.voteOnVacancy(999, true);
    }

    function test_revert_finalizeVacancy_invalidId() public {
        _seatFullParliament();
        vm.expectRevert(Parliament.InvalidVacancyId.selector);
        parliament.finalizeVacancy(999);
    }

    function test_revert_voteOnVacancy_alreadyResolved() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 vacId = parliament.proposeVacancy(majlis3, Parliament.Chamber.Majlis);

        // Vote to approve
        vm.prank(majlis1);
        parliament.voteOnVacancy(vacId, true);
        vm.prank(majlis2);
        parliament.voteOnVacancy(vacId, true);
        vm.prank(majlis4);
        parliament.voteOnVacancy(vacId, true);

        // Finalize (resolves the vacancy)
        uint256 votePeriod = constitution.getParameter(constitution.PARAM_VACANCY_VOTE_PERIOD());
        _warpForward(votePeriod);
        parliament.finalizeVacancy(vacId);

        // Try voting on resolved vacancy
        vm.prank(majlis5);
        vm.expectRevert(Parliament.VacancyAlreadyResolved.selector);
        parliament.voteOnVacancy(vacId, true);
    }

    function test_revert_finalizeVacancy_alreadyResolved() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 vacId = parliament.proposeVacancy(majlis3, Parliament.Chamber.Majlis);

        vm.prank(majlis1);
        parliament.voteOnVacancy(vacId, true);
        vm.prank(majlis2);
        parliament.voteOnVacancy(vacId, true);
        vm.prank(majlis4);
        parliament.voteOnVacancy(vacId, true);

        uint256 votePeriod = constitution.getParameter(constitution.PARAM_VACANCY_VOTE_PERIOD());
        _warpForward(votePeriod);
        parliament.finalizeVacancy(vacId);

        // Try finalizing again
        vm.expectRevert(Parliament.VacancyAlreadyResolved.selector);
        parliament.finalizeVacancy(vacId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 20. SEAT WITH PROVINCE TRACKING
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_seatSenatorWithProvince() public {
        vm.prank(address(pc));
        parliament.seatSenatorWithProvince(sen1, 2);

        assertTrue(parliament.isSenateMember(sen1));
        assertEq(parliament.senatorProvince(sen1), 2);
        assertEq(parliament.senateMemberCount(), 1);
    }

    function test_modifier_seatSenatorWithProvince_onlyProvincialCouncil() public {
        vm.prank(unauthorized);
        vm.expectRevert(Parliament.NotAuthorized.selector);
        parliament.seatSenatorWithProvince(sen1, 2);
    }

    function test_revert_seatSenatorWithProvince_alreadyMember() public {
        vm.prank(address(pc));
        parliament.seatSenatorWithProvince(sen1, 2);

        vm.prank(address(pc));
        vm.expectRevert(abi.encodeWithSelector(Parliament.AlreadyMember.selector, sen1));
        parliament.seatSenatorWithProvince(sen1, 2);
    }

    function test_happyCase_seatMajlisMemberWithProvince() public {
        vm.prank(address(election));
        parliament.seatMajlisMemberWithProvince(majlis1, 1);

        assertTrue(parliament.isMajlisMember(majlis1));
        assertEq(parliament.majlisMemberProvince(majlis1), 1);
    }

    function test_happyCase_majlisElectionSeated_restoresDissolution() public {
        vm.prank(monarchAddr);
        crown.declareDissolution();
        assertTrue(parliament.dissolved());

        // pendingMajlisElections=0 (default) + dissolved=true → restores
        vm.prank(address(election));
        parliament.majlisElectionSeated();
        assertFalse(parliament.dissolved());
    }

    function test_modifier_majlisElectionSeated_onlyElection() public {
        vm.prank(unauthorized);
        vm.expectRevert(Parliament.NotAuthorized.selector);
        parliament.majlisElectionSeated();
    }

    function test_happyCase_submitBudgetBill() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 billId = parliament.submitBudgetBill(BUDGET_HASH, "Annual Budget");

        assertEq(parliament.billCount(), 1);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.MajlisVoting));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 21. GOVERNANCE ACTIONS
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_proposeGovernanceAction_majlis() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 actionId = parliament.proposeGovernanceAction(
            address(constitution),
            abi.encodeCall(Constitution.getParameter, (MAJLIS_TERM_KEY)),
            Parliament.Chamber.Majlis,
            50,
            keccak256("test action")
        );

        assertEq(actionId, 0);
        assertEq(parliament.governanceActionCount(), 1);
    }

    function test_happyCase_governanceAction_fullCycle_majlis() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 actionId = parliament.proposeGovernanceAction(
            address(constitution),
            abi.encodeCall(Constitution.getParameter, (MAJLIS_TERM_KEY)),
            Parliament.Chamber.Majlis,
            50,
            keccak256("test action")
        );

        vm.prank(majlis1); parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(majlis2); parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(majlis3); parliament.voteOnGovernanceAction(actionId, true);

        _warpForward(3 days);
        parliament.finalizeGovernanceAction(actionId);
        parliament.executeGovernanceAction(actionId);
    }

    function test_happyCase_governanceAction_fullCycle_senate() public {
        _seatFullParliament();

        vm.prank(sen1);
        uint256 actionId = parliament.proposeGovernanceAction(
            address(constitution),
            abi.encodeCall(Constitution.getParameter, (MAJLIS_TERM_KEY)),
            Parliament.Chamber.Senate,
            50,
            keccak256("senate action")
        );

        vm.prank(sen1); parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(sen2); parliament.voteOnGovernanceAction(actionId, true);

        _warpForward(3 days);
        parliament.finalizeGovernanceAction(actionId);
        parliament.executeGovernanceAction(actionId);
    }

    function test_happyCase_governanceAction_fails() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 actionId = parliament.proposeGovernanceAction(
            address(constitution),
            abi.encodeCall(Constitution.getParameter, (MAJLIS_TERM_KEY)),
            Parliament.Chamber.Majlis,
            50,
            keccak256("test action")
        );

        vm.prank(majlis1); parliament.voteOnGovernanceAction(actionId, false);
        vm.prank(majlis2); parliament.voteOnGovernanceAction(actionId, false);
        vm.prank(majlis3); parliament.voteOnGovernanceAction(actionId, false);

        _warpForward(3 days);
        parliament.finalizeGovernanceAction(actionId);

        vm.expectRevert(Parliament.ActionNotPassed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_proposeGovernanceAction_invalidTarget() public {
        _seatFullParliament();

        vm.prank(majlis1);
        vm.expectRevert(Parliament.InvalidTarget.selector);
        parliament.proposeGovernanceAction(
            makeAddr("unregistered"),
            "",
            Parliament.Chamber.Majlis,
            50,
            keccak256("bad target")
        );
    }

    function test_revert_proposeGovernanceAction_invalidThreshold() public {
        _seatFullParliament();

        vm.prank(majlis1);
        vm.expectRevert(Parliament.InvalidThreshold.selector);
        parliament.proposeGovernanceAction(
            address(constitution),
            abi.encodeCall(Constitution.getParameter, (MAJLIS_TERM_KEY)),
            Parliament.Chamber.Majlis,
            40,
            keccak256("bad threshold")
        );
    }

    function test_revert_voteOnGovernanceAction_alreadyVoted() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 actionId = parliament.proposeGovernanceAction(
            address(constitution),
            abi.encodeCall(Constitution.getParameter, (MAJLIS_TERM_KEY)),
            Parliament.Chamber.Majlis,
            50,
            keccak256("test action")
        );

        vm.prank(majlis1);
        parliament.voteOnGovernanceAction(actionId, true);

        vm.prank(majlis1);
        vm.expectRevert(abi.encodeWithSelector(Parliament.AlreadyVoted.selector, actionId, majlis1));
        parliament.voteOnGovernanceAction(actionId, true);
    }

    function test_revert_finalizeGovernanceAction_tooEarly() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 actionId = parliament.proposeGovernanceAction(
            address(constitution),
            abi.encodeCall(Constitution.getParameter, (MAJLIS_TERM_KEY)),
            Parliament.Chamber.Majlis,
            50,
            keccak256("test action")
        );

        vm.prank(majlis1); parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(majlis2); parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(majlis3); parliament.voteOnGovernanceAction(actionId, true);

        vm.expectRevert(Parliament.VotingPeriodNotElapsed.selector);
        parliament.finalizeGovernanceAction(actionId);
    }

    function test_modifier_proposeGovernanceAction_notMember() public {
        _seatFullParliament();

        vm.prank(unauthorized);
        vm.expectRevert(Parliament.NotMajlisMember.selector);
        parliament.proposeGovernanceAction(
            address(constitution),
            abi.encodeCall(Constitution.getParameter, (MAJLIS_TERM_KEY)),
            Parliament.Chamber.Majlis,
            50,
            keccak256("unauth action")
        );
    }

    function test_revert_proposeGovernanceAction_dissolved() public {
        _seatFullParliament();

        vm.prank(monarchAddr);
        crown.declareDissolution();

        vm.prank(majlis1);
        vm.expectRevert(Parliament.MajlisDissolved.selector);
        parliament.proposeGovernanceAction(
            address(constitution),
            abi.encodeCall(Constitution.getParameter, (MAJLIS_TERM_KEY)),
            Parliament.Chamber.Majlis,
            50,
            keccak256("dissolved action")
        );
    }

    function test_revert_executeGovernanceAction_alreadyExecuted() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 actionId = parliament.proposeGovernanceAction(
            address(constitution),
            abi.encodeCall(Constitution.getParameter, (MAJLIS_TERM_KEY)),
            Parliament.Chamber.Majlis,
            50,
            keccak256("test action")
        );

        vm.prank(majlis1); parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(majlis2); parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(majlis3); parliament.voteOnGovernanceAction(actionId, true);

        _warpForward(3 days);
        parliament.finalizeGovernanceAction(actionId);
        parliament.executeGovernanceAction(actionId);

        // Second execute should fail (status is now Executed, not Passed)
        vm.expectRevert(Parliament.ActionNotPassed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_finalizeGovernanceAction_quorumNotMet() public {
        _seatFullParliament();

        vm.prank(majlis1);
        uint256 actionId = parliament.proposeGovernanceAction(
            address(constitution),
            abi.encodeCall(Constitution.getParameter, (MAJLIS_TERM_KEY)),
            Parliament.Chamber.Majlis,
            50,
            keccak256("test action")
        );

        // Only 1 vote out of 5 members (quorum is 50% → need 3)
        vm.prank(majlis1);
        parliament.voteOnGovernanceAction(actionId, true);

        _warpForward(3 days);
        vm.expectRevert(Parliament.QuorumNotMet.selector);
        parliament.finalizeGovernanceAction(actionId);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ParliamentCaretakerTest — MixinCaretaker (Majlis + Caretaker)
//
// Tests that caretaker mode blocks non-budget bill submission.
// ═══════════════════════════════════════════════════════════════════════════
contract ParliamentCaretakerTest is MixinCaretaker {
    bytes32 internal constant BILL_HASH = keccak256("Tax Reform Act");
    bytes32 internal constant BUDGET_HASH = keccak256("Annual Budget 1404");

    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupCaretaker();
    }

    function test_revert_submitBill_caretakerMode() public {
        // Caretaker is active (formation started but no PM yet)
        assertTrue(executive.isCaretaker());

        vm.prank(citizen1);
        vm.expectRevert(Parliament.CaretakerModeActive.selector);
        parliament.submitBill(BILL_HASH, "Caretaker bill");
    }

    function test_happyCase_submitBudgetBill_duringCaretaker() public {
        assertTrue(executive.isCaretaker());

        // Budget bills ARE allowed during caretaker mode (supply bills)
        vm.prank(citizen1);
        uint256 billId = parliament.submitBudgetBill(BUDGET_HASH, "Emergency supply");
        assertEq(parliament.billCount(), 1);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.MajlisVoting));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ParliamentGovernmentTest — MixinGovernment + MixinSenate
//
// Tests CrownNotSuspended reverts for suspension-only functions when
// Crown is active. Requires PM (Government) and Senate for referral.
// ═══════════════════════════════════════════════════════════════════════════
contract ParliamentGovernmentTest is MixinGovernment, MixinSenate {
    bytes32 internal constant BILL_HASH = keccak256("Government Bill");

    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
        _setupSenate();
    }

    function _submitAndPassMajlis(bytes32 hash) internal returns (uint256 billId) {
        vm.prank(citizen1);
        billId = parliament.submitBill(hash, "Test bill");
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);
    }

    function _passSenate(uint256 billId) internal {
        vm.prank(senator1); parliament.voteSenate(billId, true);
        vm.prank(senator2); parliament.voteSenate(billId, true);
        _warpForward(3 days);
        parliament.finalizeSenateVote(billId);
    }

    function test_revert_returnLawDuringSuspension_crownNotSuspended() public {
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);
        assertFalse(crown.suspended());

        vm.prank(pmCandidate);
        vm.expectRevert(Parliament.CrownNotSuspended.selector);
        parliament.returnLawDuringSuspension(billId);
    }

    function test_revert_referToCourtDuringSuspension_crownNotSuspended() public {
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);
        assertFalse(crown.suspended());

        vm.prank(pmCandidate);
        vm.expectRevert(Parliament.CrownNotSuspended.selector);
        parliament.referToCourtDuringSuspension(billId);
    }

    function test_revert_initiateFormationDuringSuspension_crownNotSuspended() public {
        assertFalse(crown.suspended());

        vm.prank(senator1);
        vm.expectRevert(Parliament.CrownNotSuspended.selector);
        parliament.initiateFormationDuringSuspension();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ParliamentIncapacityTest — MixinGovernment + MixinJustices
//
// Incapacity certification, vacancy from incapacity, effective quorum,
// incapacity cleanup on removal/expiry.
// ═══════════════════════════════════════════════════════════════════════════
contract ParliamentIncapacityTest is MixinGovernment, MixinJustices {
    bytes32 internal constant BILL_HASH = keccak256("Tax Reform Act");

    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
        _setupSenate();
        _setupJustices();
    }

    function _certifyIncapacity(address member) internal {
        bytes32 factHash = keccak256(abi.encodePacked("MEMBER_INCAPACITATED", member));
        _certifyFact(factHash);
    }

    function test_happyCase_acknowledgeIncapacity_majlis() public {
        _certifyIncapacity(citizen3);

        parliament.acknowledgeIncapacity(citizen3, Parliament.Chamber.Majlis);

        assertTrue(parliament.isIncapacitated(citizen3));
        assertEq(parliament.incapacitatedMajlisCount(), 1);
        assertFalse(parliament.isActiveMajlisMember(citizen3));
        assertTrue(parliament.isMajlisMember(citizen3));
        assertEq(parliament.effectiveMajlisMemberCount(), 4);
    }

    function test_happyCase_acknowledgeIncapacity_senate() public {
        _certifyIncapacity(senator2);

        parliament.acknowledgeIncapacity(senator2, Parliament.Chamber.Senate);

        assertTrue(parliament.isIncapacitated(senator2));
        assertEq(parliament.incapacitatedSenateCount(), 1);
        assertFalse(parliament.isActiveSenateMember(senator2));
        assertTrue(parliament.isSenateMember(senator2));
        assertEq(parliament.effectiveSenateMemberCount(), 2);
    }

    function test_revert_acknowledgeIncapacity_noCertification() public {
        // No certification — court returns false by default
        vm.expectRevert(Parliament.IncapacityNotCertified.selector);
        parliament.acknowledgeIncapacity(citizen3, Parliament.Chamber.Majlis);
    }

    function test_revert_acknowledgeIncapacity_alreadyIncapacitated() public {
        _certifyIncapacity(citizen3);
        parliament.acknowledgeIncapacity(citizen3, Parliament.Chamber.Majlis);

        vm.expectRevert(Parliament.AlreadyIncapacitated.selector);
        parliament.acknowledgeIncapacity(citizen3, Parliament.Chamber.Majlis);
    }

    function test_happyCase_incapacitatedMember_removedByVacancy_clearsTracking() public {
        _certifyIncapacity(citizen3);
        parliament.acknowledgeIncapacity(citizen3, Parliament.Chamber.Majlis);
        assertEq(parliament.incapacitatedMajlisCount(), 1);
        assertEq(parliament.effectiveMajlisMemberCount(), 4);

        // Propose and pass vacancy
        vm.prank(citizen1);
        uint256 vacId = parliament.proposeVacancy(citizen3, Parliament.Chamber.Majlis);
        vm.prank(citizen1);
        parliament.voteOnVacancy(vacId, true);
        vm.prank(citizen2);
        parliament.voteOnVacancy(vacId, true);

        uint256 votePeriod = constitution.getParameter(constitution.PARAM_VACANCY_VOTE_PERIOD());
        _warpForward(votePeriod);

        parliament.finalizeVacancy(vacId);

        assertFalse(parliament.isIncapacitated(citizen3));
        assertEq(parliament.incapacitatedMajlisCount(), 0);
        assertFalse(parliament.isMajlisMember(citizen3));
        assertEq(parliament.majlisMemberCount(), 4);
        assertEq(parliament.effectiveMajlisMemberCount(), 4);
    }

    function test_happyCase_finalizeMajlisVote_usesEffectiveCount() public {
        // Incapacitate one Majlis member
        _certifyIncapacity(citizen5);
        parliament.acknowledgeIncapacity(citizen5, Parliament.Chamber.Majlis);

        // 5 total, 1 incapacitated, 4 effective. 50% quorum = 2 votes needed.
        vm.prank(citizen1);
        uint256 billId = parliament.submitBill(BILL_HASH, "Test bill");

        vm.prank(citizen1);
        parliament.voteMajlis(billId, true);
        vm.prank(citizen2);
        parliament.voteMajlis(billId, true);

        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.SenateReview));
    }

    function test_happyCase_finalizeSenateVote_usesEffectiveCount() public {
        // Incapacitate one Senator
        _certifyIncapacity(senator3);
        parliament.acknowledgeIncapacity(senator3, Parliament.Chamber.Senate);

        // Submit bill and pass Majlis
        vm.prank(citizen1);
        uint256 billId = parliament.submitBill(BILL_HASH, "Test bill");
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);

        // Senate: 3 total, 1 incapacitated, 2 effective. 50% quorum = 1 vote.
        vm.prank(senator1);
        parliament.voteSenate(billId, true);

        _warpForward(3 days);
        parliament.finalizeSenateVote(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.CrownAction));
    }

    function test_happyCase_removeMember_clearsIncapacity() public {
        _certifyIncapacity(citizen5);
        parliament.acknowledgeIncapacity(citizen5, Parliament.Chamber.Majlis);

        assertEq(parliament.incapacitatedMajlisCount(), 1);
        assertEq(parliament.effectiveMajlisMemberCount(), 4);

        // Direct removal should clean up incapacity
        vm.prank(address(court));
        parliament.removeMember(citizen5, Parliament.Chamber.Majlis);

        assertEq(parliament.incapacitatedMajlisCount(), 0);
        assertEq(parliament.majlisMemberCount(), 4);
        assertEq(parliament.effectiveMajlisMemberCount(), 4);
    }

    function test_happyCase_expireMember_clearsIncapacity() public {
        _certifyIncapacity(citizen5);
        parliament.acknowledgeIncapacity(citizen5, Parliament.Chamber.Majlis);

        assertEq(parliament.incapacitatedMajlisCount(), 1);

        uint256 termLength = constitution.getParameter(constitution.PARAM_MAJLIS_TERM());
        _warpForward(termLength + 1);

        parliament.expireMember(citizen5, Parliament.Chamber.Majlis);

        assertEq(parliament.incapacitatedMajlisCount(), 0);
        assertEq(parliament.majlisMemberCount(), 4);
        assertEq(parliament.effectiveMajlisMemberCount(), 4);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ParliamentSuspensionTest — MixinGovernment + MixinCrownSuspension
//
// Crown suspension fallback: PM returns law, Senate initiates formation,
// PM refers to court — all during Crown suspension.
// ═══════════════════════════════════════════════════════════════════════════
contract ParliamentSuspensionTest is MixinGovernment, MixinCrownSuspension {
    bytes32 internal constant BILL_HASH = keccak256("Suspension Bill");

    address internal unauthorized = makeAddr("unauthorized");

    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
        _setupSenate();
        _setupJustices();
        _setupCrownSuspension();
    }

    function _submitAndPassMajlis(bytes32 hash) internal returns (uint256 billId) {
        vm.prank(citizen1);
        billId = parliament.submitBill(hash, "Test bill");

        vm.prank(citizen1);
        parliament.voteMajlis(billId, true);
        vm.prank(citizen2);
        parliament.voteMajlis(billId, true);
        vm.prank(citizen3);
        parliament.voteMajlis(billId, true);

        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);
    }

    function _passSenate(uint256 billId) internal {
        vm.prank(senator1);
        parliament.voteSenate(billId, true);
        vm.prank(senator2);
        parliament.voteSenate(billId, true);

        _warpForward(3 days);
        parliament.finalizeSenateVote(billId);
    }

    function test_happyCase_returnLawDuringSuspension() public {
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.CrownAction));
        assertTrue(crown.suspended());

        // PM returns the law during Crown suspension
        vm.prank(pmCandidate);
        parliament.returnLawDuringSuspension(billId);

        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Returned));
    }

    function test_revert_returnLawDuringSuspension_notPM() public {
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        vm.prank(unauthorized);
        vm.expectRevert(Parliament.NotPrimeMinister.selector);
        parliament.returnLawDuringSuspension(billId);
    }

    function test_precondition_crownIsSuspended() public view {
        assertTrue(crown.suspended(), "Crown must be suspended at this level");
    }

    function test_happyCase_initiateFormationDuringSuspension() public {
        assertTrue(crown.suspended());

        // Senate member initiates formation during Crown suspension
        vm.prank(senator1);
        parliament.initiateFormationDuringSuspension();
    }

    function test_revert_initiateFormationDuringSuspension_notSenator() public {
        vm.prank(unauthorized);
        vm.expectRevert(Parliament.NotSenateMember.selector);
        parliament.initiateFormationDuringSuspension();
    }

    function test_happyCase_referToCourtDuringSuspension() public {
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        // PM returns the law
        vm.prank(pmCandidate);
        parliament.returnLawDuringSuspension(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Returned));

        // Majlis re-adopts
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.CrownAction));

        // PM refers to Court during suspension
        vm.prank(pmCandidate);
        parliament.referToCourtDuringSuspension(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Referred));
    }

    function test_revert_referToCourtDuringSuspension_notPM() public {
        uint256 billId = _submitAndPassMajlis(BILL_HASH);
        _passSenate(billId);

        // PM returns, Majlis re-adopts
        vm.prank(pmCandidate);
        parliament.returnLawDuringSuspension(billId);
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        _warpForward(3 days);
        parliament.finalizeMajlisVote(billId);

        // Non-PM tries to refer
        vm.prank(citizen1);
        vm.expectRevert(Parliament.NotPrimeMinister.selector);
        parliament.referToCourtDuringSuspension(billId);
    }
}
