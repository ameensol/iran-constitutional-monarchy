import type { GovState, GovAction } from '../simulation/types';
import { personName } from '../simulation/types';
import { activeMajlisMembers, activeSenators, provincialCouncilMembers } from '../simulation/selectors';
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
      label: 'Submit New Bill',
      description: 'Introduce a legislative proposal to the Majlis',
      onClick: () => dispatch({ type: 'SUBMIT_BILL', name: 'New Legislative Proposal', sponsor: 'citizen10' }),
      enabled: !state.parliament.dissolved,
      disabledReason: 'Parliament is dissolved',
      tourActionId: 'SUBMIT_BILL',
    },
    {
      label: 'File No-Confidence',
      description: 'Challenge the Prime Minister\'s mandate',
      onClick: () => dispatch({ type: 'FILE_NO_CONFIDENCE' }),
      enabled: state.executive.pmSeated && !state.executive.noConfidence && !state.parliament.dissolved,
      disabledReason: !state.executive.pmSeated ? 'No PM seated' : state.executive.noConfidence ? 'Motion already pending' : 'Parliament is dissolved',
      danger: true,
      confirmText: 'File a no-confidence motion against the Prime Minister?',
    },
    {
      label: 'Override Senate',
      description: senateObjectedBills.length > 0
        ? `Override Senate objection on ${senateObjectedBills[0].name}`
        : 'No bills awaiting override',
      onClick: () => {
        if (senateObjectedBills.length > 0) {
          dispatch({ type: 'MAJLIS_OVERRIDE_SENATE', billId: senateObjectedBills[0].id });
        }
      },
      enabled: senateObjectedBills.length > 0 && !state.parliament.dissolved,
      disabledReason: senateObjectedBills.length === 0 ? 'No bills awaiting override' : 'Parliament is dissolved',
      tourActionId: 'MAJLIS_OVERRIDE_SENATE',
    },
    {
      label: 'Propose Amendment',
      description: 'Propose a constitutional amendment for Parliament vote',
      onClick: () => dispatch({ type: 'PROPOSE_AMENDMENT', title: 'Constitutional Reform Proposal' }),
      enabled: !state.parliament.dissolved,
      disabledReason: 'Parliament is dissolved',
    },
    {
      label: 'Emergency Amendment',
      description: 'Enact by 3/4 Parliament vote, no referendum (expires in 1 year unless ratified)',
      onClick: () => dispatch({ type: 'PROPOSE_EMERGENCY_AMENDMENT', title: 'Emergency Constitutional Measure' }),
      enabled: !state.parliament.dissolved,
      disabledReason: 'Parliament is dissolved',
      danger: true,
      confirmText: 'Propose an emergency amendment? This bypasses referendum but expires in 1 year.',
    },
  ];

  // ── Senate actions ──
  const senateActions: ActionItem[] = [
    {
      label: 'Approve Bill',
      description: senateReviewBills.length > 0
        ? `Approve ${senateReviewBills[0].name}`
        : 'No bills in Senate review',
      onClick: () => {
        if (senateReviewBills.length > 0) {
          dispatch({ type: 'SENATE_APPROVE_BILL', billId: senateReviewBills[0].id });
        }
      },
      enabled: senateReviewBills.length > 0,
      disabledReason: 'No bills in Senate review',
      tourActionId: 'SENATE_APPROVE_BILL',
    },
    {
      label: 'Object to Bill',
      description: senateReviewBills.length > 0
        ? `Object to ${senateReviewBills[0].name}`
        : 'No bills in Senate review',
      onClick: () => {
        if (senateReviewBills.length > 0) {
          dispatch({ type: 'SENATE_OBJECT_BILL', billId: senateReviewBills[0].id });
        }
      },
      enabled: senateReviewBills.length > 0,
      disabledReason: 'No bills in Senate review',
      tourActionId: 'SENATE_OBJECT_BILL',
    },
    {
      label: 'Initiate Formation',
      description: 'Begin PM formation during Crown suspension (Art. VI.5)',
      onClick: () => dispatch({ type: 'SENATE_START_FORMATION' }),
      enabled: state.crown.suspended && !state.executive.pmSeated && state.executive.formation.stage === 'Idle',
      disabledReason: !state.crown.suspended ? 'Crown is active' : state.executive.pmSeated ? 'PM is seated' : 'Formation already in progress',
    },
    {
      label: 'Confirm Justice',
      description: pendingJusticeVotes.length > 0
        ? `Confirm nominee for Seat ${pendingJusticeVotes[0].seatNumber}`
        : 'No nominees pending',
      onClick: () => {
        if (pendingJusticeVotes.length > 0) {
          dispatch({ type: 'RESOLVE_JUSTICE_VOTE', seatNumber: pendingJusticeVotes[0].seatNumber, outcome: 'approve' });
        }
      },
      enabled: pendingJusticeVotes.length > 0,
      disabledReason: 'No nominees pending',
      tourActionId: 'RESOLVE_JUSTICE_VOTE_APPROVE',
    },
    {
      label: 'Reject Justice',
      description: pendingJusticeVotes.length > 0
        ? `Reject nominee for Seat ${pendingJusticeVotes[0].seatNumber}`
        : 'No nominees pending',
      onClick: () => {
        if (pendingJusticeVotes.length > 0) {
          dispatch({ type: 'RESOLVE_JUSTICE_VOTE', seatNumber: pendingJusticeVotes[0].seatNumber, outcome: 'reject' });
        }
      },
      enabled: pendingJusticeVotes.length > 0,
      disabledReason: 'No nominees pending',
      danger: true,
      tourActionId: 'RESOLVE_JUSTICE_VOTE_REJECT',
    },
  ];

  return (
    <InstitutionShell title="Parliament" icon={'\u26E9'} healthy={!state.parliament.dissolved} onBack={onBack} hideBack={hideBack}>
      {state.parliament.dissolved && (
        <div className="inst-alert rose">Parliament is dissolved. Elections required within 60 days.</div>
      )}

      {/* Majlis Section */}
      <div className="inst-section" data-tour-id="parl-majlis">
        <h3 className="inst-section-title">Majlis ({majlis.length}/{state.parliament.majlisTotal})</h3>
        <div className="inst-quorum-bar">
          <div className="quorum-fill" style={{ width: `${(majlis.length / state.parliament.majlisTotal) * 100}%` }} />
          <div className="quorum-line" style={{ left: '50%' }} />
          <span className="quorum-label">Quorum: {Math.ceil(state.parliament.majlisTotal / 2 + 1)}</span>
        </div>

        {/* Party distribution */}
        <div className="inst-party-grid">
          {Array.from(majlisParties.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([party, count]) => (
              <div key={party} className="party-chip">
                <span className="party-dot" style={{ background: PARTY_COLORS[party] || 'var(--pale-gold)' }} />
                {party} <span className="party-count">{count}</span>
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
              data-tooltip={`${personName(p)} (${p.party})`}
              title={`${personName(p)} (${p.party})`}
              onClick={() => onClickPerson?.(p.id)}
            />
          ))}
          {Array.from({ length: state.parliament.majlisTotal - majlis.length }).map((_, i) => (
            <div key={`vacant-${i}`} className="seat-dot vacant" data-tooltip="Vacant seat" title="Vacant seat" />
          ))}
        </div>
      </div>

      {/* Majlis Actions */}
      {showActions && <InstitutionActions title="Majlis Actions" actions={majlisActions} />}

      {/* No-confidence inline (if active) */}
      {state.executive.noConfidence && !state.executive.noConfidence.resolved && (
        <div className="inst-section">
          <div className="inst-alert rose">
            No-confidence vote in progress — {state.executive.noConfidence.yesVotes} yes / {state.executive.noConfidence.noVotes} no — {state.executive.noConfidence.deadline - state.day}d remaining
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
                  Motion Passes
                </button>}
                {showFail && <button
                  className={`inst-action-btn ${tFail ? 'tour-action-target' : ''}`}
                  onClick={() => { dispatch({ type: 'RESOLVE_NO_CONFIDENCE', outcome: 'fail' }); tFail?.onActionTaken(); }}
                >
                  Motion Fails
                </button>}
              </div>
            );
          })()}
        </div>
      )}

      {/* Active Amendments */}
      {activeAmendments.length > 0 && (
        <div className="inst-section">
          <h3 className="inst-section-title">Active Amendments ({activeAmendments.length})</h3>
          <div className="inst-list">
            {activeAmendments.map((amend) => {
              const isProposed = amend.phase === 'Proposed';
              const isParl = amend.phase === 'ParliamentVote';
              const isRef = amend.phase === 'Referendum';
              return (
                <div key={amend.id} className="inst-list-item">
                  <span className="inst-list-name">{amend.title}</span>
                  <Badge label={amend.phase} variant={isRef ? 'gold' : 'turquoise'} />
                  <span className="inst-list-meta">{amend.deadline - state.day}d</span>
                  {amend.emergency && <Badge label="Emergency" variant="rose" />}
                  {showActions && isProposed && (
                    <div className="inst-btn-row compact">
                      <button
                        className="inst-action-btn small"
                        onClick={() => dispatch({ type: 'ADVANCE_AMENDMENT_TO_VOTE', amendmentId: amend.id })}
                      >
                        Begin Parliament Vote
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
                          Parliament Approves
                        </button>}
                        {showParlFail && <button
                          className={`inst-action-btn small danger ${tParlFail ? 'tour-action-target' : ''}`}
                          onClick={() => { dispatch({ type: 'RESOLVE_AMENDMENT', amendmentId: amend.id, outcome: 'fail' }); tParlFail?.onActionTaken(); }}
                        >
                          Parliament Rejects
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
                          Referendum Passes
                        </button>}
                        {showRefFail && <button
                          className={`inst-action-btn small danger ${tRefFail ? 'tour-action-target' : ''}`}
                          onClick={() => { dispatch({ type: 'RESOLVE_AMENDMENT', amendmentId: amend.id, outcome: 'fail' }); tRefFail?.onActionTaken(); }}
                        >
                          Referendum Fails
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
        <h3 className="inst-section-title">Senate ({senators.length}/{state.parliament.senateTotal})</h3>
        <div className="seating-chart">
          {senators.map((p) => (
            <div
              key={p.id}
              className={`seat-dot ${p.role === 'crown_senator' ? 'crown-appointed' : ''}`}
              style={{ background: p.role === 'crown_senator' ? 'var(--gold)' : (PARTY_COLORS[p.party] || 'var(--pale-gold)') }}
              data-tooltip={`${personName(p)}${p.role === 'crown_senator' ? ' (Crown-appointed)' : ` (${p.party})`}`}
              title={`${personName(p)}${p.role === 'crown_senator' ? ' (Crown-appointed)' : ` (${p.party})`}`}
              onClick={() => onClickPerson?.(p.id)}
            />
          ))}
          {Array.from({ length: state.parliament.senateTotal - senators.length }).map((_, i) => (
            <div key={`vacant-${i}`} className="seat-dot vacant" data-tooltip="Vacant seat" title="Vacant seat" />
          ))}
        </div>
      </div>

      {/* Senate Actions */}
      {showActions && <InstitutionActions title="Senate Actions" actions={senateActions} />}

      {/* Provincial Councils */}
      <div className="inst-section" data-tour-id="parl-councils">
        <h3 className="inst-section-title">Provincial Councils ({state.provinces.length} Provinces)</h3>
        <div className="province-grid">
          {state.provinces.map((province) => {
            const members = provincialCouncilMembers(state, province.id);
            const full = members.length >= province.councilSize;
            const damaged = members.length < province.councilSize;
            return (
              <div key={province.id} className={`province-chip ${damaged ? 'province-damaged' : ''}`}>
                <span className="province-name">{province.name}</span>
                <span className="province-meta">
                  <span className={`province-count ${full ? '' : 'incomplete'}`}>{members.length}/{province.councilSize}</span>
                  <span className="province-cohort">Cohort {province.senateCohort}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Bills */}
      <div className="inst-section" data-tour-id="parl-bills">
        <h3 className="inst-section-title">Active Bills ({activeBills.length})</h3>
        {activeBills.length === 0 ? (
          <div className="inst-empty">No active bills</div>
        ) : (
          <div className="inst-list">
            {activeBills.map((bill) => (
              <div
                key={bill.id}
                className={`inst-list-item ${onClickBill ? 'clickable' : ''}`}
                onClick={() => onClickBill?.(bill.id)}
              >
                <span className="inst-list-name">{bill.name}</span>
                <Badge label={bill.stage} variant="gold" />
                <span className="inst-list-meta">{bill.deadline - state.day}d</span>
                {showActions && bill.stage === 'Introduced' && (() => {
                  const t = findTourTarget(activeTargets, 'BEGIN_MAJLIS_VOTE', bill.id);
                  const show = !readOnly || (tourMode && t);
                  if (!show) return null;
                  return (
                    <div className="inst-btn-row compact" onClick={(e) => e.stopPropagation()}>
                      <button
                        className={`inst-action-btn small ${t ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'ADVANCE_BILL_TO_STAGE', billId: bill.id, stage: 'Majlis Voting' }); t?.onActionTaken(); }}
                      >
                        Begin Majlis Vote
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
                        Pass
                      </button>}
                      {showReject && <button
                        className={`inst-action-btn small danger ${tReject ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'RESOLVE_MAJLIS_VOTE', billId: bill.id, outcome: 'fail' }); tReject?.onActionTaken(); }}
                      >
                        Reject
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
                        Begin Majlis Revote
                      </button>}
                      {showDrop && <button
                        className={`inst-action-btn small danger ${tDrop ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'RESOLVE_RETURNED_BILL', billId: bill.id, outcome: 'drop' }); tDrop?.onActionTaken(); }}
                      >
                        Drop
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
                        Pass
                      </button>}
                      {showReject && <button
                        className={`inst-action-btn small danger ${tReject ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'RESOLVE_MAJLIS_VOTE', billId: bill.id, outcome: 'fail' }); tReject?.onActionTaken(); }}
                      >
                        Reject
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
