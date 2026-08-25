import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { GovState, GovAction } from '../simulation/types';
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
  state: GovState;
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

// After genesis + PROPOSE_AMENDMENT, the first amendment has id 1
const AMENDMENT_ID = 1;

const frames: Record<string, Frame> = {
  '1': {
    title: 'A Proposal',
    shahText:
      'A constitutional amendment has been proposed: "Extend the Majlis term from four years to five years." A constitution that cannot evolve is a constitution that will be overthrown. My country learned this the hardest way possible. But change must be deliberate, with high thresholds, because the rules that govern us all should only change when nearly everyone agrees.',
    highlights: ['parliament'],
    step: 1,
    viewTarget: { type: 'dashboard' },
    mode: 'narrative',
    narrativeNext: '2',
  },
  '2': {
    title: 'Parliament Debates',
    shahText:
      'The amendment enters Parliament. A supermajority is needed: not a simple fifty-percent-plus-one, but a high bar that ensures broad consensus. Ordinary laws need a majority. But changing the rules of the game itself, the constitution that constrains every institution including Parliament, that requires overwhelming agreement. This protects minorities, prevents hasty changes, and ensures stability.',
    highlights: ['parliament'],
    step: 2,
    viewTarget: { type: 'institution', id: 'parliament' },
    mode: 'narrative',
    narrativeNext: '3',
  },
  '3': {
    title: 'The Parliamentary Vote',
    shahText:
      'Parliament votes on the amendment. Two-thirds of both chambers must agree. Find the amendment in the Parliament panel and cast the vote. Does the amendment reach this high bar?',
    highlights: ['parliament'],
    step: 3,
    viewTarget: { type: 'institution', id: 'parliament' },
    mode: 'action',
  },
  '4A': {
    title: 'To the People',
    shahText:
      'Parliament approved the amendment with a supermajority. But even Parliament cannot change the constitution alone. Now it goes to a national referendum. Every citizen votes directly, using the same private ballot system we saw in the election tour. The people themselves must ratify any change to their fundamental law. Find the referendum vote and deliver the people\u2019s verdict.',
    highlights: ['parliament'],
    step: 4,
    viewTarget: { type: 'institution', id: 'parliament' },
    mode: 'action',
  },
  '4B': {
    title: 'The Rules Stand',
    shahText:
      'Parliament did not reach the supermajority. The amendment dies. The constitution is unchanged. This high bar exists to protect minorities and prevent hasty changes. If the Majlis term should be five years, then enough representatives must believe it to clear a two-thirds threshold. Short of that, the existing rules, which the people already ratified, remain in force.',
    highlights: ['parliament'],
    step: 4,
    viewTarget: { type: 'dashboard' },
    mode: 'narrative',
    narrativeNext: '6',
  },
  '5A': {
    title: 'The Constitution Evolves',
    shahText:
      'The referendum passed. The amendment is enacted. The Majlis term is now five years. The constitution has been changed by the will of the people, through their representatives AND directly. Two barriers, both cleared. This is how a living constitution works: it bends to the people\u2019s will, but slowly, deliberately, with every safeguard in place.',
    highlights: ['parliament', 'elections'],
    step: 5,
    viewTarget: { type: 'dashboard' },
    mode: 'narrative',
    narrativeNext: '6',
  },
  '5B': {
    title: 'The People Said No',
    shahText:
      'The referendum failed. Even though Parliament approved the amendment with a supermajority, the people rejected it. The constitution is unchanged. This is the ultimate check: the people themselves have veto power over constitutional change. Parliament can propose, but only the citizens can ratify. Sovereignty, in the end, belongs to no institution. It belongs to the people.',
    highlights: ['elections'],
    step: 5,
    viewTarget: { type: 'dashboard' },
    mode: 'narrative',
    narrativeNext: '6',
  },
  '6': {
    title: 'What Did We Learn?',
    shahText:
      'Changing the constitution requires both Parliament (supermajority) and the people (referendum). Three possible outcomes: Parliament says no, Parliament says yes but the people say no, or both agree and the constitution evolves. There is also an emergency path: when the Supreme Court certifies an existential threat, Parliament can amend constitutional parameters temporarily by a three-quarters vote of each chamber, without a referendum. These emergency amendments expire after one year unless confirmed by the people. And certain provisions are protected even from emergency amendment: justice terms, court quorum, election rules, and the amendment thresholds themselves cannot be changed without a full referendum.',
    highlights: [],
    step: 6,
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

/** Reset to genesis then propose the amendment so frame 1 shows it. */
function resetWithAmendmentProposed(dispatch: React.Dispatch<GovAction>) {
  resetToFullGenesis(dispatch);
  dispatch({ type: 'PROPOSE_AMENDMENT', title: 'Extend Majlis term from 4 to 5 years' });
}

function applyTransition(dispatch: React.Dispatch<GovAction>, from: string, to: string) {
  switch (`${from}>${to}`) {
    case '1>2':
      // Advance amendment to ParliamentVote phase
      dispatch({ type: 'TOUR_SET_AMENDMENT_PHASE', amendmentId: AMENDMENT_ID, phase: 'ParliamentVote' });
      break;
    case '3>4A':
      dispatch({ type: 'RESOLVE_AMENDMENT', amendmentId: AMENDMENT_ID, outcome: 'pass' });
      break;
    case '3>4B':
      dispatch({ type: 'RESOLVE_AMENDMENT', amendmentId: AMENDMENT_ID, outcome: 'fail' });
      break;
    case '4A>5A':
      dispatch({ type: 'RESOLVE_AMENDMENT', amendmentId: AMENDMENT_ID, outcome: 'pass' });
      break;
    case '4A>5B':
      dispatch({ type: 'RESOLVE_AMENDMENT', amendmentId: AMENDMENT_ID, outcome: 'fail' });
      break;
    // narrative transitions — no state change
    case '2>3': break;
    case '4B>6': break;
    case '5A>6': break;
    case '5B>6': break;
  }
}

function replayState(dispatch: React.Dispatch<GovAction>, history: string[]) {
  resetWithAmendmentProposed(dispatch);
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
        { actionType: 'RESOLVE_AMENDMENT_PARL_PASS', actionKey: AMENDMENT_ID, nextFrame: '4A', onActionTaken: () => onAction('4A') },
        { actionType: 'RESOLVE_AMENDMENT_PARL_FAIL', actionKey: AMENDMENT_ID, nextFrame: '4B', onActionTaken: () => onAction('4B') },
      ];
    case '4A':
      return [
        { actionType: 'RESOLVE_AMENDMENT_REF_PASS', actionKey: AMENDMENT_ID, nextFrame: '5A', onActionTaken: () => onAction('5A') },
        { actionType: 'RESOLVE_AMENDMENT_REF_FAIL', actionKey: AMENDMENT_ID, nextFrame: '5B', onActionTaken: () => onAction('5B') },
      ];
    default:
      return [];
  }
}

export default function RewritingRulesTour({ dispatch, speed, setSpeed, onClose, setTourView, setTourActions }: TourProps) {
  const [frameId, setFrameId] = useState('1');
  const [history, setHistory] = useState<string[]>(['1']);
  const [fading, setFading] = useState(false);
  const { markCompleted } = useTourCompletion();

  const frame = frames[frameId];
  const highlights = useMemo(() => frame.highlights, [frame]);
  useTourSpotlight(highlights);

  useEffect(() => {
    resetWithAmendmentProposed(dispatch);
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

  // Narrative/terminal handler
  const handleChoose = useCallback((nextFrame: string) => {
    if (nextFrame === 'close') {
      markCompleted('rewriting-rules');
      onClose();
      return;
    }

    setFading(true);

    if (nextFrame === '1') {
      resetWithAmendmentProposed(dispatch);
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
      tourTitle="Rewriting the Rules"
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
