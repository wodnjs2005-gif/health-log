import type { Exercise, Meal } from '../lib/backend';
import { MAIN3 } from '../lib/constants';
import { cx } from '../lib/cx';
import { addDays, parseYmd, WD } from '../lib/date';
import ui from '../styles/ui.module.css';
import s from './WeekChart.module.css';

interface Props {
  mid: string;
  /** 마지막 날(선택한 날). 이 날이 진한 초록으로 표시된다 */
  end: string;
  ex: Exercise[];
  meals: Meal[];
  /** 있으면 막대·줄을 눌러 그 날짜로 이동 */
  onGo?: (date: string) => void;
}

/** 최근 7일 운동 막대그래프 + 날짜별 아침·점심·저녁 기록 여부 */
export function WeekChart({ mid, end, ex, meals, onGo }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
  const mins = days.map((ds) => ex.filter((e) => e.mid === mid && e.date === ds).reduce((a, e) => a + e.min, 0));
  const max = Math.max(30, ...mins);
  const total = mins.reduce((a, b) => a + b, 0);

  const items = days.map((ds, i) => {
    const d = parseYmd(ds);
    return {
      ds,
      sel: ds === end,
      min: mins[i],
      h: Math.round((mins[i] / max) * 80),
      wd: WD[d.getDay()],
      day: d.getDate(),
      short: `${d.getMonth() + 1}/${d.getDate()} (${WD[d.getDay()]})`,
      meals: MAIN3.map((m) => ({ name: m, on: meals.some((x) => x.mid === mid && x.date === ds && x.meal === m) })),
    };
  });

  const Col = onGo ? 'button' : 'div';

  return (
    <>
      <section className={s.card}>
        <div className={ui.row}>
          <div className={ui.h3}>최근 7일 운동 시간</div>
          <div style={{ fontSize: '1rem', color: 'var(--ink-2)' }}>
            합계 <b className={ui.num}>{total}분</b>
          </div>
        </div>
        <div className={s.bars}>
          {items.map((d) => (
            <Col
              key={d.ds}
              {...(onGo ? { type: 'button' as const, onClick: () => onGo(d.ds), 'aria-label': `${d.short} ${d.min}분` } : {})}
              className={cx(s.col, d.sel && s.sel)}
            >
              <span className={s.minLabel}>{d.min || ''}</span>
              <div className={s.barPiece} style={{ height: `${d.h}%` }} />
            </Col>
          ))}
        </div>
        <div className={s.days} aria-hidden="true">
          {items.map((d) => (
            <div key={d.ds} className={cx(s.day, d.sel && s.sel)}>
              <span className={s.wd}>{d.wd}</span>
              <span className={s.dnum}>{d.day}</span>
            </div>
          ))}
        </div>
      </section>
      <section className={cx(s.card, s.mealCard)}>
        <div className={ui.h3}>식사 기록 (아침·점심·저녁)</div>
        {items.map((d) => (
          <Col
            key={d.ds}
            {...(onGo ? { type: 'button' as const, onClick: () => onGo(d.ds) } : {})}
            className={s.mealRow}
          >
            <span className={s.mealDate}>{d.short}</span>
            <div className={s.mealDots}>
              {d.meals.map((m) => (
                <span key={m.name} className={s.dot} data-on={m.on} aria-label={`${m.name} ${m.on ? '기록함' : '없음'}`}>
                  {m.name}
                </span>
              ))}
            </div>
          </Col>
        ))}
      </section>
    </>
  );
}
