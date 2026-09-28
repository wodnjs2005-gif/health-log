// 체력 측정: 날짜별로 묶기, 지난번과 비교
import type { TestItem, TestResult } from './backend';

/** 12.50 → '12.5', 3 → '3' */
export const numText = (v: number) => String(Math.round(v * 100) / 100);

export const BETTER_LABEL: Record<TestItem['better'], string> = {
  high: '높을수록 좋아요',
  low: '낮을수록 좋아요',
  none: '비교 안 함',
};

/** 한 이용자의 측정 날짜들 (최근 날짜 먼저), 날짜마다 항목 id → 결과 */
export function testDays(tests: TestResult[], mid: string) {
  const by = new Map<string, Map<string, TestResult>>();
  for (const t of tests) {
    if (t.mid !== mid) continue;
    const m = by.get(t.date) ?? new Map<string, TestResult>();
    m.set(t.item, t);
    by.set(t.date, m);
  }
  return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, values]) => ({ date, values }));
}

export interface Trend {
  item: TestItem;
  last: TestResult;
  prev?: TestResult;
  /** 지난번과의 차이 (지난번이 없으면 null) */
  diff: number | null;
  /** 좋아졌으면 true, 나빠졌으면 false, 같거나 비교하지 않는 항목이면 null */
  good: boolean | null;
}

/** 항목마다 가장 최근 결과와 그 전 결과 (결과가 있는 항목만, 항목 순서대로) */
export function testTrends(items: TestItem[], tests: TestResult[], mid: string): Trend[] {
  return items.flatMap((item) => {
    const list = tests.filter((t) => t.mid === mid && t.item === item.id).sort((a, b) => b.date.localeCompare(a.date));
    if (!list.length) return [];
    const [last, prev] = list;
    const diff = prev ? Math.round((last.value - prev.value) * 100) / 100 : null;
    const good = diff === null || diff === 0 || item.better === 'none' ? null : item.better === 'high' ? diff > 0 : diff < 0;
    return [{ item, last, prev, diff, good }];
  });
}
