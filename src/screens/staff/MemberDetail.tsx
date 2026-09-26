import { useApp } from '../../AppContext';
import { NutriLine } from '../../components/Nutri';
import { WeekChart } from '../../components/WeekChart';
import type { ReactNode } from 'react';
import { ageOf } from '../../lib/age';
import type { Nutri, PublicMember } from '../../lib/backend';
import { MEALS } from '../../lib/constants';
import { cx } from '../../lib/cx';
import { addDays, md } from '../../lib/date';
import { sumMeals } from '../../lib/nutrition';
import ui from '../../styles/ui.module.css';
import { MemberLessons } from './MemberLessons';
import s from './staff.module.css';

interface LogRow {
  id: string;
  tag: string;
  cls: string;
  main: string;
  sub: string;
  /** 식사: 음식을 골라 기록했으면 영양소 (계산 못 했으면 v=null) */
  nutri?: { v: Nutri | null };
}

interface Props {
  member: PublicMember;
  /** 이름 아래에 넣을 카드 (보호자 화면의 하루 요약) */
  summary?: ReactNode;
  /** 7일 중 마지막 날. 없으면 오늘 */
  end?: string;
  /** 있으면 그래프 막대를 눌러 그 날짜로 이동 */
  onGo?: (date: string) => void;
}

/** 한 이용자의 7일 기록 (읽기 전용). 트레이너·보호자 화면에서 함께 쓴다. */
export function MemberDetail({ member, summary, end: endProp, onGo }: Props) {
  const { data, today } = useApp();
  const end = endProp ?? today;
  const age = ageOf(member, today);
  const count = (pid: string, day?: string) =>
    data.views.filter((v) => v.pid === pid && v.mid === member.id && (!day || v.date === day)).length;
  const progs = data.programs.filter((p) => p.mids.includes(member.id));

  const log = Array.from({ length: 7 }, (_, i) => {
    const ds = addDays(end, -i);
    const rows: LogRow[] = [
      ...data.ex
        .filter((e) => e.mid === member.id && e.date === ds)
        .map((e) => ({
          id: e.id,
          tag: '운동',
          cls: ui.badgeGreen,
          main: `${e.kind} ${e.min}분`,
          sub: [`강도 ${e.level}`, e.memo].filter(Boolean).join(' · '),
        })),
      ...data.meals
        .filter((e) => e.mid === member.id && e.date === ds)
        .sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal))
        .map((e) => ({
          id: e.id,
          tag: e.meal,
          cls: ui.badgeOrange,
          main: e.menu,
          sub: [`양 ${e.amount}`, e.memo].filter(Boolean).join(' · '),
          // 음식을 골라 기록한 식사만 영양소 줄을 보여준다 (예전 기록은 없음)
          nutri: (e.foods?.length ?? 0) > 0 ? { v: e.nutri ?? null } : undefined,
        })),
    ];
    const meals = sumMeals(data.meals.filter((e) => e.mid === member.id && e.date === ds));
    return { ds, label: ds === today ? `${md(ds)} · 오늘` : md(ds), rows, meals };
  }).filter((d) => d.rows.length);

  return (
    <>
      <div className={ui.row}>
        <h2 className={ui.h2}>{member.name} 님</h2>
        {age !== null ? <div className={ui.muted}>{age}세</div> : null}
      </div>
      {summary}
      <WeekChart mid={member.id} end={end} ex={data.ex} meals={data.meals} onGo={onGo} />

      {progs.length > 0 && (
        <section className={ui.card} style={{ padding: '1.125rem 1rem', gap: '0.5rem' }}>
          <h3 className={ui.h3}>운동 영상 따라하기</h3>
          {progs.map((p) => (
            <div key={p.id} className={ui.divided} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', paddingTop: '0.5rem' }}>
              <div className={ui.sectionHead} style={{ minWidth: 0, gap: '0.125rem' }}>
                <span className={s.logMain}>{p.title}</span>
                <span style={{ fontSize: '0.875rem', color: 'var(--ink-3)' }}>
                  오늘 {count(p.id, today)}회
                </span>
              </div>
              <span className={s.countVal} style={{ fontSize: '1.25rem' }}>
                {count(p.id)}회
              </span>
            </div>
          ))}
        </section>
      )}

      <MemberLessons mid={member.id} />

      <h3 className={ui.h3} style={{ fontWeight: 800, paddingTop: '0.25rem' }}>
        날짜별 기록
      </h3>
      {log.length === 0 && (
        <div className={ui.empty}>
          {end === today ? '최근 7일 동안 기록이 없어요.' : `${md(addDays(end, -6))}부터 ${md(end)}까지 기록이 없어요.`}
        </div>
      )}
      {log.map((day) => (
        <section key={day.ds} className={ui.card} style={{ gap: '0.5rem' }}>
          <div style={{ fontSize: '1.0625rem', fontWeight: 800 }}>{day.label}</div>
          {day.rows.map((r) => (
            <div key={r.id} className={s.logRow}>
              <span className={cx(ui.badge, r.cls)} style={{ flex: 'none' }}>
                {r.tag}
              </span>
              <div className={ui.sectionHead} style={{ flex: 1, minWidth: 0, gap: '0.125rem' }}>
                <div className={s.logMain}>{r.main}</div>
                <div className={ui.small}>{r.sub}</div>
                {r.nutri && <NutriLine n={r.nutri.v} />}
              </div>
            </div>
          ))}
          {day.meals.counted > 0 && (
            <div className={cx(ui.divided, ui.sectionHead)} style={{ gap: '0.25rem', paddingTop: '0.5rem' }}>
              <span className={ui.small}>
                하루 영양소{day.meals.counted < day.meals.total ? ` (${day.meals.total}끼 중 ${day.meals.counted}끼 계산)` : ''}
              </span>
              <NutriLine n={day.meals.sum} />
            </div>
          )}
        </section>
      ))}
    </>
  );
}
