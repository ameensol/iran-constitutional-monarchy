import type { GovState, GovAction } from '../simulation/types';
import { personName } from '../simulation/types';
import { activeJustices } from '../simulation/selectors';
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
  onClickProcess?: (processId: string) => void;
  readOnly?: boolean;
  hideBack?: boolean;
}

function getApptLabels(suspended: boolean, hasPM: boolean): Record<string, string> {
  const nominator = suspended ? (hasPM ? 'PM' : 'Frozen') : 'Crown';
  const picker = suspended ? (hasPM ? 'PM' : 'Senate') : 'Crown';
  return {
    'CrownNom1': `${nominator} 1st Nomination`,
    'SenateVote1': 'Senate Vote (1st)',
    'CrownNom2': `${nominator} 2nd Nomination`,
    'SenateVote2': 'Senate Vote (2nd)',
    'SenateList': 'Senate List',
    'CrownPick': `${picker} Pick`,
    'Seated': 'Seated',
  };
}

const INSTITUTIONS = ['Crown', 'Parliament', 'Executive', 'Supreme Court'];

export default function CourtPanel({ state, dispatch, onBack, onClickPerson, onClickProcess, readOnly, hideBack }: Props) {
  const { tourMode, activeTargets } = useTourAction();
  const showActions = !readOnly || tourMode;
  const justices = activeJustices(state);
  const referredBills = state.bills.filter((b) => b.stage === 'Referred');
  const APPT_LABELS = getApptLabels(state.crown.suspended, state.executive.pmSeated);

  const activeReviews = state.reviews.filter((r) => r.phase !== 'Resolved');
  const activeDisputes = state.disputes.filter((d) => d.phase !== 'Resolved');
  const activePetitions = state.petitions.filter((p) => !p.activated);

  // Build a map of seat number → justice (for the 4x3 grid)
  const seatMap = new Map<number, typeof justices[0]>();
  for (const j of state.people.filter((p) => p.role === 'justice')) {
    if (j.seatNumber !== undefined) seatMap.set(j.seatNumber, j);
  }

  // ── Filing actions ──
  const filingActions: ActionItem[] = [
    {
      label: 'File Review (Crown)',
      description: 'Crown files constitutional review of a law',
      onClick: () => dispatch({ type: 'FILE_CONSTITUTIONAL_REVIEW', petitioner: 'Crown', lawDescription: 'Existing law under constitutional challenge' }),
      enabled: !state.crown.suspended,
      disabledReason: 'Crown is suspended',
    },
    {
      label: 'File Review (PM)',
      description: 'PM files constitutional review of a law',
      onClick: () => dispatch({ type: 'FILE_CONSTITUTIONAL_REVIEW', petitioner: 'PM', lawDescription: 'Law challenged by the Executive' }),
      enabled: state.executive.pmSeated,
      disabledReason: 'No PM seated',
    },
    {
      label: 'File Review (Parliament)',
      description: 'Parliament files constitutional review of a law',
      onClick: () => dispatch({ type: 'FILE_CONSTITUTIONAL_REVIEW', petitioner: 'Parliament', lawDescription: 'Law referred by Parliament for review' }),
      enabled: !state.parliament.dissolved,
      disabledReason: 'Parliament is dissolved',
    },
    {
      label: 'File Dispute',
      description: 'File a dispute between constitutional organs',
      onClick: () => {
        const pet = INSTITUTIONS[Math.floor(Math.random() * 2)]; // Crown or Parliament
        const resp = INSTITUTIONS.find((i) => i !== pet) || 'Executive';
        dispatch({ type: 'FILE_DISPUTE', petitioner: pet, respondent: resp, description: 'Jurisdictional boundary dispute' });
      },
      enabled: justices.length > 0,
      disabledReason: 'No justices seated',
    },
    {
      label: 'Create Petition',
      description: 'Parliament member creates a collective petition to the Court',
      onClick: () => dispatch({ type: 'CREATE_PETITION', title: 'Petition for Court review of executive overreach' }),
      enabled: !state.parliament.dissolved && (state.parliament.majlisSeats + state.parliament.senateSeats) > 0,
      disabledReason: 'Parliament is dissolved or has no members',
    },
  ];

  return (
    <InstitutionShell title="Supreme Court" icon={'\u2696'} healthy={!state.court.crisis} onBack={onBack} hideBack={hideBack}>
      {state.court.crisis && (
        <div className="inst-alert rose">
          Court in crisis: {justices.length}/{state.court.totalSeats} justices (need {Math.ceil(state.court.totalSeats * 2 / 3)} for quorum)
        </div>
      )}

      {/* Justice Grid (4x3) */}
      <div className="inst-section" data-tour-id="court-grid">
        <h3 className="inst-section-title">Justice Seats ({justices.length}/{state.court.totalSeats})</h3>
        <div className="justice-grid">
          {Array.from({ length: state.court.totalSeats }).map((_, i) => {
            const seat = i + 1;
            const justice = seatMap.get(seat);
            const isActive = justice && justice.status === 'active';
            const appt = state.court.appointments.find((a) => a.seatNumber === seat);

            return (
              <div
                key={seat}
                className={`justice-seat ${isActive ? 'occupied' : appt ? 'in-progress' : 'vacant'}`}
                onClick={isActive && onClickPerson ? () => onClickPerson(justice.id) : undefined}
              >
                <div className="justice-seat-number">Seat {seat}</div>
                {isActive ? (
                  <div className="justice-seat-name">{personName(justice)}</div>
                ) : appt ? (
                  <div className="justice-seat-status">{APPT_LABELS[appt.phase]}</div>
                ) : (
                  <div className="justice-seat-status">Vacant</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Appointment Pipelines */}
      {state.court.appointments.length > 0 && (
        <div className="inst-section" data-tour-id="court-appointments">
          <h3 className="inst-section-title">Appointment Pipelines</h3>
          {state.court.appointments.map((appt) => {
            const isNomPhase = appt.phase === 'CrownNom1' || appt.phase === 'CrownNom2';
            const isVotePhase = appt.phase === 'SenateVote1' || appt.phase === 'SenateVote2';
            const isListPhase = appt.phase === 'SenateList' || appt.phase === 'CrownPick';
            const frozen = appt._frozen || (state.crown.suspended && !state.executive.pmSeated && isNomPhase);
            const nomLabel = state.crown.suspended ? (state.executive.pmSeated ? 'PM Nominates' : 'Frozen') : 'Crown Nominates';

            return (
              <div key={appt.seatNumber} className="inst-list-item">
                <span className="inst-list-name" style={{ cursor: onClickProcess ? 'pointer' : undefined }} onClick={() => onClickProcess?.(`appointment-${appt.seatNumber}`)}>Seat {appt.seatNumber}</span>
                <Badge label={APPT_LABELS[appt.phase]} variant="turquoise" />
                {appt.deadline && (
                  <span className="inst-list-meta">{appt.deadline - state.day}d</span>
                )}
                {showActions && !tourMode && isNomPhase && (
                  <button
                    className="inst-action-btn small"
                    disabled={frozen}
                    onClick={() => {
                      const eligible = state.people.filter((p) => p.status === 'active' && p.role !== 'justice' && p.role !== 'monarch' && p.role !== 'heir');
                      const nominee = eligible[Math.floor(Math.random() * eligible.length)];
                      if (nominee) dispatch({ type: 'CROWN_NOMINATE_JUSTICE', seatNumber: appt.seatNumber, personId: nominee.id });
                    }}
                  >
                    {nomLabel}
                  </button>
                )}
                {showActions && !tourMode && isVotePhase && (
                  <div className="inst-btn-row compact">
                    <button
                      className="inst-action-btn small"
                      onClick={() => dispatch({ type: 'RESOLVE_JUSTICE_VOTE', seatNumber: appt.seatNumber, outcome: 'approve' })}
                    >
                      Confirm
                    </button>
                    <button
                      className="inst-action-btn small danger"
                      onClick={() => dispatch({ type: 'RESOLVE_JUSTICE_VOTE', seatNumber: appt.seatNumber, outcome: 'reject' })}
                    >
                      Reject
                    </button>
                  </div>
                )}
                {showActions && !tourMode && isListPhase && (
                  <button
                    className="inst-action-btn small"
                    onClick={() => dispatch({ type: 'RESOLVE_JUSTICE_VOTE', seatNumber: appt.seatNumber, outcome: 'approve' })}
                  >
                    {appt.phase === 'SenateList' ? 'Crown Picks' : 'Appoint'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Constitutional Reviews (bill referrals) */}
      <div className="inst-section">
        <h3 className="inst-section-title">Bill Reviews ({referredBills.length})</h3>
        {referredBills.length === 0 ? (
          <div className="inst-empty">No bills referred for review</div>
        ) : (
          <div className="inst-list">
            {referredBills.map((bill) => (
              <div key={bill.id} className="inst-list-item">
                <span className="inst-list-name">{bill.name}</span>
                <span className="inst-list-meta">{bill.deadline - state.day}d</span>
                {showActions && (() => {
                  const tUphold = findTourTarget(activeTargets, 'COURT_UPHOLD_BILL', bill.id);
                  const tStrike = findTourTarget(activeTargets, 'COURT_STRIKE_BILL', bill.id);
                  const showUphold = !readOnly || (tourMode && tUphold);
                  const showStrike = !readOnly || (tourMode && tStrike);
                  if (!showUphold && !showStrike) return null;
                  return (
                    <div className="inst-btn-row compact">
                      {showUphold && <button
                        className={`inst-action-btn small ${tUphold ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'COURT_UPHOLD_BILL', billId: bill.id }); tUphold?.onActionTaken(); }}
                      >
                        Uphold
                      </button>}
                      {showStrike && <button
                        className={`inst-action-btn small danger ${tStrike ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'COURT_STRIKE_BILL', billId: bill.id }); tStrike?.onActionTaken(); }}
                      >
                        Strike Down
                      </button>}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Direct Constitutional Reviews */}
      {(activeReviews.length > 0 || state.reviews.length > 0) && (
        <div className="inst-section">
          <h3 className="inst-section-title">Constitutional Reviews ({activeReviews.length} active)</h3>
          {activeReviews.length === 0 ? (
            <div className="inst-empty">No active reviews</div>
          ) : (
            <div className="inst-list">
              {activeReviews.map((review) => (
                <div key={review.id} className="inst-list-item">
                  <span className="inst-list-name">{review.lawDescription}</span>
                  <Badge label={`by ${review.petitioner}`} variant="turquoise" />
                  <span className="inst-list-meta">{review.deadline - state.day}d</span>
                  {showActions && !tourMode && (
                    <div className="inst-btn-row compact">
                      <button
                        className="inst-action-btn small"
                        onClick={() => dispatch({ type: 'RESOLVE_REVIEW', reviewId: review.id, outcome: 'constitutional' })}
                      >
                        Constitutional
                      </button>
                      <button
                        className="inst-action-btn small danger"
                        onClick={() => dispatch({ type: 'RESOLVE_REVIEW', reviewId: review.id, outcome: 'unconstitutional' })}
                      >
                        Unconstitutional
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Disputes */}
      {(activeDisputes.length > 0 || state.disputes.length > 0) && (
        <div className="inst-section">
          <h3 className="inst-section-title">Disputes ({activeDisputes.length} active)</h3>
          {activeDisputes.length === 0 ? (
            <div className="inst-empty">No active disputes</div>
          ) : (
            <div className="inst-list">
              {activeDisputes.map((dispute) => (
                <div key={dispute.id} className="inst-list-item">
                  <span className="inst-list-name">{dispute.petitioner} vs. {dispute.respondent}</span>
                  <Badge label={dispute.phase} variant="turquoise" />
                  <span className="inst-list-meta">{dispute.deadline - state.day}d</span>
                  {showActions && !tourMode && (
                    <div className="inst-btn-row compact">
                      <button
                        className="inst-action-btn small"
                        onClick={() => dispatch({ type: 'RESOLVE_DISPUTE', disputeId: dispute.id, outcome: 'petitioner' })}
                      >
                        {dispute.petitioner} Wins
                      </button>
                      <button
                        className="inst-action-btn small"
                        onClick={() => dispatch({ type: 'RESOLVE_DISPUTE', disputeId: dispute.id, outcome: 'respondent' })}
                      >
                        {dispute.respondent} Wins
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Collective Petitions */}
      {(activePetitions.length > 0 || state.petitions.length > 0) && (
        <div className="inst-section">
          <h3 className="inst-section-title">Collective Petitions ({activePetitions.length} active)</h3>
          {activePetitions.length === 0 ? (
            <div className="inst-empty">No active petitions</div>
          ) : (
            <div className="inst-list">
              {activePetitions.map((petition) => (
                <div key={petition.id} className="inst-list-item">
                  <span className="inst-list-name">{petition.title}</span>
                  <Badge label={`${petition.signatures}/${petition.requiredSignatures}`} variant={petition.signatures >= petition.requiredSignatures ? 'emerald' : 'turquoise'} />
                  <span className="inst-list-meta">{petition.deadline - state.day}d</span>
                  {showActions && !tourMode && !petition.activated && (
                    <button
                      className="inst-action-btn small"
                      onClick={() => dispatch({ type: 'SIGN_PETITION', petitionId: petition.id })}
                    >
                      Sign (+1)
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filing Actions */}
      {showActions && !tourMode && <InstitutionActions title="Court Filings" actions={filingActions} />}

      {/* Quorum Indicator */}
      <div className="inst-section" data-tour-id="court-quorum">
        <div className="inst-quorum-bar">
          <div className="quorum-fill" style={{ width: `${(justices.length / state.court.totalSeats) * 100}%` }} />
          <div className="quorum-line" style={{ left: `${(2/3) * 100}%` }} />
          <span className="quorum-label">Quorum: {Math.ceil(state.court.totalSeats * 2 / 3)}</span>
        </div>
      </div>
    </InstitutionShell>
  );
}
