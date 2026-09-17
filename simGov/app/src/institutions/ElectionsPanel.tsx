import { useState } from 'react';
import type { GovState, GovAction, ProvinceId } from '../simulation/types';
import InstitutionShell from './InstitutionShell';
import Badge from '../shared/Badge';
import PassportCard from '../elections/PassportCard';
import VotingBooth from '../elections/VotingBooth';
import '../elections/Elections.css';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber, formatPercent, partyDisplayName, provinceDisplayName } from '../i18n/simulatorFormat';

interface Props {
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  onBack: () => void;
  onClickProcess?: (processId: string) => void;
  readOnly?: boolean;
  hideBack?: boolean;
}

const PHASE_VARIANTS: Record<string, string> = {
  'registration': 'turquoise',
  'voting': 'gold',
  'tallied': 'gold',
  'seated': 'emerald',
};

type IssuanceStep = 'welcome' | 'name' | 'province' | 'issued';

export default function ElectionsPanel({ state, dispatch, onBack, onClickProcess, hideBack }: Props) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const number = (value: number) => formatNumber(value, locale);
  const [issuanceStep, setIssuanceStep] = useState<IssuanceStep>('welcome');
  const [firstName, setFirstName] = useState(locale === 'fa' ? 'داریوش' : 'Dariush');
  const [lastName, setLastName] = useState(locale === 'fa' ? 'احمدی' : 'Ahmadi');
  const [selectedProvince, setSelectedProvince] = useState<ProvinceId | null>(null);
  const [showingIssuedCard, setShowingIssuedCard] = useState(false);

  const hasPassport = state.player !== null;

  // If no passport OR just issued (showing celebration), show issuance flow
  if (!hasPassport || showingIssuedCard) {
    return (
      <InstitutionShell title={t('institutions.elections')} icon={'\u2611'} healthy={true} onBack={onBack} hideBack={hideBack}>
        <PassportIssuanceFlow
          step={issuanceStep}
          setStep={setIssuanceStep}
          firstName={firstName}
          setFirstName={setFirstName}
          lastName={lastName}
          setLastName={setLastName}
          selectedProvince={selectedProvince}
          setSelectedProvince={setSelectedProvince}
          state={state}
          dispatch={dispatch}
          onDismissIssued={() => setShowingIssuedCard(false)}
          setShowingIssuedCard={setShowingIssuedCard}
        />
      </InstitutionShell>
    );
  }

  // Has passport — show normal elections view with voting
  const playerProvince = state.provinces.find((p) => p.id === state.player!.provinceId)!;
  const activeProcesses = state.elections.processes.filter((p) => p.phase !== 'seated');
  const completedProcesses = state.elections.processes.filter((p) => p.phase === 'seated');

  // Find elections in voting phase that cover the player's province (show booth or confirmation)
  const votableElections = state.elections.processes.filter((proc) => {
    if (proc.phase !== 'voting') return false;
    // Majlis general covers all provinces
    if (proc.electionType === 'majlis_general') return true;
    // Provincial election only if it's the player's province
    if (proc.electionType === 'provincial' && proc.provinceId === state.player!.provinceId) return true;
    return false;
  });

  // Find elections where player already voted (show results)
  const votedElections = state.elections.processes.filter((proc) =>
    state.playerVotes.some((v) => v.electionId === proc.id)
  );

  // Province-level elections
  const provinceElections = state.elections.processes.filter((p) => p.provinceId !== undefined);
  const provinceElectionMap = new Map<number, typeof state.elections.processes[0]>();
  for (const proc of provinceElections) {
    if (proc.provinceId !== undefined) {
      provinceElectionMap.set(proc.provinceId, proc);
    }
  }

  return (
    <InstitutionShell title={t('institutions.elections')} icon={'\u2611'} healthy={activeProcesses.length === 0} onBack={onBack} hideBack={hideBack}>
      {/* Passport Card */}
      <div className="inst-section">
        <PassportCard player={state.player!} province={playerProvince} year={state.year} />
      </div>

      {/* Voting Booth(s) */}
      {votableElections.map((proc) => (
        <div key={proc.id} className="inst-section" data-tour-id="voting-booth">
          <VotingBooth
            election={proc}
            currentDay={state.day}
            playerVotes={state.playerVotes}
            dispatch={dispatch}
            provinceName={provinceDisplayName(playerProvince, locale)}
          />
        </div>
      ))}

      {/* Post-vote results */}
      {votedElections.map((proc) => {
        const vote = state.playerVotes.find((v) => v.electionId === proc.id);
        if (!vote) return null;
        if (proc.phase === 'voting') return null; // already showing confirmation in booth
        const won = proc.results?.winningParty === vote.party;
        return (
          <div key={proc.id} className={`vote-result${won ? ' won' : ''}`}>
            <span className="vote-result-icon">{won ? '\u2713' : '\u2717'}</span>
            <span>
              {t('electionsPanel.voted', { party: partyDisplayName(vote.party, locale, t) })}{' '}
              {proc.results
                ? <>
                    {t('electionsPanel.winner', { party: partyDisplayName(proc.results.winningParty, locale, t), province: provinceDisplayName(playerProvince, locale) })}
                    {won ? ` — ${t('electionsPanel.yourParty')}` : ''}
                  </>
                : t('electionsPanel.pending')}
            </span>
          </div>
        );
      })}

      {/* Next Scheduled */}
      <div className="inst-section">
        <h3 className="inst-section-title">{t('electionsPanel.schedule')}</h3>
        <div className="inst-list-item">
          <span className="inst-list-name">{t('electionsPanel.nextGeneral')}</span>
          <span className="inst-list-meta">{t('labels.days', { count: number(state.elections.nextScheduled) })}</span>
        </div>
        {(() => {
          const hasActiveMajlis = state.elections.processes.some(
            (p) => p.electionType === 'majlis_general' && p.phase !== 'seated'
          );
          return (
            <button
              className="inst-action-btn"
              style={{ marginTop: 8 }}
              onClick={() => dispatch({ type: 'START_ELECTION', electionType: 'majlis_general' })}
              disabled={hasActiveMajlis || !state.parliament.dissolved}
            >
              {t(hasActiveMajlis ? 'electionsPanel.electionProgress' : !state.parliament.dissolved ? 'electionsPanel.parliamentActive' : 'electionsPanel.callGeneral')}
            </button>
          );
        })()}
      </div>

      {/* Active Elections */}
      <div className="inst-section" data-tour-id="elections-active">
        <h3 className="inst-section-title">{t('electionsPanel.active', { count: number(activeProcesses.length) })}</h3>
        {activeProcesses.length === 0 ? (
          <div className="inst-empty">{t('electionsPanel.none')}</div>
        ) : (
          <div className="inst-list">
            {activeProcesses.map((proc) => {
              const advanceLabel = proc.phase === 'registration' ? t('electionsPanel.openVoting')
                : proc.phase === 'voting' ? t('electionsPanel.tally')
                : proc.phase === 'tallied' ? t('electionsPanel.seatWinners')
                : null;
              return (
                <div key={proc.id} className="inst-list-item clickable" onClick={() => onClickProcess?.(`election-${proc.id}`)}>
                  <span className="inst-list-name">{t(`electionsPanel.type.${proc.electionType}`)}</span>
                  <Badge label={t(`electionsPanel.phase.${proc.phase}`)} variant="turquoise" />
                  <span className="inst-list-meta">{t('electionsPanel.seats', { count: number(proc.seatsContested) })}</span>
                  <span className="inst-list-meta">{t('budgetPanel.remaining', { days: number(proc.phaseDeadline - state.day) })}</span>
                  {advanceLabel && (
                    <button
                      className="inst-action-btn small"
                      style={{ marginInlineStart: 8 }}
                      onClick={(e) => { e.stopPropagation(); dispatch({ type: 'ADVANCE_ELECTION', electionId: proc.id }); }}
                    >
                      {advanceLabel}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Province Breakdown */}
      {provinceElections.length > 0 && (
        <div className="inst-section" data-tour-id="elections-provinces">
          <h3 className="inst-section-title">{t('electionsPanel.byProvince', { count: number(provinceElections.length) })}</h3>
          <div className="province-grid">
            {state.provinces.map((province) => {
              const proc = provinceElectionMap.get(province.id);
              if (!proc) return null;
              const phaseClass = proc.phase === 'seated' ? 'phase-seated'
                : proc.phase === 'voting' ? 'phase-voting'
                : proc.phase === 'registration' ? 'phase-registration'
                : '';
              return (
                <div key={province.id} className={`province-chip ${phaseClass}`}>
                  <span className="province-name">{provinceDisplayName(province, locale)}</span>
                  <span className="province-meta">
                    <span className="province-count">{t('electionsPanel.seats', { count: number(proc.seatsContested) })}</span>
                    <Badge label={t(`electionsPanel.phase.${proc.phase}`)} variant={(PHASE_VARIANTS[proc.phase] || 'turquoise') as 'gold' | 'turquoise' | 'emerald' | 'rose'} />
                  </span>
                  {proc.results && (
                    <span className="province-result">
                      {partyDisplayName(proc.results.winningParty, locale, t)} ({formatPercent(Math.round(proc.results.turnout * 100), locale)})
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed Elections */}
      {completedProcesses.length > 0 && (
        <div className="inst-section">
          <h3 className="inst-section-title">{t('electionsPanel.completed')}</h3>
          <div className="inst-list">
            {completedProcesses.map((proc) => (
              <div key={proc.id} className="inst-list-item">
                <span className="inst-list-name">{t(`electionsPanel.type.${proc.electionType}`)}</span>
                <Badge label={t('electionsPanel.phase.seated')} variant="emerald" />
                <span className="inst-list-meta">{t('electionsPanel.seats', { count: number(proc.seatsContested) })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </InstitutionShell>
  );
}

/* ── Passport Issuance Sub-component ─────────────── */

interface IssuanceProps {
  step: IssuanceStep;
  setStep: (step: IssuanceStep) => void;
  firstName: string;
  setFirstName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  selectedProvince: ProvinceId | null;
  setSelectedProvince: (v: ProvinceId | null) => void;
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  onDismissIssued: () => void;
  setShowingIssuedCard: (v: boolean) => void;
}

function PassportIssuanceFlow({
  step, setStep,
  firstName, setFirstName,
  lastName, setLastName,
  selectedProvince, setSelectedProvince,
  state, dispatch,
  onDismissIssued, setShowingIssuedCard,
}: IssuanceProps) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const number = (value: number) => formatNumber(value, locale);
  const stepIndex = ['welcome', 'name', 'province', 'issued'].indexOf(step);

  const handleIssue = () => {
    if (!selectedProvince || !firstName.trim() || !lastName.trim()) return;
    dispatch({
      type: 'ISSUE_PASSPORT',
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      provinceId: selectedProvince,
    });
    setShowingIssuedCard(true);
    setStep('issued');
  };

  return (
    <div className="passport-issuance">
      {/* Step dots */}
      <div className="passport-steps">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`passport-step-dot${i === stepIndex ? ' active' : i < stepIndex ? ' done' : ''}`}
          />
        ))}
      </div>

      {step === 'welcome' && (
        <>
          <div className="passport-issuance-hero">
            <h2>{t('electionsPanel.welcome')}</h2>
            <p>{t('electionsPanel.welcomeText')}</p>
          </div>
          <button className="passport-btn" onClick={() => setStep('name')}>
            {t('electionsPanel.begin')}
          </button>
        </>
      )}

      {step === 'name' && (
        <>
          <div className="passport-issuance-hero">
            <h2>{t('electionsPanel.name')}</h2>
          </div>
          <div className="passport-issuance-form">
            <div className="passport-input-group">
              <label>{t('electionsPanel.first')}</label>
              <input
                type="text"
                placeholder={t('electionsPanel.firstExample')}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="passport-input-group">
              <label>{t('electionsPanel.last')}</label>
              <input
                type="text"
                placeholder={t('electionsPanel.lastExample')}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="passport-btn secondary" onClick={() => setStep('welcome')}>
              {t('actions.back')}
            </button>
            <button
              className="passport-btn"
              disabled={!firstName.trim() || !lastName.trim()}
              onClick={() => setStep('province')}
            >
              {t('electionsPanel.next')}
            </button>
          </div>
        </>
      )}

      {step === 'province' && (
        <>
          <div className="passport-issuance-hero">
            <h2>{t('electionsPanel.pickProvince')}</h2>
            <p>{t('electionsPanel.provinceText')}</p>
          </div>
          <div className="province-picker">
            {state.provinces.map((prov) => (
              <div
                key={prov.id}
                className={`province-picker-card${selectedProvince === prov.id ? ' selected' : ''}`}
                onClick={() => setSelectedProvince(prov.id)}
              >
                <span className="province-picker-name">{provinceDisplayName(prov, locale)}</span>
                <span className="province-picker-meta">
                  <span>{t('electionsPanel.seats', { count: number(prov.majlisSeats) })}</span>
                  <span>{t('electionsPanel.cohort', { cohort: prov.senateCohort })}</span>
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="passport-btn secondary" onClick={() => setStep('name')}>
              {t('actions.back')}
            </button>
            <button
              className="passport-btn"
              disabled={selectedProvince === null}
              onClick={handleIssue}
            >
              {t('electionsPanel.issue')}
            </button>
          </div>
        </>
      )}

      {step === 'issued' && state.player && (
        <>
          <PassportCard
            player={state.player}
            province={state.provinces.find((p) => p.id === state.player!.provinceId)!}
            year={state.year}
          />
          <button className="passport-btn" onClick={() => {
            dispatch({ type: 'START_PLAYER_ELECTION' });
            onDismissIssued();
          }}>
            {t('electionsPanel.participate')}
          </button>
        </>
      )}
    </div>
  );
}
