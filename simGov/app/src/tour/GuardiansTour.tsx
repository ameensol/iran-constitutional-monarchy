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

// After genesis + TOUR_RETIRE_JUSTICE, the first active justice (seat 1) is retired.
// The appointment pipeline entry is created at CrownNom1 for seat 1.
const SEAT_NUMBER = 1;

const frames: Record<string, Frame> = {
  '1': {
    title: 'An Empty Seat',
    shahText:
      'A justice of the Supreme Court has retired. Look at the court card: eleven of twelve seats are filled. The Supreme Court does not make laws. Its role is to guard the constitution, to ensure that no law passed by Parliament and no act of the executive violates the fundamental rights of the people. When the court rules a law unconstitutional, that ruling is final. Filling this seat is one of the most consequential acts in the entire system.',
    highlights: ['court-grid'],
    step: 1,
    viewTarget: { type: 'institution', id: 'court' },
    mode: 'narrative',
    narrativeNext: '2',
  },
  '2': {
    title: 'The Crown Nominates',
    shahText:
      'The Crown nominates a candidate for the vacant seat. The Senate has thirty days to vote on the nomination. This is the balance: the Crown chooses a legal scholar, but the Senate, representing the provinces, must approve. No single institution controls who guards the constitution.',
    highlights: ['court-appointments'],
    step: 2,
    viewTarget: { type: 'institution', id: 'court' },
    mode: 'narrative',
    narrativeNext: '3',
  },
  '3': {
    title: 'The Senate Votes',
    shahText:
      'The nominee stands before the Senate. Seventy senators, sixty-three elected through the provincial councils and seven appointed by the Crown, will decide whether this candidate is worthy of guarding the constitution. Find the justice vote in the Senate Actions and deliver the Senate\u2019s judgment.',
    highlights: ['parl-senate'],
    step: 3,
    viewTarget: { type: 'institution', id: 'parliament' },
    mode: 'action',
  },
  '4A': {
    title: 'Justice Seated',
    shahText:
      'The Senate confirmed the Crown\u2019s nominee. A new justice takes the oath and the court returns to full strength. Twelve guardians of the constitution, chosen through cooperation between the Crown and the provinces. Neither institution had absolute power over this appointment.',
    highlights: ['court-grid'],
    step: 4,
    viewTarget: { type: 'institution', id: 'court' },
    mode: 'narrative',
    narrativeNext: '6',
  },
  '4B': {
    title: 'Try Again',
    shahText:
      'The Senate rejected the Crown\u2019s first choice. The Crown must listen and nominate a second candidate. Another thirty-day vote begins. If the Senate rejects this nominee too, something important happens: the Senate presents a ranked list of three candidates, and the Crown must pick from that list within fourteen days. Cast the Senate\u2019s vote on the second nominee.',
    highlights: ['parl-senate'],
    step: 4,
    viewTarget: { type: 'institution', id: 'parliament' },
    mode: 'action',
  },
  '5B1': {
    title: 'Justice Seated (Second Attempt)',
    shahText:
      'The second nominee was confirmed. Negotiation between the Crown and the Senate found common ground. The court is at full strength again. This iterative process ensures that justices have legitimacy from both the sovereign and the provinces.',
    highlights: ['court-grid'],
    step: 5,
    viewTarget: { type: 'institution', id: 'court' },
    mode: 'narrative',
    narrativeNext: '6',
  },
  '5B2': {
    title: 'The Senate\u2019s List',
    shahText:
      'Both Crown nominees rejected. The power shifts: the Senate now presents its own list of qualified candidates, and the Crown must pick from that list. The provinces have the final say on who guards their constitution. This mechanism ensures that no appointment is blocked forever, and that democratic legitimacy ultimately prevails.',
    highlights: ['parl-senate'],
    step: 5,
    viewTarget: { type: 'institution', id: 'parliament' },
    mode: 'narrative',
    narrativeNext: '6',
  },
  '6': {
    title: 'What Did We Learn?',
    shahText:
      'No single institution controls the Supreme Court. The Crown proposes, the Senate approves. If they disagree once, the Crown tries again. If they disagree twice, the Senate wins. Independence through shared power. This is how you build a judiciary that serves the people, not the palace and not the parliament alone.',
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

/** Reset to genesis then retire a justice so frame 1 shows the vacancy. */
function resetWithJusticeRetired(dispatch: React.Dispatch<GovAction>) {
  resetToFullGenesis(dispatch);
  dispatch({ type: 'TOUR_RETIRE_JUSTICE' });
}

function applyTransition(dispatch: React.Dispatch<GovAction>, from: string, to: string) {
  switch (`${from}>${to}`) {
    case '1>2':
      // Crown nominates — advance appointment from CrownNom1 → SenateVote1
      dispatch({ type: 'TOUR_ADVANCE_NOMINATION', seatNumber: SEAT_NUMBER });
      break;
    case '3>4A':
      dispatch({ type: 'RESOLVE_JUSTICE_VOTE', seatNumber: SEAT_NUMBER, outcome: 'approve' });
      break;
    case '3>4B':
      // Senate rejects → CrownNom2, then Crown nominates second → SenateVote2
      dispatch({ type: 'RESOLVE_JUSTICE_VOTE', seatNumber: SEAT_NUMBER, outcome: 'reject' });
      dispatch({ type: 'TOUR_ADVANCE_NOMINATION', seatNumber: SEAT_NUMBER });
      break;
    case '4B>5B1':
      dispatch({ type: 'RESOLVE_JUSTICE_VOTE', seatNumber: SEAT_NUMBER, outcome: 'approve' });
      break;
    case '4B>5B2':
      dispatch({ type: 'RESOLVE_JUSTICE_VOTE', seatNumber: SEAT_NUMBER, outcome: 'reject' });
      break;
    // narrative transitions — no state change
    case '2>3': break;
    case '4A>6': break;
    case '5B1>6': break;
    case '5B2>6': break;
  }
}

function replayState(dispatch: React.Dispatch<GovAction>, history: string[]) {
  resetWithJusticeRetired(dispatch);
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
        { actionType: 'RESOLVE_JUSTICE_VOTE_APPROVE', nextFrame: '4A', onActionTaken: () => onAction('4A') },
        { actionType: 'RESOLVE_JUSTICE_VOTE_REJECT', nextFrame: '4B', onActionTaken: () => onAction('4B') },
      ];
    case '4B':
      return [
        { actionType: 'RESOLVE_JUSTICE_VOTE_APPROVE', nextFrame: '5B1', onActionTaken: () => onAction('5B1') },
        { actionType: 'RESOLVE_JUSTICE_VOTE_REJECT', nextFrame: '5B2', onActionTaken: () => onAction('5B2') },
      ];
    default:
      return [];
  }
}

export default function GuardiansTour({ dispatch, speed, setSpeed, onClose, setTourView, setTourActions }: TourProps) {
  const [frameId, setFrameId] = useState('1');
  const [history, setHistory] = useState<string[]>(['1']);
  const [fading, setFading] = useState(false);
  const { markCompleted } = useTourCompletion();

  const frame = frames[frameId];
  const highlights = useMemo(() => frame.highlights, [frame]);
  useTourSpotlight(highlights);

  useEffect(() => {
    resetWithJusticeRetired(dispatch);
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

    // After real button click, apply additional state setup
    if (nextFrame === '4B') {
      // Senate rejected first nominee → appointment now at CrownNom2
      // Crown nominates second candidate → advance to SenateVote2
      dispatch({ type: 'TOUR_ADVANCE_NOMINATION', seatNumber: SEAT_NUMBER });
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
      markCompleted('guardians');
      onClose();
      return;
    }

    setFading(true);

    if (nextFrame === '1') {
      resetWithJusticeRetired(dispatch);
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
      tourTitle="The Guardians"
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
