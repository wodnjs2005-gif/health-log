import { useState } from 'react';
import { useApp } from '../../AppContext';
import { ConfirmButton } from '../../components/ConfirmButton';
import { Sheet } from '../../components/Layout';
import { useConfirm } from '../../hooks/useConfirm';
import { AMOUNTS, KINDS, LEVELS, MEALS } from '../../lib/constants';
import type { Exercise, Meal, MealFood } from '../../lib/backend';
import { cx } from '../../lib/cx';
import { mealNutri } from '../../lib/nutrition';
import { FoodPicker, matchTyped, MealTotal, renamed, useFoodList } from './FoodPicker';
import ui from '../../styles/ui.module.css';
import s from './user.module.css';

/** rec 가 있으면 관리자가 그 기록을 고친다 */
export type SheetState = { kind: 'ex'; rec?: Exercise } | { kind: 'meal'; meal: string; rec?: Meal };

const MIN_STEP = 5;
const MIN_MAX = 300;

/** 예전 기록(음식을 고르지 않고 글로 적은 식사)은 쉼표로 나눠 이름만 있는 음식으로 */
const foodsOf = (m: Meal): MealFood[] =>
  m.foods?.length ? m.foods : [...new Set(m.menu.split(/[,，]/).map((x) => x.trim().slice(0, 40)).filter(Boolean))].slice(0, 20).map((n) => ({ n }));

/** 운동/식사 기록 바텀시트. 이용자는 새로 적고, 관리자는 이용자가 잘못 적은 기록을 고치거나 지운다 */
export function RecordSheet({ state, date: dateProp, onClose }: { state: SheetState; date: string; onClose: () => void }) {
  const { be, userCode, staffToken, today, setData, toast, fail } = useApp();
  const isEx = state.kind === 'ex';
  const ex = state.kind === 'ex' ? state.rec : undefined;
  const ml = state.kind === 'meal' ? state.rec : undefined;
  const editing = !!(ex || ml);
  const { list, failed } = useFoodList();
  const confirm = useConfirm();

  const [date, setDate] = useState(ex?.date ?? ml?.date ?? dateProp);
  const [kind, setKind] = useState(ex?.kind ?? '');
  const [min, setMin] = useState(ex?.min ?? 30);
  const [level, setLevel] = useState(ex?.level ?? '보통');
  const [meal, setMeal] = useState(ml?.meal ?? (state.kind === 'meal' ? state.meal : '아침'));
  const [foods, setFoods] = useState<MealFood[]>(() => (ml ? foodsOf(ml) : []));
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState(ml?.amount ?? '보통');
  const [memo, setMemo] = useState(ex?.memo ?? ml?.memo ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // 예전 기록에 있던, 지금 고를 수 없는 종류·때·양도 고를 수 있게 남겨 둔다
  const kinds = ex && !KINDS.includes(ex.kind) ? [...KINDS, ex.kind] : KINDS;
  const meals = ml && !MEALS.includes(ml.meal) ? [...MEALS, ml.meal] : MEALS;
  const levels = ex && !LEVELS.includes(ex.level) ? [...LEVELS, ex.level] : LEVELS;
  const amounts = ml && !AMOUNTS.includes(ml.amount) ? [...AMOUNTS, ml.amount] : AMOUNTS;

  const edit = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setError('');
  };

  const save = async () => {
    if (saving) return;
    if (!date || date > today) return setError('날짜를 확인해주세요.');
    if (isEx && !kind) return setError('운동 종류를 골라주세요.');
    // 찾기 칸에 적어 두고 고르지 않았으면 가장 비슷한 음식을 넣는다 (비슷한 게 없으면 이름만)
    const typed = matchTyped(list, query).filter((x) => !foods.some((f) => f.n === x.food.n));
    const mealFoods = [...foods, ...typed.map((x) => x.food)].slice(0, 20);
    if (!isEx && !mealFoods.length) return setError('드신 음식을 적어주세요.');
    setSaving(true);
    try {
      if (isEx) {
        const r = { date, kind, min, level, memo: memo.trim() };
        const rec = ex ? await be.adminUpdateEx(staffToken, ex.id, r) : await be.userAddEx(userCode, r);
        setData((d) => ({ ...d, ex: ex ? d.ex.map((x) => (x.id === rec.id ? rec : x)) : [...d.ex, rec] }));
        toast(ex ? '운동 기록을 고쳤어요' : '운동을 저장했어요');
      } else {
        const r = {
          date, meal, amount, memo: memo.trim(),
          menu: mealFoods.map((x) => x.n).join(', '),
          foods: mealFoods,
          nutri: mealNutri(mealFoods, amount),
        };
        const rec = ml ? await be.adminUpdateMeal(staffToken, ml.id, r) : await be.userAddMeal(userCode, r);
        setData((d) => ({ ...d, meals: ml ? d.meals.map((x) => (x.id === rec.id ? rec : x)) : [...d.meals, rec] }));
        const note = renamed(typed);
        toast(`${ml ? '식사 기록을 고쳤어요' : '식사를 저장했어요'}${note ? ` · ${note} 영양 정보로 계산` : ''}`);
      }
      onClose();
    } catch (e) {
      setSaving(false);
      fail(e);
    }
  };

  const del = () =>
    confirm.tap('del', async () => {
      if (saving) return;
      setSaving(true);
      try {
        if (ex) await be.adminDelEx(staffToken, ex.id);
        if (ml) await be.adminDelMeal(staffToken, ml.id);
      } catch (e) {
        setSaving(false);
        return fail(e);
      }
      setData((d) => ({ ...d, ex: d.ex.filter((x) => x.id !== ex?.id), meals: d.meals.filter((x) => x.id !== ml?.id) }));
      toast('기록을 지웠어요');
      onClose();
    });

  const choice = (orange = false, pill = false) =>
    cx(ui.choice, orange && ui.choiceOrange, pill && ui.pill);

  return (
    <Sheet title={`${isEx ? '운동' : '식사'} ${editing ? '기록 고치기' : '기록하기'}`} onClose={onClose}>
      {editing && (
        <label className={ui.field}>
          <span className={ui.label}>날짜</span>
          <input type="date" className={ui.input} value={date} max={today} onChange={(e) => edit(setDate)(e.target.value)} />
        </label>
      )}
      {isEx ? (
        <>
          <div className={ui.field}>
            <div className={ui.label}>어떤 운동을 했나요?</div>
            <div className={ui.choices}>
              {kinds.map((k) => (
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
              <button type="button" className={cx(ui.stepBtn, ui.stepBtnFill)} aria-label="5분 늘리기" onClick={() => edit(setMin)(Math.min(Math.max(MIN_MAX, min), min + MIN_STEP))}>
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
              {levels.map((k) => (
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
              {meals.map((k) => (
                <button key={k} type="button" className={choice(true)} aria-pressed={meal === k} onClick={() => edit(setMeal)(k)}>
                  {k}
                </button>
              ))}
            </div>
          </div>
          <FoodPicker
            foods={foods}
            onChange={edit(setFoods)}
            query={query}
            onQuery={setQuery}
            onError={setError}
            list={list}
            failed={failed}
            mid={ml?.mid}
            onNote={toast}
          />
          <div className={ui.field}>
            <div className={ui.label}>양은 어땠나요?</div>
            <div className={ui.grid3}>
              {amounts.map((k) => (
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
        {saving ? '저장하는 중…' : editing ? '고친 내용 저장' : '저장하기'}
      </button>
      {editing && <ConfirmButton armed={confirm.pending === 'del'} onClick={del} label="이 기록 지우기" danger wide />}
    </Sheet>
  );
}
