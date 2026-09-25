// 수업·출석 계산 (직원·이용자·보호자 화면에서 함께 쓴다)
import type { Attendance, Lesson, OffDay } from './backend';
import { addDays, parseYmd, WD } from './date';

/** 화면에 보여줄 요일 순서: 월 … 일 */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** [1,3,5] → '월·수·금', 7일 모두면 '매일' */
export const daysLabel = (days: number[]) =>
  days.length === 7 ? '매일' : DAY_ORDER.filter((d) => days.includes(d)).map((d) => WD[d]).join('·');

export const isLessonDay = (l: Lesson, date: string) => l.days.includes(parseYmd(date).getDay());

export const isOff = (offdays: OffDay[], lid: string, date: string) => offdays.some((o) => o.lid === lid && o.date === date);

export const isPresent = (att: Attendance[], lid: string, mid: string, date: string) =>
  att.some((a) => a.lid === lid && a.mid === mid && a.date === date);

/** 그달 1일 */
export const monthStart = (date: string) => date.slice(0, 8) + '01';

export interface SessionDay {
  date: string;
  present: boolean;
}

/**
 * 한 이용자의 수업일 목록 (최근 날짜 먼저).
 * 수업일 = 수업 요일이면서 대상에 들어간 날(since) 이후이고 휴강이 아닌 날 + 요일이 아니어도 출석한 날(보강).
 * 휴강한 날은 출석 기록이 남아 있어도 빼서, 화면과 내려받은 엑셀의 출석률이 같게 한다.
 */
export function sessionDays(l: Lesson, mid: string, att: Attendance[], offdays: OffDay[], from: string, to: string): SessionDay[] {
  const since = l.roster.find((r) => r.mid === mid)?.since ?? l.createdAt;
  const off = new Set(offdays.filter((o) => o.lid === l.id).map((o) => o.date));
  const present = new Set(
    att.filter((a) => a.lid === l.id && a.mid === mid && a.date >= from && a.date <= to && !off.has(a.date)).map((a) => a.date),
  );
  const days = new Set(present);
  for (let d = from > since ? from : since; d <= to; d = addDays(d, 1)) {
    if (isLessonDay(l, d) && !off.has(d)) days.add(d);
  }
  return [...days].sort((a, b) => (a < b ? 1 : -1)).map((date) => ({ date, present: present.has(date) }));
}

/** 이번 달 출석 n / 수업일 m */
export function monthRate(l: Lesson, mid: string, att: Attendance[], offdays: OffDay[], today: string) {
  const list = sessionDays(l, mid, att, offdays, monthStart(today), today);
  return { present: list.filter((x) => x.present).length, total: list.length };
}

/** 오늘 수업이 있는 수업 먼저, 그다음 이름순 */
export const sortLessons = (lessons: Lesson[], offdays: OffDay[], today: string) => {
  const on = (l: Lesson) => isLessonDay(l, today) && !isOff(offdays, l.id, today);
  return [...lessons].sort((a, b) => Number(on(b)) - Number(on(a)) || a.name.localeCompare(b.name, 'ko'));
};
