// 월간 리포트·관리자 통계 계산 (화면에 있는 데이터로만 계산한다. 서버를 따로 부르지 않는다)
import type { DataSet, Lesson } from './backend';
import { MAIN3, WEEK_GOAL } from './constants';
import { addDays, mondayOf, parseYmd } from './date';
import { sessionDays } from './lessons';

/** '2026-09' */
export const ymOf = (date: string) => date.slice(0, 7);

/** '2026년 9월' */
export const ymLabel = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;

/** '9월' */
export const monthName = (ym: string) => `${Number(ym.slice(5, 7))}월`;

export const addMonths = (ym: string, n: number) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** 그달의 첫날과 마지막 날 (이번 달이면 오늘까지) */
export const monthRange = (ym: string, today: string) => {
  const from = ym + '-01';
  const last = addDays(addMonths(ym, 1) + '-01', -1);
  return { from, to: last < today ? last : today, last, partial: last > today };
};

/** 몇 분 → '2시간 30분' / '45분' */
export const hm = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}시간${m ? ` ${m}분` : ''}` : `${m}분`;
};

export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

/** 한 이용자·한 수업의 기간 출석 */
export const lessonRate = (l: Lesson, mid: string, data: Pick<DataSet, 'attendance' | 'offdays'>, from: string, to: string) => {
  // 대상에 들어오기 전 기간이면 수업일이 없다
  const list = to < from ? [] : sessionDays(l, mid, data.attendance, data.offdays, from, to);
  return { present: list.filter((x) => x.present).length, total: list.length };
};

/** 여러 이용자의 기간 출석 합계 (대상인 수업만) */
export const groupAttendance = (data: DataSet, mids: string[], from: string, to: string) => {
  let present = 0;
  let total = 0;
  const set = new Set(mids);
  for (const l of data.lessons)
    for (const r of l.roster) {
      if (!set.has(r.mid)) continue;
      const x = lessonRate(l, r.mid, data, from, to);
      present += x.present;
      total += x.total;
    }
  return { present, total };
};

export interface WeekBar {
  /** 그 주 월요일 (달 첫 주는 달 첫날) */
  start: string;
  min: number;
}

/** 한 이용자의 한 달 요약 */
export function memberMonth(data: DataSet, mid: string, ym: string, today: string) {
  const { from, to, last, partial } = monthRange(ym, today);
  const ex = data.ex.filter((e) => e.mid === mid && inRange(e.date, from, to));
  const meals = data.meals.filter((e) => e.mid === mid && inRange(e.date, from, to));
  const exMin = ex.reduce((a, e) => a + e.min, 0);
  const exDays = new Set(ex.map((e) => e.date));

  // 주별 운동 시간 (월요일로 나눈다. 달의 첫 주·마지막 주는 그 달 날짜만)
  const weeks: WeekBar[] = [];
  for (let w = mondayOf(from); w <= to; w = addDays(w, 7)) {
    const s = w < from ? from : w;
    const e = addDays(w, 6) > to ? to : addDays(w, 6);
    weeks.push({ start: s, min: ex.filter((x) => inRange(x.date, s, e)).reduce((a, x) => a + x.min, 0) });
  }
  // 목표(주 150분)는 월~일이 모두 이 달 안에 있고 끝난(또는 지금) 주만 센다
  const fullWeeks = weeks.filter((w) => parseYmd(w.start).getDay() === 1 && addDays(w.start, 6) <= last);
  const goalWeeks = fullWeeks.filter((w) => w.min >= WEEK_GOAL).length;

  const kinds = [...ex.reduce((m, e) => m.set(e.kind, (m.get(e.kind) ?? 0) + e.min), new Map<string, number>())]
    .map(([kind, min]) => ({ kind, min }))
    .sort((a, b) => b.min - a.min);

  const dayCount = Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / 864e5) + 1;
  const main = meals.filter((m) => MAIN3.includes(m.meal));
  const mainSlots = new Set(main.map((m) => m.date + m.meal)).size;
  const mealDays = new Set(meals.map((m) => m.date));
  // 영양소를 계산할 수 있는 식사가 있는 날의 하루 평균 칼로리
  const kcalByDay = new Map<string, number>();
  meals.forEach((m) => m.nutri && kcalByDay.set(m.date, (kcalByDay.get(m.date) ?? 0) + m.nutri.kcal));
  const kcalAvg = kcalByDay.size ? Math.round([...kcalByDay.values()].reduce((a, b) => a + b, 0) / kcalByDay.size) : null;

  const lessons = data.lessons
    .filter((l) => l.roster.some((r) => r.mid === mid))
    .map((l) => ({ id: l.id, name: l.name, ...lessonRate(l, mid, data, from, to) }))
    .filter((x) => x.total > 0);
  const att = lessons.reduce((a, x) => ({ present: a.present + x.present, total: a.total + x.total }), { present: 0, total: 0 });

  const views = data.views.filter((v) => v.mid === mid && inRange(v.date, from, to));
  const notes = data.notes.filter((n) => n.mid === mid && inRange(n.date, from, to)).sort((a, b) => (a.date < b.date ? -1 : 1));

  // 건강 수치: 이 달 처음 적은 값과 마지막 값
  const ms = data.measures.filter((x) => x.mid === mid && inRange(x.date, from, to)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const firstLast = <K extends 'weight' | 'sbp' | 'dbp' | 'glu'>(k: K) => {
    const list = ms.filter((x) => x[k] != null);
    return list.length ? { first: list[0][k] as number, last: list[list.length - 1][k] as number, n: list.length } : null;
  };
  const bp = ms.filter((x) => x.sbp != null && x.dbp != null);
  const measures = {
    weight: firstLast('weight'),
    bp: bp.length ? { first: `${bp[0].sbp}/${bp[0].dbp}`, last: `${bp[bp.length - 1].sbp}/${bp[bp.length - 1].dbp}`, n: bp.length } : null,
    glu: firstLast('glu'),
  };

  // 체력 측정: 이 달의 마지막 값과 그 전(이 달 전) 마지막 값
  const tests = data.testItems
    .filter((it) => it.kind === 'number')
    .map((it) => {
      const mine = data.tests.filter((t) => t.mid === mid && t.item === it.id && t.value != null).sort((a, b) => (a.date < b.date ? -1 : 1));
      const now = [...mine].reverse().find((t) => inRange(t.date, from, to));
      if (!now) return null;
      const before = [...mine].reverse().find((t) => t.date < from);
      const diff = before ? (now.value as number) - (before.value as number) : null;
      const trend =
        diff === null || diff === 0 || it.better === 'none' ? (diff === 0 ? 'same' : null) : (diff > 0) === (it.better === 'high') ? 'better' : 'worse';
      return { id: it.id, name: it.name, unit: it.unit, now: now.value as number, before: before ? (before.value as number) : null, trend };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  return {
    from,
    to,
    partial,
    dayCount,
    exMin,
    exDays,
    weeks,
    fullWeeks: fullWeeks.length,
    goalWeeks,
    kinds,
    mainSlots,
    mainPossible: dayCount * 3,
    snacks: meals.filter((m) => !MAIN3.includes(m.meal)).length,
    mealDays,
    kcalAvg,
    lessons,
    att,
    views: views.length,
    notes,
    measures,
    tests,
  };
}

export type MemberMonth = ReturnType<typeof memberMonth>;

/** 관리자 통계: 한 달 전체 */
export function orgMonth(data: DataSet, ym: string, today: string) {
  const { from, to, partial } = monthRange(ym, today);
  const mids = data.members.map((m) => m.id);
  const exIn = data.ex.filter((e) => inRange(e.date, from, to));
  const mealIn = data.meals.filter((e) => inRange(e.date, from, to));
  const active = new Set([...exIn.map((e) => e.mid), ...mealIn.map((e) => e.mid)]);
  const exMin = exIn.reduce((a, e) => a + e.min, 0);
  const exMembers = new Set(exIn.map((e) => e.mid));
  const att = groupAttendance(data, mids, from, to);
  const views = data.views.filter((v) => inRange(v.date, from, to)).length;
  return { from, to, partial, members: mids.length, active: active.size, activeSet: active, exMin, exMembers: exMembers.size, att, views };
}
