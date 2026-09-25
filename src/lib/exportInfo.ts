// 기록 내려받기: 기간·대상·파일 이름·건수 (엑셀 라이브러리 없이 쓰는 가벼운 부분)
import type { DataSet } from './backend';
import { addDays, parseYmd, ymd } from './date';
import { monthStart } from './lessons';

export interface ExportOptions {
  data: DataSet;
  /** 내려받을 이용자 */
  mids: string[];
  /** 한 명만 고른 경우 제목과 파일 이름에 이름을 쓴다 */
  single: boolean;
  from: string;
  to: string;
  today: string;
}

export interface Range {
  from: string;
  to: string;
}

/** 자주 쓰는 기간 */
export function rangePresets(today: string): { label: string; range: Range }[] {
  const t = parseYmd(today);
  const lastMonthEnd = ymd(new Date(t.getFullYear(), t.getMonth(), 0));
  return [
    { label: '이번 달', range: { from: monthStart(today), to: today } },
    { label: '지난달', range: { from: monthStart(lastMonthEnd), to: lastMonthEnd } },
    { label: '최근 7일', range: { from: addDays(today, -6), to: today } },
    { label: '최근 30일', range: { from: addDays(today, -29), to: today } },
  ];
}

/** 파일 이름: 건강일지_전체_2026-09-01~2026-09-25.xlsx */
export function exportFileName(o: ExportOptions) {
  const who = o.single ? (o.data.members.find((m) => m.id === o.mids[0])?.name ?? '이용자') : '전체';
  return `건강일지_${who.replace(/[\\/:*?"<>|\s]+/g, '')}_${o.from}~${o.to}.xlsx`;
}

/** 내려받기 전에 보여줄 건수 */
export function exportCounts(data: DataSet, mids: string[], from: string, to: string) {
  const set = new Set(mids);
  const inRange = (d: string) => d >= from && d <= to;
  return {
    ex: data.ex.filter((e) => set.has(e.mid) && inRange(e.date)).length,
    meals: data.meals.filter((e) => set.has(e.mid) && inRange(e.date)).length,
    lessons: data.lessons.filter((l) => l.roster.some((r) => set.has(r.mid))).length,
  };
}
