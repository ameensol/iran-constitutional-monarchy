import type { ShahSession } from './types';

const MAX_RECENT = 20;

export function createSession(): ShahSession {
  // Try to load tutorialsSeen from localStorage
  let tutorialsSeen = new Set<string>();
  try {
    const stored = localStorage.getItem('simgov_tutorials_seen');
    if (stored) {
      tutorialsSeen = new Set(JSON.parse(stored));
    }
  } catch { /* ignore */ }

  return {
    recentIds: new Set(),
    firedOnce: new Set(),
    tutorialsSeen,
    lastCommentaryDay: 0,
  };
}

export function recordCommentary(session: ShahSession, id: string, day: number, once: boolean): void {
  session.recentIds.add(id);
  session.lastCommentaryDay = day;

  // Trim recent to max size
  if (session.recentIds.size > MAX_RECENT) {
    const arr = Array.from(session.recentIds);
    session.recentIds = new Set(arr.slice(arr.length - MAX_RECENT));
  }

  if (once) {
    session.firedOnce.add(id);
  }
}

export function recordTutorial(session: ShahSession, tutorialId: string): void {
  session.tutorialsSeen.add(tutorialId);
  try {
    localStorage.setItem('simgov_tutorials_seen', JSON.stringify(Array.from(session.tutorialsSeen)));
  } catch { /* ignore */ }
}
