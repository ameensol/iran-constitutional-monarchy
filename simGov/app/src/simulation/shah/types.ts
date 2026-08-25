import type { GovState } from '../types';

export type ShahMood = 'proud' | 'concerned' | 'alarmed' | 'mourning' | 'hopeful' | 'teaching';

export interface CommentaryEntry {
  id: string;
  text: string;
  category: string;
  condition?: (state: GovState) => boolean;
  mood?: ShahMood;
  once?: boolean;  // fire only once per session
}

export interface TutorialEntry {
  id: string;
  trigger: string;  // what triggers this tutorial (e.g., 'first_crown_click')
  text: string;
}

export interface HistoricalParallel {
  id: string;
  text: string;
  matchKeywords: string[];
  marker?: string;
  once: boolean;
}

export interface ShahSession {
  recentIds: Set<string>;
  firedOnce: Set<string>;
  tutorialsSeen: Set<string>;
  lastCommentaryDay: number;
}
