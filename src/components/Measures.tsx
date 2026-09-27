import { useState } from 'react';
import { useApp } from '../AppContext';
import { useConfirm } from '../hooks/useConfirm';
import type { Measure } from '../lib/backend';
import { cx } from '../lib/cx';
import { dayParts, md } from '../lib/date';
import { EMPTY_MEASURE, METRICS, measureLine, parseMeasure, seriesOf, valueText, type MeasureDraft, type MetricKey } from '../lib/measures';
import ui from '../styles/ui.module.css';
import { ConfirmButton } from './ConfirmButton';
import { DateNav } from './DateNav';
import { Sheet } from './Layout';
import s from './Measures.module.css';

/** user = 이용자 본인 (자기가 적은 것만 지움), staff = 트레이너·관리자, view = 보호자 (보기만) */
export type MeasureMode = 'user' | 'staff' | 'view';
type Color = 'green' | 'orange' | 'navy';

const COLOR: Record<MetricKey, string> = { weight: 'var(--green)', bp: 'var(--navy)', glu: 'var(--orange)' };
const BTN: Record<Color, string> = { green: ui.green, orange: ui.orange, navy: ui.navy };
const CHOICE: Record<Color, string | undefined> = { green: undefined, orange: ui.choiceOrange, navy: ui.choiceNavy };
const POINTS = 10;

const byDate = (list: Measure[], mid: string) =>
  list.filter((m) => m.mid === mid).map((m, i) => ({ m, i })).sort((a, b) => a.m.date.localeCompare(b.m.date) || a.i - b.i).map((x) => x.m);

/** 한 이용자의 체중·혈압·혈당: 항목별 최근 값과 변화 그래프, 최근 기록 */
export function MeasureSection({ mid, mode, color = 'green' }: { mid: string; mode: MeasureMode; color?: Color }) {
  const { be, data, setData, userCode, staffToken, toast, fail } = useApp();
  const all = byDate(data.measures, mid);
  const firstWith = METRICS.find((x) => seriesOf(all, x.key).length)?.key ?? 'weight';
  const [picked, setPicked] = useState<MetricKey | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const confirm = useConfirm();
  const key = picked ?? firstWith;
  const metric = METRICS.find((x) => x.key === key)!;
  const series = seriesOf(all, key).slice(-POINTS);
  const recent = [...all].reverse();
  const shownRecent = showAll ? recent.slice(0, 20) : recent.slice(0, 3);

  const canDelete = (m: Measure) => mode === 'staff' || (mode === 'user' && m.by === '');
  const del = (id: string) =>
    confirm.tap('ms' + id, async () => {
      try {
        await (mode === 'user' ? be.userDelMeasure(userCode, id) : be.staffDelMeasure(staffToken, id));
      } catch (e) {
        return fail(e);
      }
      setData((d) => ({ ...d, measures: d.measures.filter((x) => x.id !== id) }));
      toast('삭제했어요');
    });

  return (
    <section className={ui.card} style={{ gap: '0.875rem' }}>
      <div className={s.head}>
        <h3 className={ui.h3}>건강 수치</h3>
        {all.length > 0 && <span className={ui.small}>최근 {md(all[all.length - 1].date)}</span>}
      </div>

      {all.length === 0 ? (
        <div className={ui.muted}>
          {mode === 'view' ? '아직 적은 체중·혈압·혈당이 없어요.' : '체중·혈압·혈당을 적어 두면 변화를 그래프로 볼 수 있어요.'}
        </div>
      ) : (
        <>
          <div className={s.tabs} role="group" aria-label="볼 항목">
            {METRICS.map((x) => (
              <button
                key={x.key}
                type="button"
                className={cx(ui.choice, CHOICE[color], ui.pill)}
                style={{ paddingInline: '0.25rem' }}
                aria-pressed={key === x.key}
                onClick={() => setPicked(x.key)}
              >
                {x.label}
              </button>
            ))}
          </div>
          {series.length === 0 ? (
            <div className={ui.muted}>아직 적은 {metric.label}이 없어요.</div>
          ) : (
            <Trend series={series} metricKey={key} unit={metric.unit} label={metric.label} />
          )}

          <div className={cx(ui.divided, s.list)}>
            <span className={ui.small}>최근 기록</span>
            {shownRecent.map((m) => (
              <div key={m.id} className={s.item}>
                <div className={s.itemTop}>
                  <span className={s.itemDate}>{md(m.date)}</span>
                  {m.by && <span className={ui.small}>{m.by} 입력</span>}
                </div>
                <div className={s.itemValues}>{measureLine(m)}</div>
                {canDelete(m) && <ConfirmButton armed={confirm.pending === 'ms' + m.id} onClick={() => del(m.id)} />}
              </div>
            ))}
            {recent.length > 3 && (
              <button type="button" className={ui.btnSmall} style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                {showAll ? '접기' : `더 보기 (${Math.min(recent.length, 20)}개)`}
              </button>
            )}
          </div>
        </>
      )}

      {mode !== 'view' && (
        <button type="button" className={cx(ui.btn, BTN[color])} onClick={() => setAdding(true)}>
          + 건강 수치 기록하기
        </button>
      )}
      {adding && <MeasureSheet mid={mid} mode={mode} color={color} onClose={() => setAdding(false)} />}
    </section>
  );
}

/** 최근 값 + 처음과 비교 + 꺾은선 그래프 */
function Trend({ series, metricKey, unit, label }: { series: Measure[]; metricKey: MetricKey; unit: string; label: string }) {
  const first = series[0];
  const last = series[series.length - 1];
  const c = COLOR[metricKey];

  let change = '';
  if (series.length > 1) {
    const since = `처음 기록한 ${dayParts(first.date).md}`;
    if (metricKey === 'bp') change = `${since}: ${valueText(first, 'bp')}`;
    else {
      const a = metricKey === 'weight' ? first.weight! : first.glu!;
      const b = metricKey === 'weight' ? last.weight! : last.glu!;
      const diff = Math.round((b - a) * 10) / 10;
      change = diff === 0 ? `${since}과 같아요.` : `${since}보다 ${Math.abs(diff)}${unit} ${diff < 0 ? '줄었어요' : '늘었어요'}.`;
    }
  }

  // 그래프: 가로 300 × 세로 110. 값의 범위에 여유를 두고 그린다
  const lines: { vals: number[]; stroke: string }[] =
    metricKey === 'bp'
      ? [
          { vals: series.map((m) => m.sbp!), stroke: 'var(--navy)' },
          { vals: series.map((m) => m.dbp!), stroke: '#97a3c4' },
        ]
      : [{ vals: series.map((m) => (metricKey === 'weight' ? m.weight! : m.glu!)), stroke: c }];
  const vals = lines.flatMap((l) => l.vals);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.25, metricKey === 'weight' ? 1 : 5);
  const y0 = lo - pad;
  const y1 = hi + pad;
  const W = 300;
  const H = 110;
  const x = (i: number) => (series.length === 1 ? W / 2 : 12 + (i * (W - 24)) / (series.length - 1));
  const y = (v: number) => H - 8 - ((v - y0) / (y1 - y0)) * (H - 16);

  return (
    <>
      <div className={s.latest} style={{ ['--c' as string]: c }}>
        <span className={s.latestNum}>{valueText(last, metricKey)}</span>
        <span className={s.latestUnit}>{unit}</span>
        <span className={ui.small}>· {md(last.date)}</span>
      </div>
      {change && <div className={s.change}>{change}</div>}
      <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`최근 ${series.length}번의 ${label} 변화`}>
        <line x1="0" x2={W} y1={H - 4} y2={H - 4} stroke="var(--divider)" strokeWidth="1.5" />
        {lines.map((l, li) => (
          <g key={li}>
            {series.length > 1 && (
              <polyline
                points={l.vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                fill="none"
                stroke={l.stroke}
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {l.vals.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={i === l.vals.length - 1 ? 6 : 4} fill={i === l.vals.length - 1 ? l.stroke : 'var(--card)'} stroke={l.stroke} strokeWidth="2.5" />
            ))}
          </g>
        ))}
      </svg>
      {series.length > 1 && (
        <div className={s.axis} aria-hidden="true">
          <span>{md(first.date)}</span>
          <span>{md(last.date)}</span>
        </div>
      )}
      {metricKey === 'bp' && (
        <div className={s.legend}>
          <span className={s.legendItem}>
            <span className={s.swatch} />
            높은 값(수축기)
          </span>
          <span className={s.legendItem}>
            <span className={cx(s.swatch, s.swatchLight)} />
            낮은 값(이완기)
          </span>
        </div>
      )}
    </>
  );
}

function MeasureSheet({ mid, mode, color, onClose }: { mid: string; mode: MeasureMode; color: Color; onClose: () => void }) {
  const { be, setData, userCode, staffToken, today, toast, fail } = useApp();
  const [date, setDate] = useState(today);
  const [draft, setDraft] = useState<MeasureDraft>(EMPTY_MEASURE);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k: keyof MeasureDraft, v: string) => {
    setDraft((d) => ({ ...d, [k]: v.replace(/[^0-9.,]/g, '').slice(0, 5) }));
    setError('');
  };

  const save = async () => {
    if (saving) return;
    const r = parseMeasure(draft, date);
    if ('error' in r) return setError(r.error);
    setSaving(true);
    try {
      const m = mode === 'user' ? await be.userAddMeasure(userCode, r.value) : await be.staffAddMeasure(staffToken, mid, r.value);
      setData((d) => ({ ...d, measures: [...d.measures, m] }));
      toast('건강 수치를 저장했어요');
      onClose();
    } catch (e) {
      setSaving(false);
      fail(e);
    }
  };

  const input = (k: keyof MeasureDraft, label: string, placeholder: string, decimal = false) => (
    <input
      className={ui.input}
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={draft[k]}
      onChange={(e) => set(k, e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      autoComplete="off"
    />
  );

  return (
    <Sheet title="건강 수치 기록하기" onClose={onClose}>
      <DateNav date={date} today={today} onChange={setDate} />
      <div className={ui.note}>잰 것만 적으면 돼요.</div>
      <div className={ui.field}>
        <span className={ui.label}>체중</span>
        <div className={s.withUnit}>
          {input('weight', '체중 (kg)', '예: 58.5', true)}
          <span className={s.unitText}>kg</span>
        </div>
      </div>
      <div className={ui.field}>
        <span className={ui.label}>
          혈압 <span className={ui.labelSub}>(mmHg)</span>
        </span>
        <div className={s.bpRow}>
          <label className={ui.field} style={{ gap: '0.375rem' }}>
            <span className={ui.small}>높은 값(수축기)</span>
            {input('sbp', '혈압 높은 값', '예: 130')}
          </label>
          <span className={s.slash} aria-hidden="true">
            /
          </span>
          <label className={ui.field} style={{ gap: '0.375rem' }}>
            <span className={ui.small}>낮은 값(이완기)</span>
            {input('dbp', '혈압 낮은 값', '예: 80')}
          </label>
        </div>
      </div>
      <div className={ui.field}>
        <span className={ui.label}>혈당</span>
        <div className={s.withUnit}>
          {input('glu', '혈당 (mg/dL)', '예: 110')}
          <span className={s.unitText}>mg/dL</span>
        </div>
      </div>
      {error && (
        <div role="alert" className={ui.error}>
          {error}
        </div>
      )}
      <button type="button" className={cx(ui.btn, ui.btnSave, BTN[color])} disabled={saving} onClick={() => void save()}>
        {saving ? '저장하는 중…' : '저장하기'}
      </button>
    </Sheet>
  );
}
