import type { GovState, GovEvent } from '../types';
import type { CommentaryEntry, ShahSession } from './types';
import { assessMood } from './mood';

/** Classify an event into a category for quote matching. */
export function classifyEvent(event: GovEvent): string {
  const d = event.description.toLowerCase();
  const m = event.marker;

  // Crown
  if (m === 'crown') {
    if (d.includes('signed')) return 'crown_sign';
    if (d.includes('returned')) return 'crown_return';
    if (d.includes('deadline expired') || d.includes('enforced')) return 'crown_deadline';
    if (d.includes('crowned') || d.includes('coronation')) return 'succession';
    if (d.includes('suspended')) return 'crown_suspend';
    if (d.includes('disaster')) return 'disaster_general';
  }

  // Parliament
  if (m === 'parl') {
    if (d.includes('submitted')) return 'bill_submit';
    if (d.includes('passed the majlis')) return 'majlis_pass';
    if (d.includes('rejected by the majlis')) return 'majlis_reject';
    if (d.includes('senate approved')) return 'senate_approve';
    if (d.includes('senate objected')) return 'senate_object';
    if (d.includes('dissolved')) return 'parl_dissolve';
    if (d.includes('overrode') || d.includes('override')) return 'majlis_override';
    if (d.includes('re-adopted')) return 'majlis_pass';
    if (d.includes('amendment')) return 'amendment';
  }

  // Executive
  if (m === 'exec') {
    if (d.includes('seated') || d.includes('confidence')) return 'pm_seated';
    if (d.includes('caretaker')) return 'pm_caretaker';
    if (d.includes('no-confidence') || d.includes('no confidence')) return 'no_confidence';
    if (d.includes('formation') || d.includes('nominated')) return 'formation';
    if (d.includes('minister')) return 'minister';
  }

  // Court
  if (m === 'court') {
    if (d.includes('review filed') || d.includes('review')) return 'court_review';
    if (d.includes('upheld') || d.includes('struck down') || d.includes('ruling')) return 'court_ruling';
    if (d.includes('seated') || d.includes('approved') || d.includes('appointment')) return 'court_appoint';
    if (d.includes('quorum') || d.includes('crisis')) return 'court_crisis';
  }

  // Elections
  if (m === 'election') {
    if (d.includes('begun') || d.includes('started') || d.includes('registration')) return 'election_start';
    if (d.includes('tallied') || d.includes('tally')) return 'election_tally';
    if (d.includes('seated') || d.includes('winners')) return 'election_seat';
    if (d.includes('by-election') || d.includes('byelection')) return 'byelection';
    if (d.includes('referendum')) return 'referendum';
  }

  // Budget
  if (m === 'budget') {
    if (d.includes('enacted')) return 'budget_enact';
    if (d.includes('proposed') || d.includes('begins')) return 'budget_propose';
    if (d.includes('audit')) return 'budget_audit';
    if (d.includes('rejected')) return 'budget_reject';
  }

  return 'general';
}

/** Simple seeded random. */
function simpleRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/**
 * Select a commentary entry for the given event.
 * Returns null if no match or rate-limited.
 */
export function selectCommentary(
  event: GovEvent,
  state: GovState,
  quotes: CommentaryEntry[],
  session: ShahSession,
): CommentaryEntry | null {
  const category = classifyEvent(event);
  const mood = assessMood(state);

  // Rate limit: at most one commentary per day
  if (session.lastCommentaryDay >= state.day) return null;

  // Filter matching quotes
  let candidates = quotes.filter((q) => q.category === category);

  // Remove once-fired quotes
  candidates = candidates.filter((q) => !q.once || !session.firedOnce.has(q.id));

  // Remove recently shown quotes (dedup within last 20)
  candidates = candidates.filter((q) => !session.recentIds.has(q.id));

  // Check conditions
  candidates = candidates.filter((q) => !q.condition || q.condition(state));

  if (candidates.length === 0) return null;

  // Weight by mood match (2x for matching mood)
  const weighted: { entry: CommentaryEntry; weight: number }[] = candidates.map((q) => ({
    entry: q,
    weight: q.mood === mood ? 2 : 1,
  }));

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = simpleRandom(state.day * 1000 + event.description.length) * totalWeight;

  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) return w.entry;
  }

  return weighted[0].entry;
}
