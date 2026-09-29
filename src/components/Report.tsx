import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../AppContext';
import { useBack } from '../hooks/useBack';
import { MAIN3 } from '../lib/constants';
import { cx } from '../lib/cx';
import { addDays, md, parseYmd } from '../lib/date';
import { addMonths, hm, memberMonth, monthName, pct, ymLabel, ymOf } from '../lib/monthly';
import { WEEK_GOAL } from '../lib/constants';
import { BarChart } from './BarChart';
import s from './Report.module.css';

type Tone = 'green' | 'orange' | 'navy' | 'plum';

interface Props {
  mid: string;
  onClose: () => void;
  /** 화면 색 (이용자=초록, 트레이너=주황, 관리자=남색, 보호자=보라) */
  tone?: Tone;
}

/** 한 이용자의 한 달 건강 리포트 (보고 · 인쇄 · PDF 저장). 이용자·보호자·트레이너·관리자 화면에서 함께 쓴다 */
export function MonthlyReport({ mid, onClose, tone = 'green' }: Props) {
  const { data, today } = useApp();
  const member = data.members.find((m) => m.id === mid);
  const [ym, setYm] = useState(() => ymOf(today));
  useBack(true, onClose);

  // 기록이 처음 생긴 달부터 이번 달까지
  const firstYm = useMemo(() => {
    const dates = [
      ...data.ex.filter((x) => x.mid === mid).map((x) => x.date),
      ...data.meals.filter((x) => x.mid === mid).map((x) => x.date),
      ...data.attendance.filter((x) => x.mid === mid).map((x) => x.date),
      ...data.measures.filter((x) => x.mid === mid).map((x) => x.date),
      ...data.notes.filter((x) => x.mid === mid).map((x) => x.date),
    ];
    return dates.length ? ymOf(dates.reduce((a, b) => (a < b ? a : b))) : ymOf(today);
  }, [data, mid, today]);
  const thisYm = ymOf(today);
  const r = useMemo(() => memberMonth(data, mid, ym, today), [data, mid, ym, today]);

  // 인쇄할 때는 앱 화면을 숨기고 리포트만
  useEffect(() => {
    document.body.classList.add('hl-report-open');
    return () => document.body.classList.remove('hl-report-open');
  }, []);

  if (!member) return null;
  const mon = monthName(ym);
  const attRate = pct(r.att.present, r.att.total);
  const hasMeasures = r.measures.weight || r.measures.bp || r.measures.glu;

  // 한 줄 요약 (보호자·어르신이 읽기 쉽게)
  const summary = [
    r.exDays.size ? `${mon}에 ${r.exDays.size}일 운동해서 모두 ${hm(r.exMin)} 움직였어요.` : `${mon}에는 운동 기록이 없어요.`,
    r.att.total ? `수업은 ${r.att.total}번 중 ${r.att.present}번 나왔어요.` : '',
    r.mainSlots ? `식사는 ${r.mainSlots}끼 기록했어요.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div className={cx(s.overlay, s[tone])} role="dialog" aria-modal="true" aria-label={`${member.name} 님 ${ymLabel(ym)} 리포트`}>
      <div className={s.bar}>
        <button type="button" className={s.close} onClick={onClose}>
          ‹ 닫기
        </button>
        <div className={s.month}>
          <button type="button" className={s.nav} aria-label="지난달" disabled={ym <= firstYm} onClick={() => setYm(addMonths(ym, -1))}>
            ‹
          </button>
          <span className={s.monthLabel} aria-live="polite">
            {ymLabel(ym)}
          </span>
          <button type="button" className={s.nav} aria-label="다음 달" disabled={ym >= thisYm} onClick={() => setYm(addMonths(ym, 1))}>
            ›
          </button>
        </div>
        <button type="button" className={s.print} onClick={() => window.print()}>
          인쇄 · PDF
        </button>
      </div>

      <article className={s.paper}>
        <header className={s.head}>
          <div className={s.brand}>맞춤 건강관리 · 월간 리포트</div>
          <h1 className={s.title}>
            {member.name} 님의 {ymLabel(ym)}
          </h1>
          <div className={s.range}>
            {md(r.from)} ~ {md(r.to)}
            {r.partial && ' (진행 중)'}
          </div>
          <p className={s.summary}>{summary}</p>
        </header>

        <div className={s.tiles}>
          <Tile label="운동 시간" value={hm(r.exMin)} sub={`${r.exDays.size}일 운동`} />
          <Tile label="주 150분 목표" value={r.fullWeeks ? `${r.goalWeeks} / ${r.fullWeeks}주` : '—'} sub="달성한 주" />
          <Tile label="식사 기록" value={`${r.mainSlots}끼`} sub={`아침·점심·저녁 ${r.mainPossible}끼 중`} />
          <Tile label="수업 출석" value={attRate === null ? '—' : `${attRate}%`} sub={r.att.total ? `${r.att.total}번 중 ${r.att.present}번` : '수업 없음'} />
        </div>

        <section className={s.section}>
          <h2 className={s.h2}>주별 운동 시간</h2>
          <BarChart
            title="주별 운동 시간"
            color={tone === 'navy' ? 'navy' : tone === 'orange' ? 'orange' : 'green'}
            max={Math.max(WEEK_GOAL, ...r.weeks.map((w) => w.min))}
            bars={r.weeks.map((w) => {
              const d = parseYmd(w.start);
              return { label: `${d.getMonth() + 1}/${d.getDate()}~`, value: w.min, text: `${w.min}분`, on: w.min >= WEEK_GOAL };
            })}
          />
          <div className={s.note}>진한 막대는 주 {WEEK_GOAL}분 목표를 채운 주예요.</div>
          {r.kinds.length > 0 && (
            <div className={s.kinds}>
              {r.kinds.map((k) => (
                <span key={k.kind} className={s.kind}>
                  {k.kind} <b>{hm(k.min)}</b>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className={s.section}>
          <h2 className={s.h2}>달력</h2>
          <Calendar ym={ym} mid={mid} to={r.to} />
          <div className={s.legend}>
            <span>
              <i className={s.legendEx} /> 운동한 날 (분)
            </span>
            <span>
              <i className={s.legendMeal} /> 기록한 끼니
            </span>
          </div>
        </section>

        <section className={s.section}>
          <h2 className={s.h2}>식사</h2>
          <Rows
            rows={[
              ['아침·점심·저녁 기록', `${r.mainSlots}끼 / ${r.mainPossible}끼`],
              ['간식 기록', `${r.snacks}번`],
              ['식사를 기록한 날', `${r.mealDays.size}일 / ${r.dayCount}일`],
              ...(r.kcalAvg !== null ? ([['하루 평균 열량 (음식을 골라 기록한 날)', `${r.kcalAvg.toLocaleString()}kcal`]] as [string, string][]) : []),
            ]}
          />
        </section>

        {r.lessons.length > 0 && (
          <section className={s.section}>
            <h2 className={s.h2}>수업 출석</h2>
            <Rows rows={r.lessons.map((l) => [l.name, `${l.present} / ${l.total}번 (${pct(l.present, l.total)}%)`] as [string, string])} />
          </section>
        )}

        {hasMeasures && (
          <section className={s.section}>
            <h2 className={s.h2}>건강 수치</h2>
            <Rows
              rows={[
                ...(r.measures.weight ? ([['체중', change(r.measures.weight.first, r.measures.weight.last, 'kg', r.measures.weight.n)]] as [string, string][]) : []),
                ...(r.measures.bp ? ([['혈압', change(r.measures.bp.first, r.measures.bp.last, 'mmHg', r.measures.bp.n)]] as [string, string][]) : []),
                ...(r.measures.glu ? ([['혈당', change(r.measures.glu.first, r.measures.glu.last, 'mg/dL', r.measures.glu.n)]] as [string, string][]) : []),
              ]}
            />
          </section>
        )}

        {r.tests.length > 0 && (
          <section className={s.section}>
            <h2 className={s.h2}>체력 측정</h2>
            <Rows
              rows={r.tests.map(
                (t) =>
                  [
                    t.name,
                    `${t.before !== null ? `${t.before} → ` : ''}${t.now}${t.unit}${t.trend === 'better' ? ' · 좋아졌어요' : t.trend === 'worse' ? ' · 낮아졌어요' : t.trend === 'same' ? ' · 그대로' : ''}`,
                  ] as [string, string],
              )}
            />
          </section>
        )}

        {r.views > 0 && (
          <section className={s.section}>
            <h2 className={s.h2}>운동 영상</h2>
            <Rows rows={[['영상 따라 하기', `${r.views}번`]]} />
          </section>
        )}

        {r.notes.length > 0 && (
          <section className={s.section}>
            <h2 className={s.h2}>트레이너 한마디</h2>
            <ul className={s.notes}>
              {r.notes.map((n) => (
                <li key={n.id} className={s.noteItem}>
                  <span className={s.noteMeta}>
                    {md(n.date)} · {n.by || '트레이너'}
                  </span>
                  <span>{n.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className={s.foot}>{md(today)} 만든 리포트 · 맞춤 건강관리</footer>
      </article>
    </div>,
    document.body,
  );
}

const change = (first: number | string, last: number | string, unit: string, n: number) =>
  n > 1 && first !== last ? `${first} → ${last} ${unit} (${n}번 적음)` : `${last} ${unit}${n > 1 ? ` (${n}번 적음)` : ''}`;

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={s.tile}>
      <span className={s.tileLabel}>{label}</span>
      <span className={s.tileValue}>{value}</span>
      <span className={s.tileSub}>{sub}</span>
    </div>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className={s.rows}>
      {rows.map(([k, v]) => (
        <div key={k} className={s.row}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 그달 달력: 운동한 날은 칠하고 분을, 아침·점심·저녁 기록은 점으로 */
function Calendar({ ym, mid, to }: { ym: string; mid: string; to: string }) {
  const { data } = useApp();
  const first = ym + '-01';
  const lead = parseYmd(first).getDay();
  const days: string[] = [];
  for (let d = first; d.startsWith(ym); d = addDays(d, 1)) days.push(d);
  const exMin = new Map<string, number>();
  data.ex.filter((e) => e.mid === mid && e.date.startsWith(ym)).forEach((e) => exMin.set(e.date, (exMin.get(e.date) ?? 0) + e.min));
  const meals = new Map<string, number>();
  const seen = new Set<string>();
  data.meals
    .filter((e) => e.mid === mid && e.date.startsWith(ym) && MAIN3.includes(e.meal))
    .forEach((e) => {
      if (seen.has(e.date + e.meal)) return;
      seen.add(e.date + e.meal);
      meals.set(e.date, (meals.get(e.date) ?? 0) + 1);
    });
  return (
    <div className={s.cal} role="table" aria-label="달력">
      <div className={s.calRow} role="row">
        {WEEK.map((w, i) => (
          <span key={w} role="columnheader" className={cx(s.calHead, i === 0 && s.sun)}>
            {w}
          </span>
        ))}
      </div>
      <div className={s.calGrid} role="rowgroup">
        {Array.from({ length: lead }, (_, i) => (
          <span key={'x' + i} className={s.calEmpty} />
        ))}
        {days.map((d) => {
          const m = exMin.get(d) ?? 0;
          const ml = meals.get(d) ?? 0;
          const later = d > to;
          return (
            <span
              key={d}
              role="cell"
              className={cx(s.calDay, m > 0 && s.calEx, later && s.calLater)}
              aria-label={`${Number(d.slice(8))}일${m ? ` 운동 ${m}분` : ''}${ml ? ` 식사 ${ml}끼` : ''}`}
            >
              <span className={s.calNum}>{Number(d.slice(8))}</span>
              {m > 0 && <span className={s.calMin}>{m}</span>}
              {ml > 0 && (
                <span className={s.calDots} aria-hidden="true">
                  {'●'.repeat(ml)}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
