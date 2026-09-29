import { useApp } from '../../AppContext';
import { InstallCard } from '../../components/InstallCard';
import { NoteCard } from '../../components/Notes';
import { PushButton, PushCard } from '../../components/Push';
import { NoticeList } from '../../components/Notices';
import { NutriLine } from '../../components/Nutri';
import { WeekGoal } from '../../components/WeekGoal';
import { autoMeal, MAIN3, MEALS } from '../../lib/constants';
import { cx } from '../../lib/cx';
import { md, mondayOf } from '../../lib/date';
import { sumMeals } from '../../lib/nutrition';
import ui from '../../styles/ui.module.css';
import { MemberLessons } from '../staff/MemberLessons';
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
  const isToday = date === today;
  const mainDone = MAIN3.filter((m) => dayMeals.some((x) => x.meal === m)).length;
  const myProgs = data.programs.filter((p) => me && p.mids.includes(me));
  const todayViews = data.views.filter((v) => v.mid === me && v.date === today).length;

  return (
    <>
      {isToday && <NoticeList notices={data.notices} today={today} />}
      {isToday && me && <NoteCard mid={me} mode="user" />}
      {isToday && <PushCard role="user" />}

      <section className={cx(ui.card, s.homeCard)}>
        <div className={ui.row}>
          <h2 className={ui.h3}>운동</h2>
          <div className={ui.small}>{dayEx.length}건</div>
        </div>
        <div className={s.big}>
          <span className={s.bigLabel}>{isToday ? '오늘' : md(date)}</span>
          <span className={s.bigNum}>{dayMin}</span>
          <span className={s.bigUnit}>분</span>
        </div>
        <WeekGoal min={weekMin} thisWeek={mon === mondayOf(today)} />
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
                <span className={s.mealCellState}>{on ? '✓ 기록' : '—'}</span>
              </button>
            );
          })}
        </div>
        {sumMeals(dayMeals).counted > 0 && (
          <div className={ui.sectionHead} style={{ gap: '0.25rem' }}>
            <span className={ui.small}>{date === today ? '오늘' : '이 날'} 먹은 영양소</span>
            <NutriLine n={sumMeals(dayMeals).sum} />
          </div>
        )}
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

      {me && <MemberLessons mid={me} />}

      <InstallCard />
      <PushButton role="user" />

      <button type="button" className={ui.btnGhost} onClick={logout}>
        로그아웃 (다른 번호로 들어가기)
      </button>
    </>
  );
}
