import { useState, useEffect, useRef, useCallback } from 'react';
import type { GovAction, ElectionProcess, PartyId, PlayerVote } from '../simulation/types';
import { PARTY_NAMES, PARTY_COLORS } from '../simulation/nameGen';
import { seededRandom } from '../simulation/engine';
import ZkProofAnimation from './ZkProofAnimation';
import BallotReceipt from './BallotReceipt';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber, partyDisplayName } from '../i18n/simulatorFormat';

type BoothPhase = 'selecting' | 'proving' | 'receipt';

interface Props {
  election: ElectionProcess;
  currentDay: number;
  playerVotes: PlayerVote[];
  dispatch: React.Dispatch<GovAction>;
  provinceName?: string;
}

/** Simulated live voter counter. Client-side only, seeded from election ID. */
function useVoterCounter(electionId: number, active: boolean): number {
  const baseCount = 2000 + Math.floor(seededRandom(electionId * 3571) * 5000);
  const [count, setCount] = useState(baseCount);
  const tickRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      tickRef.current += 1;
      const increment = 1 + Math.floor(seededRandom(electionId * 100 + tickRef.current) * 3);
      setCount((c) => c + increment);
    }, 500);
    return () => clearInterval(interval);
  }, [electionId, active]);

  return count;
}

export default function VotingBooth({ election, currentDay, playerVotes, dispatch, provinceName }: Props) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const [selectedParty, setSelectedParty] = useState<PartyId | null>(null);
  const [phase, setPhase] = useState<BoothPhase>('selecting');
  const [votedParty, setVotedParty] = useState<PartyId | null>(null);

  const existingVote = playerVotes.find((v) => v.electionId === election.id);
  const alreadyVoted = !!existingVote;

  // If component mounts and vote already exists, skip straight to receipt
  const effectivePhase = alreadyVoted && phase === 'selecting' ? 'receipt' : phase;

  const voterCount = useVoterCounter(election.id, effectivePhase !== 'proving');

  const handleCastBallot = () => {
    if (!selectedParty) return;
    // Dispatch vote immediately (state is recorded before animation)
    dispatch({ type: 'CAST_VOTE', electionId: election.id, party: selectedParty });
    setVotedParty(selectedParty);
    setPhase('proving');
  };

  const handleProofComplete = useCallback(() => {
    setPhase('receipt');
  }, []);

  const daysLeft = election.phaseDeadline - currentDay;
  const electionLabel = t(election.electionType === 'majlis_general' ? 'election.majlisGeneral' : 'election.provincial');

  const displayParty = votedParty || existingVote?.party || '';
  const displayProofHash = existingVote?.proofHash || '';
  const displayNullifierHash = existingVote?.nullifierHash || '';

  return (
    <div className="voting-booth">
      <div className="voting-booth-title">{electionLabel}</div>

      {/* Voter counter — visible during selecting and receipt */}
      {effectivePhase !== 'proving' && (
        <div className="voter-counter">
          <span className="voter-counter-icon">{'\uD83D\uDDF3\uFE0F'}</span>
          <span>{t(provinceName ? 'election.citizensVotedProvince' : 'election.citizensVoted', { count: formatNumber(voterCount, locale), province: provinceName })}</span>
        </div>
      )}

      {/* Phase: selecting */}
      {effectivePhase === 'selecting' && (
        <>
          <div className="voting-booth-deadline">
            {t('election.closes', { count: formatNumber(daysLeft, locale) })}
          </div>

          {PARTY_NAMES.map((party) => (
            <div
              key={party}
              className={`party-option${selectedParty === party ? ' selected' : ''}`}
              onClick={() => setSelectedParty(party)}
            >
              <div className="party-option-radio">
                <div className="party-option-radio-inner" />
              </div>
              <div className="party-option-color" style={{ background: PARTY_COLORS[party] }} />
              <span className="party-option-name">{partyDisplayName(party, locale, t)}</span>
              <span className="party-option-desc">{t(`parties.${party}.description`)}</span>
            </div>
          ))}

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button
              className="passport-btn"
              disabled={!selectedParty}
              onClick={handleCastBallot}
            >
              {t('election.cast')}
            </button>
          </div>
        </>
      )}

      {/* Phase: proving */}
      {effectivePhase === 'proving' && (
        <ZkProofAnimation onComplete={handleProofComplete} />
      )}

      {/* Phase: receipt */}
      {effectivePhase === 'receipt' && displayProofHash && (
        <BallotReceipt
          proofHash={displayProofHash}
          nullifierHash={displayNullifierHash}
          party={displayParty}
        />
      )}
    </div>
  );
}
