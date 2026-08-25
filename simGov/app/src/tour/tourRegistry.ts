export interface TourMeta {
  id: string;
  title: string;
  description: string;
  artSrc: string;
  totalSteps: number;
  resetsState: boolean;
  category: 'foundations' | 'how-it-works' | 'accountability' | 'resilience';
}

export const TOURS: TourMeta[] = [
  // ── Foundations ──
  {
    id: 'genesis',
    title: 'Genesis: Building a Nation',
    description: 'Watch a constitutional monarchy come to life from an empty blockchain.',
    artSrc: '/assets/persepolis-relief.svg',
    totalSteps: 7,
    resetsState: true,
    category: 'foundations',
  },
  {
    id: 'bill-lifecycle',
    title: 'Life of a Law',
    description: 'Submit a bill and guide it through Parliament, the Senate, and the Crown. Every path reveals why the king is a seal, not a gate.',
    artSrc: '/assets/king-and-courtier.svg',
    totalSteps: 7,
    resetsState: true,
    category: 'foundations',
  },

  // ── How It Works ──
  {
    id: 'pm-formation',
    title: 'Who Chooses the Prime Minister?',
    description: 'The PM resigns. Watch the Crown, Parliament, and the people negotiate who leads next.',
    artSrc: '/assets/three-courtiers.svg',
    totalSteps: 6,
    resetsState: true,
    category: 'how-it-works',
  },
  {
    id: 'guardians',
    title: 'The Guardians',
    description: 'A Supreme Court seat is empty. See how the Crown and Senate fill it, and who gets the last word.',
    artSrc: '/assets/noble-with-rhyton.svg',
    totalSteps: 6,
    resetsState: true,
    category: 'how-it-works',
  },
  {
    id: 'election-day',
    title: 'Election Day',
    description: 'Parliament dissolves. Watch a new election unfold, from registration to the sealed ballot box that no one can open.',
    artSrc: '/assets/offering-bearer.svg',
    totalSteps: 5,
    resetsState: true,
    category: 'how-it-works',
  },

  // ── Accountability ──
  {
    id: 'peoples-veto',
    title: "The People's Veto",
    description: 'Parliament has had enough. Watch a no-confidence vote unseat a Prime Minister, or fail trying.',
    artSrc: '/assets/gryphon.svg',
    totalSteps: 5,
    resetsState: true,
    category: 'accountability',
  },
  {
    id: 'rewriting-rules',
    title: 'Rewriting the Rules',
    description: 'A constitutional amendment is proposed. See who must agree before the nation\'s fundamental law can change.',
    artSrc: '/assets/rosette.svg',
    totalSteps: 6,
    resetsState: true,
    category: 'accountability',
  },

  // ── Resilience ──
  {
    id: 'system-breaks',
    title: 'When the System Breaks',
    description: 'Choose a crisis and watch the constitution\'s emergency procedures activate. Every breakdown has a procedure.',
    artSrc: '/assets/lamassu.svg',
    totalSteps: 7,
    resetsState: true,
    category: 'resilience',
  },
];

export const TOUR_CATEGORIES: { key: TourMeta['category']; label: string }[] = [
  { key: 'foundations', label: 'Foundations' },
  { key: 'how-it-works', label: 'How It Works' },
  { key: 'accountability', label: 'Accountability' },
  { key: 'resilience', label: 'Resilience' },
];
