import type { GovState, GovAction, DisasterId, PersonId, ProvinceId } from './types';

interface Disaster {
  id: DisasterId;
  name: string;
  description: string;
  affectedInstitutions: string[];
  generateActions: (state: GovState, provinceId?: ProvinceId) => GovAction[];
}

/** Deterministic seeded random. */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function sampleIds(ids: PersonId[], fraction: number, seed: number): PersonId[] {
  const count = Math.max(1, Math.floor(ids.length * fraction));
  const shuffled = [...ids];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export const DISASTERS: Disaster[] = [
  {
    id: 'nuke_tehran',
    name: 'Nuclear Strike on Tehran',
    description: 'A nuclear strike destroys Tehran. The monarch, PM, 80% of Majlis members, Tehran provincial council, and 3 justices are killed.',
    affectedInstitutions: ['crown', 'parliament', 'executive', 'court'],
    generateActions(state) {
      const actions: GovAction[] = [];
      const tehranPeople = state.people.filter((p) => p.provinceId === 1 && p.status === 'active');

      // Kill monarch
      const monarch = state.people.find((p) => p.role === 'monarch' && p.status === 'active');
      if (monarch) actions.push({ type: 'KILL_PERSON', personId: monarch.id });

      // Kill PM
      const pm = state.people.find((p) => p.role === 'prime_minister' && p.status === 'active');
      if (pm) actions.push({ type: 'KILL_PERSON', personId: pm.id });

      // Kill 80% of Majlis
      const majlis = state.people.filter((p) => p.role === 'majlis_member' && p.status === 'active');
      const toKill = sampleIds(majlis.map((p) => p.id), 0.8, state.day * 111);
      if (toKill.length > 0) actions.push({ type: 'KILL_BULK', personIds: toKill });

      // Kill Tehran council
      const council = tehranPeople.filter((p) => p.role === 'provincial_council');
      if (council.length > 0) actions.push({ type: 'KILL_BULK', personIds: council.map((p) => p.id) });

      // Kill 3 justices
      const justices = state.people.filter((p) => p.role === 'justice' && p.status === 'active');
      const justiceKill = sampleIds(justices.map((p) => p.id), 0.25, state.day * 222);
      if (justiceKill.length > 0) actions.push({ type: 'KILL_BULK', personIds: justiceKill.slice(0, 3) });

      return actions;
    },
  },
  {
    id: 'earthquake',
    name: 'Earthquake in Province',
    description: 'A devastating earthquake destroys a province. The provincial council and both senators are killed.',
    affectedInstitutions: ['parliament', 'elections'],
    generateActions(state, provinceId) {
      const pid = provinceId ?? 8; // Kerman default
      const actions: GovAction[] = [];
      const affected = state.people.filter(
        (p) => p.provinceId === pid && p.status === 'active'
          && (p.role === 'provincial_council' || p.role === 'senator')
      );
      if (affected.length > 0) {
        actions.push({ type: 'KILL_BULK', personIds: affected.map((p) => p.id) });
      }
      return actions;
    },
  },
  {
    id: 'plane_crash',
    name: 'Plane Crash',
    description: 'A plane crash kills the Prime Minister and Deputy PM.',
    affectedInstitutions: ['executive'],
    generateActions(state) {
      const actions: GovAction[] = [];
      const pm = state.people.find((p) => p.role === 'prime_minister' && p.status === 'active');
      const dpm = state.people.find((p) => p.role === 'deputy_pm' && p.status === 'active');
      if (pm) actions.push({ type: 'KILL_PERSON', personId: pm.id });
      if (dpm) actions.push({ type: 'KILL_PERSON', personId: dpm.id });
      return actions;
    },
  },
  {
    id: 'assassination',
    name: 'Assassination of the Monarch',
    description: 'The monarch is assassinated. Succession activates immediately.',
    affectedInstitutions: ['crown'],
    generateActions(state) {
      const monarch = state.people.find((p) => p.role === 'monarch' && p.status === 'active');
      if (!monarch) return [];
      return [{ type: 'KILL_PERSON', personId: monarch.id }];
    },
  },
  {
    id: 'mass_resignation',
    name: 'Mass Resignation',
    description: '30% of Majlis members resign in protest.',
    affectedInstitutions: ['parliament'],
    generateActions(state) {
      const majlis = state.people.filter((p) => p.role === 'majlis_member' && p.status === 'active');
      const toResign = sampleIds(majlis.map((p) => p.id), 0.3, state.day * 333);
      return toResign.map((id) => ({ type: 'RESIGN_PERSON' as const, personId: id }));
    },
  },
  {
    id: 'revolution',
    name: 'Revolution',
    description: 'The Crown is suspended by popular uprising.',
    affectedInstitutions: ['crown'],
    generateActions() {
      return [{ type: 'SUSPEND_CROWN' }];
    },
  },
  {
    id: 'judicial_massacre',
    name: 'Judicial Massacre',
    description: '8 of 12 justices are killed, destroying court quorum.',
    affectedInstitutions: ['court'],
    generateActions(state) {
      const justices = state.people.filter((p) => p.role === 'justice' && p.status === 'active');
      const toKill = sampleIds(justices.map((p) => p.id), 0.72, state.day * 444);
      return toKill.slice(0, 8).map((id) => ({ type: 'KILL_PERSON' as const, personId: id }));
    },
  },
  {
    id: 'economic_crisis',
    name: 'Economic Crisis',
    description: 'Budget is rejected twice. Financial gridlock.',
    affectedInstitutions: ['budget'],
    generateActions() {
      return [
        { type: 'PROPOSE_AMENDMENT', title: 'Emergency Economic Measures', emergency: true },
      ];
    },
  },
  {
    id: 'provincial_uprising',
    name: 'Provincial Uprising',
    description: 'A province loses its entire council to mass resignation.',
    affectedInstitutions: ['elections'],
    generateActions(state, provinceId) {
      const pid = provinceId ?? 12; // Kurdistan default
      const council = state.people.filter(
        (p) => p.provinceId === pid && p.role === 'provincial_council' && p.status === 'active'
      );
      return council.map((p) => ({ type: 'RESIGN_PERSON' as const, personId: p.id }));
    },
  },
  {
    id: 'full_1979',
    name: 'The Full 1979',
    description: 'Crown suspended, PM replaced, Majlis dissolved. The system collapses.',
    affectedInstitutions: ['crown', 'parliament', 'executive'],
    generateActions(state) {
      const actions: GovAction[] = [];
      actions.push({ type: 'SUSPEND_CROWN' });
      const pm = state.people.find((p) => p.role === 'prime_minister' && p.status === 'active');
      if (pm) actions.push({ type: 'RESIGN_PERSON', personId: pm.id });
      actions.push({ type: 'DISSOLVE_PARLIAMENT' });
      return actions;
    },
  },
];

export function getDisaster(id: DisasterId): Disaster {
  return DISASTERS.find((d) => d.id === id)!;
}
