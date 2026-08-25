import type { GovState, GovEvent, BudgetState } from '../types';

/** Tick budget cycle: fiscal year rollover and audit. */
export function tickBudget(state: GovState, day: number): { budget: BudgetState; events: GovEvent[] } {
  const events: GovEvent[] = [];
  let budget = state.budget;

  // Fiscal year rollover every 365 days (simplified)
  if (day % 365 === 0 && (budget.status === 'Active' || budget.status === 'Continuation')) {
    const newFY = budget.fiscalYear + 1;
    events.push({
      day,
      marker: 'budget',
      description: `Fiscal year ${newFY} begins; PM must propose a new budget`,
      call: `Budget.newFiscalYear(fy: ${newFY}) → awaiting proposal`,
    });
    budget = {
      ...budget,
      fiscalYear: newFY,
      status: 'None',
      allocated: 0,
      totalAmount: 0,
      proposedDay: null,
      deadline: day + 90,
      rejectCount: 0,
      supplementaryCount: 0,
    };
  }

  // Auto-continue prior budget if no proposal by deadline
  if (budget.status === 'None' && budget.deadline !== null && day >= budget.deadline) {
    events.push({
      day,
      marker: 'budget',
      description: `No budget proposed for FY ${budget.fiscalYear}; prior year budget continues (Art. IX.3)`,
      call: `Budget.continuePrior(fy: ${budget.fiscalYear}) → continuation`,
    });
    budget = {
      ...budget,
      status: 'Continuation',
      allocated: 60,
      totalAmount: 700,
      deadline: null,
    };
  }

  // Audit head term expiry
  if (budget.auditHeadId !== null && budget.auditHeadTermEnd !== null && day >= budget.auditHeadTermEnd) {
    events.push({
      day,
      marker: 'budget',
      description: 'Audit Head term expired; Parliament must appoint a new one',
      call: 'Budget.removeExpiredAuditHead()',
    });
    budget = {
      ...budget,
      auditHeadId: null,
      auditHeadTermEnd: null,
    };
  }

  return { budget, events };
}
