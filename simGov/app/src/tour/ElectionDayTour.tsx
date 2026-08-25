import { useState, useEffect, useCallback, useMemo } from 'react';
import type { GovState, GovAction } from '../simulation/types';
import type { PlaySpeed } from '../simulation/useSimulation';
import type { TourViewTarget } from './tourTypes';
import TourNarrator from './TourNarrator';
import ShahDialogue from './ShahDialogue';
import { useTourCompletion } from './useTourCompletion';
import { useTourSpotlight } from './useTourSpotlight';
import { GENESIS_MAX_STAGE } from '../simulation/genesis';

interface TourProps {
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  speed: PlaySpeed;
  setSpeed: (speed: PlaySpeed) => void;
  onClose: () => void;
  setTourView: (view: TourViewTarget | undefined) => void;
}

interface Frame {
  title: string;
  shahText: string;
  highlights: string[];
  step: number;
  viewTarget?: TourViewTarget;
}

const electionFrames: Frame[] = [
  {
    title: 'Parliament Dissolved',
    shahText:
      'The Crown has dissolved Parliament, as the constitution permits at the end of a term or in extraordinary circumstances. All one hundred and forty-nine Majlis seats are now empty. An election must happen within sixty days. Look at the parliament card: the seats read zero. The institution is silent, waiting for the people to speak.',
    highlights: ['parl-majlis'],
    step: 1,
    viewTarget: { type: 'institution', id: 'parliament' },
  },
  {
    title: 'Registration Opens',
    shahText:
      'The election process begins across all thirty-one provinces simultaneously. Candidates register to run for the Majlis. Any citizen registered in their province can put their name forward. The blockchain records every registration transparently. No one can be secretly added or removed from the ballot.',
    highlights: ['elections-provinces'],
    step: 2,
    viewTarget: { type: 'institution', id: 'elections' },
  },
  {
    title: 'The Secret Ballot',
    shahText:
      'Voting begins. Here is what makes this system different from every election in Iranian history: your passport proves you are an Iranian citizen over eighteen, but the mathematical proof reveals nothing else. Not your name, not your province, not how you voted. The ballot box is sealed by mathematics, not by a government official who might open it later. No one, not the Shah, not the Supreme Court, not the election commission, can connect your identity to your vote.',
    highlights: ['elections-provinces'],
    step: 3,
    viewTarget: { type: 'institution', id: 'elections' },
  },
  {
    title: 'The Count',
    shahText:
      'Ballots tallied across all thirty-one provinces. The results are published on the blockchain, and anyone in the world can verify the count. Not a committee of officials behind closed doors, but an open ledger that any Iranian with an internet connection can audit. New members are seated. Parliament reconvenes, filled with the people\u2019s chosen representatives.',
    highlights: ['elections-provinces'],
    step: 4,
    viewTarget: { type: 'institution', id: 'elections' },
  },
  {
    title: 'What Did We Learn?',
    shahText:
      'Elections are transparent (anyone can verify the count) yet private (no one knows how you voted). The Majlis is elected directly by the people. The Senate works differently: its members are elected through provincial councils, giving the provinces their own voice in the legislature. Two chambers, two sources of legitimacy. One chosen by the people directly, the other by the people\u2019s provincial representatives.',
    highlights: [],
    step: 5,
    viewTarget: { type: 'dashboard' },
  },
];

function resetToFullGenesis(dispatch: React.Dispatch<GovAction>) {
  dispatch({ type: 'RESET_TO_GENESIS' });
  for (let i = 1; i <= GENESIS_MAX_STAGE; i++) {
    dispatch({ type: 'GENESIS_ADVANCE', stage: i });
  }
}

/** Reset to genesis then dissolve parliament so frame 0 shows dissolved state. */
function resetWithParliamentDissolved(dispatch: React.Dispatch<GovAction>) {
  resetToFullGenesis(dispatch);
  dispatch({ type: 'DISSOLVE_PARLIAMENT' });
}

function applyStage(dispatch: React.Dispatch<GovAction>, stage: number) {
  switch (stage) {
    case 1:
      // Start provincial elections across all 31 provinces
      dispatch({ type: 'TOUR_START_PROVINCIAL_ELECTIONS' });
      break;
    case 2:
      // Advance all to voting phase
      dispatch({ type: 'TOUR_SET_ALL_ELECTIONS_PHASE', phase: 'voting' });
      break;
    case 3:
      // Advance to seated with results
      dispatch({ type: 'TOUR_SET_ALL_ELECTIONS_PHASE', phase: 'seated' });
      break;
    // stage 4: no state change (summary)
  }
}

export default function ElectionDayTour({ dispatch, speed, setSpeed, onClose, setTourView }: TourProps) {
  const [stage, setStage] = useState(0);
  const [fading, setFading] = useState(false);
  const { markCompleted } = useTourCompletion();

  const frame = electionFrames[stage];
  const highlights = useMemo(() => frame.highlights, [frame]);
  useTourSpotlight(highlights);

  useEffect(() => {
    resetWithParliamentDissolved(dispatch);
    setSpeed('paused');
    setTourView(electionFrames[0].viewTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (speed !== 'paused') setSpeed('paused');
  }, [speed, setSpeed]);

  const isLastFrame = stage === electionFrames.length - 1;

  const handleContinue = useCallback(() => {
    if (isLastFrame) {
      markCompleted('election-day');
      onClose();
      return;
    }

    setFading(true);
    const nextStage = stage + 1;
    applyStage(dispatch, nextStage);

    setTimeout(() => {
      setStage(nextStage);
      setTourView(electionFrames[nextStage]?.viewTarget);
      setFading(false);
    }, 300);
  }, [stage, isLastFrame, dispatch, markCompleted, onClose, setTourView]);

  const handleBack = useCallback(() => {
    if (stage > 0) {
      setFading(true);
      resetWithParliamentDissolved(dispatch);
      const targetStage = stage - 1;
      for (let i = 1; i <= targetStage; i++) {
        applyStage(dispatch, i);
      }
      setTimeout(() => {
        setStage(targetStage);
        setTourView(electionFrames[targetStage]?.viewTarget);
        setFading(false);
      }, 300);
    }
  }, [stage, dispatch, setTourView]);

  return (
    <TourNarrator
      tourTitle="Election Day"
      frameTitle={frame.title}
      totalSteps={electionFrames.length}
      currentStep={stage + 1}
      onClose={onClose}
      onBack={handleBack}
      canGoBack={stage > 0}
    >
      <div className={`tour-content ${fading ? 'fading' : ''}`}>
        <ShahDialogue text={frame.shahText} />
        <div className="decisions">
          <button className="decision-btn" onClick={handleContinue}>
            {isLastFrame ? 'Return to Tour Hub' : 'Continue'}
          </button>
        </div>
      </div>
    </TourNarrator>
  );
}
