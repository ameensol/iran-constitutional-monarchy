import type { GovState, GovAction } from '../simulation/types';
import InstitutionShell from './InstitutionShell';
import InstitutionActions from '../shared/InstitutionActions';
import type { ActionItem } from '../shared/InstitutionActions';
import Badge from '../shared/Badge';

interface Props {
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  onBack: () => void;
  readOnly?: boolean;
  hideBack?: boolean;
}

const STATUS_VARIANTS: Record<string, 'gold' | 'turquoise' | 'emerald' | 'rose'> = {
  'None': 'turquoise',
  'Proposed': 'turquoise',
  'Approved': 'turquoise',
  'Active': 'gold',
  'Rejected': 'rose',
  'Continuation': 'turquoise',
};

export default function BudgetPanel({ state, dispatch, onBack, readOnly, hideBack }: Props) {
  const budget = state.budget;
  const showActions = !readOnly;
  const hasPM = state.executive.pmSeated;
  const hasAuditHead = budget.auditHeadId !== null;
  const budgetActive = budget.status === 'Active' || budget.status === 'Continuation';

  // ── PM / Executive actions ──
  const pmActions: ActionItem[] = [
    {
      label: 'Propose Budget',
      description: `PM proposes FY ${budget.fiscalYear} budget for Parliament approval`,
      onClick: () => dispatch({ type: 'PROPOSE_BUDGET', totalAmount: 800 + Math.floor(Math.random() * 200) }),
      enabled: hasPM && (budget.status === 'None' || budget.status === 'Rejected'),
      disabledReason: !hasPM ? 'No PM seated' : 'Budget already proposed',
    },
    {
      label: 'Activate Budget',
      description: 'Put Parliament-approved budget into effect',
      onClick: () => dispatch({ type: 'ACTIVATE_BUDGET' }),
      enabled: hasPM && budget.status === 'Approved',
      disabledReason: !hasPM ? 'No PM seated' : 'Budget not yet approved by Parliament',
    },
    {
      label: 'Allocate Funds',
      description: budgetActive
        ? `Allocate 10% of budget (currently ${budget.allocated}% allocated)`
        : 'No active budget to allocate from',
      onClick: () => dispatch({ type: 'ALLOCATE_FUNDS', amount: 10 }),
      enabled: hasPM && budgetActive && budget.allocated < 100,
      disabledReason: !hasPM ? 'No PM seated' : !budgetActive ? 'No active budget' : 'Fully allocated',
    },
  ];

  // ── Parliament actions ──
  const parlActions: ActionItem[] = [
    {
      label: 'Approve Budget',
      description: `Approve the proposed FY ${budget.fiscalYear} budget (${budget.totalAmount} units)`,
      onClick: () => dispatch({ type: 'APPROVE_BUDGET' }),
      enabled: budget.status === 'Proposed' && !state.parliament.dissolved,
      disabledReason: budget.status !== 'Proposed' ? 'No budget to approve' : 'Parliament is dissolved',
    },
    {
      label: 'Reject Budget',
      description: `Reject the proposed budget (rejected ${budget.rejectCount} time${budget.rejectCount !== 1 ? 's' : ''} so far)`,
      onClick: () => dispatch({ type: 'REJECT_BUDGET' }),
      enabled: budget.status === 'Proposed' && !state.parliament.dissolved,
      disabledReason: budget.status !== 'Proposed' ? 'No budget to reject' : 'Parliament is dissolved',
      danger: true,
    },
    {
      label: 'Continue Prior Budget',
      description: 'Extend prior year budget when no new budget is adopted (Art. IX.3)',
      onClick: () => dispatch({ type: 'CONTINUE_PRIOR_BUDGET' }),
      enabled: (budget.status === 'None' || budget.status === 'Rejected') && !state.parliament.dissolved,
      disabledReason: state.parliament.dissolved ? 'Parliament is dissolved' : 'Budget already active or proposed',
    },
    {
      label: 'Approve Supplementary',
      description: budgetActive
        ? `Increase current budget by 100 units (currently ${budget.totalAmount})`
        : 'No active budget',
      onClick: () => dispatch({ type: 'APPROVE_SUPPLEMENTARY', amount: 100 }),
      enabled: budgetActive && !state.parliament.dissolved,
      disabledReason: !budgetActive ? 'No active budget' : 'Parliament is dissolved',
    },
    {
      label: 'Appoint Audit Head',
      description: hasAuditHead ? 'Audit Head already serving' : 'Appoint an independent Audit Head (9-year term)',
      onClick: () => dispatch({ type: 'APPOINT_AUDIT_HEAD' }),
      enabled: !hasAuditHead && !state.parliament.dissolved,
      disabledReason: hasAuditHead ? 'Audit Head already serving' : 'Parliament is dissolved',
    },
  ];

  // ── Audit actions ──
  const auditActions: ActionItem[] = [
    {
      label: 'Submit Clean Report',
      description: 'Audit Head certifies clean fiscal management',
      onClick: () => dispatch({ type: 'SUBMIT_AUDIT_REPORT', clean: true }),
      enabled: hasAuditHead,
      disabledReason: 'No Audit Head appointed',
    },
    {
      label: 'Flag Issues',
      description: 'Audit Head reports irregularities',
      onClick: () => dispatch({ type: 'SUBMIT_AUDIT_REPORT', clean: false }),
      enabled: hasAuditHead,
      disabledReason: 'No Audit Head appointed',
      danger: true,
    },
  ];

  return (
    <InstitutionShell title="Budget" icon={'\u2696'} healthy={budget.auditClean && budgetActive} onBack={onBack} hideBack={hideBack}>
      {budget.status === 'Rejected' && (
        <div className="inst-alert rose">
          Budget rejected {budget.rejectCount} time{budget.rejectCount !== 1 ? 's' : ''}. PM must resubmit or Parliament must continue prior year budget.
        </div>
      )}
      {budget.status === 'None' && (
        <div className="inst-alert turquoise">
          No budget proposed yet for FY {budget.fiscalYear}. The PM must propose one.
        </div>
      )}
      {budget.status === 'Continuation' && (
        <div className="inst-alert turquoise">
          Running on prior year continuation budget (Art. IX.3). PM should propose a proper budget.
        </div>
      )}

      {/* Fiscal Year Overview */}
      <div className="inst-section" data-tour-id="budget-fiscal">
        <h3 className="inst-section-title">Fiscal Year {budget.fiscalYear}</h3>
        <div className="inst-list">
          <div className="inst-list-item">
            <span className="inst-list-name">Status</span>
            <Badge label={budget.status} variant={STATUS_VARIANTS[budget.status] || 'turquoise'} />
          </div>
          {budget.totalAmount > 0 && (
            <div className="inst-list-item">
              <span className="inst-list-name">Total Budget</span>
              <span className="inst-list-meta">{budget.totalAmount} units</span>
            </div>
          )}
          {budget.supplementaryCount > 0 && (
            <div className="inst-list-item">
              <span className="inst-list-name">Supplementary Budgets</span>
              <span className="inst-list-meta">{budget.supplementaryCount} approved</span>
            </div>
          )}
          {budget.deadline && (
            <div className="inst-list-item">
              <span className="inst-list-name">Deadline</span>
              <span className="inst-list-meta">{budget.deadline - state.day}d remaining</span>
            </div>
          )}
        </div>
      </div>

      {/* Allocation Bar */}
      {budgetActive && (
        <div className="inst-section" data-tour-id="budget-allocation">
          <h3 className="inst-section-title">Allocation ({budget.allocated}%)</h3>
          <div className="budget-bar-container">
            <div className="budget-bar">
              <div className="budget-bar-fill" style={{ width: `${budget.allocated}%` }} />
            </div>
            <span className="budget-bar-label">{budget.allocated}%</span>
          </div>
        </div>
      )}

      {/* PM / Executive Actions */}
      {showActions && <InstitutionActions title="Executive Actions" actions={pmActions} />}

      {/* Parliament Actions */}
      {showActions && <InstitutionActions title="Parliament Actions" actions={parlActions} />}

      {/* Audit Section */}
      <div className="inst-section">
        <h3 className="inst-section-title">Audit</h3>
        <div className="inst-list">
          <div className="inst-list-item">
            <span className="inst-list-name">Audit Head</span>
            {hasAuditHead ? (
              <Badge label="Appointed" variant="emerald" />
            ) : (
              <Badge label="Vacant" variant="rose" />
            )}
          </div>
          {budget.auditHeadTermEnd && (
            <div className="inst-list-item">
              <span className="inst-list-name">Term Expires</span>
              <span className="inst-list-meta">{budget.auditHeadTermEnd - state.day}d</span>
            </div>
          )}
          <div className="inst-list-item">
            <span className="inst-list-name">Last Report</span>
            <Badge label={budget.auditClean ? 'Clean' : 'Issues Found'} variant={budget.auditClean ? 'emerald' : 'rose'} />
          </div>
        </div>
      </div>

      {/* Audit Actions */}
      {showActions && <InstitutionActions title="Audit Actions" actions={auditActions} />}

      {/* Related Amendments */}
      {state.amendments.filter((a) => a.title.toLowerCase().includes('economic') || a.title.toLowerCase().includes('budget')).length > 0 && (
        <div className="inst-section">
          <h3 className="inst-section-title">Related Amendments</h3>
          <div className="inst-list">
            {state.amendments
              .filter((a) => a.title.toLowerCase().includes('economic') || a.title.toLowerCase().includes('budget'))
              .map((a) => (
                <div key={a.id} className="inst-list-item">
                  <span className="inst-list-name">{a.title}</span>
                  <Badge label={a.phase} variant={a.phase === 'Enacted' ? 'emerald' : a.phase === 'Rejected' ? 'rose' : 'turquoise'} />
                </div>
              ))}
          </div>
        </div>
      )}
    </InstitutionShell>
  );
}
