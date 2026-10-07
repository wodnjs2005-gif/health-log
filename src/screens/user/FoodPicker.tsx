import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../AppContext';
import { NutriGrid } from '../../components/Nutri';
import type { MealFood } from '../../lib/backend';
import { closestFood, fmt, hasNutri, loadFoods, mealNutri, mergeFoods, searchFoods, toMealFood, type Food } from '../../lib/nutrition';
import { FOOD_SOURCE } from '../../lib/nutritionSource';
import ui from '../../styles/ui.module.css';
import s from './food.module.css';

const MAX_FOODS = 20;
const RECENT = 8;

/** 음식 목록: 기본 목록 + 관리자가 추가한 음식 (추가한 음식을 못 받아와도 기본 목록은 쓴다). 불러오는 중이면 null */
export function useFoodList() {
  const { be } = useApp();
  const [list, setList] = useState<Food[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([loadFoods(), be.customFoodsGet().catch(() => [])])
      .then(([r, customs]) => {
        if (!alive) return;
        setList(mergeFoods(r.foods, customs));
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [be]);

  return { list, failed };
}

export interface Typed {
  food: MealFood;
  /** 적은 글 그대로 */
  typed: string;
}

/** 적어 둔 글('김치찌게, 밥')을 쉼표로 나눠 음식마다 가장 비슷한 목록 음식으로. 비슷한 게 없으면 이름만 */
export function matchTyped(list: Food[] | null, text: string): Typed[] {
  return text
    .split(/[,，]/)
    .map((x) => x.trim().slice(0, 40))
    .filter(Boolean)
    .map((typed) => {
      const f = list ? closestFood(list, typed) : undefined;
      return { food: f ? toMealFood(f) : { n: typed }, typed };
    });
}

/** 비슷한 음식으로 바꾼 것 안내 ('「김치찌게」→「김치찌개」'). 바꾼 게 없으면 '' */
export function renamed(items: Typed[]) {
  const diff = items.filter((x) => hasNutri(x.food) && x.food.n !== x.typed);
  if (!diff.length) return '';
  const first = `「${diff[0].typed}」→「${diff[0].food.n}」`;
  return diff.length > 1 ? `${first} 외 ${diff.length - 1}개` : first;
}

interface Props {
  foods: MealFood[];
  onChange: (foods: MealFood[]) => void;
  query: string;
  onQuery: (q: string) => void;
  onError: (msg: string) => void;
  /** useFoodList() 결과 */
  list: Food[] | null;
  failed: boolean;
  /** 자주 드신 음식을 셀 이용자 (없으면 로그인한 이용자) */
  mid?: string;
  /** 비슷한 음식으로 바꿔 넣었을 때 알려줄 말 */
  onNote?: (msg: string) => void;
}

/** 식사 기록: 음식 찾아 고르기 → 영양소 자동 계산. 적기만 해도 가장 비슷한 음식이 들어간다 */
export function FoodPicker({ foods, onChange, query, onQuery, onError, list, failed, mid, onNote }: Props) {
  const { data, me } = useApp();
  const who = mid ?? me;

  // 이 이용자가 자주 고른 음식 (목록에 있는 것만)
  const recent = useMemo(() => {
    const count = new Map<string, number>();
    for (const m of data.meals) if (m.mid === who) for (const f of m.foods ?? []) if (hasNutri(f)) count.set(f.n, (count.get(f.n) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }, [data.meals, who]);

  const picked = new Set(foods.map((f) => f.n));
  // 쉼표로 여러 개를 적고 있으면 마지막 음식으로 찾는다
  const parts = query.split(/[,，]/);
  const last = parts[parts.length - 1].trim();
  const before = parts.slice(0, -1).join(',');
  const results = list ? searchFoods(list, last) : [];
  const exact = results.some((f) => f.name.replace(/\s/g, '') === last.replace(/\s/g, ''));
  const quick = list ? recent.filter((n) => !picked.has(n)).slice(0, RECENT).map((n) => list.find((f) => f.name === n)).filter((f): f is Food => !!f) : [];

  const addMany = (add: MealFood[]) => {
    const fresh = add.filter((f, i) => !picked.has(f.n) && add.findIndex((x) => x.n === f.n) === i);
    if (!fresh.length) return onError('이미 고른 음식이에요.');
    if (foods.length + fresh.length > MAX_FOODS) return onError(`음식은 ${MAX_FOODS}개까지 고를 수 있어요.`);
    onChange([...foods, ...fresh]);
    onQuery('');
    onError('');
  };
  // 고른 음식과 함께, 앞에 쉼표로 적어 둔 음식도 가장 비슷한 음식으로 넣는다
  const add = (f: MealFood) => addMany([...matchTyped(list, before).map((x) => x.food), f]);

  // 엔터: 적은 음식마다 가장 비슷한 음식을 넣는다
  const addTyped = () => {
    const items = matchTyped(list, query);
    if (!items.length) return;
    addMany(items.map((x) => x.food));
    const note = renamed(items);
    if (note) onNote?.(`${note} 영양 정보로 넣었어요`);
  };

  // 이름만 들어간 음식을 비슷한 목록 음식으로 바꾸기
  const swap = (from: MealFood, to: Food) => {
    // 이미 다른 줄에 같은 음식이 있으면 이 줄은 뺀다
    const dup = foods.some((x) => x !== from && x.n === to.name);
    onChange(dup ? foods.filter((x) => x !== from) : foods.map((x) => (x === from ? toMealFood(to) : x)));
    onError('');
  };

  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor="food-search">
        무엇을 드셨나요?
      </label>

      {foods.length > 0 && (
        <ul className={s.picked} aria-label="고른 음식">
          {foods.map((f) => {
            const near = !hasNutri(f) && list ? closestFood(list, f.n) : undefined;
            return (
              <li key={f.n} className={s.pickedRow}>
                <span className={s.pickedMain}>
                  <span className={s.pickedName}>{f.n}</span>
                  <span className={s.pickedSub}>{hasNutri(f) ? fmt('kcal', f.kcal) : '영양 정보 없음'}</span>
                  {near && (
                    <button type="button" className={s.swap} onClick={() => swap(f, near)}>
                      「{near.name}」 영양 정보 쓰기
                    </button>
                  )}
                </span>
                <button type="button" className={s.remove} aria-label={`${f.n} 빼기`} onClick={() => onChange(foods.filter((x) => x.n !== f.n))}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <input
        id="food-search"
        className={ui.input}
        value={query}
        onChange={(e) => {
          onQuery(e.target.value.slice(0, 80));
          onError('');
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
          e.preventDefault();
          addTyped();
        }}
        placeholder="음식 이름 (예: 된장찌개, 밥)"
        autoComplete="off"
        enterKeyHint="done"
        aria-describedby="food-hint"
        style={{ outlineColor: 'var(--orange)' }}
      />
      <div id="food-hint" className={ui.small}>
        적기만 해도 가장 비슷한 음식의 영양 정보가 들어가요. 여러 개는 쉼표(,)로 나눠 적으세요.
      </div>

      {failed && <div className={ui.small}>음식 목록을 불러오지 못했어요. 이름을 적고 「이름만 추가」를 눌러주세요.</div>}
      {!list && !failed && last && <div className={ui.small}>음식 목록을 불러오는 중…</div>}

      {last !== '' && (
        <div className={s.results} role="listbox" aria-label="찾은 음식">
          {results.map((f, i) => (
            <button
              key={f.name}
              type="button"
              role="option"
              aria-selected={picked.has(f.name)}
              className={s.result}
              onClick={() => add(toMealFood(f))}
            >
              <span className={s.resultName}>
                {f.name}
                {i === 0 && !exact && <span className={s.best}>가장 비슷</span>}
              </span>
              <span className={s.resultSub}>
                {f.per} {f.size}
                {f.unit} · {fmt('kcal', f.kcal)}
              </span>
            </button>
          ))}
          {list && results.length === 0 && <div className={ui.small}>비슷한 음식이 목록에 없어요.</div>}
          {!exact && (
            <button type="button" className={s.custom} onClick={() => add({ n: last.slice(0, 40) })}>
              「{last}」 이름만 추가 <span className={s.resultSub}>(영양 정보 없음)</span>
            </button>
          )}
        </div>
      )}

      {query.trim() === '' && quick.length > 0 && (
        <div className={s.quick}>
          <span className={ui.small}>자주 드신 음식</span>
          <div className={s.quickList}>
            {quick.map((f) => (
              <button key={f.name} type="button" className={s.quickBtn} onClick={() => add(toMealFood(f))}>
                + {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

/** 이 식사 영양소 합계 (양 반영). 목록에서 고른 음식이 없으면 그리지 않는다 */
export function MealTotal({ foods, amount }: { foods: MealFood[]; amount: string }) {
  const total = mealNutri(foods, amount);
  if (!total) return null;
  return (
    <div className={s.total}>
      <div className={s.totalHead}>
        <span>이 식사 영양소</span>
        <span className={ui.small}>양 「{amount}」 반영</span>
      </div>
      <NutriGrid n={total} label="이 식사 영양소" />
      {foods.some((f) => !hasNutri(f)) && <div className={ui.small}>이름만 추가한 음식은 계산에서 빠져요.</div>}
      <div className={s.source}>영양 정보: {FOOD_SOURCE} · 1인분(과일·우유 등은 1회 분량) 기준</div>
    </div>
  );
}
