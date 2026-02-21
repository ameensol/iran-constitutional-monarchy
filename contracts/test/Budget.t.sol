// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./helpers/TestBase.sol";
import "./helpers/MixinMajlis.sol";
import "./helpers/MixinGovernment.sol";
import "./helpers/MixinJustices.sol";
import "../src/Budget.sol";
import "../src/Parliament.sol";

/// @title BudgetBaseTest
/// @notice Tests for Budget.sol — proposals, approval, allocation, continuation, audit.
///         Uses real contract interactions (no mocks).
///
/// Hierarchy: GovTestBase → MixinMajlis → MixinGovernment
///
/// Access control patterns:
///   - onlyExecutive calls: vm.prank(address(executive)) — no governance wrapper exists
///   - onlyParliament calls: _executeMajlisAction / _prepareMajlisAction (real governance path)
///   - Permissionless: direct calls
///   - Modifier tests: vm.prank(unauthorized) for EOA checks
///
/// Logical progression:
///   1. Construction
///   2. Propose budget
///   3. Approve / reject budget
///   4. Activate budget
///   5. Allocate funds
///   6. Prior year continuation
///   7. Audit reports
///   8. Boundary conditions
///   9. Caretaker mode / deputy overdue
///  10. Continuation budget replacement
///  11. Supplementary budgets
///  12. Audit head appointment & lifecycle
///  13. Constitution access control for audit head role
///  14. Court vacancy (not certified — base check)
contract BudgetBaseTest is GovTestBase, MixinGovernment {
    // Events
    event BudgetProposed(uint256 indexed budgetId, uint256 fiscalYear, uint256 totalAmount);
    event BudgetApproved(uint256 indexed budgetId, uint256 fiscalYear);
    event BudgetRejected(uint256 indexed budgetId, uint256 fiscalYear);
    event BudgetActivated(uint256 indexed budgetId, uint256 fiscalYear);
    event FundsAllocated(uint256 indexed budgetId, bytes32 category, uint256 amount);
    event PriorBudgetContinued(uint256 indexed budgetId, uint256 fiscalYear);
    event ContinuationBudgetSuperseded(uint256 indexed oldBudgetId, uint256 indexed newBudgetId, uint256 fiscalYear);
    event SupplementaryBudgetApproved(uint256 indexed budgetId, uint256 fiscalYear, uint256 additionalAmount, uint256 newTotal);
    event AuditReportSubmitted(uint256 fiscalYear, bytes32 reportHash);
    event AuditHeadAppointed(address indexed appointee, uint256 termEnd);
    event AuditHeadRemoved(address indexed former, string reason);

    address internal unauthorized = makeAddr("unauthorized");

    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    /// @dev Propose a budget (onlyExecutive — no governance wrapper exists)
    function _proposeBudget(uint256 year, uint256 amount) internal returns (uint256 budgetId) {
        vm.prank(address(executive));
        budgetId = budgetContract.proposeBudget(keccak256("budget"), year, amount);
    }

    /// @dev Expire all Majlis members and re-elect them.
    ///      Used after large time warps (e.g. 9-year audit head term) that expire
    ///      the 4-year Majlis terms, making governance actions impossible.
    function _reelectMajlis() internal {
        address[5] memory members = [citizen1, citizen2, citizen3, citizen4, citizen5];
        for (uint256 i = 0; i < members.length; i++) {
            parliament.expireMember(members[i], Parliament.Chamber.Majlis);
        }
        _setupMajlis();
    }

    /// @dev Approve + activate a budget via real governance paths
    function _approveAndActivate(uint256 budgetId) internal {
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveBudget, (budgetId))
        );
        vm.prank(address(executive));
        budgetContract.activateBudget(budgetId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. CONSTRUCTION
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_constructor() public view {
        assertEq(address(budgetContract.constitution()), address(constitution));
        assertEq(budgetContract.budgetCount(), 0);
    }

    function test_revert_constructor_zeroAddress() public {
        vm.expectRevert(Budget.ZeroAddress.selector);
        new Budget(address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. PROPOSE BUDGET
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_proposeBudget() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);

        assertEq(id, 0);
        assertEq(budgetContract.budgetCount(), 1);
        assertEq(uint256(budgetContract.getBudgetStatus(0)), uint256(Budget.BudgetStatus.Proposed));
    }

    function test_happyCase_proposeBudget_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit BudgetProposed(0, 2025, 1_000_000 ether);

        vm.prank(address(executive));
        budgetContract.proposeBudget(keccak256("budget2025"), 2025, 1_000_000 ether);
    }

    function test_modifier_proposeBudget_onlyExecutive() public {
        vm.prank(unauthorized);
        vm.expectRevert(Budget.NotAuthorized.selector);
        budgetContract.proposeBudget(keccak256("budget"), 2025, 1_000_000 ether);
    }

    function test_modifier_proposeBudget_revert_parliamentCaller() public {
        // Parliament cannot propose budgets — onlyExecutive
        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.proposeBudget, (keccak256("budget"), 2025, 1_000_000 ether))
        );
        // Inner revert: NotAuthorized (msg.sender is parliament, not executive)
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. APPROVE / REJECT
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_approveBudget() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);

        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveBudget, (id))
        );

        assertEq(uint256(budgetContract.getBudgetStatus(id)), uint256(Budget.BudgetStatus.Approved));
    }

    function test_happyCase_approveBudget_emitsEvent() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);

        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveBudget, (id))
        );

        vm.expectEmit(true, false, false, true);
        emit BudgetApproved(id, 2025);

        parliament.executeGovernanceAction(actionId);
    }

    function test_happyCase_rejectBudget() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);

        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.rejectBudget, (id))
        );

        assertEq(uint256(budgetContract.getBudgetStatus(id)), uint256(Budget.BudgetStatus.Rejected));
    }

    function test_happyCase_rejectBudget_emitsEvent() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);

        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.rejectBudget, (id))
        );

        vm.expectEmit(true, false, false, true);
        emit BudgetRejected(id, 2025);

        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_approveBudget_invalidBudget() public {
        // Inner revert: InvalidBudget (budget 999 doesn't exist)
        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveBudget, (999))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_rejectBudget_invalidBudget() public {
        // Inner revert: InvalidBudget
        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.rejectBudget, (999))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_rejectBudget_notProposed() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.rejectBudget, (id))
        );

        // Already rejected — inner revert: NotInStatus(Proposed)
        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.rejectBudget, (id))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_modifier_rejectBudget_revert_executiveCaller() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);

        // Executive cannot reject — onlyParliament
        vm.prank(address(executive));
        vm.expectRevert(Budget.NotAuthorized.selector);
        budgetContract.rejectBudget(id);
    }

    function test_revert_approveBudget_notProposed() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveBudget, (id))
        );

        // Already approved — inner revert: NotInStatus(Proposed)
        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveBudget, (id))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_modifier_approveBudget_onlyParliament() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);

        vm.prank(unauthorized);
        vm.expectRevert(Budget.NotAuthorized.selector);
        budgetContract.approveBudget(id);
    }

    function test_modifier_approveBudget_revert_executiveCaller() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);

        // Executive cannot approve — onlyParliament
        vm.prank(address(executive));
        vm.expectRevert(Budget.NotAuthorized.selector);
        budgetContract.approveBudget(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. ACTIVATE BUDGET
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_activateBudget() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id);

        assertEq(uint256(budgetContract.getBudgetStatus(id)), uint256(Budget.BudgetStatus.Active));
        assertTrue(budgetContract.hasActiveBudget(2025));
        assertEq(budgetContract.activeBudgetForYear(2025), id);
    }

    function test_happyCase_activateBudget_emitsEvent() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveBudget, (id))
        );

        vm.expectEmit(true, false, false, true);
        emit BudgetActivated(id, 2025);

        vm.prank(address(executive));
        budgetContract.activateBudget(id);
    }

    function test_revert_activateBudget_alreadyActive() public {
        uint256 id1 = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id1);

        uint256 id2 = _proposeBudget(2025, 2_000_000 ether);
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveBudget, (id2))
        );

        vm.prank(address(executive));
        vm.expectRevert(abi.encodeWithSelector(Budget.BudgetAlreadyActive.selector, 2025));
        budgetContract.activateBudget(id2);
    }

    function test_revert_activateBudget_notApproved() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);

        vm.prank(address(executive));
        vm.expectRevert(abi.encodeWithSelector(Budget.NotInStatus.selector, Budget.BudgetStatus.Approved));
        budgetContract.activateBudget(id);
    }

    function test_modifier_activateBudget_revert_parliamentCaller() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveBudget, (id))
        );

        // Parliament cannot activate — onlyExecutive; inner revert: NotAuthorized
        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.activateBudget, (id))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. ALLOCATE FUNDS
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_allocateFunds() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id);

        vm.prank(address(executive));
        budgetContract.allocateFunds(id, keccak256("Defense"), 100_000 ether);

        assertEq(budgetContract.getRemainingBudget(id), 900_000 ether);
    }

    function test_happyCase_allocateFunds_emitsEvent() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id);

        bytes32 category = keccak256("Education");
        vm.expectEmit(true, false, false, true);
        emit FundsAllocated(id, category, 200_000 ether);

        vm.prank(address(executive));
        budgetContract.allocateFunds(id, category, 200_000 ether);
    }

    function test_happyCase_multipleAllocations() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id);

        vm.prank(address(executive));
        budgetContract.allocateFunds(id, keccak256("Defense"), 100_000 ether);
        vm.prank(address(executive));
        budgetContract.allocateFunds(id, keccak256("Education"), 200_000 ether);
        vm.prank(address(executive));
        budgetContract.allocateFunds(id, keccak256("Health"), 300_000 ether);

        assertEq(budgetContract.getRemainingBudget(id), 400_000 ether);
    }

    function test_revert_allocateFunds_insufficientBudget() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id);

        vm.prank(address(executive));
        vm.expectRevert(abi.encodeWithSelector(Budget.InsufficientBudget.selector, 2_000_000 ether, 1_000_000 ether));
        budgetContract.allocateFunds(id, keccak256("Defense"), 2_000_000 ether);
    }

    function test_revert_allocateFunds_notActive() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);

        vm.prank(address(executive));
        vm.expectRevert(Budget.BudgetNotActive.selector);
        budgetContract.allocateFunds(id, keccak256("Defense"), 100_000 ether);
    }

    function test_modifier_allocateFunds_revert_parliamentCaller() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id);

        // Parliament cannot allocate — onlyExecutive; inner revert: NotAuthorized
        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.allocateFunds, (id, keccak256("Defense"), 100_000 ether))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_boundary_allocateFunds_exactAmount() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id);

        vm.prank(address(executive));
        budgetContract.allocateFunds(id, keccak256("All"), 1_000_000 ether);

        assertEq(budgetContract.getRemainingBudget(id), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. PRIOR YEAR CONTINUATION
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_continuePriorBudget() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id);

        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.continuePriorBudget, (2025, 2026))
        );
        uint256 newId = budgetContract.budgetCount() - 1;

        assertEq(uint256(budgetContract.getBudgetStatus(newId)), uint256(Budget.BudgetStatus.Active));
        assertTrue(budgetContract.hasActiveBudget(2026));
        assertEq(budgetContract.getRemainingBudget(newId), 1_000_000 ether);
    }

    function test_happyCase_continuePriorBudget_emitsEvent() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id);

        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.continuePriorBudget, (2025, 2026))
        );

        vm.expectEmit(true, false, false, true);
        emit PriorBudgetContinued(1, 2026);

        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_continuePriorBudget_noPriorBudget() public {
        // Inner revert: NoBudgetForYear(2025)
        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.continuePriorBudget, (2025, 2026))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_continuePriorBudget_alreadyActive() public {
        uint256 id1 = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id1);

        uint256 id2 = _proposeBudget(2026, 2_000_000 ether);
        _approveAndActivate(id2);

        // Inner revert: BudgetAlreadyActive(2026)
        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.continuePriorBudget, (2025, 2026))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_modifier_continuePriorBudget_revert_executiveCaller() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id);

        // Executive cannot continue prior budget — onlyParliament
        vm.prank(address(executive));
        vm.expectRevert(Budget.NotAuthorized.selector);
        budgetContract.continuePriorBudget(2025, 2026);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 7. AUDIT REPORTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_submitAuditReport() public {
        bytes32 reportHash = keccak256("Audit 2025 - all in order");

        vm.prank(auditHead);
        budgetContract.submitAuditReport(2025, reportHash);

        assertTrue(budgetContract.hasAuditReport(2025));
    }

    function test_happyCase_submitAuditReport_emitsEvent() public {
        bytes32 reportHash = keccak256("Audit 2025");

        vm.expectEmit(false, false, false, true);
        emit AuditReportSubmitted(2025, reportHash);

        vm.prank(auditHead);
        budgetContract.submitAuditReport(2025, reportHash);
    }

    function test_revert_submitAuditReport_alreadySubmitted() public {
        vm.prank(auditHead);
        budgetContract.submitAuditReport(2025, keccak256("report1"));

        vm.prank(auditHead);
        vm.expectRevert(abi.encodeWithSelector(Budget.AuditAlreadySubmitted.selector, 2025));
        budgetContract.submitAuditReport(2025, keccak256("report2"));
    }

    function test_modifier_submitAuditReport_onlyAuditHead() public {
        vm.prank(unauthorized);
        vm.expectRevert(Budget.NotAuditHead.selector);
        budgetContract.submitAuditReport(2025, keccak256("report"));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 8. BOUNDARY CONDITIONS
    // ═══════════════════════════════════════════════════════════════════════

    function test_revert_activateBudget_invalidBudget() public {
        vm.prank(address(executive));
        vm.expectRevert(Budget.InvalidBudget.selector);
        budgetContract.activateBudget(999);
    }

    function test_revert_allocateFunds_invalidBudget() public {
        vm.prank(address(executive));
        vm.expectRevert(Budget.InvalidBudget.selector);
        budgetContract.allocateFunds(999, keccak256("Defense"), 100_000 ether);
    }

    function test_boundary_getBudget_invalid() public {
        vm.expectRevert(Budget.InvalidBudget.selector);
        budgetContract.getBudget(99);
    }

    function test_boundary_getBudgetMeta_invalid() public {
        vm.expectRevert(Budget.InvalidBudget.selector);
        budgetContract.getBudgetMeta(99);
    }

    function test_boundary_getBudgetStatus_invalid() public {
        vm.expectRevert(Budget.InvalidBudget.selector);
        budgetContract.getBudgetStatus(99);
    }

    function test_boundary_getRemainingBudget_invalid() public {
        vm.expectRevert(Budget.InvalidBudget.selector);
        budgetContract.getRemainingBudget(99);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 9. CARETAKER MODE + DEPUTY OVERDUE
    // ═══════════════════════════════════════════════════════════════════════

    function test_revert_proposeBudget_caretakerMode() public {
        // Start a new formation cycle → puts Executive into caretaker mode
        _executeMajlisAction(
            address(executive),
            abi.encodeCall(Executive.startFormation, ())
        );
        assertTrue(executive.caretaker());

        vm.prank(address(executive));
        vm.expectRevert(Budget.CaretakerModeActive.selector);
        budgetContract.proposeBudget(keccak256("FY2025"), 2025, 10_000_000 ether);
    }

    function test_revert_proposeBudget_deputyDesignationOverdue() public {
        // Government exists but PM hasn't designated deputy within 14 days
        uint256 deadline = constitution.getParameter(constitution.PARAM_DEPUTY_DESIGNATION_DEADLINE());
        _warpForward(deadline + 1);
        assertTrue(executive.isDeputyOverdue());

        vm.prank(address(executive));
        vm.expectRevert(Budget.DeputyDesignationOverdue.selector);
        budgetContract.proposeBudget(keccak256("FY2025"), 2025, 10_000_000 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 10. CONTINUATION BUDGET REPLACEMENT (Art. IX.3.4)
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_replaceContinuationWithNewBudget() public {
        // Set up prior year budget
        uint256 priorId = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(priorId);

        // Continue prior budget into 2026
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.continuePriorBudget, (2025, 2026))
        );
        uint256 contId = budgetContract.budgetCount() - 1;
        assertEq(uint256(budgetContract.getBudgetStatus(contId)), uint256(Budget.BudgetStatus.Active));

        // Propose, approve, and activate a proper budget for 2026
        uint256 newId = _proposeBudget(2026, 2_000_000 ether);
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveBudget, (newId))
        );
        vm.prank(address(executive));
        budgetContract.activateBudget(newId);

        // Old continuation → Superseded, new → Active
        assertEq(uint256(budgetContract.getBudgetStatus(contId)), uint256(Budget.BudgetStatus.Superseded));
        assertEq(uint256(budgetContract.getBudgetStatus(newId)), uint256(Budget.BudgetStatus.Active));
        assertEq(budgetContract.activeBudgetForYear(2026), newId);
    }

    function test_revert_replaceProperBudgetWithAnother() public {
        // Activate a proper (non-continuation) budget for 2025
        uint256 id1 = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id1);

        // Try to activate another proper budget for 2025
        uint256 id2 = _proposeBudget(2025, 2_000_000 ether);
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveBudget, (id2))
        );

        vm.prank(address(executive));
        vm.expectRevert(abi.encodeWithSelector(Budget.BudgetAlreadyActive.selector, 2025));
        budgetContract.activateBudget(id2);
    }

    function test_allocateFunds_afterContinuationSuperseded() public {
        // Set up continuation for 2026
        uint256 priorId = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(priorId);
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.continuePriorBudget, (2025, 2026))
        );
        uint256 contId = budgetContract.budgetCount() - 1;

        // Replace with proper budget
        uint256 newId = _proposeBudget(2026, 2_000_000 ether);
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveBudget, (newId))
        );
        vm.prank(address(executive));
        budgetContract.activateBudget(newId);

        // Allocation on superseded budget reverts
        vm.prank(address(executive));
        vm.expectRevert(Budget.BudgetNotActive.selector);
        budgetContract.allocateFunds(contId, keccak256("Defense"), 100_000 ether);

        // Allocation on new budget works
        vm.prank(address(executive));
        budgetContract.allocateFunds(newId, keccak256("Defense"), 100_000 ether);
        assertEq(budgetContract.getRemainingBudget(newId), 1_900_000 ether);
    }

    function test_continuationFlag() public {
        // Proposed budget has isContinuation = false
        uint256 propId = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(propId);
        (,, bool isCont) = budgetContract.getBudgetMeta(propId);
        assertFalse(isCont);

        // Continuation budget has isContinuation = true
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.continuePriorBudget, (2025, 2026))
        );
        uint256 contId = budgetContract.budgetCount() - 1;
        (,, bool isContNew) = budgetContract.getBudgetMeta(contId);
        assertTrue(isContNew);
    }

    function test_event_ContinuationBudgetSuperseded() public {
        uint256 priorId = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(priorId);
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.continuePriorBudget, (2025, 2026))
        );
        uint256 contId = budgetContract.budgetCount() - 1;

        uint256 newId = _proposeBudget(2026, 2_000_000 ether);
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveBudget, (newId))
        );

        vm.expectEmit(true, true, false, true);
        emit ContinuationBudgetSuperseded(contId, newId, 2026);

        vm.prank(address(executive));
        budgetContract.activateBudget(newId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 11. SUPPLEMENTARY BUDGETS (Art. IX.5)
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_approveSupplementary() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id);

        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveSupplementary, (2025, 500_000 ether, keccak256("supplementary2025")))
        );

        assertEq(budgetContract.getRemainingBudget(id), 1_500_000 ether);
    }

    function test_allocateFunds_afterSupplementary() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id);

        // Allocate up to near original total
        vm.prank(address(executive));
        budgetContract.allocateFunds(id, keccak256("Defense"), 900_000 ether);

        // Would fail without supplementary
        vm.prank(address(executive));
        vm.expectRevert(abi.encodeWithSelector(Budget.InsufficientBudget.selector, 200_000 ether, 100_000 ether));
        budgetContract.allocateFunds(id, keccak256("Health"), 200_000 ether);

        // Approve supplementary
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveSupplementary, (2025, 500_000 ether, keccak256("supplementary")))
        );

        // Now can allocate beyond original ceiling
        vm.prank(address(executive));
        budgetContract.allocateFunds(id, keccak256("Health"), 200_000 ether);
        assertEq(budgetContract.getRemainingBudget(id), 400_000 ether);
    }

    function test_revert_supplementary_noActiveBudget() public {
        // Inner revert: NoBudgetToSupplement(2025)
        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveSupplementary, (2025, 500_000 ether, keccak256("supplementary")))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_supplementary_notParliament() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id);

        // Executive cannot approve supplementary — onlyParliament
        vm.prank(address(executive));
        vm.expectRevert(Budget.NotAuthorized.selector);
        budgetContract.approveSupplementary(2025, 500_000 ether, keccak256("supplementary"));

        // Unauthorized EOA
        vm.prank(unauthorized);
        vm.expectRevert(Budget.NotAuthorized.selector);
        budgetContract.approveSupplementary(2025, 500_000 ether, keccak256("supplementary"));
    }

    function test_event_SupplementaryBudgetApproved() public {
        uint256 id = _proposeBudget(2025, 1_000_000 ether);
        _approveAndActivate(id);

        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.approveSupplementary, (2025, 500_000 ether, keccak256("supplementary")))
        );

        vm.expectEmit(true, false, false, true);
        emit SupplementaryBudgetApproved(id, 2025, 500_000 ether, 1_500_000 ether);

        parliament.executeGovernanceAction(actionId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 12. AUDIT HEAD APPOINTMENT (Art. IX.4)
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_appointAuditHead() public view {
        // setUp (via _postDeploy) already appointed auditHead
        assertEq(constitution.getRole(ROLE_AUDIT_HEAD), auditHead);
        assertTrue(budgetContract.hasServedAsAuditHead(auditHead));
        assertGt(budgetContract.auditHeadTermEnd(), 0);
        assertEq(budgetContract.auditHeadTermEnd(), budgetContract.auditHeadTermStart() + budgetContract.AUDIT_HEAD_TERM());
    }

    function test_happyCase_appointAuditHead_emitsEvent() public {
        // Remove current audit head (warp past 9-year term)
        _warpForward(budgetContract.AUDIT_HEAD_TERM());
        budgetContract.removeExpiredAuditHead();

        // Re-elect Majlis (4-year terms expired during the 9-year warp)
        _reelectMajlis();

        address newAuditHead = makeAddr("newAuditHead");

        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.appointAuditHead, (newAuditHead))
        );

        // Compute expected term AFTER _prepareMajlisAction (which warps 3 days)
        uint256 expectedTermEnd = block.timestamp + budgetContract.AUDIT_HEAD_TERM();

        vm.expectEmit(true, false, false, true);
        emit AuditHeadAppointed(newAuditHead, expectedTermEnd);

        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_appointAuditHead_notParliament() public {
        // Remove current audit head first
        _warpForward(budgetContract.AUDIT_HEAD_TERM());
        budgetContract.removeExpiredAuditHead();

        address nominee = makeAddr("nominee");

        // Executive cannot appoint
        vm.prank(address(executive));
        vm.expectRevert(Budget.NotAuthorized.selector);
        budgetContract.appointAuditHead(nominee);

        // Crown cannot appoint
        vm.prank(address(crown));
        vm.expectRevert(Budget.NotAuthorized.selector);
        budgetContract.appointAuditHead(nominee);

        // Unauthorized cannot appoint
        vm.prank(unauthorized);
        vm.expectRevert(Budget.NotAuthorized.selector);
        budgetContract.appointAuditHead(nominee);
    }

    function test_revert_appointAuditHead_alreadyActive() public {
        // Audit head is already active from setUp
        address newNominee = makeAddr("newNominee");

        // Inner revert: AuditHeadActive
        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.appointAuditHead, (newNominee))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_appointAuditHead_alreadyServed() public {
        // Remove current audit head (warp past 9-year term)
        _warpForward(budgetContract.AUDIT_HEAD_TERM());
        budgetContract.removeExpiredAuditHead();

        // Re-elect Majlis (4-year terms expired during the 9-year warp)
        _reelectMajlis();

        // Try to reappoint the same person — non-renewable
        // Inner revert: AuditHeadAlreadyServed
        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.appointAuditHead, (auditHead))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_appointAuditHead_zeroAddress() public {
        _warpForward(budgetContract.AUDIT_HEAD_TERM());
        budgetContract.removeExpiredAuditHead();

        // Re-elect Majlis (4-year terms expired during the 9-year warp)
        _reelectMajlis();

        // Inner revert: ZeroAddress
        uint256 actionId = _prepareMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.appointAuditHead, (address(0)))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 13. AUDIT HEAD TERM EXPIRY
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_removeExpiredAuditHead() public {
        // Warp past 9-year term
        _warpForward(budgetContract.AUDIT_HEAD_TERM());

        vm.expectEmit(true, false, false, true);
        emit AuditHeadRemoved(auditHead, "term_expired");

        budgetContract.removeExpiredAuditHead();

        assertEq(constitution.getRole(ROLE_AUDIT_HEAD), address(0));
    }

    function test_revert_removeExpiredAuditHead_termNotExpired() public {
        // Only 1 year has passed, term is 9 years
        _warpForward(365 days);

        vm.expectRevert(Budget.AuditHeadTermNotExpired.selector);
        budgetContract.removeExpiredAuditHead();
    }

    function test_revert_removeExpiredAuditHead_noAuditHead() public {
        // Remove the audit head first
        _warpForward(budgetContract.AUDIT_HEAD_TERM());
        budgetContract.removeExpiredAuditHead();

        // Try again — no audit head
        vm.expectRevert(Budget.NoAuditHead.selector);
        budgetContract.removeExpiredAuditHead();
    }

    function test_happyCase_appointAfterExpiry() public {
        // Expire and remove
        _warpForward(budgetContract.AUDIT_HEAD_TERM());
        budgetContract.removeExpiredAuditHead();

        // Re-elect Majlis (4-year terms expired during the 9-year warp)
        _reelectMajlis();

        // Appoint new audit head via governance action
        address newAuditHead = makeAddr("newAuditHead");
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.appointAuditHead, (newAuditHead))
        );

        assertEq(constitution.getRole(ROLE_AUDIT_HEAD), newAuditHead);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 14. COURT VACANCY — NOT CERTIFIED (base check)
    // ═══════════════════════════════════════════════════════════════════════

    function test_revert_vacateAuditHead_notCertified() public {
        // Real Court with no justices → isFactCertified returns false naturally
        vm.expectRevert(Budget.AuditHeadVacancyNotCertified.selector);
        budgetContract.vacateAuditHead();
    }

    function test_revert_vacateAuditHead_noAuditHead() public {
        // Remove audit head via term expiry first
        _warpForward(budgetContract.AUDIT_HEAD_TERM());
        budgetContract.removeExpiredAuditHead();

        // NoAuditHead is checked before fact certification
        vm.expectRevert(Budget.NoAuditHead.selector);
        budgetContract.vacateAuditHead();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 15. CONSTITUTION.SOL ACCESS CONTROL FOR ROLE_AUDIT_HEAD
    // ═══════════════════════════════════════════════════════════════════════

    function test_revert_executive_setAuditHeadRole() public {
        vm.prank(address(executive));
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.setRole(ROLE_AUDIT_HEAD, makeAddr("attacker"));
    }

    function test_revert_crown_setAuditHeadRole() public {
        vm.prank(address(crown));
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.setRole(ROLE_AUDIT_HEAD, makeAddr("attacker"));
    }

    function test_happyCase_referendum_canSetAuditHeadRole() public {
        // Referendum retains override power
        address override_ = makeAddr("referendumOverride");
        vm.prank(address(referendum));
        constitution.setRole(ROLE_AUDIT_HEAD, override_);
        assertEq(constitution.getRole(ROLE_AUDIT_HEAD), override_);
    }

    function test_happyCase_executiveCanStillSetOtherRoles() public {
        // Executive can still set non-audit-head roles (e.g. PM)
        address pm = makeAddr("pm");
        vm.prank(address(executive));
        constitution.setRole(ROLE_PM, pm);
        assertEq(constitution.getRole(ROLE_PM), pm);
    }
}

/// @title BudgetVacancyTest
/// @notice Tests for Budget.sol court-certified audit head vacancy.
///         Uses MixinJustices for real fact certification (no mocks).
///
/// Hierarchy: GovTestBase → MixinMajlis → MixinGovernment + MixinSenate → MixinJustices
contract BudgetVacancyTest is GovTestBase, MixinGovernment, MixinJustices {
    // Events
    event AuditHeadRemoved(address indexed former, string reason);

    address internal unauthorized = makeAddr("unauthorized");

    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupGovernment();
        _setupSenate();
        _setupJustices();
    }

    /// @dev Propose a budget (onlyExecutive — no governance wrapper exists)
    function _proposeBudget(uint256 year, uint256 amount) internal returns (uint256 budgetId) {
        vm.prank(address(executive));
        budgetId = budgetContract.proposeBudget(keccak256("budget"), year, amount);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // COURT-CERTIFIED VACANCY
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_vacateAuditHead() public {
        // Certify AUDIT_HEAD_VACANCY via real justices
        bytes32 factHash = keccak256(abi.encodePacked("AUDIT_HEAD_VACANCY"));
        _certifyFact(factHash);

        vm.expectEmit(true, false, false, true);
        emit AuditHeadRemoved(auditHead, "court_certified_vacancy");

        budgetContract.vacateAuditHead();

        assertEq(constitution.getRole(ROLE_AUDIT_HEAD), address(0));
    }

    function test_happyCase_appointAfterVacancy() public {
        // Certify and vacate
        bytes32 factHash = keccak256(abi.encodePacked("AUDIT_HEAD_VACANCY"));
        _certifyFact(factHash);
        budgetContract.vacateAuditHead();
        assertEq(constitution.getRole(ROLE_AUDIT_HEAD), address(0));

        // Parliament appoints replacement via governance action
        address replacement = makeAddr("replacement");
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.appointAuditHead, (replacement))
        );

        assertEq(constitution.getRole(ROLE_AUDIT_HEAD), replacement);
        assertTrue(budgetContract.hasServedAsAuditHead(replacement));
    }

    function test_fullLifecycle_incapacityAndReplacement() public {
        // Verify initial audit head is in place
        assertEq(constitution.getRole(ROLE_AUDIT_HEAD), auditHead);

        // Audit head submits a report (existing functionality still works)
        vm.prank(auditHead);
        budgetContract.submitAuditReport(2025, keccak256("report2025"));
        assertTrue(budgetContract.hasAuditReport(2025));

        // Court certifies incapacity via real justices
        bytes32 factHash = keccak256(abi.encodePacked("AUDIT_HEAD_VACANCY"));
        _certifyFact(factHash);

        // Anyone triggers vacancy
        budgetContract.vacateAuditHead();
        assertEq(constitution.getRole(ROLE_AUDIT_HEAD), address(0));

        // Old audit head can no longer submit reports
        vm.prank(auditHead);
        vm.expectRevert(Budget.NotAuditHead.selector);
        budgetContract.submitAuditReport(2026, keccak256("report2026"));

        // Parliament appoints replacement via governance action
        address replacement = makeAddr("replacementAuditor");
        _executeMajlisAction(
            address(budgetContract),
            abi.encodeCall(Budget.appointAuditHead, (replacement))
        );
        assertEq(constitution.getRole(ROLE_AUDIT_HEAD), replacement);

        // Replacement can submit reports
        vm.prank(replacement);
        budgetContract.submitAuditReport(2026, keccak256("report2026"));
        assertTrue(budgetContract.hasAuditReport(2026));
    }
}
