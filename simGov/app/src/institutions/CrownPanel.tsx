import { useState } from 'react';
import type { GovState, GovAction } from '../simulation/types';
import { personName } from '../simulation/types';
import { activeMonarch, activeHeirs, personById } from '../simulation/selectors';
import { SENATE_CROWN } from '../simulation/provinces';
import InstitutionShell from './InstitutionShell';
import { useTourAction, findTourTarget } from '../tour/TourActionContext';
import Badge from '../shared/Badge';

interface Props {
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  onBack: () => void;
  onClickPerson?: (personId: number) => void;
  readOnly?: boolean;
  hideBack?: boolean;
}

export default function CrownPanel({ state, dispatch, onBack, onClickPerson, readOnly, hideBack }: Props) {
  const [confirmDissolve, setConfirmDissolve] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [confirmAbdicate, setConfirmAbdicate] = useState(false);
  const { tourMode, activeTargets } = useTourAction();
  const showActions = !readOnly || tourMode;
  const monarch = activeMonarch(state);
  const heirs = activeHeirs(state);
  const crownBills = state.bills.filter((b) => b.stage === 'Crown Action');
  const crownSenators = state.people.filter((p) => p.role === 'crown_senator' && p.status === 'active');

  return (
    <InstitutionShell title="The Crown" icon={'\u2654'} healthy={!state.crown.suspended} onBack={onBack} hideBack={hideBack}>
      {state.crown.suspended && (
        <div className="inst-alert rose">
          Crown powers are suspended.
          {state.executive.pmSeated
            ? ' The PM exercises legislative return power (Art. VI.5.2). The Senate handles nominations.'
            : ' No PM to exercise Crown legislative powers. Bills auto-enact on deadline. Justice appointments frozen.'}
        </div>
      )}

      {/* Monarch */}
      <div className="inst-section" data-tour-id="crown-monarch">
        <h3 className="inst-section-title">Monarch</h3>
        {monarch ? (
          <div className="person-card" onClick={() => onClickPerson?.(monarch.id)}>
            <div className="person-card-name">{personName(monarch)}</div>
            <Badge label="Active" variant="gold" />
          </div>
        ) : (
          <div className="inst-empty">No monarch (Crown suspended or vacant)</div>
        )}
      </div>

      {/* Succession */}
      <div className="inst-section" data-tour-id="crown-succession">
        <h3 className="inst-section-title">Succession List ({heirs.length} heirs)</h3>
        {state.crown.successionList.length === 0 ? (
          <div className="inst-empty">No heirs in succession</div>
        ) : (
          <div className="inst-list">
            {state.crown.successionList.map((heirId, i) => {
              const heir = personById(state, heirId);
              if (!heir) return null;
              return (
                <div key={heirId} className="inst-list-item" onClick={() => onClickPerson?.(heirId)}>
                  <span className="inst-list-rank">#{i + 1}</span>
                  <span className="inst-list-name">{personName(heir)}</span>
                  <Badge label={heir.status === 'active' ? 'Eligible' : heir.status} variant={heir.status === 'active' ? 'emerald' : 'rose'} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending Ministerial Acts */}
      <div className="inst-section" data-tour-id="crown-pending">
        <h3 className="inst-section-title">Pending Actions ({crownBills.length})</h3>
        {crownBills.length === 0 ? (
          <div className="inst-empty">No bills awaiting Crown action</div>
        ) : (
          <div className="inst-list">
            {crownBills.map((bill) => (
              <div key={bill.id} className="inst-list-item">
                <span className="inst-list-name">{bill.name}</span>
                <span className="inst-list-meta">{bill.deadline - state.day}d remaining</span>
                {showActions && (() => {
                  const tSign = findTourTarget(activeTargets, 'SIGN_BILL', bill.id);
                  const tReturn = findTourTarget(activeTargets, 'RETURN_BILL', bill.id);
                  const tRefer = findTourTarget(activeTargets, 'REFER_TO_COURT', bill.id);
                  // In tour mode, only show buttons that are targets
                  const showSign = !readOnly || (tourMode && tSign);
                  const showReturn = (!readOnly && !bill.crownReturned) || (tourMode && tReturn);
                  const showRefer = (!readOnly && bill.crownReturned) || (tourMode && tRefer);
                  if (!showSign && !showReturn && !showRefer) return null;
                  return (
                    <div className="inst-action-group">
                      {showSign && <button
                        className={`inst-action-btn small ${tSign ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'SIGN_BILL', billId: bill.id }); tSign?.onActionTaken(); }}
                        disabled={!tourMode && state.crown.suspended && !state.executive.pmSeated}
                      >
                        {state.crown.suspended ? 'PM Signs' : 'Sign'}
                      </button>}
                      {showReturn && <button
                        className={`inst-action-btn small secondary ${tReturn ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'RETURN_BILL', billId: bill.id }); tReturn?.onActionTaken(); }}
                        disabled={!tourMode && ((state.crown.suspended && !state.executive.pmSeated) || bill.crownReturned)}
                      >
                        {state.crown.suspended ? 'PM Returns' : 'Return'}
                      </button>}
                      {showRefer && <button
                        className={`inst-action-btn small secondary ${tRefer ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'REFER_TO_COURT', billId: bill.id }); tRefer?.onActionTaken(); }}
                        disabled={!tourMode && state.crown.suspended}
                      >
                        Refer to Court
                      </button>}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Justice Nominations (Crown/PM/Senate nominates) */}
      {showActions && (() => {
        const pendingNoms = state.court.appointments.filter(
          (a) => a.phase === 'CrownNom1' || a.phase === 'CrownNom2'
        );
        if (pendingNoms.length === 0) return null;
        const nominator = state.crown.suspended ? (state.executive.pmSeated ? 'PM' : 'Senate') : 'Crown';
        return (
          <div className="inst-section">
            <h3 className="inst-section-title">Pending Justice Nominations ({pendingNoms.length})</h3>
            <div className="inst-list">
              {pendingNoms.map((appt) => {
                const phaseLabel = appt.phase === 'CrownNom1' ? '1st Nomination' : '2nd Nomination';
                return (
                  <div key={appt.seatNumber} className="inst-list-item">
                    <span className="inst-list-name">Seat {appt.seatNumber}</span>
                    <Badge label={phaseLabel} variant="turquoise" />
                    {appt.deadline && <span className="inst-list-meta">{appt.deadline - state.day}d</span>}
                    <button
                      className="inst-action-btn small"
                      onClick={() => {
                        const citizens = state.people.filter((p) => p.status === 'active' && p.role !== 'justice' && p.role !== 'monarch' && p.role !== 'heir');
                        const pick = citizens[Math.floor(Math.random() * citizens.length)];
                        if (pick) dispatch({ type: 'CROWN_NOMINATE_JUSTICE', seatNumber: appt.seatNumber, personId: pick.id });
                      }}
                    >
                      {nominator} Nominates
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Crown Senators */}
      <div className="inst-section" data-tour-id="crown-senators">
        <h3 className="inst-section-title">Crown-Appointed Senators ({crownSenators.length}/{SENATE_CROWN})</h3>
        <div className="inst-list">
          {crownSenators.map((s) => (
            <div key={s.id} className="inst-list-item" onClick={() => onClickPerson?.(s.id)}>
              <span className="inst-list-name">{personName(s)}</span>
              <Badge label="Crown Senator" variant="gold" />
            </div>
          ))}
        </div>
        {showActions && !tourMode && (
          <button
            className="inst-action-btn"
            style={{ marginTop: 8 }}
            onClick={() => dispatch({ type: 'APPOINT_CROWN_SENATOR' })}
            disabled={crownSenators.length >= SENATE_CROWN || state.crown.suspended}
          >
            {crownSenators.length >= SENATE_CROWN ? `All ${SENATE_CROWN} Filled` : 'Appoint Crown Senator'}
          </button>
        )}
      </div>

      {/* Crown Powers */}
      {showActions && !tourMode && (
        <div className="inst-section">
          <h3 className="inst-section-title">Crown Powers</h3>
          <div className="inst-btn-row">
            {/* Dissolve Parliament */}
            {confirmDissolve ? (
              <div className="disaster-confirm">
                <span className="disaster-confirm-text">Dissolve Parliament? This triggers new elections.</span>
                <button
                  className="inst-action-btn danger small"
                  onClick={() => { dispatch({ type: 'DISSOLVE_PARLIAMENT' }); setConfirmDissolve(false); }}
                >
                  Confirm
                </button>
                <button
                  className="inst-action-btn small secondary"
                  onClick={() => setConfirmDissolve(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="inst-action-btn danger"
                onClick={() => setConfirmDissolve(true)}
                disabled={state.crown.suspended || state.parliament.dissolved}
              >
                Dissolve Parliament
              </button>
            )}

            {/* Suspend Crown */}
            {confirmSuspend ? (
              <div className="disaster-confirm">
                <span className="disaster-confirm-text">Suspend Crown powers? Senate assumes Crown functions.</span>
                <button
                  className="inst-action-btn danger small"
                  onClick={() => { dispatch({ type: 'SUSPEND_CROWN' }); setConfirmSuspend(false); }}
                >
                  Confirm
                </button>
                <button
                  className="inst-action-btn small secondary"
                  onClick={() => setConfirmSuspend(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="inst-action-btn danger"
                onClick={() => setConfirmSuspend(true)}
                disabled={state.crown.suspended}
              >
                {state.crown.suspended ? 'Already Suspended' : 'Suspend Crown'}
              </button>
            )}

            {/* Resume Crown */}
            {state.crown.suspended && (
              <button
                className="inst-action-btn"
                onClick={() => dispatch({ type: 'RESUME_CROWN' })}
                disabled={!state.crown.suspended || (heirs.length === 0 && !monarch)}
              >
                Resume Crown
              </button>
            )}

            {/* Abdicate */}
            {confirmAbdicate ? (
              <div className="disaster-confirm">
                <span className="disaster-confirm-text">
                  Abdicate the throne?{heirs.length > 0 ? ` ${heirs[0].firstName} ${heirs[0].lastName} will be crowned.` : ' No heir — Crown will be suspended.'}
                </span>
                <button
                  className="inst-action-btn danger small"
                  onClick={() => { dispatch({ type: 'ABDICATE' }); setConfirmAbdicate(false); }}
                >
                  Confirm
                </button>
                <button
                  className="inst-action-btn small secondary"
                  onClick={() => setConfirmAbdicate(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="inst-action-btn danger"
                onClick={() => setConfirmAbdicate(true)}
                disabled={state.crown.suspended || !monarch}
              >
                Abdicate
              </button>
            )}

            {/* Update Succession */}
            {heirs.length > 1 && !state.crown.suspended && (
              <button
                className="inst-action-btn secondary"
                onClick={() => {
                  // Reverse the order as a simple reorder action
                  const reversed = [...state.crown.successionList].reverse();
                  dispatch({ type: 'UPDATE_SUCCESSION', heirIds: reversed });
                }}
              >
                Reverse Succession Order
              </button>
            )}
          </div>
        </div>
      )}
    </InstitutionShell>
  );
}
