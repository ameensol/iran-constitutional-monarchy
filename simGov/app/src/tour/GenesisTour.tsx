import { useState, useEffect, useCallback, useMemo } from 'react';
import type { GovState, GovAction } from '../simulation/types';
import type { PlaySpeed } from '../simulation/useSimulation';
import TourNarrator from './TourNarrator';
import ShahDialogue from './ShahDialogue';
import { genesisFrames } from './genesisFrames';
import { useTourCompletion } from './useTourCompletion';
import { useTourSpotlight } from './useTourSpotlight';

interface GenesisTourProps {
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  speed: PlaySpeed;
  setSpeed: (speed: PlaySpeed) => void;
  onClose: () => void;
  setTourView: (view: import('./tourTypes').TourViewTarget | undefined) => void;
}

export default function GenesisTour({ dispatch, speed, setSpeed, onClose }: GenesisTourProps) {
  const [stage, setStage] = useState(0);
  const [fading, setFading] = useState(false);
  const { markCompleted } = useTourCompletion();

  const frame = genesisFrames[stage];
  const highlights = useMemo(() => frame.highlights, [frame]);
  useTourSpotlight(highlights);

  // On mount: reset to genesis and pause auto-advance
  useEffect(() => {
    dispatch({ type: 'RESET_TO_GENESIS' });
    setSpeed('paused');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep paused during the tour
  useEffect(() => {
    if (speed !== 'paused') {
      setSpeed('paused');
    }
  }, [speed, setSpeed]);

  const isLastFrame = stage === genesisFrames.length - 1;

  const handleContinue = useCallback(() => {
    if (isLastFrame) {
      markCompleted('genesis');
      onClose();
      return;
    }

    setFading(true);
    const nextStage = stage + 1;
    // Dispatch the genesis advance for the next stage
    dispatch({ type: 'GENESIS_ADVANCE', stage: nextStage });

    setTimeout(() => {
      setStage(nextStage);
      setFading(false);
    }, 300);
  }, [stage, isLastFrame, dispatch, markCompleted, onClose]);

  const handleBack = useCallback(() => {
    if (stage > 0) {
      setFading(true);
      // Reset and replay up to stage-1
      dispatch({ type: 'RESET_TO_GENESIS' });
      const targetStage = stage - 1;
      for (let i = 1; i <= targetStage; i++) {
        dispatch({ type: 'GENESIS_ADVANCE', stage: i });
      }
      setTimeout(() => {
        setStage(targetStage);
        setFading(false);
      }, 300);
    }
  }, [stage, dispatch]);

  return (
    <TourNarrator
      tourTitle="Genesis: Building a Nation"
      frameTitle={frame.title}
      totalSteps={genesisFrames.length}
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
