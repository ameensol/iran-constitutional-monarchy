import type { Province, SenateCohort } from './types';

/** Iran's 31 provinces with Senate cohort assignments for staggered elections. */
export const PROVINCES: Province[] = [
  { id: 1,  name: 'Tehran', nameFa: 'تهران', senateCohort: 'A', majlisSeats: 30, councilSize: 15 },
  { id: 2,  name: 'Isfahan', nameFa: 'اصفهان', senateCohort: 'B', majlisSeats: 10, councilSize: 15 },
  { id: 3,  name: 'Fars', nameFa: 'فارس', senateCohort: 'C', majlisSeats: 8, councilSize: 15 },
  { id: 4,  name: 'Khorasan Razavi', nameFa: 'خراسان رضوی', senateCohort: 'A', majlisSeats: 10, councilSize: 15 },
  { id: 5,  name: 'East Azerbaijan', nameFa: 'آذربایجان شرقی', senateCohort: 'B', majlisSeats: 7, councilSize: 15 },
  { id: 6,  name: 'Khuzestan', nameFa: 'خوزستان', senateCohort: 'C', majlisSeats: 7, councilSize: 15 },
  { id: 7,  name: 'Mazandaran', nameFa: 'مازندران', senateCohort: 'A', majlisSeats: 5, councilSize: 15 },
  { id: 8,  name: 'Kerman', nameFa: 'کرمان', senateCohort: 'B', majlisSeats: 5, councilSize: 15 },
  { id: 9,  name: 'West Azerbaijan', nameFa: 'آذربایجان غربی', senateCohort: 'C', majlisSeats: 5, councilSize: 15 },
  { id: 10, name: 'Gilan', nameFa: 'گیلان', senateCohort: 'A', majlisSeats: 5, councilSize: 15 },
  { id: 11, name: 'Sistan-Baluchestan', nameFa: 'سیستان و بلوچستان', senateCohort: 'B', majlisSeats: 4, councilSize: 15 },
  { id: 12, name: 'Kurdistan', nameFa: 'کردستان', senateCohort: 'C', majlisSeats: 4, councilSize: 15 },
  { id: 13, name: 'Hormozgan', nameFa: 'هرمزگان', senateCohort: 'A', majlisSeats: 4, councilSize: 15 },
  { id: 14, name: 'Lorestan', nameFa: 'لرستان', senateCohort: 'B', majlisSeats: 4, councilSize: 15 },
  { id: 15, name: 'Hamedan', nameFa: 'همدان', senateCohort: 'C', majlisSeats: 4, councilSize: 15 },
  { id: 16, name: 'Kermanshah', nameFa: 'کرمانشاه', senateCohort: 'A', majlisSeats: 4, councilSize: 15 },
  { id: 17, name: 'Golestan', nameFa: 'گلستان', senateCohort: 'B', majlisSeats: 3, councilSize: 15 },
  { id: 18, name: 'Markazi', nameFa: 'مرکزی', senateCohort: 'C', majlisSeats: 3, councilSize: 15 },
  { id: 19, name: 'Ardabil', nameFa: 'اردبیل', senateCohort: 'A', majlisSeats: 3, councilSize: 15 },
  { id: 20, name: 'Bushehr', nameFa: 'بوشهر', senateCohort: 'B', majlisSeats: 2, councilSize: 15 },
  { id: 21, name: 'Zanjan', nameFa: 'زنجان', senateCohort: 'C', majlisSeats: 2, councilSize: 15 },
  { id: 22, name: 'North Khorasan', nameFa: 'خراسان شمالی', senateCohort: 'A', majlisSeats: 2, councilSize: 15 },
  { id: 23, name: 'South Khorasan', nameFa: 'خراسان جنوبی', senateCohort: 'B', majlisSeats: 2, councilSize: 15 },
  { id: 24, name: 'Chaharmahal-Bakhtiari', nameFa: 'چهارمحال و بختیاری', senateCohort: 'C', majlisSeats: 2, councilSize: 15 },
  { id: 25, name: 'Kohgiluyeh-Boyer-Ahmad', nameFa: 'کهگیلویه و بویراحمد', senateCohort: 'A', majlisSeats: 2, councilSize: 15 },
  { id: 26, name: 'Qazvin', nameFa: 'قزوین', senateCohort: 'B', majlisSeats: 2, councilSize: 15 },
  { id: 27, name: 'Semnan', nameFa: 'سمنان', senateCohort: 'C', majlisSeats: 1, councilSize: 15 },
  { id: 28, name: 'Yazd', nameFa: 'یزد', senateCohort: 'A', majlisSeats: 2, councilSize: 15 },
  { id: 29, name: 'Qom', nameFa: 'قم', senateCohort: 'B', majlisSeats: 1, councilSize: 15 },
  { id: 30, name: 'Ilam', nameFa: 'ایلام', senateCohort: 'C', majlisSeats: 1, councilSize: 15 },
  { id: 31, name: 'Alborz', nameFa: 'البرز', senateCohort: 'A', majlisSeats: 5, councilSize: 15 },
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
