import type { GovState, GovEvent } from '../types';

/** Tick executive formation deadlines. */
export function tickFormation(state: GovState, day: number): { state: GovState; events: GovEvent[] } {
  const events: GovEvent[] = [];
  const formation = state.executive.formation;

  if (formation.stage === 'Idle' || formation.stage === 'Dissolved') return { state, events };
  if (formation.deadline === null || day < formation.deadline) return { state, events };

  // During Crown suspension, the Senate takes the Crown's nomination role (Art. VI.5.2)
  const suspended = state.crown.suspended;
  const nominator = suspended ? 'Senate' : 'Crown';

  // Deadline reached for current formation stage
  switch (formation.stage) {
    case 'CrownNom1': {
      events.push({
        day,
        marker: 'exec',
        description: `${nominator} first nomination deadline expired; second attempt begins`,
        call: `Executive.formationAdvance(nominator: ${nominator}) → Nom2`,
      });
      return {
        state: {
          ...state,
          executive: {
            ...state.executive,
            formation: { stage: 'CrownNom2', nomineeId: null, deadline: day + 14, attempt: 2 },
          },
        },
        events,
      };
    }

    case 'Confidence1': {
      events.push({
        day,
        marker: 'exec',
        description: `First confidence vote expired without majority; ${nominator} nominates again`,
        call: `Executive.confidenceFailed(nominator: ${nominator}) → Nom2`,
      });
      return {
        state: {
          ...state,
          executive: {
            ...state.executive,
            formation: { stage: 'CrownNom2', nomineeId: null, deadline: day + 14, attempt: 2 },
          },
        },
        events,
      };
    }

    case 'CrownNom2': {
      events.push({
        day,
        marker: 'exec',
        description: `${nominator} second nomination expired; Majlis will present candidate list`,
        call: `Executive.formationAdvance(nominator: ${nominator}) → MajlisList`,
      });
      return {
        state: {
          ...state,
          executive: {
            ...state.executive,
            formation: { stage: 'MajlisList', nomineeId: null, deadline: day + 14, attempt: 2 },
          },
        },
        events,
      };
    }

    case 'Confidence2': {
      events.push({
        day,
        marker: 'exec',
        description: 'Second confidence vote expired; Majlis presents its own list',
        call: 'Executive.confidenceFailed() → MajlisList',
      });
      return {
        state: {
          ...state,
          executive: {
            ...state.executive,
            formation: { stage: 'MajlisList', nomineeId: null, deadline: day + 14, attempt: 2 },
          },
        },
        events,
      };
    }

    case 'MajlisList': {
      const picker = suspended ? 'Senate' : 'Crown';
      events.push({
        day,
        marker: 'exec',
        description: `Majlis list deadline expired; ${picker} must pick or dissolve Parliament`,
        call: `Executive.formationAdvance(picker: ${picker}) → Pick`,
      });
      return {
        state: {
          ...state,
          executive: {
            ...state.executive,
            formation: { stage: 'CrownPick', nomineeId: null, deadline: day + 7, attempt: 2 },
          },
        },
        events,
      };
    }

    case 'CrownPick': {
      events.push({
        day,
        marker: 'exec',
        description: 'Formation exhausted; Parliament dissolved for new elections',
        call: 'Executive.formationExhausted() → Parliament dissolved',
      });
      return {
        state: {
          ...state,
          executive: {
            ...state.executive,
            formation: { stage: 'Dissolved', nomineeId: null, deadline: null, attempt: 2 },
          },
          parliament: { ...state.parliament, dissolved: true, quorum: false },
          elections: { ...state.elections, nextScheduled: Math.min(state.elections.nextScheduled, 60) },
        },
        events,
      };
    }
  }

  return { state, events };
}
