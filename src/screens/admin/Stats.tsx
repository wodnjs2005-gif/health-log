import { useMemo, useState } from 'react';
import { useApp } from '../../AppContext';
import { BarChart } from '../../components/BarChart';
import { Sheet } from '../../components/Layout';
import { cx } from '../../lib/cx';
import { md } from '../../lib/date';
import { addMonths, groupAttendance, hm, lessonRate, monthName, monthRange, orgMonth, pct, ymLabel, ymOf } from '../../lib/monthly';
import { trainerTitle } from '../../lib/rank';
import ui from '../../styles/ui.module.css';
import s from './admin.module.css';

const TREND = 6;

/** 이용자 관리 맨 위: 이번 달 요약 한 줄. 누르면 통계 창 */
export function StatsCard() {
  const { data, today } = useApp();
  const [open, setOpen] = useState(false);
  const m = useMemo(() => orgMonth(data, ymOf(today), today), [data, today]);
  const att = pct(m.att.present, m.att.total);
  if (!data.members.length) return null;
  return (
    <>
      <button type="button" className={cx(ui.card, s.statsCard)} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className={s.statsCardHead}>
          <span className={s.statsCardTitle}>{monthName(ymOf(today))} 통계</span>
          <span className={ui.chev} aria-hidden="true">
            ›
          </span>
        </span>
        <span className={s.statsCardRow}>
          <span>
            기록한 이용자 <b>{m.active}</b>/{m.members}명
          </span>
          <span>
            출석률 <b>{att === null ? '—' : `${att}%`}</b>
          </span>
          <span>
            운동 <b>{hm(m.exMin)}</b>
          </span>
        </span>
      </button>
      {open && <StatsSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** 관리자 통계: 달마다 기록·출석·운동, 6개월 흐름, 수업별·트레이너별, 기록이 없는 분 */
function StatsSheet({ onClose }: { onClose: () => void }) {
  const { data, today, trainers } = useApp();
  const thisYm = ymOf(today);
  const [ym, setYm] = useState(thisYm);
  const m = useMemo(() => orgMonth(data, ym, today), [data, ym, today]);
  const { from, to } = monthRange(ym, today);
  const trend = useMemo(
    () => Array.from({ length: TREND }, (_, i) => addMonths(ym, i - TREND + 1)).map((y) => ({ ym: y, ...orgMonth(data, y, today) })),
    [data, ym, today],
  );
  const att = pct(m.att.present, m.att.total);

  const lessons = data.lessons
    .map((l) => {
      const r = l.roster.reduce(
        (a, x) => {
          if (!data.members.some((mm) => mm.id === x.mid)) return a;
          const v = lessonRate(l, x.mid, data, from, to);
          return { present: a.present + v.present, total: a.total + v.total };
        },
        { present: 0, total: 0 },
      );
      return { id: l.id, name: l.name, people: l.roster.filter((x) => data.members.some((mm) => mm.id === x.mid)).length, ...r };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const groups = [
    ...trainers.map((t) => ({ id: t.id, name: trainerTitle(t.name, t.rank), mids: data.members.filter((mm) => data.assign[mm.id] === t.id).map((mm) => mm.id) })),
    { id: '-', name: '담당 없음', mids: data.members.filter((mm) => !trainers.some((t) => t.id === data.assign[mm.id])).map((mm) => mm.id) },
  ].filter((g) => g.mids.length > 0);

  const quiet = data.members.filter((mm) => !m.activeSet.has(mm.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const kinds = [...data.ex.filter((e) => e.date >= from && e.date <= to).reduce((a, e) => a.set(e.kind, (a.get(e.kind) ?? 0) + e.min), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);

  return (
    <Sheet title="통계" onClose={onClose}>
      <div className={s.statsMonth}>
        <button type="button" className={cx(ui.btnSmall, s.statsNav)} aria-label="지난달" onClick={() => setYm(addMonths(ym, -1))}>
          ‹
        </button>
        <span className={s.statsMonthLabel} aria-live="polite">
          {ymLabel(ym)}
          <span className={ui.small}>
            {' '}
            {md(from).replace(/ \(.\)$/, '')} ~ {md(to).replace(/ \(.\)$/, '')}
            {m.partial && ' (진행 중)'}
          </span>
        </span>
        <button type="button" className={cx(ui.btnSmall, s.statsNav)} aria-label="다음 달" disabled={ym >= thisYm} onClick={() => setYm(addMonths(ym, 1))}>
          ›
        </button>
      </div>

      <div className={s.statsTiles}>
        <Tile label="기록한 이용자" value={`${m.active} / ${m.members}명`} sub={`${pct(m.active, m.members) ?? 0}% · 운동이나 식사를 1번 이상`} />
        <Tile label="수업 출석률" value={att === null ? '—' : `${att}%`} sub={m.att.total ? `${m.att.total}번 중 ${m.att.present}번` : '수업일 없음'} />
        <Tile label="운동 시간 합계" value={hm(m.exMin)} sub={m.exMembers ? `운동한 분 1인 평균 ${hm(Math.round(m.exMin / m.exMembers))}` : '운동 기록 없음'} />
        <Tile label="영상 따라 하기" value={`${m.views}번`} sub="이용자가 운동 영상을 본 횟수" />
      </div>

      <section className={s.statsSection}>
        <h3 className={s.statsH3}>최근 {TREND}개월 출석률</h3>
        <BarChart
          title="월별 수업 출석률"
          color="navy"
          max={100}
          bars={trend.map((t) => {
            const v = pct(t.att.present, t.att.total);
            return { label: monthName(t.ym), value: v, text: v === null ? undefined : `${v}%`, on: t.ym === ym };
          })}
        />
      </section>
      <section className={s.statsSection}>
        <h3 className={s.statsH3}>최근 {TREND}개월 기록한 이용자</h3>
        <BarChart
          title="월별 기록한 이용자 비율"
          color="navy"
          max={100}
          bars={trend.map((t) => {
            const v = t.members ? pct(t.active, t.members) : null;
            return { label: monthName(t.ym), value: v, text: v === null ? undefined : `${v}%`, on: t.ym === ym };
          })}
        />
        <div className={ui.small}>지금 등록된 이용자 중 그달에 운동이나 식사를 기록한 분의 비율이에요.</div>
      </section>
      <section className={s.statsSection}>
        <h3 className={s.statsH3}>최근 {TREND}개월 운동 시간 합계</h3>
        <BarChart
          title="월별 운동 시간 합계"
          color="navy"
          bars={trend.map((t) => ({ label: monthName(t.ym), value: Math.round(t.exMin / 6) / 10, text: `${Math.round(t.exMin / 6) / 10}h`, on: t.ym === ym }))}
        />
        <div className={ui.small}>h = 시간</div>
      </section>

      {lessons.length > 0 && (
        <section className={s.statsSection}>
          <h3 className={s.statsH3}>수업별 출석 ({monthName(ym)})</h3>
          <Table
            head={['수업', '대상', '출석률']}
            rows={lessons.map((l) => [l.name, `${l.people}명`, `${pct(l.present, l.total)}% (${l.present}/${l.total})`])}
          />
        </section>
      )}

      {groups.length > 0 && (
        <section className={s.statsSection}>
          <h3 className={s.statsH3}>트레이너별 ({monthName(ym)})</h3>
          <Table
            head={['담당', '기록한 분', '출석률']}
            rows={groups.map((g) => {
              const a = groupAttendance(data, g.mids, from, to);
              const act = g.mids.filter((id) => m.activeSet.has(id)).length;
              const r = pct(a.present, a.total);
              return [`${g.name} (${g.mids.length}명)`, `${act}명 (${pct(act, g.mids.length)}%)`, r === null ? '—' : `${r}%`];
            })}
          />
        </section>
      )}

      {kinds.length > 0 && (
        <section className={s.statsSection}>
          <h3 className={s.statsH3}>운동 종류 ({monthName(ym)})</h3>
          <Table head={['종류', '시간']} rows={kinds.map(([k, v]) => [k, hm(v)])} />
        </section>
      )}

      <section className={s.statsSection}>
        <h3 className={s.statsH3}>
          {monthName(ym)}에 기록이 없는 분 <span className={ui.muted}>{quiet.length}명</span>
        </h3>
        {quiet.length === 0 ? (
          <div className={ui.small}>모든 분이 기록을 남겼어요.</div>
        ) : (
          <div className={s.statsNames}>
            {quiet.map((mm) => (
              <span key={mm.id} className={s.statsName}>
                {mm.name}
              </span>
            ))}
          </div>
        )}
      </section>
    </Sheet>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={s.statsTile}>
      <span className={s.statsTileLabel}>{label}</span>
      <span className={s.statsTileValue}>{value}</span>
      <span className={s.statsTileSub}>{sub}</span>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <table className={s.statsTable}>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
