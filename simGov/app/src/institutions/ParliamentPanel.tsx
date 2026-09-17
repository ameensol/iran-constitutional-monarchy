import type { GovState, GovAction } from '../simulation/types';
import { activeMajlisMembers, activeSenators, provincialCouncilMembers } from '../simulation/selectors';
import { useTranslation } from 'react-i18next';
import { activeLocale, billStageLabel, formatNumber, namedEntityDisplayName, partyDisplayName, personDisplayName, provinceDisplayName } from '../i18n/simulatorFormat';
import { PARTY_COLORS } from '../simulation/nameGen';
import InstitutionShell from './InstitutionShell';
import InstitutionActions from '../shared/InstitutionActions';
import type { ActionItem } from '../shared/InstitutionActions';
import { useTourAction, findTourTarget } from '../tour/TourActionContext';
import Badge from '../shared/Badge';

interface Props {
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  onBack: () => void;
  onClickPerson?: (personId: number) => void;
  onClickBill?: (billId: number) => void;
  readOnly?: boolean;
  hideBack?: boolean;
}

export default function ParliamentPanel({ state, dispatch, onBack, onClickPerson, onClickBill, readOnly, hideBack }: Props) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const n = (value: number) => formatNumber(value, locale);
  const { tourMode, activeTargets } = useTourAction();
  const showActions = !readOnly || tourMode;
  const majlis = activeMajlisMembers(state);
  const senators = activeSenators(state);
  const activeBills = state.bills.filter((b) => !['Enacted', 'Rejected', 'Vetoed'].includes(b.stage));
  const senateReviewBills = state.bills.filter((b) => b.stage === 'Senate Review');
  const senateObjectedBills = state.bills.filter((b) => b.stage === 'Senate Objected');
  const pendingJusticeVotes = state.court.appointments.filter(
    (a) => a.phase === 'SenateVote1' || a.phase === 'SenateVote2'
  );
  const activeAmendments = state.amendments.filter(
    (a) => !['Enacted', 'Rejected', 'Expired'].includes(a.phase)
  );

  // Party distribution for Majlis
  const majlisParties = new Map<string, number>();
  for (const m of majlis) {
    majlisParties.set(m.party, (majlisParties.get(m.party) || 0) + 1);
  }

  // ── Majlis actions ──
  const majlisActions: ActionItem[] = [
    {
      label: t('parliamentPanel.submit'),
      description: t('parliamentPanel.submitDesc'),
      onClick: () => dispatch({ type: 'SUBMIT_BILL', name: 'New Legislative Proposal', sponsor: 'citizen10' }),
      enabled: !state.parliament.dissolved,
      disabledReason: t('parliamentPanel.dissolved'),
      tourActionId: 'SUBMIT_BILL',
    },
    {
      label: t('parliamentPanel.noConfidence'),
      description: t('parliamentPanel.noConfidenceDesc'),
      onClick: () => dispatch({ type: 'FILE_NO_CONFIDENCE' }),
      enabled: state.executive.pmSeated && !state.executive.noConfidence && !state.parliament.dissolved,
      disabledReason: !state.executive.pmSeated ? t('parliamentPanel.noPm') : state.executive.noConfidence ? t('parliamentPanel.motionPending') : t('parliamentPanel.dissolved'),
      danger: true,
      confirmText: t('parliamentPanel.noConfidenceConfirm'),
    },
    {
      label: t('parliamentPanel.override'),
      description: senateObjectedBills.length > 0
        ? t('parliamentPanel.overrideDesc', { bill: senateObjectedBills[0].name })
        : t('parliamentPanel.noOverride'),
      onClick: () => {
        if (senateObjectedBills.length > 0) {
          dispatch({ type: 'MAJLIS_OVERRIDE_SENATE', billId: senateObjectedBills[0].id });
        }
      },
      enabled: senateObjectedBills.length > 0 && !state.parliament.dissolved,
      disabledReason: senateObjectedBills.length === 0 ? t('parliamentPanel.noOverride') : t('parliamentPanel.dissolved'),
      tourActionId: 'MAJLIS_OVERRIDE_SENATE',
    },
    {
      label: t('parliamentPanel.propose'),
      description: t('parliamentPanel.proposeDesc'),
      onClick: () => dispatch({ type: 'PROPOSE_AMENDMENT', title: 'Constitutional Reform Proposal' }),
      enabled: !state.parliament.dissolved,
      disabledReason: t('parliamentPanel.dissolved'),
    },
    {
      label: t('parliamentPanel.emergencyAmend'),
      description: t('parliamentPanel.emergencyDesc'),
      onClick: () => dispatch({ type: 'PROPOSE_EMERGENCY_AMENDMENT', title: 'Emergency Constitutional Measure' }),
      enabled: !state.parliament.dissolved,
      disabledReason: t('parliamentPanel.dissolved'),
      danger: true,
      confirmText: t('parliamentPanel.emergencyConfirm'),
    },
  ];

  // ── Senate actions ──
  const senateActions: ActionItem[] = [
    {
      label: t('parliamentPanel.approveBill'),
      description: senateReviewBills.length > 0
        ? t('parliamentPanel.approveBillDesc', { bill: namedEntityDisplayName(senateReviewBills[0].name, locale, t) })
        : t('parliamentPanel.noSenateBill'),
      onClick: () => {
        if (senateReviewBills.length > 0) {
          dispatch({ type: 'SENATE_APPROVE_BILL', billId: senateReviewBills[0].id });
        }
      },
      enabled: senateReviewBills.length > 0,
      disabledReason: t('parliamentPanel.noSenateBill'),
      tourActionId: 'SENATE_APPROVE_BILL',
    },
    {
      label: t('parliamentPanel.objectBill'),
      description: senateReviewBills.length > 0
        ? t('parliamentPanel.objectBillDesc', { bill: namedEntityDisplayName(senateReviewBills[0].name, locale, t) })
        : t('parliamentPanel.noSenateBill'),
      onClick: () => {
        if (senateReviewBills.length > 0) {
          dispatch({ type: 'SENATE_OBJECT_BILL', billId: senateReviewBills[0].id });
        }
      },
      enabled: senateReviewBills.length > 0,
      disabledReason: t('parliamentPanel.noSenateBill'),
      tourActionId: 'SENATE_OBJECT_BILL',
    },
    {
      label: t('parliamentPanel.initiateFormation'),
      description: t('parliamentPanel.initiateFormationDesc'),
      onClick: () => dispatch({ type: 'SENATE_START_FORMATION' }),
      enabled: state.crown.suspended && !state.executive.pmSeated && state.executive.formation.stage === 'Idle',
      disabledReason: !state.crown.suspended ? t('parliamentPanel.crownActive') : state.executive.pmSeated ? t('parliamentPanel.pmSeated') : t('parliamentPanel.formationOpen'),
    },
    {
      label: t('parliamentPanel.confirmJustice'),
      description: pendingJusticeVotes.length > 0
        ? t('parliamentPanel.confirmJusticeDesc', { seat: n(pendingJusticeVotes[0].seatNumber) })
        : t('parliamentPanel.noNominees'),
      onClick: () => {
        if (pendingJusticeVotes.length > 0) {
          dispatch({ type: 'RESOLVE_JUSTICE_VOTE', seatNumber: pendingJusticeVotes[0].seatNumber, outcome: 'approve' });
        }
      },
      enabled: pendingJusticeVotes.length > 0,
      disabledReason: t('parliamentPanel.noNominees'),
      tourActionId: 'RESOLVE_JUSTICE_VOTE_APPROVE',
    },
    {
      label: t('parliamentPanel.rejectJustice'),
      description: pendingJusticeVotes.length > 0
        ? t('parliamentPanel.rejectJusticeDesc', { seat: n(pendingJusticeVotes[0].seatNumber) })
        : t('parliamentPanel.noNominees'),
      onClick: () => {
        if (pendingJusticeVotes.length > 0) {
          dispatch({ type: 'RESOLVE_JUSTICE_VOTE', seatNumber: pendingJusticeVotes[0].seatNumber, outcome: 'reject' });
        }
      },
      enabled: pendingJusticeVotes.length > 0,
      disabledReason: t('parliamentPanel.noNominees'),
      danger: true,
      tourActionId: 'RESOLVE_JUSTICE_VOTE_REJECT',
    },
  ];

  return (
    <InstitutionShell title={t('institutions.parliament')} icon={'\u26E9'} healthy={!state.parliament.dissolved} onBack={onBack} hideBack={hideBack}>
      {state.parliament.dissolved && (
        <div className="inst-alert rose">{t('parliamentPanel.dissolved')}</div>
      )}

      {/* Majlis Section */}
      <div className="inst-section" data-tour-id="parl-majlis">
        <h3 className="inst-section-title">{t('parliamentPanel.majlis', { current: n(majlis.length), total: n(state.parliament.majlisTotal) })}</h3>
        <div className="inst-quorum-bar">
          <div className="quorum-fill" style={{ width: `${(majlis.length / state.parliament.majlisTotal) * 100}%` }} />
          <div className="quorum-line" style={{ left: '50%' }} />
          <span className="quorum-label">{t('parliamentPanel.quorum', { count: n(Math.ceil(state.parliament.majlisTotal / 2 + 1)) })}</span>
        </div>

        {/* Party distribution */}
        <div className="inst-party-grid">
          {Array.from(majlisParties.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([party, count]) => (
              <div key={party} className="party-chip">
                <span className="party-dot" style={{ background: PARTY_COLORS[party] || 'var(--pale-gold)' }} />
                {partyDisplayName(party, locale, t)} <span className="party-count">{n(count)}</span>
              </div>
            ))}
        </div>

        {/* Seating chart: colored dots */}
        <div className="seating-chart">
          {majlis.map((p) => (
            <div
              key={p.id}
              className="seat-dot"
              style={{ background: PARTY_COLORS[p.party] || 'var(--pale-gold)' }}
              data-tooltip={`${personDisplayName(p, locale)} (${partyDisplayName(p.party, locale, t)})`}
              title={`${personDisplayName(p, locale)} (${partyDisplayName(p.party, locale, t)})`}
              onClick={() => onClickPerson?.(p.id)}
            />
          ))}
          {Array.from({ length: state.parliament.majlisTotal - majlis.length }).map((_, i) => (
            <div key={`vacant-${i}`} className="seat-dot vacant" data-tooltip={t('parliamentPanel.vacantSeat')} title={t('parliamentPanel.vacantSeat')} />
          ))}
        </div>
      </div>

      {/* Majlis Actions */}
      {showActions && <InstitutionActions title={t('parliamentPanel.majlisActions')} actions={majlisActions} />}

      {/* No-confidence inline (if active) */}
      {state.executive.noConfidence && !state.executive.noConfidence.resolved && (
        <div className="inst-section">
          <div className="inst-alert rose">
            {t('parliamentPanel.confidence', { yes: n(state.executive.noConfidence.yesVotes), no: n(state.executive.noConfidence.noVotes), days: n(state.executive.noConfidence.deadline - state.day) })}
          </div>
          {showActions && (() => {
            const tPass = findTourTarget(activeTargets, 'RESOLVE_NO_CONFIDENCE_PASS');
            const tFail = findTourTarget(activeTargets, 'RESOLVE_NO_CONFIDENCE_FAIL');
            const showPass = !readOnly || (tourMode && tPass);
            const showFail = !readOnly || (tourMode && tFail);
            if (!showPass && !showFail) return null;
            return (
              <div className="inst-btn-row">
                {showPass && <button
                  className={`inst-action-btn danger ${tPass ? 'tour-action-target' : ''}`}
                  onClick={() => { dispatch({ type: 'RESOLVE_NO_CONFIDENCE', outcome: 'pass' }); tPass?.onActionTaken(); }}
                >
                  {t('parliamentPanel.motionPasses')}
                </button>}
                {showFail && <button
                  className={`inst-action-btn ${tFail ? 'tour-action-target' : ''}`}
                  onClick={() => { dispatch({ type: 'RESOLVE_NO_CONFIDENCE', outcome: 'fail' }); tFail?.onActionTaken(); }}
                >
                  {t('parliamentPanel.motionFails')}
                </button>}
              </div>
            );
          })()}
        </div>
      )}

      {/* Active Amendments */}
      {activeAmendments.length > 0 && (
        <div className="inst-section">
          <h3 className="inst-section-title">{t('parliamentPanel.amendments', { count: n(activeAmendments.length) })}</h3>
          <div className="inst-list">
            {activeAmendments.map((amend) => {
              const isProposed = amend.phase === 'Proposed';
              const isParl = amend.phase === 'ParliamentVote';
              const isRef = amend.phase === 'Referendum';
              return (
                <div key={amend.id} className="inst-list-item">
                  <span className="inst-list-name">{namedEntityDisplayName(amend.title, locale, t)}</span>
                  <Badge label={t(`amendmentPhases.${amend.phase}`)} variant={isRef ? 'gold' : 'turquoise'} />
                  <span className="inst-list-meta">{t('courtPanel.remaining', { days: n(amend.deadline - state.day) })}</span>
                  {amend.emergency && <Badge label={t('parliamentPanel.emergency')} variant="rose" />}
                  {showActions && isProposed && (
                    <div className="inst-btn-row compact">
                      <button
                        className="inst-action-btn small"
                        onClick={() => dispatch({ type: 'ADVANCE_AMENDMENT_TO_VOTE', amendmentId: amend.id })}
                      >
                        {t('parliamentPanel.beginParliament')}
                      </button>
                    </div>
                  )}
                  {showActions && isParl && (() => {
                    const tParlPass = findTourTarget(activeTargets, 'RESOLVE_AMENDMENT_PARL_PASS', amend.id);
                    const tParlFail = findTourTarget(activeTargets, 'RESOLVE_AMENDMENT_PARL_FAIL', amend.id);
                    const showParlPass = !readOnly || (tourMode && tParlPass);
                    const showParlFail = !readOnly || (tourMode && tParlFail);
                    if (!showParlPass && !showParlFail) return null;
                    return (
                      <div className="inst-btn-row compact">
                        {showParlPass && <button
                          className={`inst-action-btn small ${tParlPass ? 'tour-action-target' : ''}`}
                          onClick={() => { dispatch({ type: 'RESOLVE_AMENDMENT', amendmentId: amend.id, outcome: 'pass' }); tParlPass?.onActionTaken(); }}
                        >
                          {t('parliamentPanel.parliamentApproves')}
                        </button>}
                        {showParlFail && <button
                          className={`inst-action-btn small danger ${tParlFail ? 'tour-action-target' : ''}`}
                          onClick={() => { dispatch({ type: 'RESOLVE_AMENDMENT', amendmentId: amend.id, outcome: 'fail' }); tParlFail?.onActionTaken(); }}
                        >
                          {t('parliamentPanel.parliamentRejects')}
                        </button>}
                      </div>
                    );
                  })()}
                  {showActions && isRef && (() => {
                    const tRefPass = findTourTarget(activeTargets, 'RESOLVE_AMENDMENT_REF_PASS', amend.id);
                    const tRefFail = findTourTarget(activeTargets, 'RESOLVE_AMENDMENT_REF_FAIL', amend.id);
                    const showRefPass = !readOnly || (tourMode && tRefPass);
                    const showRefFail = !readOnly || (tourMode && tRefFail);
                    if (!showRefPass && !showRefFail) return null;
                    return (
                      <div className="inst-btn-row compact">
                        {showRefPass && <button
                          className={`inst-action-btn small ${tRefPass ? 'tour-action-target' : ''}`}
                          onClick={() => { dispatch({ type: 'RESOLVE_AMENDMENT', amendmentId: amend.id, outcome: 'pass' }); tRefPass?.onActionTaken(); }}
                        >
                          {t('parliamentPanel.referendumPasses')}
                        </button>}
                        {showRefFail && <button
                          className={`inst-action-btn small danger ${tRefFail ? 'tour-action-target' : ''}`}
                          onClick={() => { dispatch({ type: 'RESOLVE_AMENDMENT', amendmentId: amend.id, outcome: 'fail' }); tRefFail?.onActionTaken(); }}
                        >
                          {t('parliamentPanel.referendumFails')}
                        </button>}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Senate Section */}
      <div className="inst-section" data-tour-id="parl-senate">
        <h3 className="inst-section-title">{t('parliamentPanel.senate', { current: n(senators.length), total: n(state.parliament.senateTotal) })}</h3>
        <div className="seating-chart">
          {senators.map((p) => (
            <div
              key={p.id}
              className={`seat-dot ${p.role === 'crown_senator' ? 'crown-appointed' : ''}`}
              style={{ background: p.role === 'crown_senator' ? 'var(--gold)' : (PARTY_COLORS[p.party] || 'var(--pale-gold)') }}
              data-tooltip={`${personDisplayName(p, locale)} (${p.role === 'crown_senator' ? t('parliamentPanel.crownAppointed') : partyDisplayName(p.party, locale, t)})`}
              title={`${personDisplayName(p, locale)} (${p.role === 'crown_senator' ? t('parliamentPanel.crownAppointed') : partyDisplayName(p.party, locale, t)})`}
              onClick={() => onClickPerson?.(p.id)}
            />
          ))}
          {Array.from({ length: state.parliament.senateTotal - senators.length }).map((_, i) => (
            <div key={`vacant-${i}`} className="seat-dot vacant" data-tooltip={t('parliamentPanel.vacantSeat')} title={t('parliamentPanel.vacantSeat')} />
          ))}
        </div>
      </div>

      {/* Senate Actions */}
      {showActions && <InstitutionActions title={t('parliamentPanel.senateActions')} actions={senateActions} />}

      {/* Provincial Councils */}
      <div className="inst-section" data-tour-id="parl-councils">
        <h3 className="inst-section-title">{t('parliamentPanel.councils', { count: n(state.provinces.length) })}</h3>
        <div className="province-grid">
          {state.provinces.map((province) => {
            const members = provincialCouncilMembers(state, province.id);
            const full = members.length >= province.councilSize;
            const damaged = members.length < province.councilSize;
            return (
              <div key={province.id} className={`province-chip ${damaged ? 'province-damaged' : ''}`}>
                <span className="province-name">{provinceDisplayName(province, locale)}</span>
                <span className="province-meta">
                  <span className={`province-count ${full ? '' : 'incomplete'}`}>{n(members.length)}/{n(province.councilSize)}</span>
                  <span className="province-cohort">{t('parliamentPanel.cohort', { number: province.senateCohort })}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Bills */}
      <div className="inst-section" data-tour-id="parl-bills">
        <h3 className="inst-section-title">{t('parliamentPanel.bills', { count: n(activeBills.length) })}</h3>
        {activeBills.length === 0 ? (
          <div className="inst-empty">{t('parliamentPanel.noBills')}</div>
        ) : (
          <div className="inst-list">
            {activeBills.map((bill) => (
              <div
                key={bill.id}
                className={`inst-list-item ${onClickBill ? 'clickable' : ''}`}
                onClick={() => onClickBill?.(bill.id)}
              >
                <span className="inst-list-name">{namedEntityDisplayName(bill.name, locale, t)}</span>
                <Badge label={billStageLabel(bill.stage, t)} variant="gold" />
                <span className="inst-list-meta">{t('courtPanel.remaining', { days: n(bill.deadline - state.day) })}</span>
                {showActions && bill.stage === 'Introduced' && (() => {
                  const tourTarget = findTourTarget(activeTargets, 'BEGIN_MAJLIS_VOTE', bill.id);
                  const show = !readOnly || (tourMode && tourTarget);
                  if (!show) return null;
                  return (
                    <div className="inst-btn-row compact" onClick={(e) => e.stopPropagation()}>
                      <button
                        className={`inst-action-btn small ${tourTarget ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'ADVANCE_BILL_TO_STAGE', billId: bill.id, stage: 'Majlis Voting' }); tourTarget?.onActionTaken(); }}
                      >
                        {t('parliamentPanel.beginMajlis')}
                      </button>
                    </div>
                  );
                })()}
                {showActions && bill.stage === 'Majlis Voting' && (() => {
                  const tPass = findTourTarget(activeTargets, 'RESOLVE_MAJLIS_VOTE_PASS', bill.id);
                  const tReject = findTourTarget(activeTargets, 'RESOLVE_MAJLIS_VOTE_FAIL', bill.id);
                  const showPass = !readOnly || (tourMode && tPass);
                  const showReject = !readOnly || (tourMode && tReject);
                  if (!showPass && !showReject) return null;
                  return (
                    <div className="inst-btn-row compact" onClick={(e) => e.stopPropagation()}>
                      {showPass && <button
                        className={`inst-action-btn small ${tPass ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'RESOLVE_MAJLIS_VOTE', billId: bill.id, outcome: 'pass' }); tPass?.onActionTaken(); }}
                      >
                        {t('parliamentPanel.pass')}
                      </button>}
                      {showReject && <button
                        className={`inst-action-btn small danger ${tReject ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'RESOLVE_MAJLIS_VOTE', billId: bill.id, outcome: 'fail' }); tReject?.onActionTaken(); }}
                      >
                        {t('parliamentPanel.reject')}
                      </button>}
                    </div>
                  );
                })()}
                {showActions && bill.stage === 'Returned' && (() => {
                  const tRevote = findTourTarget(activeTargets, 'BEGIN_MAJLIS_REVOTE', bill.id);
                  const tDrop = findTourTarget(activeTargets, 'RESOLVE_RETURNED_BILL_DROP', bill.id);
                  const showRevote = !readOnly || (tourMode && tRevote);
                  const showDrop = !readOnly || (tourMode && tDrop);
                  if (!showRevote && !showDrop) return null;
                  return (
                    <div className="inst-btn-row compact" onClick={(e) => e.stopPropagation()}>
                      {showRevote && <button
                        className={`inst-action-btn small ${tRevote ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'RESOLVE_RETURNED_BILL', billId: bill.id, outcome: 'readopt' }); tRevote?.onActionTaken(); }}
                      >
                        {t('parliamentPanel.beginRevote')}
                      </button>}
                      {showDrop && <button
                        className={`inst-action-btn small danger ${tDrop ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'RESOLVE_RETURNED_BILL', billId: bill.id, outcome: 'drop' }); tDrop?.onActionTaken(); }}
                      >
                        {t('parliamentPanel.drop')}
                      </button>}
                    </div>
                  );
                })()}
                {showActions && bill.stage === 'Majlis Revote' && (() => {
                  const tPass = findTourTarget(activeTargets, 'RESOLVE_MAJLIS_REVOTE_PASS', bill.id);
                  const tReject = findTourTarget(activeTargets, 'RESOLVE_MAJLIS_REVOTE_FAIL', bill.id);
                  const showPass = !readOnly || (tourMode && tPass);
                  const showReject = !readOnly || (tourMode && tReject);
                  if (!showPass && !showReject) return null;
                  return (
                    <div className="inst-btn-row compact" onClick={(e) => e.stopPropagation()}>
                      {showPass && <button
                        className={`inst-action-btn small ${tPass ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'RESOLVE_MAJLIS_VOTE', billId: bill.id, outcome: 'pass' }); tPass?.onActionTaken(); }}
                      >
                        {t('parliamentPanel.pass')}
                      </button>}
                      {showReject && <button
                        className={`inst-action-btn small danger ${tReject ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'RESOLVE_MAJLIS_VOTE', billId: bill.id, outcome: 'fail' }); tReject?.onActionTaken(); }}
                      >
                        {t('parliamentPanel.reject')}
                      </button>}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>
    </InstitutionShell>
  );
}
