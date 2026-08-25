import type { GovState, GovEvent } from '../types';
import type { ShahSession } from './types';
import { selectCommentary } from './matcher';
import { createSession, recordCommentary } from './delivery';
import { HISTORICAL_PARALLELS } from './history';
import { ALL_QUOTES } from './quotes/index';

export type { ShahMood, TutorialEntry, ShahSession } from './types';
export { assessMood } from './mood';
export { TUTORIALS } from './tutorials';
export { HISTORICAL_PARALLELS } from './history';
export { createSession, recordTutorial } from './delivery';

let session: ShahSession | null = null;

function getSession(): ShahSession {
  if (!session) session = createSession();
  return session;
}

/** Simple seeded random. */
function simpleRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export interface ShahCommentaryResult {
  text: string;
  trigger: string; // the event description that triggered this commentary
}

/**
 * Get commentary for an event. This is the main public API.
 * Returns a quote with its trigger context, or null.
 */
export function getShahCommentary(event: GovEvent, state: GovState): ShahCommentaryResult | null {
  const s = getSession();

  // 40% chance to use a historical parallel instead
  const matchingParallels = HISTORICAL_PARALLELS.filter((hp) => {
    if (s.firedOnce.has(hp.id)) return false;
    if (hp.marker && hp.marker !== event.marker) return false;
    return hp.matchKeywords.some((kw) => event.description.toLowerCase().includes(kw));
  });

  if (matchingParallels.length > 0 && simpleRandom(state.day * 777) < 0.4) {
    const hp = matchingParallels[Math.floor(simpleRandom(state.day * 888) * matchingParallels.length)];
    recordCommentary(s, hp.id, state.day, hp.once);
    return { text: hp.text, trigger: event.description };
  }

  // Regular commentary
  const entry = selectCommentary(event, state, ALL_QUOTES, s);
  if (!entry) return null;

  recordCommentary(s, entry.id, state.day, entry.once ?? false);
  return { text: entry.text, trigger: event.description };
}
