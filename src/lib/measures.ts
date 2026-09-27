// 건강 수치 (체중·혈압·혈당): 입력 검사와 보여주기. 범위는 서버 _check_measure 와 같다.
import type { Measure, NewMeasure } from './backend';
import { addDays } from './date';

export const LIMITS = { weight: [20, 300], sbp: [50, 300], dbp: [30, 200], glu: [20, 800] } as const;

export type MetricKey = 'weight' | 'bp' | 'glu';
export const METRICS: { key: MetricKey; label: string; unit: string }[] = [
  { key: 'weight', label: '체중', unit: 'kg' },
  { key: 'bp', label: '혈압', unit: 'mmHg' },
  { key: 'glu', label: '혈당', unit: 'mg/dL' },
];

/** 입력칸 글자 → 숫자 (비어 있으면 null, 숫자가 아니면 NaN) */
const num = (s: string) => {
  const t = s.trim().replace(',', '.');
  return t === '' ? null : Number(t);
};

export interface MeasureDraft {
  weight: string;
  sbp: string;
  dbp: string;
  glu: string;
}
export const EMPTY_MEASURE: MeasureDraft = { weight: '', sbp: '', dbp: '', glu: '' };

const inRange = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

/** 입력 → 저장할 값, 또는 이용자에게 보여줄 오류 문구 */
export function parseMeasure(d: MeasureDraft, date: string): { value: NewMeasure } | { error: string } {
  const weight = num(d.weight);
  const sbp = num(d.sbp);
  const dbp = num(d.dbp);
  const glu = num(d.glu);
  if (weight === null && sbp === null && dbp === null && glu === null) return { error: '체중·혈압·혈당 중 하나 이상 입력해주세요.' };
  if (weight !== null && !(Number.isFinite(weight) && inRange(weight, LIMITS.weight))) return { error: '체중을 다시 확인해주세요. (예: 58.5)' };
  if ((sbp === null) !== (dbp === null)) return { error: '혈압은 높은 값과 낮은 값을 모두 입력해주세요.' };
  if (sbp !== null && dbp !== null) {
    const ok = Number.isInteger(sbp) && Number.isInteger(dbp) && inRange(sbp, LIMITS.sbp) && inRange(dbp, LIMITS.dbp) && dbp < sbp;
    if (!ok) return { error: '혈압을 다시 확인해주세요. (예: 높은 값 130, 낮은 값 80)' };
  }
  if (glu !== null && !(Number.isInteger(glu) && inRange(glu, LIMITS.glu))) return { error: '혈당을 다시 확인해주세요. (예: 110)' };
  return { value: { date, weight: weight === null ? null : Math.round(weight * 10) / 10, sbp, dbp, glu } };
}

/** 서버와 같은 검사 (개발용 가짜 서버에서 쓴다) */
export function validMeasure(m: NewMeasure, today: string) {
  if (!m.date || m.date > today || m.date < addDays(today, -3650)) return false;
  if (m.weight === null && m.sbp === null && m.dbp === null && m.glu === null) return false;
  if (m.weight !== null && !inRange(m.weight, LIMITS.weight)) return false;
  if ((m.sbp === null) !== (m.dbp === null)) return false;
  if (m.sbp !== null && m.dbp !== null && !(inRange(m.sbp, LIMITS.sbp) && inRange(m.dbp, LIMITS.dbp) && m.dbp < m.sbp)) return false;
  if (m.glu !== null && !inRange(m.glu, LIMITS.glu)) return false;
  return true;
}

/** 그 항목이 들어 있는 기록만, 날짜순 */
export const seriesOf = (list: Measure[], key: MetricKey) =>
  list
    .filter((m) => (key === 'bp' ? m.sbp !== null : m[key] !== null))
    .sort((a, b) => a.date.localeCompare(b.date));

/** '58.5kg', '130/80', '110' */
export const valueText = (m: Measure, key: MetricKey) =>
  key === 'weight' ? `${m.weight}` : key === 'bp' ? `${m.sbp}/${m.dbp}` : `${m.glu}`;

/** 한 기록에 적은 것들: '체중 58.5kg · 혈압 130/80 · 혈당 110' */
export const measureLine = (m: Measure) =>
  METRICS.filter((x) => (x.key === 'bp' ? m.sbp !== null : m[x.key] !== null))
    .map((x) => `${x.label} ${valueText(m, x.key)}${x.key === 'weight' ? 'kg' : ''}`)
    .join(' · ');
