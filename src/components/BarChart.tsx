import { cx } from '../lib/cx';
import s from './BarChart.module.css';

export interface Bar {
  /** 아래 이름 (예: '9월', '9/1~') */
  label: string;
  value: number | null;
  /** 막대 위에 쓸 값 (예: '85%', '3시간'). value 가 null 이면 '—' */
  text?: string;
  /** 진하게 (지금 보는 달) */
  on?: boolean;
}

interface Props {
  bars: Bar[];
  /** 그래프 이름 (화면 읽기용 설명에도 쓴다) */
  title: string;
  /** 세로 최댓값 (없으면 가장 큰 값) */
  max?: number;
  color?: 'green' | 'navy' | 'orange';
}

/** 한 가지 값의 막대그래프 (막대 위에 값, 아래에 이름). 값이 없는 칸은 '—' */
export function BarChart({ bars, title, max, color = 'green' }: Props) {
  const top = max ?? Math.max(1, ...bars.map((b) => b.value ?? 0));
  const desc = bars.map((b) => `${b.label} ${b.value == null ? '없음' : (b.text ?? b.value)}`).join(', ');
  return (
    <figure className={cx(s.chart, s[color])} aria-label={`${title}: ${desc}`} role="img">
      <div className={s.bars} style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
        {bars.map((b, i) => (
          <div key={i} className={cx(s.col, b.on && s.on)} title={`${b.label}: ${b.value == null ? '없음' : (b.text ?? b.value)}`}>
            <span className={s.val}>{b.value == null ? '—' : (b.text ?? b.value)}</span>
            {b.value != null && b.value > 0 && <span className={s.bar} style={{ height: `max(0.25rem, calc((100% - 1.5rem) * ${Math.min(1, b.value / top)}))` }} />}
          </div>
        ))}
      </div>
      <div className={s.labels} style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {bars.map((b, i) => (
          <span key={i} className={cx(s.label, b.on && s.on)}>
            {b.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
