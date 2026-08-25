import type { CommentaryEntry } from '../types';

import { CROWN_QUOTES } from './crown';
import { PARLIAMENT_QUOTES } from './parliament';
import { EXECUTIVE_QUOTES } from './executive';
import { COURT_QUOTES } from './court';
import { ELECTION_QUOTES } from './election';
import { BUDGET_QUOTES } from './budget';
import { DISASTER_QUOTES } from './disaster';
import { MILESTONE_QUOTES } from './milestone';

export const ALL_QUOTES: CommentaryEntry[] = [
  ...CROWN_QUOTES,
  ...PARLIAMENT_QUOTES,
  ...EXECUTIVE_QUOTES,
  ...COURT_QUOTES,
  ...ELECTION_QUOTES,
  ...BUDGET_QUOTES,
  ...DISASTER_QUOTES,
  ...MILESTONE_QUOTES,
];

export {
  CROWN_QUOTES,
  PARLIAMENT_QUOTES,
  EXECUTIVE_QUOTES,
  COURT_QUOTES,
  ELECTION_QUOTES,
  BUDGET_QUOTES,
  DISASTER_QUOTES,
  MILESTONE_QUOTES,
};
