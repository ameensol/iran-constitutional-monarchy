import type { Province, SenateCohort } from './types';

/** Iran's 31 provinces with Senate cohort assignments for staggered elections. */
export const PROVINCES: Province[] = [
  { id: 1,  name: 'Tehran',                senateCohort: 'A', majlisSeats: 30, councilSize: 15 },
  { id: 2,  name: 'Isfahan',               senateCohort: 'B', majlisSeats: 10, councilSize: 15 },
  { id: 3,  name: 'Fars',                  senateCohort: 'C', majlisSeats: 8,  councilSize: 15 },
  { id: 4,  name: 'Khorasan Razavi',       senateCohort: 'A', majlisSeats: 10, councilSize: 15 },
  { id: 5,  name: 'East Azerbaijan',       senateCohort: 'B', majlisSeats: 7,  councilSize: 15 },
  { id: 6,  name: 'Khuzestan',             senateCohort: 'C', majlisSeats: 7,  councilSize: 15 },
  { id: 7,  name: 'Mazandaran',            senateCohort: 'A', majlisSeats: 5,  councilSize: 15 },
  { id: 8,  name: 'Kerman',                senateCohort: 'B', majlisSeats: 5,  councilSize: 15 },
  { id: 9,  name: 'West Azerbaijan',       senateCohort: 'C', majlisSeats: 5,  councilSize: 15 },
  { id: 10, name: 'Gilan',                 senateCohort: 'A', majlisSeats: 5,  councilSize: 15 },
  { id: 11, name: 'Sistan-Baluchestan',    senateCohort: 'B', majlisSeats: 4,  councilSize: 15 },
  { id: 12, name: 'Kurdistan',             senateCohort: 'C', majlisSeats: 4,  councilSize: 15 },
  { id: 13, name: 'Hormozgan',             senateCohort: 'A', majlisSeats: 4,  councilSize: 15 },
  { id: 14, name: 'Lorestan',              senateCohort: 'B', majlisSeats: 4,  councilSize: 15 },
  { id: 15, name: 'Hamedan',               senateCohort: 'C', majlisSeats: 4,  councilSize: 15 },
  { id: 16, name: 'Kermanshah',            senateCohort: 'A', majlisSeats: 4,  councilSize: 15 },
  { id: 17, name: 'Golestan',              senateCohort: 'B', majlisSeats: 3,  councilSize: 15 },
  { id: 18, name: 'Markazi',               senateCohort: 'C', majlisSeats: 3,  councilSize: 15 },
  { id: 19, name: 'Ardabil',               senateCohort: 'A', majlisSeats: 3,  councilSize: 15 },
  { id: 20, name: 'Bushehr',               senateCohort: 'B', majlisSeats: 2,  councilSize: 15 },
  { id: 21, name: 'Zanjan',                senateCohort: 'C', majlisSeats: 2,  councilSize: 15 },
  { id: 22, name: 'North Khorasan',        senateCohort: 'A', majlisSeats: 2,  councilSize: 15 },
  { id: 23, name: 'South Khorasan',        senateCohort: 'B', majlisSeats: 2,  councilSize: 15 },
  { id: 24, name: 'Chaharmahal-Bakhtiari', senateCohort: 'C', majlisSeats: 2,  councilSize: 15 },
  { id: 25, name: 'Kohgiluyeh-Boyer-Ahmad',senateCohort: 'A', majlisSeats: 2,  councilSize: 15 },
  { id: 26, name: 'Qazvin',               senateCohort: 'B', majlisSeats: 2,  councilSize: 15 },
  { id: 27, name: 'Semnan',                senateCohort: 'C', majlisSeats: 1,  councilSize: 15 },
  { id: 28, name: 'Yazd',                  senateCohort: 'A', majlisSeats: 2,  councilSize: 15 },
  { id: 29, name: 'Qom',                   senateCohort: 'B', majlisSeats: 1,  councilSize: 15 },
  { id: 30, name: 'Ilam',                  senateCohort: 'C', majlisSeats: 1,  councilSize: 15 },
  { id: 31, name: 'Alborz',                senateCohort: 'A', majlisSeats: 5,  councilSize: 15 },
];

// Total Majlis seats: 149
// Elected senators: 2 per province = 62, plus 1 extra for Tehran (capital) = 63.
// Crown senators: 7. Total = 70. Crown share = exactly 10%.

export function provinceById(id: number): Province {
  return PROVINCES.find((p) => p.id === id) || PROVINCES[0];
}

export function provincesInCohort(cohort: SenateCohort): Province[] {
  return PROVINCES.filter((p) => p.senateCohort === cohort);
}

export const TOTAL_MAJLIS_SEATS = PROVINCES.reduce((sum, p) => sum + p.majlisSeats, 0);
export const TOTAL_PROVINCES = PROVINCES.length;
export const SENATE_ELECTED = TOTAL_PROVINCES * 2 + 1;  // 2 per province + 1 extra for Tehran = 63
export const SENATE_CROWN = 7;
export const SENATE_TOTAL = SENATE_ELECTED + SENATE_CROWN;
