import type { GovState, GovAction } from '../simulation/types';
import InstitutionShell from './InstitutionShell';
import InstitutionActions from '../shared/InstitutionActions';
import type { ActionItem } from '../shared/InstitutionActions';
import Badge from '../shared/Badge';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber, formatPercent } from '../i18n/simulatorFormat';

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
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const number = (value: number) => formatNumber(value, locale);
  const percent = (value: number) => formatPercent(value, locale);
  const budget = state.budget;
  const showActions = !readOnly;
  const hasPM = state.executive.pmSeated;
  const hasAuditHead = budget.auditHeadId !== null;
  const budgetActive = budget.status === 'Active' || budget.status === 'Continuation';

  // ── PM / Executive actions ──
  const pmActions: ActionItem[] = [
    {
      label: t('budgetPanel.propose'),
      description: t('budgetPanel.proposeDesc', { year: number(budget.fiscalYear) }),
      onClick: () => dispatch({ type: 'PROPOSE_BUDGET', totalAmount: 800 + ((state.day * 37) % 200) }),
      enabled: hasPM && (budget.status === 'None' || budget.status === 'Rejected'),
      disabledReason: !hasPM ? t('budgetPanel.noPm') : t('budgetPanel.alreadyProposed'),
    },
    {
      label: t('budgetPanel.activate'),
      description: t('budgetPanel.activateDesc'),
      onClick: () => dispatch({ type: 'ACTIVATE_BUDGET' }),
      enabled: hasPM && budget.status === 'Approved',
      disabledReason: !hasPM ? t('budgetPanel.noPm') : t('budgetPanel.notApproved'),
    },
    {
      label: t('budgetPanel.allocate'),
      description: budgetActive
        ? t('budgetPanel.allocateDesc', { percent: percent(budget.allocated) })
        : t('budgetPanel.noActive'),
      onClick: () => dispatch({ type: 'ALLOCATE_FUNDS', amount: 10 }),
      enabled: hasPM && budgetActive && budget.allocated < 100,
      disabledReason: !hasPM ? t('budgetPanel.noPm') : !budgetActive ? t('budgetPanel.noActive') : t('budgetPanel.fullyAllocated'),
    },
  ];

  // ── Parliament actions ──
  const parlActions: ActionItem[] = [
    {
      label: t('budgetPanel.approve'),
      description: t('budgetPanel.approveDesc', { year: number(budget.fiscalYear), amount: number(budget.totalAmount) }),
      onClick: () => dispatch({ type: 'APPROVE_BUDGET' }),
      enabled: budget.status === 'Proposed' && !state.parliament.dissolved,
      disabledReason: budget.status !== 'Proposed' ? t('budgetPanel.nothingApprove') : t('budgetPanel.dissolved'),
    },
    {
      label: t('budgetPanel.reject'),
      description: t('budgetPanel.rejectDesc', { count: number(budget.rejectCount) }),
      onClick: () => dispatch({ type: 'REJECT_BUDGET' }),
      enabled: budget.status === 'Proposed' && !state.parliament.dissolved,
      disabledReason: budget.status !== 'Proposed' ? t('budgetPanel.nothingReject') : t('budgetPanel.dissolved'),
      danger: true,
    },
    {
      label: t('budgetPanel.continue'),
      description: t('budgetPanel.continueDesc'),
      onClick: () => dispatch({ type: 'CONTINUE_PRIOR_BUDGET' }),
      enabled: (budget.status === 'None' || budget.status === 'Rejected') && !state.parliament.dissolved,
      disabledReason: state.parliament.dissolved ? t('budgetPanel.dissolved') : t('budgetPanel.alreadyProposed'),
    },
    {
      label: t('budgetPanel.supplementary'),
      description: budgetActive
        ? t('budgetPanel.supplementaryDesc', { amount: number(budget.totalAmount) })
        : t('budgetPanel.noActive'),
      onClick: () => dispatch({ type: 'APPROVE_SUPPLEMENTARY', amount: 100 }),
      enabled: budgetActive && !state.parliament.dissolved,
      disabledReason: !budgetActive ? t('budgetPanel.noActive') : t('budgetPanel.dissolved'),
    },
    {
      label: t('budgetPanel.appointAudit'),
      description: hasAuditHead ? t('budgetPanel.auditServing') : t('budgetPanel.appointAuditDesc'),
      onClick: () => dispatch({ type: 'APPOINT_AUDIT_HEAD' }),
      enabled: !hasAuditHead && !state.parliament.dissolved,
      disabledReason: hasAuditHead ? t('budgetPanel.auditServing') : t('budgetPanel.dissolved'),
    },
  ];

  // ── Audit actions ──
  const auditActions: ActionItem[] = [
    {
      label: t('budgetPanel.cleanReport'),
      description: t('budgetPanel.cleanDesc'),
      onClick: () => dispatch({ type: 'SUBMIT_AUDIT_REPORT', clean: true }),
      enabled: hasAuditHead,
      disabledReason: t('budgetPanel.noAudit'),
    },
    {
      label: t('budgetPanel.flag'),
      description: t('budgetPanel.flagDesc'),
      onClick: () => dispatch({ type: 'SUBMIT_AUDIT_REPORT', clean: false }),
      enabled: hasAuditHead,
      disabledReason: t('budgetPanel.noAudit'),
      danger: true,
    },
  ];

  return (
    <InstitutionShell title={t('institutions.budget')} icon={'\u2696'} healthy={budget.auditClean && budgetActive} onBack={onBack} hideBack={hideBack}>
      {budget.status === 'Rejected' && (
        <div className="inst-alert rose">
          {t('budgetPanel.rejectedAlert', { count: number(budget.rejectCount) })}
        </div>
      )}
      {budget.status === 'None' && (
        <div className="inst-alert turquoise">
          {t('budgetPanel.noneAlert', { year: number(budget.fiscalYear) })}
        </div>
      )}
      {budget.status === 'Continuation' && (
        <div className="inst-alert turquoise">
          {t('budgetPanel.continuationAlert')}
        </div>
      )}

      {/* Fiscal Year Overview */}
      <div className="inst-section" data-tour-id="budget-fiscal">
        <h3 className="inst-section-title">{t('budgetPanel.fiscal', { year: number(budget.fiscalYear) })}</h3>
        <div className="inst-list">
          <div className="inst-list-item">
            <span className="inst-list-name">{t('labels.status')}</span>
            <Badge label={t(`budgetStatuses.${budget.status}`)} variant={STATUS_VARIANTS[budget.status] || 'turquoise'} />
          </div>
          {budget.totalAmount > 0 && (
            <div className="inst-list-item">
              <span className="inst-list-name">{t('budgetPanel.total')}</span>
              <span className="inst-list-meta">{t('budgetPanel.units', { amount: number(budget.totalAmount) })}</span>
            </div>
          )}
          {budget.supplementaryCount > 0 && (
            <div className="inst-list-item">
              <span className="inst-list-name">{t('budgetPanel.supplements')}</span>
              <span className="inst-list-meta">{t('budgetPanel.approvedCount', { count: number(budget.supplementaryCount) })}</span>
            </div>
          )}
          {budget.deadline && (
            <div className="inst-list-item">
              <span className="inst-list-name">{t('budgetPanel.deadline')}</span>
              <span className="inst-list-meta">{t('budgetPanel.remaining', { days: number(budget.deadline - state.day) })}</span>
            </div>
          )}
        </div>
      </div>

      {/* Allocation Bar */}
      {budgetActive && (
        <div className="inst-section" data-tour-id="budget-allocation">
          <h3 className="inst-section-title">{t('budgetPanel.allocation', { percent: percent(budget.allocated) })}</h3>
          <div className="budget-bar-container">
            <div className="budget-bar">
              <div className="budget-bar-fill" style={{ width: `${budget.allocated}%` }} />
            </div>
            <span className="budget-bar-label">{percent(budget.allocated)}</span>
          </div>
        </div>
      )}

      {/* PM / Executive Actions */}
      {showActions && <InstitutionActions title={t('budgetPanel.executiveActions')} actions={pmActions} />}

      {/* Parliament Actions */}
      {showActions && <InstitutionActions title={t('budgetPanel.parliamentActions')} actions={parlActions} />}

      {/* Audit Section */}
      <div className="inst-section">
        <h3 className="inst-section-title">{t('budgetPanel.audit')}</h3>
        <div className="inst-list">
          <div className="inst-list-item">
            <span className="inst-list-name">{t('budgetPanel.auditHead')}</span>
            {hasAuditHead ? (
              <Badge label={t('budgetPanel.appointed')} variant="emerald" />
            ) : (
              <Badge label={t('labels.vacant')} variant="rose" />
            )}
          </div>
          {budget.auditHeadTermEnd && (
            <div className="inst-list-item">
              <span className="inst-list-name">{t('budgetPanel.termExpires')}</span>
              <span className="inst-list-meta">{t('budgetPanel.remaining', { days: number(budget.auditHeadTermEnd - state.day) })}</span>
            </div>
          )}
          <div className="inst-list-item">
            <span className="inst-list-name">{t('budgetPanel.lastReport')}</span>
            <Badge label={t(budget.auditClean ? 'budgetPanel.clean' : 'budgetPanel.issues')} variant={budget.auditClean ? 'emerald' : 'rose'} />
          </div>
        </div>
      </div>

      {/* Audit Actions */}
      {showActions && <InstitutionActions title={t('budgetPanel.auditActions')} actions={auditActions} />}

      {/* Related Amendments */}
      {state.amendments.filter((a) => a.title.toLowerCase().includes('economic') || a.title.toLowerCase().includes('budget')).length > 0 && (
        <div className="inst-section">
          <h3 className="inst-section-title">{t('budgetPanel.related')}</h3>
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
