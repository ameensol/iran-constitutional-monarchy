import type { GovState, GovAction } from '../simulation/types';
import { activeJustices } from '../simulation/selectors';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber, namedEntityDisplayName, personDisplayName } from '../i18n/simulatorFormat';
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

const INSTITUTIONS = ['Crown', 'Parliament', 'Executive', 'Supreme Court'];

export default function CourtPanel({ state, dispatch, onBack, onClickPerson, onClickProcess, readOnly, hideBack }: Props) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const n = (value: number) => formatNumber(value, locale);
  const institutionLabel = (value: string) => ({ Crown: t('institutions.crown'), Parliament: t('institutions.parliament'), Executive: t('institutions.executive'), 'Supreme Court': t('institutions.court'), PM: t('labels.primeMinister') }[value] ?? value);
  const { tourMode, activeTargets } = useTourAction();
  const showActions = !readOnly || tourMode;
  const justices = activeJustices(state);
  const referredBills = state.bills.filter((b) => b.stage === 'Referred');
  const nominator = state.crown.suspended ? (state.executive.pmSeated ? t('labels.primeMinister') : t('courtPanel.frozen')) : t('institutions.crown');
  const picker = state.crown.suspended ? (state.executive.pmSeated ? t('labels.primeMinister') : t('institutions.senate')) : t('institutions.crown');
  const APPT_LABELS: Record<string, string> = {
    CrownNom1: t('courtPanel.firstNom', { institution: nominator }), SenateVote1: t('courtPanel.senateVote1'),
    CrownNom2: t('courtPanel.secondNom', { institution: nominator }), SenateVote2: t('courtPanel.senateVote2'),
    SenateList: t('courtPanel.senateList'), CrownPick: t('courtPanel.pick', { institution: picker }), Seated: t('labels.seated'),
  };

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
      label: t('courtPanel.fileCrown'),
      description: t('courtPanel.fileCrownDesc'),
      onClick: () => dispatch({ type: 'FILE_CONSTITUTIONAL_REVIEW', petitioner: 'Crown', lawDescription: 'Existing law under constitutional challenge' }),
      enabled: !state.crown.suspended,
      disabledReason: t('courtPanel.crownSuspended'),
    },
    {
      label: t('courtPanel.filePm'),
      description: t('courtPanel.filePmDesc'),
      onClick: () => dispatch({ type: 'FILE_CONSTITUTIONAL_REVIEW', petitioner: 'PM', lawDescription: 'Law challenged by the Executive' }),
      enabled: state.executive.pmSeated,
      disabledReason: t('courtPanel.noPm'),
    },
    {
      label: t('courtPanel.fileParliament'),
      description: t('courtPanel.fileParliamentDesc'),
      onClick: () => dispatch({ type: 'FILE_CONSTITUTIONAL_REVIEW', petitioner: 'Parliament', lawDescription: 'Law referred by Parliament for review' }),
      enabled: !state.parliament.dissolved,
      disabledReason: t('courtPanel.parliamentDissolved'),
    },
    {
      label: t('courtPanel.fileDispute'),
      description: t('courtPanel.fileDisputeDesc'),
      onClick: () => {
        const pet = INSTITUTIONS[Math.floor(Math.random() * 2)]; // Crown or Parliament
        const resp = INSTITUTIONS.find((i) => i !== pet) || 'Executive';
        dispatch({ type: 'FILE_DISPUTE', petitioner: pet, respondent: resp, description: 'Jurisdictional boundary dispute' });
      },
      enabled: justices.length > 0,
      disabledReason: t('courtPanel.noJustices'),
    },
    {
      label: t('courtPanel.createPetition'),
      description: t('courtPanel.createPetitionDesc'),
      onClick: () => dispatch({ type: 'CREATE_PETITION', title: 'Petition for Court review of executive overreach' }),
      enabled: !state.parliament.dissolved && (state.parliament.majlisSeats + state.parliament.senateSeats) > 0,
      disabledReason: t('courtPanel.noMembers'),
    },
  ];

  return (
    <InstitutionShell title={t('institutions.court')} icon={'\u2696'} healthy={!state.court.crisis} onBack={onBack} hideBack={hideBack}>
      {state.court.crisis && (
        <div className="inst-alert rose">
          {t('courtPanel.crisis', { current: n(justices.length), total: n(state.court.totalSeats), quorum: n(Math.ceil(state.court.totalSeats * 2 / 3)) })}
        </div>
      )}

      {/* Justice Grid (4x3) */}
      <div className="inst-section" data-tour-id="court-grid">
        <h3 className="inst-section-title">{t('courtPanel.seats', { current: n(justices.length), total: n(state.court.totalSeats) })}</h3>
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
                <div className="justice-seat-number">{t('labels.seat', { number: n(seat) })}</div>
                {isActive ? (
                  <div className="justice-seat-name">{personDisplayName(justice, locale)}</div>
                ) : appt ? (
                  <div className="justice-seat-status">{APPT_LABELS[appt.phase]}</div>
                ) : (
                  <div className="justice-seat-status">{t('labels.vacant')}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Appointment Pipelines */}
      {state.court.appointments.length > 0 && (
        <div className="inst-section" data-tour-id="court-appointments">
          <h3 className="inst-section-title">{t('courtPanel.pipelines')}</h3>
          {state.court.appointments.map((appt) => {
            const isNomPhase = appt.phase === 'CrownNom1' || appt.phase === 'CrownNom2';
            const isVotePhase = appt.phase === 'SenateVote1' || appt.phase === 'SenateVote2';
            const isListPhase = appt.phase === 'SenateList' || appt.phase === 'CrownPick';
            const frozen = appt._frozen || (state.crown.suspended && !state.executive.pmSeated && isNomPhase);
            const nomLabel = state.crown.suspended ? (state.executive.pmSeated ? t('courtPanel.pmNominates') : t('courtPanel.frozen')) : t('courtPanel.crownNominates');

            return (
              <div key={appt.seatNumber} className="inst-list-item">
                <span className="inst-list-name" style={{ cursor: onClickProcess ? 'pointer' : undefined }} onClick={() => onClickProcess?.(`appointment-${appt.seatNumber}`)}>{t('labels.seat', { number: n(appt.seatNumber) })}</span>
                <Badge label={APPT_LABELS[appt.phase]} variant="turquoise" />
                {appt.deadline && (
                  <span className="inst-list-meta">{t('courtPanel.remaining', { days: n(appt.deadline - state.day) })}</span>
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
                      {t('courtPanel.confirm')}
                    </button>
                    <button
                      className="inst-action-btn small danger"
                      onClick={() => dispatch({ type: 'RESOLVE_JUSTICE_VOTE', seatNumber: appt.seatNumber, outcome: 'reject' })}
                    >
                      {t('courtPanel.reject')}
                    </button>
                  </div>
                )}
                {showActions && !tourMode && isListPhase && (
                  <button
                    className="inst-action-btn small"
                    onClick={() => dispatch({ type: 'RESOLVE_JUSTICE_VOTE', seatNumber: appt.seatNumber, outcome: 'approve' })}
                  >
                    {appt.phase === 'SenateList' ? t('courtPanel.crownPicks') : t('courtPanel.appoint')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Constitutional Reviews (bill referrals) */}
      <div className="inst-section">
        <h3 className="inst-section-title">{t('courtPanel.billReviews', { count: n(referredBills.length) })}</h3>
        {referredBills.length === 0 ? (
          <div className="inst-empty">{t('courtPanel.noBills')}</div>
        ) : (
          <div className="inst-list">
            {referredBills.map((bill) => (
              <div key={bill.id} className="inst-list-item">
                <span className="inst-list-name">{namedEntityDisplayName(bill.name, locale, t)}</span>
                <span className="inst-list-meta">{t('courtPanel.remaining', { days: n(bill.deadline - state.day) })}</span>
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
                        {t('courtPanel.uphold')}
                      </button>}
                      {showStrike && <button
                        className={`inst-action-btn small danger ${tStrike ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'COURT_STRIKE_BILL', billId: bill.id }); tStrike?.onActionTaken(); }}
                      >
                        {t('courtPanel.strike')}
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
          <h3 className="inst-section-title">{t('courtPanel.reviews', { count: n(activeReviews.length) })}</h3>
          {activeReviews.length === 0 ? (
            <div className="inst-empty">{t('courtPanel.noReviews')}</div>
          ) : (
            <div className="inst-list">
              {activeReviews.map((review) => (
                <div key={review.id} className="inst-list-item">
                  <span className="inst-list-name">{review.lawDescription}</span>
                  <Badge label={t('courtPanel.by', { petitioner: institutionLabel(review.petitioner) })} variant="turquoise" />
                  <span className="inst-list-meta">{t('courtPanel.remaining', { days: n(review.deadline - state.day) })}</span>
                  {showActions && !tourMode && (
                    <div className="inst-btn-row compact">
                      <button
                        className="inst-action-btn small"
                        onClick={() => dispatch({ type: 'RESOLVE_REVIEW', reviewId: review.id, outcome: 'constitutional' })}
                      >
                        {t('courtPanel.constitutional')}
                      </button>
                      <button
                        className="inst-action-btn small danger"
                        onClick={() => dispatch({ type: 'RESOLVE_REVIEW', reviewId: review.id, outcome: 'unconstitutional' })}
                      >
                        {t('courtPanel.unconstitutional')}
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
          <h3 className="inst-section-title">{t('courtPanel.disputes', { count: n(activeDisputes.length) })}</h3>
          {activeDisputes.length === 0 ? (
            <div className="inst-empty">{t('courtPanel.noDisputes')}</div>
          ) : (
            <div className="inst-list">
              {activeDisputes.map((dispute) => (
                <div key={dispute.id} className="inst-list-item">
                  <span className="inst-list-name">{t('courtPanel.versus', { petitioner: institutionLabel(dispute.petitioner), respondent: institutionLabel(dispute.respondent) })}</span>
                  <Badge label={dispute.phase} variant="turquoise" />
                  <span className="inst-list-meta">{t('courtPanel.remaining', { days: n(dispute.deadline - state.day) })}</span>
                  {showActions && !tourMode && (
                    <div className="inst-btn-row compact">
                      <button
                        className="inst-action-btn small"
                        onClick={() => dispatch({ type: 'RESOLVE_DISPUTE', disputeId: dispute.id, outcome: 'petitioner' })}
                      >
                        {t('courtPanel.wins', { institution: institutionLabel(dispute.petitioner) })}
                      </button>
                      <button
                        className="inst-action-btn small"
                        onClick={() => dispatch({ type: 'RESOLVE_DISPUTE', disputeId: dispute.id, outcome: 'respondent' })}
                      >
                        {t('courtPanel.wins', { institution: institutionLabel(dispute.respondent) })}
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
          <h3 className="inst-section-title">{t('courtPanel.petitions', { count: n(activePetitions.length) })}</h3>
          {activePetitions.length === 0 ? (
            <div className="inst-empty">{t('courtPanel.noPetitions')}</div>
          ) : (
            <div className="inst-list">
              {activePetitions.map((petition) => (
                <div key={petition.id} className="inst-list-item">
                  <span className="inst-list-name">{petition.title}</span>
                  <Badge label={`${n(petition.signatures)}/${n(petition.requiredSignatures)}`} variant={petition.signatures >= petition.requiredSignatures ? 'emerald' : 'turquoise'} />
                  <span className="inst-list-meta">{t('courtPanel.remaining', { days: n(petition.deadline - state.day) })}</span>
                  {showActions && !tourMode && !petition.activated && (
                    <button
                      className="inst-action-btn small"
                      onClick={() => dispatch({ type: 'SIGN_PETITION', petitionId: petition.id })}
                    >
                      {t('courtPanel.sign')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filing Actions */}
      {showActions && !tourMode && <InstitutionActions title={t('courtPanel.filings')} actions={filingActions} />}

      {/* Quorum Indicator */}
      <div className="inst-section" data-tour-id="court-quorum">
        <div className="inst-quorum-bar">
          <div className="quorum-fill" style={{ width: `${(justices.length / state.court.totalSeats) * 100}%` }} />
          <div className="quorum-line" style={{ left: `${(2/3) * 100}%` }} />
          <span className="quorum-label">{t('courtPanel.quorum', { count: n(Math.ceil(state.court.totalSeats * 2 / 3)) })}</span>
        </div>
      </div>
    </InstitutionShell>
  );
}
