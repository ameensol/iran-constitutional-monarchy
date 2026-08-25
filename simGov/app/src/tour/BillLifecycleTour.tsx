import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { GovState, GovAction } from '../simulation/types';
import type { PlaySpeed } from '../simulation/useSimulation';
import type { TourViewTarget } from './tourTypes';
import type { TourActionTarget, TourActionContextValue } from './TourActionContext';
import TourNarrator from './TourNarrator';
import ShahDialogue from './ShahDialogue';
import DecisionButtons from './DecisionButtons';
import BillFlowchart from './BillFlowchart';
import { useTourCompletion } from './useTourCompletion';
import { useTourSpotlight } from './useTourSpotlight';
// genesis stages handled inline (BILL_TOUR_GENESIS_MAX)

interface BillLifecycleTourProps {
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  speed: PlaySpeed;
  setSpeed: (speed: PlaySpeed) => void;
  onClose: () => void;
  setTourView: (view: TourViewTarget | undefined) => void;
  setTourActions: (ctx: TourActionContextValue) => void;
}

// ── Frame definitions ──────────────────────────────

interface LifecycleFrame {
  title: string;
  shahText: string;
  highlights: string[];
  viewTarget: TourViewTarget;
  step: number;
  mode: 'narrative' | 'action' | 'terminal';
  narrativeNext?: string; // frame to go to on "Continue" (narrative mode)
}

const frames: Record<string, LifecycleFrame> = {
  '1': {
    title: 'Where Laws Begin',
    shahText:
      'In this system, no law begins in the palace. Every bill is born here, in the Majlis, drafted by elected representatives of the people. This is the house where Iranian voices become legislation. Let us follow one bill from its first breath to its final form.',
    highlights: ['parl-majlis'],
    viewTarget: { type: 'institution', id: 'parliament' },
    step: 1,
    mode: 'narrative',
    narrativeNext: '2',
  },
  '2': {
    title: 'Submit the Bill',
    shahText:
      'A member of the Majlis proposes a reform. Submit the bill yourself: find the highlighted button in the Parliament panel and click it. See how the process begins not with royal decree, but with a representative\u2019s pen.',
    highlights: [],
    viewTarget: { type: 'institution', id: 'parliament' },
    step: 2,
    mode: 'action',
  },
  '3': {
    title: 'The Majlis Debates',
    shahText:
      'The Majlis has the bill before it. The elected representatives will debate, and then vote. You decide their verdict: pass the bill to the Senate for review, or reject it outright. Find the bill in the Active Bills list and cast the Majlis vote.',
    highlights: ['parl-bills'],
    viewTarget: { type: 'institution', id: 'parliament' },
    step: 3,
    mode: 'action',
  },
  '3R': {
    title: 'Rejected',
    shahText:
      'The Majlis rejected the bill. This is democracy at work. Not every proposal deserves to become law, and Parliament\u2019s refusal is as legitimate as its approval. The process protected the nation from a law its representatives did not support.',
    highlights: [],
    viewTarget: { type: 'dashboard' },
    step: 3,
    mode: 'terminal',
  },
  '4': {
    title: 'Senate Review',
    shahText:
      'The Majlis approved the bill. Now it goes to the Senate, the chamber of longer view and cooler judgment. The Senate can approve it and send it to the Crown, or object and return it to the Majlis. Use the Senate Actions to decide.',
    highlights: ['parl-senate'],
    viewTarget: { type: 'institution', id: 'parliament' },
    step: 4,
    mode: 'action',
  },
  '4O': {
    title: 'Senate Objects',
    shahText:
      'The Senate raised objections. But in this constitution, the elected Majlis has the last word over the appointed Senate. The Majlis can override the Senate\u2019s objection with an absolute majority and send the bill directly to the Crown. Click Override Senate in the Majlis Actions.',
    highlights: [],
    viewTarget: { type: 'institution', id: 'parliament' },
    step: 4,
    mode: 'action',
  },
  '5': {
    title: "The Crown's Desk",
    shahText:
      'The bill arrives at the Crown\u2019s desk. The king has two choices: sign it into law, or return it to Parliament with objections. The Crown cannot refer a bill to the Court on first reading. That power only becomes available if the Majlis re-adopts a returned bill. Choose wisely.',
    highlights: ['crown-pending'],
    viewTarget: { type: 'institution', id: 'crown' },
    step: 5,
    mode: 'action',
  },
  '5R': {
    title: 'Returned to Parliament',
    shahText:
      'The Crown returned the bill. This is the king\u2019s one chance to ask Parliament to reconsider, not a veto, but a request. The Majlis can begin a formal revote on the bill, or accept the Crown\u2019s concerns and drop it. Click Begin Majlis Revote to put the bill back before the chamber.',
    highlights: ['parl-bills'],
    viewTarget: { type: 'institution', id: 'parliament' },
    step: 5,
    mode: 'action',
  },
  '5RV': {
    title: 'The Majlis Revotes',
    shahText:
      'The bill is back on the Majlis floor. The representatives will vote again, knowing the Crown\u2019s objections. If they pass it a second time, the bill goes back to the Crown, and this time the king cannot return it. He must sign it or refer it to the Court. Cast the Majlis vote.',
    highlights: ['parl-bills'],
    viewTarget: { type: 'institution', id: 'parliament' },
    step: 5,
    mode: 'action',
  },
  '5R2': {
    title: 'Parliament Persists',
    shahText:
      'The Majlis re-adopted the bill. Now the Crown\u2019s options narrow: sign it, or refer it to the Court for constitutional review. The king cannot return it a second time. When the people\u2019s representatives persist, the Crown must yield or seek the constitution\u2019s judgment.',
    highlights: ['crown-pending'],
    viewTarget: { type: 'institution', id: 'crown' },
    step: 5,
    mode: 'action',
  },
  '5RD': {
    title: 'Parliament Accepts',
    shahText:
      'The Majlis chose not to re-adopt the bill. The Crown\u2019s objection was persuasive, and Parliament decided to listen. Not every bill needs to become law. This is dialogue between institutions working as designed.',
    highlights: [],
    viewTarget: { type: 'dashboard' },
    step: 5,
    mode: 'terminal',
  },
  '5C': {
    title: 'Constitutional Review',
    shahText:
      'The bill is before the Supreme Court. The justices will examine whether this law respects the constitution, the fundamental agreement that binds all institutions, including the Crown itself. The Court can uphold the bill or strike it down. Their ruling is final.',
    highlights: [],
    viewTarget: { type: 'institution', id: 'court' },
    step: 5,
    mode: 'action',
  },
  '6A': {
    title: 'Enacted',
    shahText:
      'The bill is law. Whether the Crown signed willingly or Parliament persisted until it had no choice, the result is the same: the people\u2019s will, expressed through their representatives, became the law of the land.',
    highlights: [],
    viewTarget: { type: 'dashboard' },
    step: 6,
    mode: 'narrative',
    narrativeNext: '7',
  },
  '5CU': {
    title: 'Court Upholds',
    shahText:
      'The Court found no constitutional flaw. The bill becomes law with the Court\u2019s blessing, carrying not only Parliament\u2019s mandate but the Court\u2019s confirmation that it respects the nation\u2019s fundamental charter.',
    highlights: [],
    viewTarget: { type: 'dashboard' },
    step: 6,
    mode: 'narrative',
    narrativeNext: '7',
  },
  '5CS': {
    title: 'Vetoed',
    shahText:
      'The Court struck down the bill. This is the one true veto in the system, and it belongs not to the king but to the constitution itself. The Crown cannot veto. But the constitution can, through an independent court that answers to no one.',
    highlights: [],
    viewTarget: { type: 'dashboard' },
    step: 6,
    mode: 'terminal',
  },
  '7': {
    title: 'What Did We Learn?',
    shahText:
      'Every path through this process reveals the same truth: the Crown is a seal, not a gate. The king can delay, question, and seek review, but he cannot permanently block the will of the people. The only power that can stop a bill is the constitution itself, enforced by an independent court. This is what twenty-five centuries taught us: a king who serves the law, not a law that serves the king.',
    highlights: [],
    viewTarget: { type: 'dashboard' },
    step: 7,
    mode: 'terminal',
  },
};

// ── Bill ID ────────────────────────────────────────

// Genesis stages 1-4 create no bills. The first SUBMIT_BILL yields id 1.
const BILL_ID = 1;

// ── Path tracking for flowchart ────────────────────

type BillPath =
  | 'sign'
  | 'return-readopt-sign'
  | 'return-readopt-refer-uphold'
  | 'return-readopt-refer-strike'
  | 'return-drop'
  | 'reject'
  | 'senate-object'
  | null;

function getPathFromHistory(history: string[]): BillPath {
  const h = new Set(history);
  if (h.has('3R')) return 'reject';
  if (h.has('5RD')) return 'return-drop';
  if (h.has('5CS')) return 'return-readopt-refer-strike';
  if (h.has('5CU')) return 'return-readopt-refer-uphold';
  if (h.has('5R2') && h.has('6A')) return 'return-readopt-sign';
  if (h.has('6A') && h.has('4O')) return 'sign'; // signed after senate override
  if (h.has('6A')) return 'sign';
  if (h.has('5RV')) return 'return-readopt-sign'; // mid-revote, will resolve to readopt path
  if (h.has('5R')) return 'return-drop'; // still on return path, hasn't started revote
  if (h.has('4O')) return 'senate-object';
  return null;
}

// ── State replay for back navigation ───────────────

// Only run genesis stages 1-5 (Crown, Elections, Parliament, Executive, Court).
// Skip stage 6 (first bill) so SUBMIT_BILL yields bill id 1 as BILL_ID expects.
const BILL_TOUR_GENESIS_MAX = 5;

function resetToGenesis(dispatch: React.Dispatch<GovAction>) {
  dispatch({ type: 'RESET_TO_GENESIS' });
  for (let s = 1; s <= BILL_TOUR_GENESIS_MAX; s++) {
    dispatch({ type: 'GENESIS_ADVANCE', stage: s });
  }
}

function applyTransition(dispatch: React.Dispatch<GovAction>, from: string, to: string) {
  switch (`${from}>${to}`) {
    case '1>2': break;
    case '2>3':
      dispatch({ type: 'SUBMIT_BILL', name: 'New Legislative Proposal', sponsor: 'citizen10' });
      break;
    case '3>4':
      dispatch({ type: 'RESOLVE_MAJLIS_VOTE', billId: BILL_ID, outcome: 'pass' });
      break;
    case '3>3R':
      dispatch({ type: 'RESOLVE_MAJLIS_VOTE', billId: BILL_ID, outcome: 'fail' });
      break;
    case '4>5':
      dispatch({ type: 'SENATE_APPROVE_BILL', billId: BILL_ID });
      break;
    case '4>4O':
      dispatch({ type: 'SENATE_OBJECT_BILL', billId: BILL_ID });
      break;
    case '4O>5':
      dispatch({ type: 'MAJLIS_OVERRIDE_SENATE', billId: BILL_ID });
      break;
    case '5>6A':
      dispatch({ type: 'SIGN_BILL', billId: BILL_ID });
      break;
    case '5>5R':
      dispatch({ type: 'RETURN_BILL', billId: BILL_ID });
      break;
    case '5R>5RV':
      dispatch({ type: 'RESOLVE_RETURNED_BILL', billId: BILL_ID, outcome: 'readopt' });
      break;
    case '5R>5RD':
      dispatch({ type: 'RESOLVE_RETURNED_BILL', billId: BILL_ID, outcome: 'drop' });
      break;
    case '5RV>5R2':
      dispatch({ type: 'RESOLVE_MAJLIS_VOTE', billId: BILL_ID, outcome: 'pass' });
      break;
    case '5RV>5RD':
      dispatch({ type: 'RESOLVE_MAJLIS_VOTE', billId: BILL_ID, outcome: 'fail' });
      break;
    case '5R2>6A':
      dispatch({ type: 'SIGN_BILL', billId: BILL_ID });
      break;
    case '5R2>5C':
      dispatch({ type: 'REFER_TO_COURT', billId: BILL_ID });
      break;
    case '5C>5CU':
      dispatch({ type: 'COURT_UPHOLD_BILL', billId: BILL_ID });
      break;
    case '5C>5CS':
      dispatch({ type: 'COURT_STRIKE_BILL', billId: BILL_ID });
      break;
    // narrative transitions — no state change
    case '6A>7': break;
    case '5CU>7': break;
  }
}

function replayState(dispatch: React.Dispatch<GovAction>, history: string[]) {
  resetToGenesis(dispatch);
  for (let i = 1; i < history.length; i++) {
    applyTransition(dispatch, history[i - 1], history[i]);
  }
}

// ── Target computation ─────────────────────────────

function computeTargets(
  frameId: string,
  onAction: (next: string) => void,
): TourActionTarget[] {
  switch (frameId) {
    case '2':
      return [
        { actionType: 'SUBMIT_BILL', nextFrame: '3', onActionTaken: () => onAction('3') },
      ];
    case '3':
      return [
        { actionType: 'RESOLVE_MAJLIS_VOTE_PASS', actionKey: BILL_ID, nextFrame: '4', onActionTaken: () => onAction('4') },
        { actionType: 'RESOLVE_MAJLIS_VOTE_FAIL', actionKey: BILL_ID, nextFrame: '3R', onActionTaken: () => onAction('3R') },
      ];
    case '4':
      return [
        { actionType: 'SENATE_APPROVE_BILL', nextFrame: '5', onActionTaken: () => onAction('5') },
        { actionType: 'SENATE_OBJECT_BILL', nextFrame: '4O', onActionTaken: () => onAction('4O') },
      ];
    case '4O':
      return [
        { actionType: 'MAJLIS_OVERRIDE_SENATE', nextFrame: '5', onActionTaken: () => onAction('5') },
      ];
    case '5':
      return [
        { actionType: 'SIGN_BILL', actionKey: BILL_ID, nextFrame: '6A', onActionTaken: () => onAction('6A') },
        { actionType: 'RETURN_BILL', actionKey: BILL_ID, nextFrame: '5R', onActionTaken: () => onAction('5R') },
      ];
    case '5R':
      return [
        { actionType: 'BEGIN_MAJLIS_REVOTE', actionKey: BILL_ID, nextFrame: '5RV', onActionTaken: () => onAction('5RV') },
        { actionType: 'RESOLVE_RETURNED_BILL_DROP', actionKey: BILL_ID, nextFrame: '5RD', onActionTaken: () => onAction('5RD') },
      ];
    case '5RV':
      return [
        { actionType: 'RESOLVE_MAJLIS_REVOTE_PASS', actionKey: BILL_ID, nextFrame: '5R2', onActionTaken: () => onAction('5R2') },
        { actionType: 'RESOLVE_MAJLIS_REVOTE_FAIL', actionKey: BILL_ID, nextFrame: '5RD', onActionTaken: () => onAction('5RD') },
      ];
    case '5R2':
      return [
        { actionType: 'SIGN_BILL', actionKey: BILL_ID, nextFrame: '6A', onActionTaken: () => onAction('6A') },
        { actionType: 'REFER_TO_COURT', actionKey: BILL_ID, nextFrame: '5C', onActionTaken: () => onAction('5C') },
      ];
    case '5C':
      return [
        { actionType: 'COURT_UPHOLD_BILL', actionKey: BILL_ID, nextFrame: '5CU', onActionTaken: () => onAction('5CU') },
        { actionType: 'COURT_STRIKE_BILL', actionKey: BILL_ID, nextFrame: '5CS', onActionTaken: () => onAction('5CS') },
      ];
    default:
      return [];
  }
}

// ── Component ──────────────────────────────────────

export default function BillLifecycleTour({
  dispatch,
  speed,
  setSpeed,
  onClose,
  setTourView,
  setTourActions,
}: BillLifecycleTourProps) {
  const [frameId, setFrameId] = useState('1');
  const [history, setHistory] = useState<string[]>(['1']);
  const [fading, setFading] = useState(false);
  const { markCompleted } = useTourCompletion();

  const frame = frames[frameId];
  const highlights = useMemo(() => frame.highlights, [frame]);
  useTourSpotlight(highlights);

  const activePath = getPathFromHistory(history);

  // Initialize: genesis state, pause sim
  useEffect(() => {
    resetToGenesis(dispatch);
    setSpeed('paused');
    setTourView(frames['1'].viewTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep sim paused
  useEffect(() => {
    if (speed !== 'paused') setSpeed('paused');
  }, [speed, setSpeed]);

  // Stable action handler using ref to avoid stale closures
  const handleActionRef = useRef<(next: string) => void>(() => {});
  handleActionRef.current = (nextFrame: string) => {
    setFading(true);
    // Clear targets during fade
    setTourActions({ tourMode: false, activeTargets: [] });

    setTimeout(() => {
      const newHistory = [...history, nextFrame];
      setHistory(newHistory);
      setFrameId(nextFrame);
      setTourView(frames[nextFrame]?.viewTarget);

      // Set targets for new frame
      const targets = computeTargets(nextFrame, (n) => handleActionRef.current(n));
      setTourActions({
        tourMode: targets.length > 0,
        activeTargets: targets,
      });

      setFading(false);
    }, 300);
  };

  // Set initial targets for frame 1 (and update on frame changes from narrative/back)
  useEffect(() => {
    const targets = computeTargets(frameId, (n) => handleActionRef.current(n));
    setTourActions({
      tourMode: targets.length > 0,
      activeTargets: targets,
    });
  }, [frameId, setTourActions]);

  // Clean up tour actions on unmount
  useEffect(() => {
    return () => {
      setTourActions({ tourMode: false, activeTargets: [] });
    };
  }, [setTourActions]);

  // Narrative "Continue" handler
  const handleChoose = useCallback((nextFrame: string) => {
    if (nextFrame === 'close') {
      markCompleted('bill-lifecycle');
      onClose();
      return;
    }

    if (nextFrame === '1') {
      // Restart
      setFading(true);
      resetToGenesis(dispatch);
      setTourActions({ tourMode: false, activeTargets: [] });
      setTimeout(() => {
        setHistory(['1']);
        setFrameId('1');
        setTourView(frames['1'].viewTarget);
        setFading(false);
      }, 300);
      return;
    }

    // Normal narrative advance
    setFading(true);
    setTimeout(() => {
      setHistory((h) => [...h, nextFrame]);
      setFrameId(nextFrame);
      setTourView(frames[nextFrame]?.viewTarget);
      setFading(false);
    }, 300);
  }, [dispatch, markCompleted, onClose, setTourView, setTourActions]);

  // Back navigation: replay from genesis
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
  // action mode: no sidebar choices (user clicks real UI buttons)

  return (
    <TourNarrator
      tourTitle="Life of a Law"
      frameTitle={frame.title}
      totalSteps={7}
      currentStep={frame.step}
      onClose={onClose}
      onBack={handleBack}
      canGoBack={history.length > 1}
    >
      <div className={`tour-content ${fading ? 'fading' : ''}`}>
        <ShahDialogue text={frame.shahText} />
        {frameId === '7' && <BillFlowchart activePath={activePath} />}
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
