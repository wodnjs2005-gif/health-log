// 체력 측정: 분류별로 묶기, 날짜별로 묶기, 지난번과 비교
import type { TestCategory, TestItem, TestResult } from './backend';

/** 12.50 → '12.5', 3 → '3' */
export const numText = (v: number) => String(Math.round(v * 100) / 100);

export const BETTER_LABEL: Record<TestItem['better'], string> = {
  high: '높을수록 좋아요',
  low: '낮을수록 좋아요',
  none: '비교 안 함',
};

export const NO_CATEGORY = '분류 없음';

/** 결과를 글로: 숫자 항목은 '22.5kg', 글 항목은 적은 내용 */
export const resultText = (item: TestItem, r: TestResult) =>
  item.kind === 'text' ? (r.text ?? '') : r.value === null ? '' : `${numText(r.value)}${item.unit}`;

export interface CategoryGroup<T> {
  /** null = 분류 없음 */
  category: TestCategory | null;
  name: string;
  items: T[];
}

/**
 * 항목을 분류 순서대로 묶는다 (분류 없음은 맨 뒤). 항목이 없는 분류는 withEmpty 일 때만 넣는다.
 * pick 으로 항목 대신 다른 값(예: 비교 결과)을 묶을 수 있다.
 */
export function groupByCategory<T extends { item: TestItem } | TestItem>(
  categories: TestCategory[],
  list: T[],
  withEmpty = false,
): CategoryGroup<T>[] {
  const itemOf = (x: T): TestItem => ('item' in x ? x.item : x);
  const cats = [...categories].sort((a, b) => a.sort - b.sort);
  const known = new Set(cats.map((c) => c.id));
  const groups: CategoryGroup<T>[] = cats.map((c) => ({ category: c, name: c.name, items: list.filter((x) => itemOf(x).category === c.id) }));
  const rest = list.filter((x) => !itemOf(x).category || !known.has(itemOf(x).category!));
  if (rest.length) groups.push({ category: null, name: NO_CATEGORY, items: rest });
  return withEmpty ? groups : groups.filter((g) => g.items.length);
}

/** 분류 순서 → 항목 순서로 줄 세운 항목 */
export const orderedItems = (categories: TestCategory[], items: TestItem[]) => groupByCategory(categories, items).flatMap((g) => g.items);

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
  /** 지난번과의 차이 (숫자 항목이고 지난번이 있을 때만, 아니면 null) */
  diff: number | null;
  /** 좋아졌으면 true, 나빠졌으면 false, 같거나 비교하지 않는 항목이면 null */
  good: boolean | null;
}

/** 항목마다 가장 최근 결과와 그 전 결과 (결과가 있는 항목만, 분류·항목 순서대로) */
export function testTrends(categories: TestCategory[], items: TestItem[], tests: TestResult[], mid: string): Trend[] {
  return orderedItems(categories, items).flatMap((item) => {
    const list = tests.filter((t) => t.mid === mid && t.item === item.id).sort((a, b) => b.date.localeCompare(a.date));
    if (!list.length) return [];
    const [last, prev] = list;
    const diff = item.kind === 'number' && prev && last.value !== null && prev.value !== null ? Math.round((last.value - prev.value) * 100) / 100 : null;
    const good = diff === null || diff === 0 || item.better === 'none' ? null : item.better === 'high' ? diff > 0 : diff < 0;
    return [{ item, last, prev, diff, good }];
  });
}
