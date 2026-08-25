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
    title: 'A Government Under Fire',
    shahText:
      'The Prime Minister is seated, the government is functioning, but Parliament is unhappy. Perhaps the economy has stalled, perhaps a scandal has erupted, perhaps the PM has simply lost the confidence of the majority. In our system, the PM serves because Parliament allows it. That permission can be revoked. This is the most powerful check the legislature holds over the executive.',
    highlights: ['exec-pm'],
    step: 1,
    viewTarget: { type: 'institution', id: 'executive' },
    mode: 'narrative',
    narrativeNext: '2',
  },
  '2': {
    title: 'The Motion is Filed',
    shahText:
      'A no-confidence motion has been filed. A debate period begins. The executive card shows the pending motion. This is not a coup, not a revolution, not tanks in the street. This is the constitution working. The PM has time to defend their record before the Majlis, to rally support, to argue their case. The process protects both sides: the PM gets time to respond, and Parliament gets a formal mechanism to act.',
    highlights: ['exec-confidence'],
    step: 2,
    viewTarget: { type: 'institution', id: 'executive' },
    mode: 'narrative',
    narrativeNext: '3',
  },
  '3': {
    title: 'The Vote',
    shahText:
      'The debate period has ended. The Majlis votes. Within the first ninety days of a government, two-thirds of the Majlis must vote to remove the Prime Minister. After ninety days, a simple majority suffices. Find the no-confidence vote in the Parliament panel and cast the Majlis verdict.',
    highlights: ['parl-majlis'],
    step: 3,
    viewTarget: { type: 'institution', id: 'parliament' },
    mode: 'action',
  },
  '4A': {
    title: 'A New Beginning',
    shahText:
      'No-confidence passed. The Prime Minister is removed from office. The government enters caretaker mode, and the formation process begins again: the Crown will nominate a new candidate, Parliament will vote confidence. The people\u2019s representatives spoke, and the system obeyed. No tanks, no revolution, no exile. Just a vote, and a peaceful transfer of power. This is what I wish my own country had known.',
    highlights: ['exec-pm'],
    step: 4,
    viewTarget: { type: 'institution', id: 'executive' },
    mode: 'narrative',
    narrativeNext: '5',
  },
  '4B': {
    title: 'The Government Survives',
    shahText:
      'No-confidence failed. The Prime Minister stays in office. The government continues to govern with Parliament\u2019s confidence. This too is the system working: the motion was itself the check. It was filed, debated, voted upon, and it failed. The PM retains the majority\u2019s trust. Democracy is not only about removing leaders; it is also about confirming them.',
    highlights: ['exec-pm'],
    step: 4,
    viewTarget: { type: 'institution', id: 'executive' },
    mode: 'narrative',
    narrativeNext: '5',
  },
  '5': {
    title: 'What Did We Learn?',
    shahText:
      'The Prime Minister is accountable to Parliament, always. No-confidence is the people\u2019s constitutional veto on executive power. The two-thirds threshold in the first ninety days protects new governments from premature removal, while the simple majority afterward ensures that a PM who has truly lost Parliament\u2019s confidence cannot cling to power. Whether the motion passes or fails, the process itself is the safeguard. This is the accountability that every democracy requires.',
    highlights: [],
    step: 5,
    viewTarget: { type: 'dashboard' },
    mode: 'terminal',
  },
};

function resetToFullGenesis(dispatch: React.Dispatch<GovAction>) {
  dispatch({ type: 'RESET_TO_GENESIS' });
  for (let i = 1; i <= GENESIS_MAX_STAGE; i++) {
    dispatch({ type: 'GENESIS_ADVANCE', stage: i });
  }
}

function applyTransition(dispatch: React.Dispatch<GovAction>, from: string, to: string) {
  switch (`${from}>${to}`) {
    case '1>2':
      dispatch({ type: 'FILE_NO_CONFIDENCE' });
      break;
    case '3>4A':
      dispatch({ type: 'RESOLVE_NO_CONFIDENCE', outcome: 'pass' });
      break;
    case '3>4B':
      dispatch({ type: 'RESOLVE_NO_CONFIDENCE', outcome: 'fail' });
      break;
    // narrative transitions — no state change
    case '2>3': break;
    case '4A>5': break;
    case '4B>5': break;
  }
}

function replayState(dispatch: React.Dispatch<GovAction>, history: string[]) {
  resetToFullGenesis(dispatch);
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
        { actionType: 'RESOLVE_NO_CONFIDENCE_PASS', nextFrame: '4A', onActionTaken: () => onAction('4A') },
        { actionType: 'RESOLVE_NO_CONFIDENCE_FAIL', nextFrame: '4B', onActionTaken: () => onAction('4B') },
      ];
    default:
      return [];
  }
}

export default function PeoplesVetoTour({ dispatch, speed, setSpeed, onClose, setTourView, setTourActions }: TourProps) {
  const [frameId, setFrameId] = useState('1');
  const [history, setHistory] = useState<string[]>(['1']);
  const [fading, setFading] = useState(false);
  const { markCompleted } = useTourCompletion();

  const frame = frames[frameId];
  const highlights = useMemo(() => frame.highlights, [frame]);
  useTourSpotlight(highlights);

  useEffect(() => {
    resetToFullGenesis(dispatch);
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

  // Narrative/terminal "Continue" / restart handler
  const handleChoose = useCallback((nextFrame: string) => {
    if (nextFrame === 'close') {
      markCompleted('peoples-veto');
      onClose();
      return;
    }

    setFading(true);

    if (nextFrame === '1') {
      resetToFullGenesis(dispatch);
      setTourActions({ tourMode: false, activeTargets: [] });
      setTimeout(() => {
        setHistory(['1']);
        setFrameId('1');
        setTourView(frames['1'].viewTarget);
        setFading(false);
      }, 300);
      return;
    }

    // Normal narrative advance — apply state transitions
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
      { label: 'Start over', sub: 'Try a different outcome', nextFrame: '1' },
      { label: 'Return to Tour Hub', sub: '', nextFrame: 'close' },
    ];
  }

  return (
    <TourNarrator
      tourTitle="The People's Veto"
      frameTitle={frame.title}
      totalSteps={5}
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
