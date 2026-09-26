import { useState } from 'react';
import { useApp } from '../../AppContext';
import { Sheet } from '../../components/Layout';
import { AMOUNTS, KINDS, LEVELS, MEALS } from '../../lib/constants';
import type { MealFood } from '../../lib/backend';
import { cx } from '../../lib/cx';
import { mealNutri } from '../../lib/nutrition';
import { FoodPicker, MealTotal } from './FoodPicker';
import ui from '../../styles/ui.module.css';
import s from './user.module.css';

export type SheetState = { kind: 'ex' } | { kind: 'meal'; meal: string };

const MIN_STEP = 5;
const MIN_MAX = 300;

/** 운동/식사 기록 바텀시트 */
export function RecordSheet({ state, date, onClose }: { state: SheetState; date: string; onClose: () => void }) {
  const { be, userCode, setData, toast, fail } = useApp();
  const isEx = state.kind === 'ex';

  const [kind, setKind] = useState('');
  const [min, setMin] = useState(30);
  const [level, setLevel] = useState('보통');
  const [meal, setMeal] = useState(state.kind === 'meal' ? state.meal : '아침');
  const [foods, setFoods] = useState<MealFood[]>([]);
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState('보통');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const edit = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setError('');
  };

  const save = async () => {
    if (saving) return;
    if (isEx && !kind) return setError('운동 종류를 골라주세요.');
    // 찾기 칸에 적어 두고 고르지 않았으면 직접 쓴 음식으로 넣는다
    const pending = query.trim();
    const mealFoods = pending && !foods.some((x) => x.n === pending) ? [...foods, { n: pending }] : foods;
    if (!isEx && !mealFoods.length) return setError('드신 음식을 찾아서 골라주세요.');
    setSaving(true);
    try {
      if (isEx) {
        const rec = await be.userAddEx(userCode, { date, kind, min, level, memo: memo.trim() });
        setData((d) => ({ ...d, ex: [...d.ex, rec] }));
        toast('운동을 저장했어요');
      } else {
        const rec = await be.userAddMeal(userCode, {
          date, meal, amount, memo: memo.trim(),
          menu: mealFoods.map((x) => x.n).join(', '),
          foods: mealFoods,
          nutri: mealNutri(mealFoods, amount),
        });
        setData((d) => ({ ...d, meals: [...d.meals, rec] }));
        toast('식사를 저장했어요');
      }
      onClose();
    } catch (e) {
      setSaving(false);
      fail(e);
    }
  };

  const choice = (orange = false, pill = false) =>
    cx(ui.choice, orange && ui.choiceOrange, pill && ui.pill);

  return (
    <Sheet title={isEx ? '운동 기록하기' : '식사 기록하기'} onClose={onClose}>
      {isEx ? (
        <>
          <div className={ui.field}>
            <div className={ui.label}>어떤 운동을 했나요?</div>
            <div className={ui.choices}>
              {KINDS.map((k) => (
                <button key={k} type="button" className={choice(false, true)} aria-pressed={kind === k} onClick={() => edit(setKind)(k)}>
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div className={ui.field}>
            <div className={ui.label}>몇 분 했나요?</div>
            <div className={ui.stepper}>
              <button type="button" className={ui.stepBtn} aria-label="5분 줄이기" onClick={() => edit(setMin)(Math.max(MIN_STEP, min - MIN_STEP))}>
                −
              </button>
              <div className={ui.stepValue} aria-live="polite">
                {min}
                <span className={ui.unit}>분</span>
              </div>
              <button type="button" className={cx(ui.stepBtn, ui.stepBtnFill)} aria-label="5분 늘리기" onClick={() => edit(setMin)(Math.min(MIN_MAX, min + MIN_STEP))}>
                +
              </button>
            </div>
            <div className={ui.grid4}>
              {[10, 20, 30, 60].map((n) => (
                <button key={n} type="button" className={s.minPreset} aria-pressed={min === n} onClick={() => edit(setMin)(n)}>
                  {n}분
                </button>
              ))}
            </div>
          </div>
          <div className={ui.field}>
            <div className={ui.label}>얼마나 힘들었나요?</div>
            <div className={ui.grid3}>
              {LEVELS.map((k) => (
                <button key={k} type="button" className={choice()} aria-pressed={level === k} onClick={() => edit(setLevel)(k)}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className={ui.field}>
            <div className={ui.label}>언제 드셨나요?</div>
            <div className={ui.grid4}>
              {MEALS.map((k) => (
                <button key={k} type="button" className={choice(true)} aria-pressed={meal === k} onClick={() => edit(setMeal)(k)}>
                  {k}
                </button>
              ))}
            </div>
          </div>
          <FoodPicker foods={foods} onChange={edit(setFoods)} query={query} onQuery={setQuery} onError={setError} />
          <div className={ui.field}>
            <div className={ui.label}>양은 어땠나요?</div>
            <div className={ui.grid3}>
              {AMOUNTS.map((k) => (
                <button key={k} type="button" className={choice(true)} aria-pressed={amount === k} onClick={() => edit(setAmount)(k)}>
                  {k}
                </button>
              ))}
            </div>
          </div>
          <MealTotal foods={foods} amount={amount} />
        </>
      )}
      <label className={ui.field}>
        <span className={ui.label}>
          메모 <span className={ui.labelSub}>(선택)</span>
        </span>
        <textarea
          className={ui.textarea}
          rows={2}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder={isEx ? '예: 무릎이 조금 아팠음' : '예: 싱겁게 먹음'}
        />
      </label>
      {error && (
        <div role="alert" className={ui.error}>
          {error}
        </div>
      )}
      <button type="button" className={cx(ui.btn, ui.btnSave, isEx ? ui.green : ui.orange)} disabled={saving} onClick={save}>
        {saving ? '저장하는 중…' : '저장하기'}
      </button>
    </Sheet>
  );
}
