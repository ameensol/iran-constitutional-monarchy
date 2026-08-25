import { useState, useEffect, useCallback, useMemo } from 'react';
import type { GovAction } from '../simulation/types';
import type { PlaySpeed } from '../simulation/useSimulation';
import type { TourViewTarget } from './tourTypes';
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
}

interface Frame {
  title: string;
  shahText: string;
  highlights: string[];
  choices: { label: string; sub: string; nextFrame: string }[];
  step: number;
  viewTarget?: TourViewTarget;
}

const frames: Record<string, Frame> = {
  '1': {
    title: 'A Nation at Peace',
    shahText:
      'Look at the dashboard. Over seven hundred officials in their seats. Crown, Parliament, Executive, Supreme Court, provincial councils, all functioning. Every institution staffed, every process running. This is what a constitutional monarchy looks like when it works. But what happens when it does not? A constitution is only as strong as its worst day. Let us test this one.',
    highlights: ['crown', 'parliament', 'executive', 'court'],
    choices: [{ label: 'Continue', sub: '', nextFrame: '2' }],
    step: 1,
    viewTarget: { type: 'dashboard' },
  },
  '2': {
    title: 'Choose Your Crisis',
    shahText:
      'Four disasters. Each one tests a different part of the constitutional framework. Choose the crisis, and watch the constitution respond.',
    highlights: [],
    choices: [
      { label: 'Earthquake', sub: 'A province is destroyed', nextFrame: '3A' },
      { label: 'Assassination', sub: 'The monarch is killed', nextFrame: '3B' },
      { label: 'Judicial massacre', sub: '8 of 12 justices killed', nextFrame: '3C' },
      { label: 'Full collapse', sub: 'The 1979 scenario', nextFrame: '3D' },
    ],
    step: 2,
    viewTarget: { type: 'dashboard' },
  },

  // ── Disaster triggers ──

  '3A': {
    title: 'The Ground Shakes',
    shahText:
      'Earthquake in Kerman. The provincial council is destroyed. Both senators are killed. Watch the dashboard as the casualties register: the parliament card shows fewer senators, the elections section shows by-elections automatically scheduling. The remaining institutions continue functioning. The Majlis still has quorum. The government still governs. The constitution routes around the damage and begins rebuilding.',
    highlights: ['parl-councils'],
    choices: [{ label: 'Continue', sub: 'Watch the recovery', nextFrame: '4A' }],
    step: 3,
    viewTarget: { type: 'institution', id: 'parliament' },
  },
  '3B': {
    title: 'The Crown Falls',
    shahText:
      'The monarch is assassinated. Watch the Crown card: the Supreme Court certifies the vacancy and confirms the next heir. Once confirmed, anyone can trigger the succession on the blockchain. If there are no heirs, the Crown suspends itself. The person dies, but the institution survives. The blockchain does not mourn. It executes the succession protocol exactly as written, without ambiguity, without anyone needing to seize power in the chaos.',
    highlights: ['crown-succession'],
    choices: [{ label: 'Continue', sub: 'Watch the recovery', nextFrame: '4B' }],
    step: 3,
    viewTarget: { type: 'institution', id: 'crown' },
  },
  '3C': {
    title: 'The Court Empties',
    shahText:
      'Eight of twelve justices killed. The court has lost quorum. It cannot rule on constitutional questions until enough seats are filled. But watch: the appointment pipeline activates for all vacant seats simultaneously. The Crown nominates, the Senate votes, and through the same careful process we saw in the Guardians tour, new justices will be seated. Even the guardians of the constitution can be replaced.',
    highlights: ['court-grid'],
    choices: [{ label: 'Continue', sub: 'Watch the recovery', nextFrame: '4C' }],
    step: 3,
    viewTarget: { type: 'institution', id: 'court' },
  },
  '3D': {
    title: 'Everything at Once',
    shahText:
      'Crown suspended. Prime Minister resigned. Parliament dissolved. Every institution in crisis simultaneously. This is what happened to my country in 1979. I know this scenario intimately, because I lived it. The constitution we are building has procedures for what can be proceduralized: elections for Parliament, formation cycles for the Executive. But the Crown suspension is a political question that no constitution can resolve automatically.',
    highlights: ['crown', 'parliament', 'executive'],
    choices: [{ label: 'Continue', sub: 'Watch the recovery', nextFrame: '4D' }],
    step: 3,
    viewTarget: { type: 'dashboard' },
  },

  // ── Earthquake recovery (4A–6A) ──

  '4A': {
    title: 'The Machinery Activates',
    shahText:
      'The earthquake killed the provincial council and both senators. But watch the elections section: by-elections have been scheduled automatically for the vacant Senate seats. Voting is underway. The remaining twenty-nine provinces continue functioning. The Majlis still has quorum. The government still governs. The constitution routes around the damage.',
    highlights: ['elections-active'],
    choices: [{ label: 'Continue', sub: '', nextFrame: '5A' }],
    step: 4,
    viewTarget: { type: 'institution', id: 'elections' },
  },
  '5A': {
    title: 'New Voices Rise',
    shahText:
      'The by-elections are proceeding. Citizens in Kerman vote for new senators using the same private ballot that protects every vote in this system. The ballots have been tallied. The province will have representation again, chosen by its own people, not appointed by the capital.',
    highlights: ['elections-active'],
    choices: [{ label: 'Continue', sub: '', nextFrame: '6A' }],
    step: 5,
    viewTarget: { type: 'institution', id: 'elections' },
  },
  '6A': {
    title: 'The Province Rebuilds',
    shahText:
      'New senators have been seated. The provincial council has been rebuilt through provincial elections. Kerman has full representation again. The earthquake destroyed buildings and took lives, but the constitutional machinery routed around the damage and rebuilt itself. No one seized power in the chaos. No emergency decree was needed. The procedures were already written.',
    highlights: ['parliament', 'elections'],
    choices: [{ label: 'Continue', sub: '', nextFrame: '7' }],
    step: 6,
    viewTarget: { type: 'dashboard' },
  },

  // ── Assassination recovery (4B–6B) ──

  '4B': {
    title: 'The Institution Survives',
    shahText:
      'Look at the Crown card. The monarch is dead, but the Supreme Court certified the vacancy and the next heir has been crowned. This happened the moment the death was recorded. No interregnum, no power struggle, no uncertainty. The person died, but the institution survived.',
    highlights: ['crown-succession'],
    choices: [{ label: 'Continue', sub: '', nextFrame: '5B' }],
    step: 4,
    viewTarget: { type: 'institution', id: 'crown' },
  },
  '5B': {
    title: 'Continuity of Government',
    shahText:
      'Under the new monarch, every institution continues operating exactly as before. The Prime Minister still governs with Parliament\u2019s confidence. Parliament still legislates. The Supreme Court still reviews. The succession was seamless because the protocol was already encoded. No one needed to seize power in the chaos, because there was no chaos.',
    highlights: ['crown', 'executive', 'parliament'],
    choices: [{ label: 'Continue', sub: '', nextFrame: '6B' }],
    step: 5,
    viewTarget: { type: 'dashboard' },
  },
  '6B': {
    title: 'What If There Were No Heirs?',
    shahText:
      'In our scenario, an heir was available and the succession was immediate. But what if the entire royal family were gone? The Crown would suspend itself. Parliament and the courts would continue to function independently, because they do not depend on the Crown to operate. The Crown suspension would become a matter for the nation to resolve through its constitutional processes, whether a referendum, a constitutional convention, or a negotiated transition.',
    highlights: ['crown'],
    choices: [{ label: 'Continue', sub: '', nextFrame: '7' }],
    step: 6,
    viewTarget: { type: 'dashboard' },
  },

  // ── Judicial massacre recovery (4C–6C) ──

  '4C': {
    title: 'The Appointment Pipeline',
    shahText:
      'Eight seats empty. Eight appointment pipelines activated simultaneously. For each vacant seat, the Crown nominates a legal scholar, and the Senate has thirty days to vote. Watch the Court card: nominations are pending for every vacant seat, each moving through its own pipeline independently. The court has lost quorum, but the process to rebuild it has already begun.',
    highlights: ['court-grid'],
    choices: [{ label: 'Continue', sub: '', nextFrame: '5C' }],
    step: 4,
    viewTarget: { type: 'institution', id: 'court' },
  },
  '5C': {
    title: 'The Senate Decides',
    shahText:
      'The Senate votes on the nominees. Some are confirmed, taking their seats immediately. Others may yet be rejected, and if so, the Crown nominates again. If the Crown and Senate cannot agree after two rounds, the Senate proposes its own list of three candidates and the Crown must choose from that list within fourteen days. The provinces always have the final word on who guards their constitution.',
    highlights: ['court-grid'],
    choices: [{ label: 'Continue', sub: '', nextFrame: '6C' }],
    step: 5,
    viewTarget: { type: 'institution', id: 'court' },
  },
  '6C': {
    title: 'Guardians Restored',
    shahText:
      'The remaining justices have been confirmed and seated. The Supreme Court has its quorum back. Constitutional review resumes. Even the guardians of the constitution themselves can be replaced through the constitution\u2019s own procedures. The system does not depend on any twelve individuals. It depends on the process that selects them.',
    highlights: ['court-grid'],
    choices: [{ label: 'Continue', sub: '', nextFrame: '7' }],
    step: 6,
    viewTarget: { type: 'institution', id: 'court' },
  },

  // ── Full 1979 recovery (4D–6D) ──

  '4D': {
    title: 'Three Crises, Three Procedures',
    shahText:
      'Crown suspended. Prime Minister gone. Parliament dissolved. Three simultaneous crises, but each has a constitutional procedure. Watch the elections section: a general election has been called automatically. Registration opens across all thirty-one provinces. The electoral machinery functions independently of the Crown, because it was designed to.',
    highlights: ['elections'],
    choices: [{ label: 'Continue', sub: '', nextFrame: '5D' }],
    step: 4,
    viewTarget: { type: 'institution', id: 'elections' },
  },
  '5D': {
    title: 'The People Vote',
    shahText:
      'The general election proceeds. Across every province, citizens cast their ballots for new representatives. The Crown is still suspended. The executive formation is frozen, because the Crown normally nominates the Prime Minister. But the most important thing happens first: the people choose their Parliament.',
    highlights: ['elections-active'],
    choices: [{ label: 'Continue', sub: '', nextFrame: '6D' }],
    step: 5,
    viewTarget: { type: 'institution', id: 'elections' },
  },
  '6D': {
    title: 'The Hardest Question',
    shahText:
      'Parliament is restored. One hundred and forty-nine representatives seated, ready to legislate. The courts still function. But the Crown remains suspended, and without the Crown, the normal formation process for a Prime Minister cannot proceed. This is the constitutional question my country faced in 1979, and no constitution can answer it automatically. What happens next is a political decision: a referendum on the monarchy, a constitutional convention, or a negotiated transition. The constitution provides the framework. The people must decide.',
    highlights: ['parliament', 'crown'],
    choices: [{ label: 'Continue', sub: '', nextFrame: '7' }],
    step: 6,
    viewTarget: { type: 'dashboard' },
  },

  // ── Summary ──

  '7': {
    title: 'What Did We Learn?',
    shahText:
      'No system can prevent disaster. Earthquakes happen. Leaders die. Courts are gutted. Governments fall. But a good constitution can survive any of them. The procedures exist so that recovery does not depend on any one person\u2019s judgment, on a general\u2019s ambition, or on a mob\u2019s anger. The constitution is a machine that keeps running when the operators fail. This is what Iran deserves: a system that outlasts any crisis, because the rules are stronger than the people who made them.',
    highlights: [],
    choices: [{ label: 'Start over', sub: 'Try a different crisis', nextFrame: '1' }],
    step: 7,
    viewTarget: { type: 'dashboard' },
  },
};

function resetToFullGenesis(dispatch: React.Dispatch<GovAction>) {
  dispatch({ type: 'RESET_TO_GENESIS' });
  for (let i = 1; i <= GENESIS_MAX_STAGE; i++) {
    dispatch({ type: 'GENESIS_ADVANCE', stage: i });
  }
}

function applyFrameState(dispatch: React.Dispatch<GovAction>, targetFrame: string) {
  switch (targetFrame) {
    // Disaster triggers
    case '3A':
      dispatch({ type: 'TRIGGER_DISASTER', disasterId: 'earthquake', provinceId: 8 });
      break;
    case '3B':
      dispatch({ type: 'TRIGGER_DISASTER', disasterId: 'assassination' });
      break;
    case '3C':
      dispatch({ type: 'TRIGGER_DISASTER', disasterId: 'judicial_massacre' });
      break;
    case '3D':
      dispatch({ type: 'TRIGGER_DISASTER', disasterId: 'full_1979' });
      break;

    // Earthquake recovery
    case '4A':
      dispatch({ type: 'TOUR_SET_ALL_ELECTIONS_PHASE', phase: 'voting' });
      break;
    case '5A':
      dispatch({ type: 'TOUR_SET_ALL_ELECTIONS_PHASE', phase: 'tallied' });
      break;
    case '6A':
      dispatch({ type: 'TOUR_COMPLETE_BY_ELECTIONS' });
      dispatch({ type: 'TOUR_RESTORE_PROVINCE', provinceId: 8 });
      break;

    // Assassination recovery — succession already happened in the disaster cascade
    case '4B':
    case '5B':
    case '6B':
      break;

    // Judicial massacre recovery
    case '4C':
      // Pipelines already visible from the disaster cascade
      break;
    case '5C':
      dispatch({ type: 'TOUR_CONFIRM_HALF_APPOINTMENTS' });
      break;
    case '6C':
      dispatch({ type: 'TOUR_SEAT_ALL_APPOINTMENTS' });
      break;

    // Full 1979 recovery
    case '4D':
      dispatch({ type: 'TOUR_START_PROVINCIAL_ELECTIONS' });
      break;
    case '5D':
      dispatch({ type: 'TOUR_SET_ALL_ELECTIONS_PHASE', phase: 'voting' });
      break;
    case '6D':
      dispatch({ type: 'TOUR_SET_ALL_ELECTIONS_PHASE', phase: 'seated' });
      break;
  }
}

export default function SystemBreaksTour({ dispatch, speed, setSpeed, onClose, setTourView }: TourProps) {
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

  const handleChoose = useCallback((nextFrame: string) => {
    if (nextFrame === 'close') {
      markCompleted('system-breaks');
      onClose();
      return;
    }

    setFading(true);

    if (nextFrame === '1') {
      resetToFullGenesis(dispatch);
    } else {
      applyFrameState(dispatch, nextFrame);
    }

    setTimeout(() => {
      if (nextFrame === '1') {
        setHistory(['1']);
      } else {
        setHistory((h) => [...h, nextFrame]);
      }
      setFrameId(nextFrame);
      setTourView(frames[nextFrame]?.viewTarget);
      setFading(false);
    }, 300);
  }, [dispatch, markCompleted, onClose, setTourView]);

  const handleBack = useCallback(() => {
    if (history.length <= 1) return;

    setFading(true);
    const newHistory = history.slice(0, -1);
    resetToFullGenesis(dispatch);

    for (let i = 1; i < newHistory.length; i++) {
      applyFrameState(dispatch, newHistory[i]);
    }

    const targetFrame = newHistory[newHistory.length - 1];
    setTimeout(() => {
      setHistory(newHistory);
      setFrameId(targetFrame);
      setTourView(frames[targetFrame]?.viewTarget);
      setFading(false);
    }, 300);
  }, [history, dispatch, setTourView]);

  const choices = frameId === '7'
    ? [...frame.choices, { label: 'Return to Tour Hub', sub: '', nextFrame: 'close' }]
    : frame.choices;

  return (
    <TourNarrator
      tourTitle="When the System Breaks"
      frameTitle={frame.title}
      totalSteps={7}
      currentStep={frame.step}
      onClose={onClose}
      onBack={handleBack}
      canGoBack={history.length > 1}
    >
      <div className={`tour-content ${fading ? 'fading' : ''}`}>
        <ShahDialogue text={frame.shahText} />
        <DecisionButtons choices={choices} onChoose={handleChoose} />
      </div>
    </TourNarrator>
  );
}
