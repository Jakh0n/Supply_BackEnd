/**
 * Korean public holidays & common restaurant-relevant dates (fixed + recurring).
 * trafficHint: higher | lower | closed | normal
 */
const KOREAN_HOLIDAYS = [
  // 2025
  {
    date: "2025-01-01",
    nameKo: "신정",
    nameEn: "New Year",
    trafficHint: "lower",
  },
  {
    date: "2025-01-28",
    nameKo: "설날 연휴",
    nameEn: "Seollal",
    trafficHint: "closed",
  },
  {
    date: "2025-01-29",
    nameKo: "설날",
    nameEn: "Lunar New Year",
    trafficHint: "closed",
  },
  {
    date: "2025-01-30",
    nameKo: "설날 연휴",
    nameEn: "Seollal",
    trafficHint: "lower",
  },
  {
    date: "2025-03-01",
    nameKo: "삼일절",
    nameEn: "Independence Movement Day",
    trafficHint: "normal",
  },
  {
    date: "2025-03-03",
    nameKo: "삼일절 대체공휴일",
    nameEn: "Substitute holiday",
    trafficHint: "normal",
  },
  {
    date: "2025-05-05",
    nameKo: "어린이날",
    nameEn: "Children's Day",
    trafficHint: "higher",
  },
  {
    date: "2025-05-06",
    nameKo: "어린이날 대체공휴일",
    nameEn: "Substitute holiday",
    trafficHint: "higher",
  },
  {
    date: "2025-06-06",
    nameKo: "현충일",
    nameEn: "Memorial Day",
    trafficHint: "normal",
  },
  {
    date: "2025-08-15",
    nameKo: "광복절",
    nameEn: "Liberation Day",
    trafficHint: "higher",
  },
  {
    date: "2025-10-03",
    nameKo: "개천절",
    nameEn: "National Foundation Day",
    trafficHint: "higher",
  },
  {
    date: "2025-10-05",
    nameKo: "추석 연휴",
    nameEn: "Chuseok",
    trafficHint: "closed",
  },
  {
    date: "2025-10-06",
    nameKo: "추석",
    nameEn: "Chuseok",
    trafficHint: "closed",
  },
  {
    date: "2025-10-07",
    nameKo: "추석 연휴",
    nameEn: "Chuseok",
    trafficHint: "lower",
  },
  {
    date: "2025-10-08",
    nameKo: "추석 대체공휴일",
    nameEn: "Substitute holiday",
    trafficHint: "lower",
  },
  {
    date: "2025-10-09",
    nameKo: "한글날",
    nameEn: "Hangeul Day",
    trafficHint: "normal",
  },
  {
    date: "2025-12-25",
    nameKo: "크리스마스",
    nameEn: "Christmas",
    trafficHint: "higher",
  },
  // 2026
  {
    date: "2026-01-01",
    nameKo: "신정",
    nameEn: "New Year",
    trafficHint: "lower",
  },
  {
    date: "2026-02-16",
    nameKo: "설날 연휴",
    nameEn: "Seollal",
    trafficHint: "closed",
  },
  {
    date: "2026-02-17",
    nameKo: "설날",
    nameEn: "Lunar New Year",
    trafficHint: "closed",
  },
  {
    date: "2026-02-18",
    nameKo: "설날 연휴",
    nameEn: "Seollal",
    trafficHint: "lower",
  },
  {
    date: "2026-03-01",
    nameKo: "삼일절",
    nameEn: "Independence Movement Day",
    trafficHint: "normal",
  },
  {
    date: "2026-03-02",
    nameKo: "삼일절 대체공휴일",
    nameEn: "Substitute holiday",
    trafficHint: "normal",
  },
  {
    date: "2026-05-05",
    nameKo: "어린이날",
    nameEn: "Children's Day",
    trafficHint: "higher",
  },
  {
    date: "2026-05-24",
    nameKo: "부처님오신날",
    nameEn: "Buddha Birthday",
    trafficHint: "normal",
  },
  {
    date: "2026-05-25",
    nameKo: "부처님오신날 대체공휴일",
    nameEn: "Substitute holiday",
    trafficHint: "normal",
  },
  {
    date: "2026-06-06",
    nameKo: "현충일",
    nameEn: "Memorial Day",
    trafficHint: "normal",
  },
  {
    date: "2026-08-15",
    nameKo: "광복절",
    nameEn: "Liberation Day",
    trafficHint: "higher",
  },
  {
    date: "2026-08-17",
    nameKo: "광복절 대체공휴일",
    nameEn: "Substitute holiday",
    trafficHint: "higher",
  },
  {
    date: "2026-09-24",
    nameKo: "추석 연휴",
    nameEn: "Chuseok",
    trafficHint: "closed",
  },
  {
    date: "2026-09-25",
    nameKo: "추석",
    nameEn: "Chuseok",
    trafficHint: "closed",
  },
  {
    date: "2026-09-26",
    nameKo: "추석 연휴",
    nameEn: "Chuseok",
    trafficHint: "lower",
  },
  {
    date: "2026-10-03",
    nameKo: "개천절",
    nameEn: "National Foundation Day",
    trafficHint: "higher",
  },
  {
    date: "2026-10-05",
    nameKo: "개천절 대체공휴일",
    nameEn: "Substitute holiday",
    trafficHint: "higher",
  },
  {
    date: "2026-10-09",
    nameKo: "한글날",
    nameEn: "Hangeul Day",
    trafficHint: "normal",
  },
  {
    date: "2026-12-25",
    nameKo: "크리스마스",
    nameEn: "Christmas",
    trafficHint: "higher",
  },
  // 2027
  {
    date: "2027-01-01",
    nameKo: "신정",
    nameEn: "New Year",
    trafficHint: "lower",
  },
  {
    date: "2027-02-06",
    nameKo: "설날 연휴",
    nameEn: "Seollal",
    trafficHint: "closed",
  },
  {
    date: "2027-02-07",
    nameKo: "설날",
    nameEn: "Lunar New Year",
    trafficHint: "closed",
  },
  {
    date: "2027-02-08",
    nameKo: "설날 연휴",
    nameEn: "Seollal",
    trafficHint: "lower",
  },
  {
    date: "2027-05-05",
    nameKo: "어린이날",
    nameEn: "Children's Day",
    trafficHint: "higher",
  },
  {
    date: "2027-05-13",
    nameKo: "부처님오신날",
    nameEn: "Buddha Birthday",
    trafficHint: "normal",
  },
  {
    date: "2027-06-06",
    nameKo: "현충일",
    nameEn: "Memorial Day",
    trafficHint: "normal",
  },
  {
    date: "2027-08-15",
    nameKo: "광복절",
    nameEn: "Liberation Day",
    trafficHint: "higher",
  },
  {
    date: "2027-09-14",
    nameKo: "추석 연휴",
    nameEn: "Chuseok",
    trafficHint: "closed",
  },
  {
    date: "2027-09-15",
    nameKo: "추석",
    nameEn: "Chuseok",
    trafficHint: "closed",
  },
  {
    date: "2027-09-16",
    nameKo: "추석 연휴",
    nameEn: "Chuseok",
    trafficHint: "lower",
  },
  {
    date: "2027-10-03",
    nameKo: "개천절",
    nameEn: "National Foundation Day",
    trafficHint: "higher",
  },
  {
    date: "2027-10-09",
    nameKo: "한글날",
    nameEn: "Hangeul Day",
    trafficHint: "normal",
  },
  {
    date: "2027-12-25",
    nameKo: "크리스마스",
    nameEn: "Christmas",
    trafficHint: "higher",
  },
];

const holidayByDate = new Map(KOREAN_HOLIDAYS.map((h) => [h.date, h]));

module.exports = { KOREAN_HOLIDAYS, holidayByDate };
