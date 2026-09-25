import { useApp } from '../../AppContext';
import { autoMeal, MAIN3, MEALS, WEEK_GOAL } from '../../lib/constants';
import { cx } from '../../lib/cx';
import { mondayOf } from '../../lib/date';
import ui from '../../styles/ui.module.css';
import type { SheetState } from './RecordSheet';
import s from './user.module.css';

interface Props {
  date: string;
  onOpenSheet: (s: SheetState) => void;
  onGoVideo: () => void;
}

export function HomeTab({ date, onOpenSheet, onGoVideo }: Props) {
  const { data, me, today, logout } = useApp();

  const dayEx = data.ex.filter((e) => e.mid === me && e.date === date);
  const dayMeals = data.meals.filter((m) => m.mid === me && m.date === date);
  const dayMin = dayEx.reduce((a, e) => a + e.min, 0);
  const mon = mondayOf(date);
  const weekMin = data.ex.filter((e) => e.mid === me && e.date >= mon && e.date <= date).reduce((a, e) => a + e.min, 0);
  const weekPct = Math.min(100, Math.round((weekMin / WEEK_GOAL) * 100));
  const mainDone = MAIN3.filter((m) => dayMeals.some((x) => x.meal === m)).length;
  const myProgs = data.programs.filter((p) => me && p.mids.includes(me));
  const todayViews = data.views.filter((v) => v.mid === me && v.date === today).length;

  return (
    <>
      <section className={cx(ui.card, s.homeCard)}>
        <div className={ui.row}>
          <h2 className={ui.h3}>운동</h2>
          <div className={ui.small}>{dayEx.length}건</div>
        </div>
        <div className={s.big}>
          <span className={s.bigNum}>{dayMin}</span>
          <span className={s.bigUnit}>분</span>
        </div>
        <div className={ui.sectionHead} style={{ gap: '0.5rem' }}>
          <div
            className={ui.bar}
            role="progressbar"
            aria-label="이번 주 운동 목표"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={weekPct}
          >
            <div className={ui.barFill} style={{ width: `${weekPct}%` }} />
          </div>
          <div style={{ fontSize: '1rem', color: 'var(--ink-2)' }}>
            이번 주 <b>{weekMin}분</b> / 목표 {WEEK_GOAL}분
          </div>
        </div>
        <button type="button" className={cx(ui.btn, ui.green)} onClick={() => onOpenSheet({ kind: 'ex' })}>
          + 운동 기록하기
        </button>
      </section>

      <section className={cx(ui.card, s.homeCard)}>
        <div className={ui.row}>
          <h2 className={ui.h3}>식사</h2>
          <div className={ui.small}>세 끼 중 {mainDone}끼</div>
        </div>
        <div className={ui.grid4}>
          {MEALS.map((m) => {
            const on = dayMeals.some((x) => x.meal === m);
            return (
              <button
                key={m}
                type="button"
                className={s.mealCell}
                data-on={on}
                onClick={() => onOpenSheet({ kind: 'meal', meal: m })}
                aria-label={`${m} ${on ? '기록함' : '기록 없음'}, 누르면 기록하기`}
              >
                <span className={s.mealCellName}>{m}</span>
                <span className={s.mealCellState}>{on ? '기록함' : '—'}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className={cx(ui.btn, ui.orange)} onClick={() => onOpenSheet({ kind: 'meal', meal: autoMeal() })}>
          + 식사 기록하기
        </button>
      </section>

      {myProgs.length > 0 && (
        <button type="button" className={cx(ui.linkCard, s.videoLink)} onClick={onGoVideo}>
          <div className={ui.sectionHead} style={{ flex: 1, minWidth: 0 }}>
            <div className={s.videoLinkTitle}>트레이너 운동 영상</div>
            <div style={{ fontSize: '1rem', color: 'var(--ink-2)' }}>
              {myProgs.length}개 · 오늘 {todayViews}회 따라함
            </div>
          </div>
          <div className={ui.chev} style={{ color: 'var(--navy)' }} aria-hidden="true">
            ›
          </div>
        </button>
      )}

      <button type="button" className={ui.btnGhost} onClick={logout}>
        로그아웃 (다른 번호로 들어가기)
      </button>
    </>
  );
}
