import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../AppContext';
import { NutriGrid } from '../../components/Nutri';
import type { MealFood } from '../../lib/backend';
import { fmt, hasNutri, loadFoods, mealNutri, mergeFoods, searchFoods, toMealFood, type Food } from '../../lib/nutrition';
import { FOOD_SOURCE } from '../../lib/nutritionSource';
import ui from '../../styles/ui.module.css';
import s from './food.module.css';

const MAX_FOODS = 20;
const RECENT = 8;

interface Props {
  foods: MealFood[];
  onChange: (foods: MealFood[]) => void;
  query: string;
  onQuery: (q: string) => void;
  onError: (msg: string) => void;
}

/** 식사 기록: 음식 찾아 고르기 → 영양소 자동 계산 */
export function FoodPicker({ foods, onChange, query, onQuery, onError }: Props) {
  const { be, data, me } = useApp();
  const [list, setList] = useState<Food[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    // 기본 목록 + 관리자가 추가한 음식 (추가한 음식을 못 받아와도 기본 목록은 쓴다)
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

  // 이 이용자가 자주 고른 음식 (목록에 있는 것만)
  const recent = useMemo(() => {
    const count = new Map<string, number>();
    for (const m of data.meals) if (m.mid === me) for (const f of m.foods ?? []) if (hasNutri(f)) count.set(f.n, (count.get(f.n) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }, [data.meals, me]);

  const picked = new Set(foods.map((f) => f.n));
  const results = list ? searchFoods(list, query) : [];
  const exact = results.some((f) => f.name.replace(/\s/g, '') === query.replace(/\s/g, ''));
  const quick = list ? recent.filter((n) => !picked.has(n)).slice(0, RECENT).map((n) => list.find((f) => f.name === n)).filter((f): f is Food => !!f) : [];

  const add = (f: MealFood) => {
    if (picked.has(f.n)) return onError('이미 고른 음식이에요.');
    if (foods.length >= MAX_FOODS) return onError(`음식은 ${MAX_FOODS}개까지 고를 수 있어요.`);
    onChange([...foods, f]);
    onQuery('');
    onError('');
  };

  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor="food-search">
        무엇을 드셨나요?
      </label>

      {foods.length > 0 && (
        <ul className={s.picked} aria-label="고른 음식">
          {foods.map((f) => (
            <li key={f.n} className={s.pickedRow}>
              <span className={s.pickedMain}>
                <span className={s.pickedName}>{f.n}</span>
                <span className={s.pickedSub}>{hasNutri(f) ? fmt('kcal', f.kcal) : '영양 정보 없음'}</span>
              </span>
              <button type="button" className={s.remove} aria-label={`${f.n} 빼기`} onClick={() => onChange(foods.filter((x) => x.n !== f.n))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        id="food-search"
        className={ui.input}
        value={query}
        onChange={(e) => {
          onQuery(e.target.value.slice(0, 40));
          onError('');
        }}
        placeholder="음식 이름으로 찾기 (예: 된장찌개)"
        autoComplete="off"
        enterKeyHint="search"
        style={{ outlineColor: 'var(--orange)' }}
      />

      {failed && <div className={ui.small}>음식 목록을 불러오지 못했어요. 이름을 적고 「직접 추가」를 눌러주세요.</div>}
      {!list && !failed && query.trim() && <div className={ui.small}>음식 목록을 불러오는 중…</div>}

      {query.trim() !== '' && (
        <div className={s.results} role="listbox" aria-label="찾은 음식">
          {results.map((f) => (
            <button
              key={f.name}
              type="button"
              role="option"
              aria-selected={picked.has(f.name)}
              className={s.result}
              onClick={() => add(toMealFood(f))}
            >
              <span className={s.resultName}>{f.name}</span>
              <span className={s.resultSub}>
                {f.per} {f.size}
                {f.unit} · {fmt('kcal', f.kcal)}
              </span>
            </button>
          ))}
          {list && results.length === 0 && <div className={ui.small}>목록에 없는 음식이에요.</div>}
          {!exact && (
            <button type="button" className={s.custom} onClick={() => add({ n: query.trim() })}>
              「{query.trim()}」 직접 추가 <span className={s.resultSub}>(영양 정보 없음)</span>
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
      {foods.some((f) => !hasNutri(f)) && <div className={ui.small}>직접 추가한 음식은 계산에서 빠져요.</div>}
      <div className={s.source}>영양 정보: {FOOD_SOURCE} · 1인분(과일·우유 등은 1회 분량) 기준</div>
    </div>
  );
}
