import { useApp } from '../../AppContext';
import { ConfirmButton } from '../../components/ConfirmButton';
import type { useConfirm } from '../../hooks/useConfirm';
import { MEALS } from '../../lib/constants';
import { cx } from '../../lib/cx';
import { NutriGrid, NutriLine } from '../../components/Nutri';
import type { Meal } from '../../lib/backend';
import { sumMeals } from '../../lib/nutrition';
import ui from '../../styles/ui.module.css';
import s from './user.module.css';

type Confirm = ReturnType<typeof useConfirm>;

/** 두 번 눌러 삭제. 다른 사람의 기록은 서버에서 번호로 걸러진다. */
function useDelete(confirm: Confirm) {
  const { be, userCode, setData, toast, fail } = useApp();
  return (id: string, list: 'ex' | 'meals') =>
    confirm.tap(id, async () => {
      try {
        await (list === 'ex' ? be.userDelEx(userCode, id) : be.userDelMeal(userCode, id));
      } catch (e) {
        return fail(e);
      }
      setData((d) => ({ ...d, [list]: (d[list] as { id: string }[]).filter((x) => x.id !== id) }));
      toast('삭제했어요');
    });
}

export function ExTab({ date, confirm, onAdd }: { date: string; confirm: Confirm; onAdd: () => void }) {
  const { data, me } = useApp();
  const del = useDelete(confirm);
  const list = data.ex.filter((e) => e.mid === me && e.date === date);
  const total = list.reduce((a, e) => a + e.min, 0);

  return (
    <>
      <div className={ui.row} style={{ alignItems: 'center' }}>
        <h2 className={ui.h2}>운동일지</h2>
        <div style={{ fontSize: '1rem', color: 'var(--ink-2)' }}>
          합계 <b className={ui.num}>{total}분</b>
        </div>
      </div>
      {list.length === 0 && <div className={ui.empty}>이 날은 운동 기록이 없어요.</div>}
      {list.map((e) => (
        <div key={e.id} className={ui.card}>
          <div className={s.exHead}>
            <div className={s.exIcon} aria-hidden="true">
              {e.kind[0]}
            </div>
            <div className={s.exBody}>
              <div className={s.exKind}>{e.kind}</div>
              <div className={ui.small}>강도: {e.level}</div>
            </div>
            <div className={s.exMin}>{e.min}분</div>
          </div>
          {e.memo && <div className={ui.memo}>{e.memo}</div>}
          <ConfirmButton armed={confirm.pending === e.id} onClick={() => del(e.id, 'ex')} />
        </div>
      ))}
      <button type="button" className={cx(ui.btn, ui.green)} onClick={onAdd}>
        + 운동 추가
      </button>
    </>
  );
}

export function MealTab({ date, confirm, onAdd }: { date: string; confirm: Confirm; onAdd: (meal: string) => void }) {
  const { data, me } = useApp();
  const del = useDelete(confirm);
  const dayMeals = data.meals.filter((m) => m.mid === me && m.date === date);

  return (
    <>
      <h2 className={ui.h2}>식단기록</h2>
      <DayNutri meals={dayMeals} />
      {MEALS.map((meal) => {
        const items = dayMeals.filter((x) => x.meal === meal);
        return (
          <section key={meal} className={ui.card}>
            <div className={ui.row} style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
              <h3 className={cx(ui.h3, s.mealName)}>{meal}</h3>
              <button type="button" className={s.addBtn} onClick={() => onAdd(meal)} aria-label={`${meal} 추가`}>
                + 추가
              </button>
            </div>
            {items.length === 0 && <div className={ui.muted}>아직 기록이 없어요.</div>}
            {items.map((it) => (
              <div key={it.id} className={s.mealItem}>
                <div className={s.mealItemTop}>
                  <div className={s.menu}>{it.menu}</div>
                  <span className={cx(ui.badge, ui.badgeOrange)} style={{ flex: 'none' }}>
                    {it.amount}
                  </span>
                </div>
                {(it.foods?.length ?? 0) > 0 && <NutriLine n={it.nutri} />}
                {it.memo && <div style={{ fontSize: '1rem', color: 'var(--ink-2)' }}>{it.memo}</div>}
                <ConfirmButton armed={confirm.pending === it.id} onClick={() => del(it.id, 'meals')} />
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}

/** 그날 먹은 영양소 합계. 음식을 목록에서 고른 식사만 계산한다 */
export function DayNutri({ meals, title = '하루 영양소' }: { meals: Meal[]; title?: string }) {
  const { sum, counted, total } = sumMeals(meals);
  if (!counted) return null;
  return (
    <section className={ui.card} style={{ gap: '0.625rem' }}>
      <div className={ui.row}>
        <h3 className={ui.h3}>{title}</h3>
        {counted < total && <span className={ui.small}>{total}끼 중 {counted}끼 계산</span>}
      </div>
      <NutriGrid n={sum} label={title} />
    </section>
  );
}
