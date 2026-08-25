import { useState } from 'react';
import type { GovState, GovAction, ProvinceId } from '../simulation/types';
import InstitutionShell from './InstitutionShell';
import Badge from '../shared/Badge';
import PassportCard from '../elections/PassportCard';
import VotingBooth from '../elections/VotingBooth';
import '../elections/Elections.css';

interface Props {
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  onBack: () => void;
  onClickProcess?: (processId: string) => void;
  readOnly?: boolean;
  hideBack?: boolean;
}

const PHASE_LABELS: Record<string, string> = {
  'registration': 'Registration',
  'voting': 'Voting',
  'tallied': 'Tallied',
  'seated': 'Seated',
};

const PHASE_VARIANTS: Record<string, string> = {
  'registration': 'turquoise',
  'voting': 'gold',
  'tallied': 'gold',
  'seated': 'emerald',
};

const ELECTION_TYPE_LABELS: Record<string, string> = {
  'majlis_general': 'Majlis General',
  'senate': 'Senate',
  'provincial': 'Provincial',
  'majlis_byelection': 'Majlis By-election',
  'senate_byelection': 'Senate By-election',
};

type IssuanceStep = 'welcome' | 'name' | 'province' | 'issued';

export default function ElectionsPanel({ state, dispatch, onBack, onClickProcess, hideBack }: Props) {
  const [issuanceStep, setIssuanceStep] = useState<IssuanceStep>('welcome');
  const [firstName, setFirstName] = useState('Dariush');
  const [lastName, setLastName] = useState('Ahmadi');
  const [selectedProvince, setSelectedProvince] = useState<ProvinceId | null>(null);
  const [showingIssuedCard, setShowingIssuedCard] = useState(false);

  const hasPassport = state.player !== null;

  // If no passport OR just issued (showing celebration), show issuance flow
  if (!hasPassport || showingIssuedCard) {
    return (
      <InstitutionShell title="Elections" icon={'\u2611'} healthy={true} onBack={onBack} hideBack={hideBack}>
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
    <InstitutionShell title="Elections" icon={'\u2611'} healthy={activeProcesses.length === 0} onBack={onBack} hideBack={hideBack}>
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
            provinceName={playerProvince.name}
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
              You voted for <strong>{vote.party}</strong>.{' '}
              {proc.results
                ? <>
                    <strong>{proc.results.winningParty}</strong> won in {playerProvince.name}
                    {won ? ' \u2014 your party won!' : '.'}
                  </>
                : 'Results pending.'}
            </span>
          </div>
        );
      })}

      {/* Next Scheduled */}
      <div className="inst-section">
        <h3 className="inst-section-title">Schedule</h3>
        <div className="inst-list-item">
          <span className="inst-list-name">Next General Election</span>
          <span className="inst-list-meta">{state.elections.nextScheduled} days</span>
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
              {hasActiveMajlis ? 'Election In Progress' : !state.parliament.dissolved ? 'Parliament Not Dissolved' : 'Call General Election'}
            </button>
          );
        })()}
      </div>

      {/* Active Elections */}
      <div className="inst-section" data-tour-id="elections-active">
        <h3 className="inst-section-title">Active Elections ({activeProcesses.length})</h3>
        {activeProcesses.length === 0 ? (
          <div className="inst-empty">No elections in progress</div>
        ) : (
          <div className="inst-list">
            {activeProcesses.map((proc) => {
              const advanceLabel = proc.phase === 'registration' ? 'Open Voting'
                : proc.phase === 'voting' ? 'Tally Votes'
                : proc.phase === 'tallied' ? 'Seat Winners'
                : null;
              return (
                <div key={proc.id} className="inst-list-item clickable" onClick={() => onClickProcess?.(`election-${proc.id}`)}>
                  <span className="inst-list-name">{ELECTION_TYPE_LABELS[proc.electionType]}</span>
                  <Badge label={PHASE_LABELS[proc.phase]} variant="turquoise" />
                  <span className="inst-list-meta">{proc.seatsContested} seat(s)</span>
                  <span className="inst-list-meta">{proc.phaseDeadline - state.day}d</span>
                  {advanceLabel && (
                    <button
                      className="inst-action-btn small"
                      style={{ marginLeft: 8 }}
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
          <h3 className="inst-section-title">Election by Province ({provinceElections.length})</h3>
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
                  <span className="province-name">{province.name}</span>
                  <span className="province-meta">
                    <span className="province-count">{proc.seatsContested} seats</span>
                    <Badge label={PHASE_LABELS[proc.phase]} variant={(PHASE_VARIANTS[proc.phase] || 'turquoise') as 'gold' | 'turquoise' | 'emerald' | 'rose'} />
                  </span>
                  {proc.results && (
                    <span className="province-result">
                      {proc.results.winningParty} ({Math.round(proc.results.turnout * 100)}%)
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
          <h3 className="inst-section-title">Recently Completed</h3>
          <div className="inst-list">
            {completedProcesses.map((proc) => (
              <div key={proc.id} className="inst-list-item">
                <span className="inst-list-name">{ELECTION_TYPE_LABELS[proc.electionType]}</span>
                <Badge label="Seated" variant="emerald" />
                <span className="inst-list-meta">{proc.seatsContested} seat(s)</span>
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
            <h2>Get Your Passport</h2>
            <p>
              To participate in elections and have your vote shape Iran's future,
              you need a citizen passport. It takes only a moment.
            </p>
          </div>
          <button className="passport-btn" onClick={() => setStep('name')}>
            Begin
          </button>
        </>
      )}

      {step === 'name' && (
        <>
          <div className="passport-issuance-hero">
            <h2>Your Name</h2>
          </div>
          <div className="passport-issuance-form">
            <div className="passport-input-group">
              <label>First Name</label>
              <input
                type="text"
                placeholder="e.g. Dariush"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="passport-input-group">
              <label>Last Name</label>
              <input
                type="text"
                placeholder="e.g. Ahmadi"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="passport-btn secondary" onClick={() => setStep('welcome')}>
              Back
            </button>
            <button
              className="passport-btn"
              disabled={!firstName.trim() || !lastName.trim()}
              onClick={() => setStep('province')}
            >
              Next
            </button>
          </div>
        </>
      )}

      {step === 'province' && (
        <>
          <div className="passport-issuance-hero">
            <h2>Pick Your Province</h2>
            <p>Your vote will count in this province's elections.</p>
          </div>
          <div className="province-picker">
            {state.provinces.map((prov) => (
              <div
                key={prov.id}
                className={`province-picker-card${selectedProvince === prov.id ? ' selected' : ''}`}
                onClick={() => setSelectedProvince(prov.id)}
              >
                <span className="province-picker-name">{prov.name}</span>
                <span className="province-picker-meta">
                  <span>{prov.majlisSeats} seats</span>
                  <span>Cohort {prov.senateCohort}</span>
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="passport-btn secondary" onClick={() => setStep('name')}>
              Back
            </button>
            <button
              className="passport-btn"
              disabled={selectedProvince === null}
              onClick={handleIssue}
            >
              Issue Passport
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
            Begin Participating
          </button>
        </>
      )}
    </div>
  );
}
