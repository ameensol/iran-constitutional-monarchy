import type { GovState, GovEvent } from '../types';
import { seededRandom } from '../engine';
import { changePersonStatus } from '../people';

/** Tick no-confidence motion: accumulate votes daily and auto-resolve on deadline. */
export function tickNoConfidence(state: GovState, day: number): { state: GovState; events: GovEvent[] } {
  const events: GovEvent[] = [];
  const nc = state.executive.noConfidence;

  if (!nc || nc.resolved) return { state, events };

  // Vote accumulation (each day before deadline)
  if (day < nc.deadline) {
    const yesAdd = Math.floor(seededRandom(day * 500 + 1) * 12) + 3; // 3-14 votes/day
    const noAdd = Math.floor(seededRandom(day * 500 + 2) * 8) + 2;   // 2-9 votes/day
    const majlisSeats = state.parliament.majlisSeats;
    const totalSoFar = nc.yesVotes + nc.noVotes;
    const maxAdd = majlisSeats - totalSoFar;

    if (maxAdd > 0) {
      const yesActual = Math.min(yesAdd, maxAdd);
      const noActual = Math.min(noAdd, maxAdd - yesActual);

      return {
        state: {
          ...state,
          executive: {
            ...state.executive,
            noConfidence: {
              ...nc,
              yesVotes: nc.yesVotes + yesActual,
              noVotes: nc.noVotes + noActual,
            },
          },
        },
        events,
      };
    }

    return { state, events };
  }

  // Deadline reached: auto-resolve
  const daysSincePMSeated = state.executive.pmSeated
    ? day - (state.people.find((p) => p.role === 'prime_minister' && p.status === 'active')?.seatedDay ?? 0)
    : 999;
  const threshold = daysSincePMSeated <= 90 ? 100 : 75; // 2/3 in first 90 days, simple majority after

  const passed = nc.yesVotes > nc.noVotes && nc.yesVotes >= threshold;

  if (passed) {
    const pm = state.people.find((p) => p.role === 'prime_minister' && p.status === 'active');
    const pmName = pm ? `${pm.firstName} ${pm.lastName}` : 'the Prime Minister';

    events.push({
      day,
      marker: 'exec',
      description: `No-confidence passed (${nc.yesVotes}-${nc.noVotes}): ${pmName} removed from office`,
      call: 'Executive.noConfidencePassed() → PM removed, formation begins',
    });

    let newState: GovState = {
      ...state,
      executive: {
        ...state.executive,
        noConfidence: { ...nc, resolved: true, outcome: 'pass' },
      },
    };

    if (pm) {
      newState = changePersonStatus(newState, pm.id, 'removed');
    }

    return { state: newState, events };
  } else {
    events.push({
      day,
      marker: 'exec',
      description: `No-confidence motion failed (${nc.yesVotes}-${nc.noVotes}): the Prime Minister retains Parliament's confidence`,
      call: 'Executive.noConfidenceFailed() → PM continues',
    });

    return {
      state: {
        ...state,
        executive: {
          ...state.executive,
          noConfidence: { ...nc, resolved: true, outcome: 'fail' },
        },
      },
      events,
    };
  }
}
