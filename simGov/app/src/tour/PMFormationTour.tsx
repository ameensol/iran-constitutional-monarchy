import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { GovAction } from '../simulation/types';
import type { PlaySpeed } from '../simulation/useSimulation';
import type { TourViewTarget } from './tourTypes';
import type { TourActionTarget, TourActionContextValue } from './TourActionContext';
import TourNarrator from './TourNarrator';
import ShahDialogue from './ShahDialogue';
import DecisionButtons from './DecisionButtons';
import { useTourCompletion } from './useTourCompletion';
import { useTourSpotlight } from './useTourSpotlight';
import { GENESIS_MAX_STAGE } from '../simulation/genesis';

interface TourProps {
  state: import('../simulation/types').GovState;
  dispatch: React.Dispatch<GovAction>;
  speed: PlaySpeed;
  setSpeed: (speed: PlaySpeed) => void;
  onClose: () => void;
  setTourView: (view: TourViewTarget | undefined) => void;
  setTourActions: (ctx: TourActionContextValue) => void;
}

interface Frame {
  title: string;
  shahText: string;
  highlights: string[];
  step: number;
  viewTarget?: TourViewTarget;
  mode: 'narrative' | 'action' | 'terminal';
  narrativeNext?: string;
}

const frames: Record<string, Frame> = {
  '1': {
    title: 'A Vacancy',
    shahText:
      'The Prime Minister has resigned. Look at the executive card: it reads "Caretaker Government." The Deputy Prime Minister keeps the lights on, but a caretaker cannot govern, cannot propose laws, cannot make appointments. The constitution requires a new PM, and it has a clear procedure for finding one. No backroom deals, no military interventions. A process.',
    highlights: ['exec-pm'],
    step: 1,
    viewTarget: { type: 'institution', id: 'executive' },
    mode: 'narrative',
    narrativeNext: '2',
  },
  '2': {
    title: 'The Crown Proposes',
    shahText:
      'The Crown nominates a candidate for Prime Minister. This is one of the Crown\u2019s most important powers: the right to propose who should lead the government. But proposing is not appointing. The nominee must present a program to the Majlis and receive a vote of confidence by absolute majority.',
    highlights: ['exec-formation'],
    step: 2,
    viewTarget: { type: 'institution', id: 'executive' },
    mode: 'narrative',
    narrativeNext: '3',
  },
  '3': {
    title: 'The Majlis Decides',
    shahText:
      'The nominee stands before the Majlis. One hundred and forty-nine representatives will decide whether this person should lead the government. The Crown\u2019s preference is on the table, but the people\u2019s representatives hold the vote. Find the confidence vote buttons in the Executive panel and deliver the Majlis verdict.',
    highlights: ['exec-formation'],
    step: 3,
    viewTarget: { type: 'institution', id: 'executive' },
    mode: 'action',
  },
  '4A': {
    title: 'A Government is Formed',
    shahText:
      'Confidence granted. The nominee takes office as Prime Minister, appoints a cabinet, and the caretaker period ends. Notice the simplicity of this: the Crown proposes, the people\u2019s representatives approve. No PM can govern without democratic legitimacy. The executive card now shows a seated government, ready to serve.',
    highlights: ['exec-pm'],
    step: 4,
    viewTarget: { type: 'institution', id: 'executive' },
    mode: 'narrative',
    narrativeNext: '6',
  },
  '4B': {
    title: 'The Crown Tries Again',
    shahText:
      'The Majlis rejected the Crown\u2019s first choice. This is not a crisis; it is the constitution working as designed. The Crown now nominates a second candidate, someone who might better satisfy Parliament. The Crown must listen and adjust. Cast the confidence vote on the second nominee.',
    highlights: ['exec-formation'],
    step: 4,
    viewTarget: { type: 'institution', id: 'executive' },
    mode: 'action',
  },
  '5B1': {
    title: 'Second Time\u2019s the Charm',
    shahText:
      'The second nominee receives Parliament\u2019s confidence. Negotiation worked. The Crown listened to what the Majlis wanted, adjusted its choice, and found common ground. This is how constitutional governance resolves disagreements: not through force, but through iteration.',
    highlights: ['exec-pm'],
    step: 5,
    viewTarget: { type: 'institution', id: 'executive' },
    mode: 'narrative',
    narrativeNext: '6',
  },
  '5B2': {
    title: 'The Majlis Takes Over',
    shahText:
      'Both Crown nominees rejected. Now the constitution shifts power: the Majlis presents a ranked list of three candidates, and the Crown must pick from that list within seven days. If the Crown does not choose, the first-ranked candidate is appointed automatically. The people\u2019s representatives always have the final say. The Crown proposed twice, was refused twice, and now the democratic chamber takes the lead. No deadlock is permanent.',
    highlights: ['parl-majlis'],
    step: 5,
    viewTarget: { type: 'institution', id: 'parliament' },
    mode: 'narrative',
    narrativeNext: '6',
  },
  '6': {
    title: 'What Did We Learn?',
    shahText:
      'Three paths, and all of them end with a Prime Minister who has democratic legitimacy. The Crown proposes but cannot impose. If Parliament rejects the first nominee, the Crown tries again. If Parliament rejects the second, the Majlis itself takes the lead. Power flows from the people\u2019s representatives, always. The Crown\u2019s role is to initiate, not to dictate.',
    highlights: [],
    step: 6,
    viewTarget: { type: 'dashboard' },
    mode: 'terminal',
  },
};

/** Reset to a fully populated genesis state. */
function resetToFullGenesis(dispatch: React.Dispatch<GovAction>) {
  dispatch({ type: 'RESET_TO_GENESIS' });
  for (let i = 1; i <= GENESIS_MAX_STAGE; i++) {
    dispatch({ type: 'GENESIS_ADVANCE', stage: i });
  }
}

/** Reset to genesis then resign the PM so frame 1 shows the vacancy. */
function resetWithPmResigned(dispatch: React.Dispatch<GovAction>) {
  resetToFullGenesis(dispatch);
  dispatch({ type: 'TOUR_RESIGN_PM' });
}

function applyTransition(dispatch: React.Dispatch<GovAction>, from: string, to: string) {
  switch (`${from}>${to}`) {
    case '1>2':
      dispatch({ type: 'TOUR_CROWN_NOMINATE_PM', attempt: 1 });
      break;
    case '3>4A':
      dispatch({ type: 'RESOLVE_CONFIDENCE', outcome: 'pass' });
      break;
    case '3>4B':
      dispatch({ type: 'RESOLVE_CONFIDENCE', outcome: 'fail' });
      // Crown nominates second candidate
      dispatch({ type: 'TOUR_CROWN_NOMINATE_PM', attempt: 2 });
      break;
    case '4B>5B1':
      dispatch({ type: 'RESOLVE_CONFIDENCE', outcome: 'pass' });
      break;
    case '4B>5B2':
      dispatch({ type: 'RESOLVE_CONFIDENCE', outcome: 'fail' });
      break;
    // narrative transitions — no state change
    case '2>3': break;
    case '4A>6': break;
    case '5B1>6': break;
    case '5B2>6': break;
  }
}

function replayState(dispatch: React.Dispatch<GovAction>, history: string[]) {
  resetWithPmResigned(dispatch);
  for (let i = 1; i < history.length; i++) {
    applyTransition(dispatch, history[i - 1], history[i]);
  }
}

function computeTargets(
  frameId: string,
  onAction: (next: string) => void,
): TourActionTarget[] {
  switch (frameId) {
    case '3':
      return [
        { actionType: 'RESOLVE_CONFIDENCE_PASS', nextFrame: '4A', onActionTaken: () => onAction('4A') },
        { actionType: 'RESOLVE_CONFIDENCE_FAIL', nextFrame: '4B', onActionTaken: () => onAction('4B') },
      ];
    case '4B':
      return [
        { actionType: 'RESOLVE_CONFIDENCE_PASS', nextFrame: '5B1', onActionTaken: () => onAction('5B1') },
        { actionType: 'RESOLVE_CONFIDENCE_FAIL', nextFrame: '5B2', onActionTaken: () => onAction('5B2') },
      ];
    default:
      return [];
  }
}

export default function PMFormationTour({ dispatch, speed, setSpeed, onClose, setTourView, setTourActions }: TourProps) {
  const [frameId, setFrameId] = useState('1');
  const [history, setHistory] = useState<string[]>(['1']);
  const [fading, setFading] = useState(false);
  const { markCompleted } = useTourCompletion();

  const frame = frames[frameId];
  const highlights = useMemo(() => frame.highlights, [frame]);
  useTourSpotlight(highlights);

  useEffect(() => {
    resetWithPmResigned(dispatch);
    setSpeed('paused');
    setTourView(frames['1'].viewTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (speed !== 'paused') setSpeed('paused');
  }, [speed, setSpeed]);

  // Stable action handler using ref to avoid stale closures
  const handleActionRef = useRef<(next: string) => void>(() => {});
  handleActionRef.current = (nextFrame: string) => {
    setFading(true);
    setTourActions({ tourMode: false, activeTargets: [] });

    // Additional state setup after real action
    if (nextFrame === '4B') {
      // After confidence fail, Crown nominates second candidate
      dispatch({ type: 'TOUR_CROWN_NOMINATE_PM', attempt: 2 });
    }

    setTimeout(() => {
      const newHistory = [...history, nextFrame];
      setHistory(newHistory);
      setFrameId(nextFrame);
      setTourView(frames[nextFrame]?.viewTarget);

      const targets = computeTargets(nextFrame, (n) => handleActionRef.current(n));
      setTourActions({
        tourMode: targets.length > 0,
        activeTargets: targets,
      });

      setFading(false);
    }, 300);
  };

  // Set targets when frame changes
  useEffect(() => {
    const targets = computeTargets(frameId, (n) => handleActionRef.current(n));
    setTourActions({
      tourMode: targets.length > 0,
      activeTargets: targets,
    });
  }, [frameId, setTourActions]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      setTourActions({ tourMode: false, activeTargets: [] });
    };
  }, [setTourActions]);

  // Narrative/terminal handler
  const handleChoose = useCallback((nextFrame: string) => {
    if (nextFrame === 'close') {
      markCompleted('pm-formation');
      onClose();
      return;
    }

    setFading(true);

    if (nextFrame === '1') {
      resetWithPmResigned(dispatch);
      setTourActions({ tourMode: false, activeTargets: [] });
      setTimeout(() => {
        setHistory(['1']);
        setFrameId('1');
        setTourView(frames['1'].viewTarget);
        setFading(false);
      }, 300);
      return;
    }

    // Apply state transitions for narrative advances
    applyTransition(dispatch, frameId, nextFrame);

    setTimeout(() => {
      setHistory((h) => [...h, nextFrame]);
      setFrameId(nextFrame);
      setTourView(frames[nextFrame]?.viewTarget);
      setFading(false);
    }, 300);
  }, [dispatch, frameId, markCompleted, onClose, setTourView, setTourActions]);

  const handleBack = useCallback(() => {
    if (history.length <= 1) return;

    setFading(true);
    const newHistory = history.slice(0, -1);
    replayState(dispatch, newHistory);
    setTourActions({ tourMode: false, activeTargets: [] });

    const targetFrame = newHistory[newHistory.length - 1];
    setTimeout(() => {
      setHistory(newHistory);
      setFrameId(targetFrame);
      setTourView(frames[targetFrame]?.viewTarget);
      setFading(false);
    }, 300);
  }, [history, dispatch, setTourView, setTourActions]);

  // Build sidebar choices based on frame mode
  let choices: { label: string; sub: string; nextFrame: string }[] = [];
  if (frame.mode === 'narrative' && frame.narrativeNext) {
    choices = [{ label: 'Continue', sub: '', nextFrame: frame.narrativeNext }];
  } else if (frame.mode === 'terminal') {
    choices = [
      { label: 'Start over', sub: 'Try a different path', nextFrame: '1' },
      { label: 'Return to Tour Hub', sub: '', nextFrame: 'close' },
    ];
  }

  return (
    <TourNarrator
      tourTitle="Who Chooses the Prime Minister?"
      frameTitle={frame.title}
      totalSteps={6}
      currentStep={frame.step}
      onClose={onClose}
      onBack={handleBack}
      canGoBack={history.length > 1}
    >
      <div className={`tour-content ${fading ? 'fading' : ''}`}>
        <ShahDialogue text={frame.shahText} />
        {frame.mode === 'action' && (
          <div className="tour-action-hint">
            <span className="tour-action-hint-icon">{'\u261D'}</span>
            <span>Use the buttons in the panel to continue</span>
          </div>
        )}
        {choices.length > 0 && <DecisionButtons choices={choices} onChoose={handleChoose} />}
      </div>
    </TourNarrator>
  );
}
