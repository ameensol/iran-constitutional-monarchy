import type { Person, PersonRole, PartyId, ProvinceId } from './types';
import { PROVINCES } from './provinces';

/** Deterministic seeded random for reproducible name generation. */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.floor(seededRandom(seed) * arr.length)];
}

const MALE_FIRST_NAMES = [
  'Dariush', 'Cyrus', 'Reza', 'Ali', 'Hassan', 'Hossein', 'Mehdi', 'Mohammad',
  'Amir', 'Babak', 'Farhad', 'Kaveh', 'Nader', 'Omid', 'Parviz', 'Saman',
  'Shahram', 'Siavash', 'Arash', 'Bijan', 'Jamshid', 'Keyvan', 'Maziar',
  'Payam', 'Rostam', 'Touraj', 'Vahid', 'Behzad', 'Kamran', 'Iraj',
];

const FEMALE_FIRST_NAMES = [
  'Shirin', 'Maryam', 'Nasrin', 'Parvin', 'Leila', 'Azadeh', 'Faranak',
  'Golnaz', 'Homa', 'Jaleh', 'Katayoun', 'Ladan', 'Mandana', 'Niloofar',
  'Parastoo', 'Roya', 'Sepideh', 'Taraneh', 'Vida', 'Yasaman', 'Ziba',
  'Anahita', 'Bahar', 'Darya', 'Elnaz', 'Fatemeh', 'Ghazal', 'Haleh',
  'Irana', 'Jamileh',
];

const LAST_NAMES = [
  'Ahmadi', 'Bakhtiari', 'Dabiri', 'Esfahani', 'Farzan', 'Golestan',
  'Hashemi', 'Irani', 'Javadi', 'Karimi', 'Larijani', 'Mohammadi',
  'Nazari', 'Omrani', 'Parsa', 'Qasemi', 'Rahmani', 'Sadeghi',
  'Tehrani', 'Vaezi', 'Yazdi', 'Zamani', 'Abedi', 'Bahrami',
  'Chamran', 'Dehghan', 'Eshraghi', 'Ferdowsi', 'Gharibpour', 'Hedayat',
  'Jalili', 'Khorasani', 'Lotfi', 'Mansouri', 'Nikpay', 'Ostadi',
  'Pirouz', 'Rezaei', 'Shahidi', 'Tousi',
];

export const PARTY_NAMES: PartyId[] = [
  'Nokhostin',       // "First" — centrist reformers
  'Mihan',           // "Homeland" — nationalist conservatives
  'Sabz',            // "Green" — environmentalist progressives
  'Edalat',          // "Justice" — social democrats
  'Azadi',           // "Freedom" — libertarian liberals
  'Omid',            // "Hope" — moderate technocrats
  'Pishraft',        // "Progress" — developmental modernizers
  'Hambastegi',      // "Solidarity" — labor/workers' party
];

export const PARTY_COLORS: Record<PartyId, string> = {
  'Nokhostin':    '#4A90D9',  // blue
  'Mihan':        '#D94A4A',  // red
  'Sabz':         '#2D8B4A',  // green
  'Edalat':       '#D9A04A',  // amber
  'Azadi':        '#9B59B6',  // purple
  'Omid':         '#3498DB',  // sky blue
  'Pishraft':     '#E67E22',  // orange
  'Hambastegi':   '#1ABC9C',  // teal
};

interface PersonSeed {
  role: PersonRole;
  provinceId: ProvinceId;
  seatNumber?: number;
  party: PartyId;
  seatedDay: number;
  termEnd: number | null;
}

function generateName(seed: number): { firstName: string; lastName: string } {
  const isFemale = seededRandom(seed) > 0.5;
  const names = isFemale ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES;
  return {
    firstName: pick(names, seed + 1),
    lastName: pick(LAST_NAMES, seed + 2),
  };
}

function createPerson(id: number, ps: PersonSeed, nameSeed: number): Person {
  const { firstName, lastName } = generateName(nameSeed);
  return {
    id,
    firstName,
    lastName,
    role: ps.role,
    status: 'active',
    provinceId: ps.provinceId,
    party: ps.party,
    seatedDay: ps.seatedDay,
    termEnd: ps.termEnd,
    seatNumber: ps.seatNumber,
  };
}

// ── Staged helpers ────────────────────────────────────

interface GenerateResult {
  people: Person[];
  nextId: number;
}

export function generateRoyalFamily(nextId: number, _baseSeed: number, _day: number): GenerateResult {
  const people: Person[] = [];

  people.push({
    id: nextId++,
    firstName: 'Reza',
    lastName: 'Pahlavi',
    role: 'monarch',
    status: 'active',
    provinceId: 1,
    party: '',
    seatedDay: 1,
    termEnd: null,
  });

  const heirNames = [
    { first: 'Noor', last: 'Pahlavi' },
    { first: 'Iman', last: 'Pahlavi' },
    { first: 'Farah', last: 'Pahlavi' },
  ];
  for (const h of heirNames) {
    people.push({
      id: nextId++,
      firstName: h.first,
      lastName: h.last,
      role: 'heir',
      status: 'active',
      provinceId: 1,
      party: '',
      seatedDay: 1,
      termEnd: null,
    });
  }

  return { people, nextId };
}

export function generateMajlis(nextId: number, baseSeed: number, day: number): GenerateResult {
  const people: Person[] = [];
  let majlisSeat = 1;

  for (const prov of PROVINCES) {
    for (let s = 0; s < prov.majlisSeats; s++) {
      const seed = baseSeed + nextId * 7;
      const party = pick(PARTY_NAMES, seed + 3);
      const seated = Math.max(1, day - Math.floor(seededRandom(seed + 4) * 200));
      const p = createPerson(nextId, {
        role: 'majlis_member',
        provinceId: prov.id,
        seatNumber: majlisSeat,
        party,
        seatedDay: seated,
        termEnd: seated + 1460,
      }, seed);
      people.push(p);
      nextId++;
      majlisSeat++;
    }
  }

  return { people, nextId };
}

export function generateSenate(nextId: number, baseSeed: number, day: number): GenerateResult {
  const people: Person[] = [];
  let senateSeat = 1;

  // Elected senators (2 per province + 1 extra for Tehran = 63)
  for (const prov of PROVINCES) {
    const seatsForProvince = prov.id === 1 ? 3 : 2; // Tehran (id=1) gets 3
    for (let s = 0; s < seatsForProvince; s++) {
      const seed = baseSeed + nextId * 13;
      const party = pick(PARTY_NAMES, seed + 5);
      const seated = Math.max(1, day - Math.floor(seededRandom(seed + 6) * 300));
      const p = createPerson(nextId, {
        role: 'senator',
        provinceId: prov.id,
        seatNumber: senateSeat,
        party,
        seatedDay: seated,
        termEnd: seated + 2190,
      }, seed);
      people.push(p);
      nextId++;
      senateSeat++;
    }
  }

  // Crown-appointed senators (7 = 10% of 70)
  for (let i = 0; i < 7; i++) {
    const seed = baseSeed + nextId * 17;
    const prov = pick(PROVINCES, seed + 7);
    const p = createPerson(nextId, {
      role: 'crown_senator',
      provinceId: prov.id,
      seatNumber: senateSeat,
      party: '',
      seatedDay: Math.max(1, day - Math.floor(seededRandom(seed + 8) * 200)),
      termEnd: null,
    }, seed);
    people.push(p);
    nextId++;
    senateSeat++;
  }

  return { people, nextId };
}

export function generateExecutive(nextId: number, baseSeed: number, day: number): GenerateResult {
  const people: Person[] = [];

  // Prime Minister
  {
    const seed = baseSeed + nextId * 23;
    const p = createPerson(nextId, {
      role: 'prime_minister',
      provinceId: 1,
      party: pick(PARTY_NAMES, seed + 11),
      seatedDay: day - 2,
      termEnd: null,
    }, seed);
    people.push(p);
    nextId++;
  }

  // Deputy PM
  {
    const seed = baseSeed + nextId * 29;
    const p = createPerson(nextId, {
      role: 'deputy_pm',
      provinceId: 2,
      party: pick(PARTY_NAMES, seed + 12),
      seatedDay: day - 2,
      termEnd: null,
    }, seed);
    people.push(p);
    nextId++;
  }

  // Ministers (14)
  for (let i = 0; i < 14; i++) {
    const seed = baseSeed + nextId * 31;
    const prov = pick(PROVINCES, seed + 13);
    const p = createPerson(nextId, {
      role: 'minister',
      provinceId: prov.id,
      party: pick(PARTY_NAMES, seed + 14),
      seatedDay: day - 2,
      termEnd: null,
    }, seed);
    people.push(p);
    nextId++;
  }

  return { people, nextId };
}

export function generateJustices(nextId: number, baseSeed: number, day: number): GenerateResult {
  const people: Person[] = [];

  for (let seat = 1; seat <= 12; seat++) {
    const seed = baseSeed + nextId * 19;
    const prov = pick(PROVINCES, seed + 9);
    const p = createPerson(nextId, {
      role: 'justice',
      provinceId: prov.id,
      seatNumber: seat,
      party: '',
      seatedDay: Math.max(1, day - Math.floor(seededRandom(seed + 10) * 500)),
      termEnd: null,
    }, seed);
    people.push(p);
    nextId++;
  }

  return { people, nextId };
}

export function generateCouncils(nextId: number, baseSeed: number, day: number): GenerateResult {
  const people: Person[] = [];

  for (const prov of PROVINCES) {
    for (let m = 0; m < prov.councilSize; m++) {
      const seed = baseSeed + nextId * 37;
      const party = pick(PARTY_NAMES, seed + 15);
      const seated = Math.max(1, day - Math.floor(seededRandom(seed + 16) * 300));
      const p = createPerson(nextId, {
        role: 'provincial_council',
        provinceId: prov.id,
        party,
        seatedDay: seated,
        termEnd: seated + 1460,
      }, seed);
      people.push(p);
      nextId++;
    }
  }

  return { people, nextId };
}

// ── Main generator (calls staged helpers, applies vacancy marking) ──

/**
 * Generate ~700 people for initial state.
 * Deterministic from the given day seed.
 */
export function generateInitialPeople(startDay: number): Person[] {
  const baseSeed = startDay * 31337;
  let nextId = 1;

  // 1. Royal family
  const royal = generateRoyalFamily(nextId, baseSeed, startDay);
  nextId = royal.nextId;

  // 2. Majlis
  const majlis = generateMajlis(nextId, baseSeed, startDay);
  nextId = majlis.nextId;

  // 3. Senate
  const senate = generateSenate(nextId, baseSeed, startDay);
  nextId = senate.nextId;

  // 4. Justices
  const justices = generateJustices(nextId, baseSeed, startDay);
  nextId = justices.nextId;

  // 5. Executive
  const exec = generateExecutive(nextId, baseSeed, startDay);
  nextId = exec.nextId;

  // 6. Provincial councils
  const councils = generateCouncils(nextId, baseSeed, startDay);

  // Assemble all people
  const people = [
    ...royal.people,
    ...majlis.people,
    ...senate.people,
    ...justices.people,
    ...exec.people,
    ...councils.people,
  ];

  // Apply vacancy marking (same logic as before)

  // Mark 20 Majlis seats as vacant
  const majlisMembers = people.filter((p) => p.role === 'majlis_member');
  for (let i = 0; i < 20; i++) {
    const idx = Math.floor(seededRandom(baseSeed + 9000 + i) * majlisMembers.length);
    majlisMembers[idx].status = 'removed';
  }

  // Mark 1 senate seat as vacant
  const senators = people.filter((p) => (p.role === 'senator' || p.role === 'crown_senator') && p.status === 'active');
  for (let i = 0; i < 1; i++) {
    const idx = Math.floor(seededRandom(baseSeed + 9500 + i) * senators.length);
    senators[idx].status = 'removed';
  }

  // Seat 7 justice is vacant
  const justice7 = people.find((p) => p.role === 'justice' && p.seatNumber === 7);
  if (justice7) justice7.status = 'removed';

  return people;
}
