// 기록이 끊긴 이용자 찾기 (트레이너·관리자 목록)
import type { DataSet, Member } from './backend';
import { parseYmd } from './date';

/** 이 날 수 이상 운동·식사·건강 수치 기록이 없으면 목록에 표시하고 위로 올린다 */
export const STALE_DAYS = 3;

/** 마지막으로 기록한 날 (없으면 null) */
export function lastRecord(data: Pick<DataSet, 'ex' | 'meals' | 'measures'>, mid: string): string | null {
  let last: string | null = null;
  for (const list of [data.ex, data.meals, data.measures])
    for (const e of list) if (e.mid === mid && (!last || e.date > last)) last = e.date;
  return last;
}

/** 마지막 기록 뒤로 며칠 지났는지 (오늘 기록했으면 0) */
export const daysSince = (last: string, today: string) =>
  Math.round((parseYmd(today).getTime() - parseYmd(last).getTime()) / 86_400_000);

export interface Activity {
  last: string | null;
  /** 마지막 기록 뒤로 지난 날 (기록이 없으면 null) */
  gap: number | null;
  /** STALE_DAYS 이상 기록이 없음 */
  stale: boolean;
}

export function activityOf(data: Pick<DataSet, 'ex' | 'meals' | 'measures'>, mid: string, today: string): Activity {
  const last = lastRecord(data, mid);
  const gap = last ? daysSince(last, today) : null;
  return { last, gap, stale: gap !== null && gap >= STALE_DAYS };
}

/** '4일째 기록 없음' / '아직 기록 없음' (표시할 게 없으면 '') */
export const staleText = (a: Activity) => (a.stale ? `${a.gap}일째 기록 없음` : a.gap === null ? '아직 기록 없음' : '');

/**
 * 오래 기록이 없는 분을 맨 위로 (오래된 순), 그다음 아직 기록이 없는 분, 나머지는 원래 순서.
 */
export function sortByActivity(members: Member[], data: Pick<DataSet, 'ex' | 'meals' | 'measures'>, today: string) {
  const rank = new Map(members.map((m, i) => {
    const a = activityOf(data, m.id, today);
    return [m.id, { g: a.stale ? 0 : a.gap === null ? 1 : 2, gap: a.gap ?? 0, i }];
  }));
  return [...members].sort((x, y) => {
    const a = rank.get(x.id)!;
    const b = rank.get(y.id)!;
    return a.g - b.g || (a.g === 0 ? b.gap - a.gap : 0) || a.i - b.i;
  });
}
