import type { GovState } from '../types';
import type { ShahMood } from './types';

/** Assess the Shah's mood based on current governance state. */
export function assessMood(state: GovState): ShahMood {
  let severity = 0;

  // Crown suspended is severe
  if (state.crown.suspended) severity += 4;

  // Court in crisis
  if (state.court.crisis) severity += 2;

  // Parliament dissolved
  if (state.parliament.dissolved) severity += 2;

  // No PM
  if (!state.executive.pmSeated) severity += 1;

  // Caretaker government
  if (state.executive.caretaker) severity += 1;

  // Low quorum
  if (!state.parliament.quorum) severity += 1;

  // Many vacancies
  const vacancies = state.people.filter((p) => p.status !== 'active' && p.status !== 'removed').length;
  if (vacancies > 50) severity += 2;
  if (vacancies > 100) severity += 2;

  // Recent deaths (check events for recent "died" events)
  const recentDeaths = state.events
    .slice(0, 10)
    .filter((e) => e.description.includes('died') || e.description.includes('killed'));
  if (recentDeaths.length > 3) severity += 2;

  if (severity >= 6) return 'mourning';
  if (severity >= 4) return 'alarmed';
  if (severity >= 2) return 'concerned';

  // Positive indicators
  if (state.parliament.quorum && state.executive.pmSeated && !state.court.crisis && !state.crown.suspended) {
    return 'proud';
  }

  return 'hopeful';
}
