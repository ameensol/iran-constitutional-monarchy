import type { GovState, GovEvent } from '../types';
import { personName } from '../types';

/** Check for term expirations and remove people whose terms have ended. */
export function tickTerms(state: GovState, day: number): { state: GovState; events: GovEvent[] } {
  const events: GovEvent[] = [];
  let changed = false;

  const people = state.people.map((p) => {
    if (p.status !== 'active' || p.termEnd === null) return p;
    if (day < p.termEnd) return p;

    changed = true;
    events.push({
      day,
      marker: p.role === 'majlis_member' || p.role === 'senator' ? 'parl' : 'election',
      description: `${personName(p)}'s term expired (${p.role.replace('_', ' ')})`,
      call: `Parliament.termExpired(personId: ${p.id}, role: ${p.role})`,
    });

    return { ...p, status: 'removed' as const };
  });

  if (!changed) return { state, events };

  return {
    state: { ...state, people },
    events,
  };
}
