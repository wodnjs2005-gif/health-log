// 식사 영양소: 음식 목록(식약처 식품영양성분DB, src/data/foods.json) 검색과 합계 계산
import type { CustomFood, Meal, MealFood, Nutri } from './backend';

/** 양에 따라 1인분에 곱하는 값 */
export const AMOUNT_FACTOR: Record<string, number> = { 적게: 0.7, 보통: 1, 많이: 1.3 };

export const NUTRI_KEYS = ['kcal', 'carb', 'prot', 'fat', 'na'] as const;
export const NUTRI_LABEL: Record<keyof Nutri, string> = { kcal: '칼로리', carb: '탄수화물', prot: '단백질', fat: '지방', na: '나트륨' };
export const NUTRI_UNIT: Record<keyof Nutri, string> = { kcal: 'kcal', carb: 'g', prot: 'g', fat: 'g', na: 'mg' };

export const ZERO: Nutri = { kcal: 0, carb: 0, prot: 0, fat: 0, na: 0 };

export interface Food extends Nutri {
  name: string;
  /** 1인분 중량 (예: 200) */
  size: number;
  unit: string;
  /** '1인분' = 음식 자료의 1인분, '1회' = 원재료(과일·우유 등)에 식품군 기준으로 정한 1회 분량이나 관리자가 넣은 분량 */
  per: '1인분' | '1회';
  /** 관리자가 추가한 음식 */
  custom?: boolean;
  /** 검색용 (띄어쓰기·괄호 뺀 이름) */
  key: string;
}

/** 칼로리·나트륨은 정수, 나머지는 소수 첫째 자리 (서버 _clean_nutri 와 같게) */
export const roundNutri = (n: Nutri): Nutri => ({
  kcal: Math.round(n.kcal),
  carb: Math.round(n.carb * 10) / 10,
  prot: Math.round(n.prot * 10) / 10,
  fat: Math.round(n.fat * 10) / 10,
  na: Math.round(n.na),
});

export const hasNutri = (f: MealFood): f is MealFood & Nutri => typeof f.kcal === 'number';

/** 고른 음식 1인분 합계 × 양. 목록에서 고른 음식이 하나도 없으면 null */
export function mealNutri(foods: MealFood[], amount: string): Nutri | null {
  const known = foods.filter(hasNutri);
  if (!known.length) return null;
  const k = AMOUNT_FACTOR[amount] ?? 1;
  const sum = { ...ZERO };
  for (const f of known) for (const key of NUTRI_KEYS) sum[key] += f[key] * k;
  return roundNutri(sum);
}

/** 여러 식사의 합계. 영양소가 계산된 식사 수도 함께 */
export function sumMeals(meals: Meal[]) {
  const sum = { ...ZERO };
  let counted = 0;
  for (const m of meals) {
    if (!m.nutri) continue;
    counted++;
    for (const key of NUTRI_KEYS) sum[key] += m.nutri[key] ?? 0;
  }
  return { sum: roundNutri(sum), counted, total: meals.length };
}

const comma = (v: number) => v.toLocaleString('ko-KR');
/** 1,234kcal · 탄수화물 80g … */
export const fmt = (key: keyof Nutri, v: number) => `${comma(key === 'kcal' || key === 'na' ? Math.round(v) : Math.round(v * 10) / 10)}${NUTRI_UNIT[key]}`;

// --- 음식 목록 ---------------------------------------------------------------
const norm = (s: string) => s.replace(/[\s()·_,]/g, '').toLowerCase();

let cache: Promise<{ foods: Food[]; source: string }> | null = null;

/** 음식 목록은 식사 기록 창을 열 때 처음 불러온다 (약 150KB) */
export function loadFoods() {
  cache ??= import('../data/foods.json').then((m) => ({
    source: m.default.source,
    foods: (m.default.foods as [string, number, string, number, number, number, number, number, number?][]).map(
      ([name, size, unit, kcal, carb, prot, fat, na, raw]) => ({
        name, size, unit, kcal, carb, prot, fat, na, per: raw ? '1회' : '1인분', key: norm(name),
      }),
    ),
  }));
  cache.catch(() => (cache = null)); // 실패하면 다음에 다시
  return cache;
}

/** 관리자가 추가한 음식을 기본 목록에 합친다. 이름이 같으면 추가한 값을 쓴다 */
export function mergeFoods(base: Food[], customs: CustomFood[]): Food[] {
  const names = new Set(customs.map((c) => c.name));
  return [
    ...base.filter((f) => !names.has(f.name)),
    ...customs.map((c): Food => ({
      name: c.name, size: c.size, unit: c.unit, kcal: c.kcal, carb: c.carb, prot: c.prot, fat: c.fat, na: c.na,
      per: '1회', custom: true, key: norm(c.name),
    })),
  ];
}

/** 기본 목록에 같은 이름이 있으면 그 음식 (관리자 화면에서 값 미리 채우기) */
export async function findBaseFood(name: string): Promise<Food | undefined> {
  const { foods } = await loadFoods();
  return foods.find((f) => f.name === name.trim());
}

/** 두 글자씩 묶은 조각 ('김치찌개' → 김치·치찌·찌개). 한 글자 이름은 그 글자 */
const pairs = (s: string) => {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  if (s.length === 1) out.add(s);
  return out;
};

/** 이름이 얼마나 비슷한지 0~1 (겹치는 두 글자 조각의 비율). '김치찌게' ↔ '김치찌개' = 0.67 */
const likeness = (a: Set<string>, b: Set<string>) => {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return a.size + b.size ? (2 * n) / (a.size + b.size) : 0;
};

/** 이 정도 이상 비슷해야 「비슷한 음식」으로 친다 */
const LIKE_MIN = 0.4;

/** 흔히 쓰는 말 → 음식 목록의 이름 (이름 전체가 같을 때) */
const ALIAS: Record<string, string> = {
  밥: '쌀밥', 공기밥: '쌀밥', 흰밥: '쌀밥', 흰쌀밥: '쌀밥', 백미밥: '쌀밥',
  김치: '배추김치', 계란후라이: '달걀후라이', 계란프라이: '달걀후라이', 달걀프라이: '달걀후라이',
};

/** 찾는 말을 이름 목록 표기로: 별칭, 그리고 계란 → 달걀 (띄어쓰기는 그대로) */
const canon = (q: string) => ALIAS[norm(q)] ?? q.replace(/계란/g, '달걀');

/**
 * 음식마다 점수 (작을수록 먼저, 해당 없으면 -1):
 * 0 이름이 같음 · 1 이름으로 시작 · 2 포함 · 3 띄어 쓴 낱말이 모두 들어 있음('삶은 달걀' → '달걀(삶은것)')
 * · 4~5 적은 말 안에 음식 이름이 들어 있음('엄마표 된장국' → '된장국', 긴 이름일수록 먼저)
 * · 5~6 글자가 비슷함('김치찌게' → '김치찌개', 비슷할수록 먼저)
 */
function scorer(q: string) {
  const k = norm(q);
  const words = q.split(/[\s,]+/).map(norm).filter(Boolean);
  const kp = pairs(k);
  return (f: Food) => {
    if (f.key === k) return 0;
    if (f.key.startsWith(k)) return 1;
    if (f.key.includes(k)) return 2;
    if (words.length > 1 && words.every((w) => f.key.includes(w))) return 3;
    if (f.key.length >= 2 && k.includes(f.key)) return 4 + 1 / f.key.length;
    const like = likeness(kp, pairs(f.key));
    return like >= LIKE_MIN ? 6 - like : -1;
  };
}

/**
 * 음식 찾기. 같은 이름 → 이름으로 시작 → 포함 → 낱말이 모두 들어 있음 → 비슷한 음식 순서이고,
 * 같은 순위면 짧은 이름 먼저. 흔히 쓰는 말('밥', '계란')은 목록 표기('쌀밥', '달걀')로도 찾아 더 잘 맞는 쪽을 앞에 둔다
 */
export function searchFoods(foods: Food[], q: string, limit = 8): Food[] {
  const k = norm(q);
  if (!k) return [];
  const alt = canon(q);
  const scores = [scorer(q), ...(norm(alt) !== k ? [scorer(alt)] : [])];
  return foods
    .map((f) => ({ f, s: Math.min(...scores.map((sc) => sc(f)).map((v) => (v < 0 ? Infinity : v))) }))
    .filter((x) => x.s !== Infinity)
    .sort((a, b) => a.s - b.s || a.f.name.length - b.f.name.length || a.f.name.localeCompare(b.f.name, 'ko'))
    .slice(0, limit)
    .map((x) => x.f);
}

/** 적은 이름과 가장 비슷한 음식 (없으면 undefined). 고르지 않고 적기만 한 음식에 영양 정보를 채울 때 */
export const closestFood = (foods: Food[], q: string): Food | undefined => searchFoods(foods, q, 1)[0];

/** 목록 음식 → 식사에 저장할 모양 */
export const toMealFood = (f: Food): MealFood => ({ n: f.name, kcal: f.kcal, carb: f.carb, prot: f.prot, fat: f.fat, na: f.na });
