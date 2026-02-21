// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Constitution.sol";
import "./Executive.sol";
import "./SupremeCourt.sol";

/// @title Budget
/// @notice Budget proposals, parliamentary approval, fund allocation, and audit.
///         Implements Part IX of the Constitution (Public Finance).
/// @dev Budget lifecycle:
///      1. PM proposes budget for a fiscal year
///      2. Parliament adopts (tracked as authorized contract call)
///      3. Funds allocated from approved budget
///      4. If no budget adopted by fiscal year start → prior year budget continues
///      5. Audit Office submits annual audit report
///
///      This contract tracks the procedural lifecycle of budgets on-chain.
///      Actual fund flows are represented as allocations against approved budgets.
contract Budget {
    // ─── Enums ───────────────────────────────────────────────────────────

    enum BudgetStatus {
        Proposed,    // PM has proposed the budget
        Approved,    // Parliament has approved
        Active,      // Currently the active budget for the fiscal year
        Rejected,    // Parliament rejected
        Superseded   // Continuation budget replaced by a properly adopted budget
    }

    // ─── Structs ─────────────────────────────────────────────────────────

    struct BudgetData {
        bytes32 budgetHash;       // Hash of the full budget document
        uint256 fiscalYear;
        uint256 totalAmount;
        uint256 allocatedAmount;
        address proposer;
        BudgetStatus status;
        uint256 proposedAt;
        uint256 approvedAt;
        bool isContinuation;      // True for continuation budgets (Art. IX.3)
    }

    struct AuditReport {
        bytes32 reportHash;
        uint256 fiscalYear;
        address auditor;
        uint256 submittedAt;
    }

    // ─── Errors ──────────────────────────────────────────────────────────

    error NotAuthorized();
    error ZeroAddress();
    error InvalidBudget();
    error NotInStatus(BudgetStatus expected);
    error BudgetAlreadyActive(uint256 fiscalYear);
    error InsufficientBudget(uint256 requested, uint256 available);
    error NoBudgetForYear(uint256 fiscalYear);
    error NotAuditHead();
    error AuditAlreadySubmitted(uint256 fiscalYear);
    error BudgetNotActive();
    error CaretakerModeActive();
    error DeputyDesignationOverdue();
    error NoBudgetToSupplement(uint256 fiscalYear);
    error AuditHeadActive();
    error AuditHeadAlreadyServed();
    error AuditHeadTermNotExpired();
    error AuditHeadVacancyNotCertified();
    error NoAuditHead();

    // ─── Events ──────────────────────────────────────────────────────────

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

    // ─── State ───────────────────────────────────────────────────────────

    Constitution public constitution;

    /// @notice All budgets (internal — use getBudget() for external access).
    BudgetData[] internal budgets;

    /// @notice Active budget for each fiscal year.
    mapping(uint256 => uint256) public activeBudgetForYear; // fiscalYear → budgetId
    mapping(uint256 => bool) public hasActiveBudget;        // fiscalYear → bool

    /// @notice Audit reports by fiscal year.
    mapping(uint256 => AuditReport) public auditReports;
    mapping(uint256 => bool) public hasAuditReport;

    // ─── Audit Head Lifecycle (Art. IX.4) ────────────────────────────────

    uint256 public constant AUDIT_HEAD_TERM = 9 * 365 days;
    uint256 public auditHeadTermStart;
    uint256 public auditHeadTermEnd;
    mapping(address => bool) public hasServedAsAuditHead;

    // ─── Constructor ─────────────────────────────────────────────────────

    constructor(address _constitution) {
        if (_constitution == address(0)) revert ZeroAddress();
        constitution = Constitution(_constitution);
    }

    // ─── Modifiers ───────────────────────────────────────────────────────

    modifier onlyExecutive() {
        if (msg.sender != constitution.getContract(constitution.CONTRACT_EXECUTIVE())) revert NotAuthorized();
        _;
    }

    modifier onlyParliament() {
        if (msg.sender != constitution.getContract(constitution.CONTRACT_PARLIAMENT())) revert NotAuthorized();
        _;
    }

    modifier onlyAuditHead() {
        address auditHead = constitution.getRole(constitution.ROLE_AUDIT_HEAD());
        if (msg.sender != auditHead) revert NotAuditHead();
        _;
    }

    // ─── Budget Proposal ────────────────────────────────────────────────

    /// @notice PM proposes a budget for a fiscal year.
    /// @param budgetHash Hash of the budget document.
    /// @param fiscalYear The fiscal year this budget covers.
    /// @param totalAmount The total budget amount (in smallest unit).
    /// @return budgetId The ID of the proposed budget.
    /// @dev Art. IX.1: "PM shall propose the annual budget." Access control uses
    ///      onlyExecutive (contract-level) rather than PM role check. PM enforcement
    ///      is at the Executive layer; this is a documented simplification.
    function proposeBudget(
        bytes32 budgetHash,
        uint256 fiscalYear,
        uint256 totalAmount
    ) external onlyExecutive returns (uint256 budgetId) {
        // Caretaker government cannot propose new budgets
        address execAddr = constitution.getContract(constitution.CONTRACT_EXECUTIVE());
        if (execAddr != address(0) && execAddr.code.length > 0) {
            Executive exec = Executive(execAddr);
            if (exec.isCaretaker()) revert CaretakerModeActive();
            // Art. IV.9.2: PM cannot submit legislation when Deputy PM designation is overdue
            if (exec.isDeputyOverdue()) revert DeputyDesignationOverdue();
        }
        budgetId = budgets.length;
        budgets.push(BudgetData({
            budgetHash: budgetHash,
            fiscalYear: fiscalYear,
            totalAmount: totalAmount,
            allocatedAmount: 0,
            proposer: msg.sender,
            status: BudgetStatus.Proposed,
            proposedAt: block.timestamp,
            approvedAt: 0,
            isContinuation: false
        }));

        emit BudgetProposed(budgetId, fiscalYear, totalAmount);
    }

    /// @notice Parliament approves a budget.
    /// @param budgetId The budget ID.
    function approveBudget(uint256 budgetId) external onlyParliament {
        if (budgetId >= budgets.length) revert InvalidBudget();
        BudgetData storage b = budgets[budgetId];
        if (b.status != BudgetStatus.Proposed) revert NotInStatus(BudgetStatus.Proposed);

        b.status = BudgetStatus.Approved;
        b.approvedAt = block.timestamp;

        emit BudgetApproved(budgetId, b.fiscalYear);
    }

    /// @notice Parliament rejects a budget.
    /// @param budgetId The budget ID.
    function rejectBudget(uint256 budgetId) external onlyParliament {
        if (budgetId >= budgets.length) revert InvalidBudget();
        BudgetData storage b = budgets[budgetId];
        if (b.status != BudgetStatus.Proposed) revert NotInStatus(BudgetStatus.Proposed);

        b.status = BudgetStatus.Rejected;

        emit BudgetRejected(budgetId, b.fiscalYear);
    }

    /// @notice Activate an approved budget for its fiscal year.
    ///         If a continuation budget is active for that year, it is superseded (Art. IX.3.4).
    /// @param budgetId The budget ID.
    function activateBudget(uint256 budgetId) external onlyExecutive {
        if (budgetId >= budgets.length) revert InvalidBudget();
        BudgetData storage b = budgets[budgetId];
        if (b.status != BudgetStatus.Approved) revert NotInStatus(BudgetStatus.Approved);

        if (hasActiveBudget[b.fiscalYear]) {
            uint256 currentId = activeBudgetForYear[b.fiscalYear];
            BudgetData storage current = budgets[currentId];
            if (!current.isContinuation) revert BudgetAlreadyActive(b.fiscalYear);
            current.status = BudgetStatus.Superseded;
            emit ContinuationBudgetSuperseded(currentId, budgetId, b.fiscalYear);
        }

        b.status = BudgetStatus.Active;
        activeBudgetForYear[b.fiscalYear] = budgetId;
        hasActiveBudget[b.fiscalYear] = true;

        emit BudgetActivated(budgetId, b.fiscalYear);
    }

    // ─── Fund Allocation ────────────────────────────────────────────────

    /// @notice Allocate funds from the active budget.
    /// @param budgetId The budget ID (must be active).
    /// @param category Category identifier for the allocation.
    /// @param amount Amount to allocate.
    function allocateFunds(uint256 budgetId, bytes32 category, uint256 amount) external onlyExecutive {
        if (budgetId >= budgets.length) revert InvalidBudget();
        BudgetData storage b = budgets[budgetId];
        if (b.status != BudgetStatus.Active) revert BudgetNotActive();

        uint256 available = b.totalAmount - b.allocatedAmount;
        if (amount > available) revert InsufficientBudget(amount, available);

        b.allocatedAmount += amount;

        emit FundsAllocated(budgetId, category, amount);
    }

    // ─── Prior Year Continuation ────────────────────────────────────────

    /// @notice Continue the prior year's budget when no new budget is adopted.
    ///         Creates a copy of the prior year's budget for the new fiscal year.
    /// @param priorYear The fiscal year whose budget to continue.
    /// @param newYear The new fiscal year.
    /// @return budgetId The ID of the continued budget.
    function continuePriorBudget(uint256 priorYear, uint256 newYear) external onlyParliament returns (uint256 budgetId) {
        if (!hasActiveBudget[priorYear]) revert NoBudgetForYear(priorYear);
        if (hasActiveBudget[newYear]) revert BudgetAlreadyActive(newYear);

        uint256 priorBudgetId = activeBudgetForYear[priorYear];
        BudgetData storage prior = budgets[priorBudgetId];

        budgetId = budgets.length;
        budgets.push(BudgetData({
            budgetHash: prior.budgetHash,
            fiscalYear: newYear,
            totalAmount: prior.totalAmount,
            allocatedAmount: 0,
            proposer: msg.sender,
            status: BudgetStatus.Active,
            proposedAt: block.timestamp,
            approvedAt: block.timestamp,
            isContinuation: true
        }));

        activeBudgetForYear[newYear] = budgetId;
        hasActiveBudget[newYear] = true;

        emit PriorBudgetContinued(budgetId, newYear);
    }

    // ─── Supplementary Budget ──────────────────────────────────────────

    /// @notice Parliament approves a supplementary budget, increasing the active budget's ceiling.
    ///         Art. IX.5: Parliament may approve a supplementary budget for the current fiscal year.
    /// @param fiscalYear The fiscal year whose active budget to supplement.
    /// @param additionalAmount The additional amount to add.
    /// @param supplementaryHash Hash of the supplementary budget document.
    function approveSupplementary(
        uint256 fiscalYear,
        uint256 additionalAmount,
        bytes32 supplementaryHash
    ) external onlyParliament {
        if (!hasActiveBudget[fiscalYear]) revert NoBudgetToSupplement(fiscalYear);
        uint256 budgetId = activeBudgetForYear[fiscalYear];
        BudgetData storage b = budgets[budgetId];

        b.totalAmount += additionalAmount;

        emit SupplementaryBudgetApproved(budgetId, fiscalYear, additionalAmount, b.totalAmount);
    }

    // ─── Audit ──────────────────────────────────────────────────────────

    /// @notice National Audit Office submits an audit report.
    /// @param fiscalYear The fiscal year being audited.
    /// @param reportHash Hash of the audit report document.
    function submitAuditReport(uint256 fiscalYear, bytes32 reportHash) external onlyAuditHead {
        if (hasAuditReport[fiscalYear]) revert AuditAlreadySubmitted(fiscalYear);

        auditReports[fiscalYear] = AuditReport({
            reportHash: reportHash,
            fiscalYear: fiscalYear,
            auditor: msg.sender,
            submittedAt: block.timestamp
        });
        hasAuditReport[fiscalYear] = true;

        emit AuditReportSubmitted(fiscalYear, reportHash);
    }

    // ─── Audit Head Appointment (Art. IX.4) ─────────────────────────────

    /// @notice Parliament appoints the Audit Head (Art. IX.4).
    ///         Nine-year non-renewable term. Cannot appoint while a current term is active.
    /// @param nominee The address to appoint.
    function appointAuditHead(address nominee) external onlyParliament {
        if (nominee == address(0)) revert ZeroAddress();
        address current = constitution.getRole(constitution.ROLE_AUDIT_HEAD());
        if (current != address(0)) revert AuditHeadActive();
        if (hasServedAsAuditHead[nominee]) revert AuditHeadAlreadyServed();

        hasServedAsAuditHead[nominee] = true;
        auditHeadTermStart = block.timestamp;
        auditHeadTermEnd = block.timestamp + AUDIT_HEAD_TERM;

        constitution.setRole(constitution.ROLE_AUDIT_HEAD(), nominee);

        emit AuditHeadAppointed(nominee, auditHeadTermEnd);
    }

    /// @notice Remove the Audit Head after their term expires. Anyone can call.
    function removeExpiredAuditHead() external {
        address current = constitution.getRole(constitution.ROLE_AUDIT_HEAD());
        if (current == address(0)) revert NoAuditHead();
        if (block.timestamp < auditHeadTermEnd) revert AuditHeadTermNotExpired();

        constitution.setRole(constitution.ROLE_AUDIT_HEAD(), address(0));

        emit AuditHeadRemoved(current, "term_expired");
    }

    /// @notice Vacate the Audit Head after Court certifies vacancy
    ///         (death, incapacity, misconduct). Anyone can call after certification.
    function vacateAuditHead() external {
        address current = constitution.getRole(constitution.ROLE_AUDIT_HEAD());
        if (current == address(0)) revert NoAuditHead();

        address courtAddr = constitution.getContract(constitution.CONTRACT_SUPREME_COURT());
        SupremeCourt court = SupremeCourt(courtAddr);
        bytes32 factHash = keccak256(abi.encodePacked("AUDIT_HEAD_VACANCY"));
        if (!court.isFactCertified(factHash)) revert AuditHeadVacancyNotCertified();

        constitution.setRole(constitution.ROLE_AUDIT_HEAD(), address(0));

        emit AuditHeadRemoved(current, "court_certified_vacancy");
    }

    // ─── View Functions ──────────────────────────────────────────────────

    /// @notice Get a budget's core data.
    function getBudget(uint256 budgetId) external view returns (
        bytes32 budgetHash, uint256 fiscalYear, uint256 totalAmount,
        uint256 allocatedAmount, address proposer, BudgetStatus status
    ) {
        if (budgetId >= budgets.length) revert InvalidBudget();
        BudgetData storage b = budgets[budgetId];
        return (b.budgetHash, b.fiscalYear, b.totalAmount, b.allocatedAmount, b.proposer, b.status);
    }

    /// @notice Get a budget's timestamps and continuation flag.
    function getBudgetMeta(uint256 budgetId) external view returns (
        uint256 proposedAt, uint256 approvedAt, bool isContinuation
    ) {
        if (budgetId >= budgets.length) revert InvalidBudget();
        BudgetData storage b = budgets[budgetId];
        return (b.proposedAt, b.approvedAt, b.isContinuation);
    }

    /// @notice Get the total number of budgets.
    function budgetCount() external view returns (uint256) {
        return budgets.length;
    }

    /// @notice Get a budget's status.
    function getBudgetStatus(uint256 budgetId) external view returns (BudgetStatus) {
        if (budgetId >= budgets.length) revert InvalidBudget();
        return budgets[budgetId].status;
    }

    /// @notice Get remaining budget for allocation.
    function getRemainingBudget(uint256 budgetId) external view returns (uint256) {
        if (budgetId >= budgets.length) revert InvalidBudget();
        BudgetData storage b = budgets[budgetId];
        return b.totalAmount - b.allocatedAmount;
    }
}
