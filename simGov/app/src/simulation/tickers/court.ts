import type { GovState, GovEvent } from '../types';
import { justiceCount, courtHasQuorum } from '../selectors';

/** Tick court liveness: check for crisis state. */
export function tickCourt(state: GovState, day: number): { events: GovEvent[] } {
  const events: GovEvent[] = [];
  const jCount = justiceCount(state);
  const hasQuorum = courtHasQuorum(state);

  // Emit crisis event if we just lost quorum
  if (!hasQuorum && !state.court.crisis) {
    events.push({
      day,
      marker: 'court',
      description: `Supreme Court lost quorum (${jCount}/${state.court.totalSeats} justices)`,
      call: `SupremeCourt.quorumCheck() → crisis = true`,
    });
  }

  // Emit recovery event if we just regained quorum
  if (hasQuorum && state.court.crisis) {
    events.push({
      day,
      marker: 'court',
      description: `Supreme Court quorum restored (${jCount}/${state.court.totalSeats} justices)`,
      call: `SupremeCourt.quorumCheck() → crisis = false`,
    });
  }

  return { events };
}
