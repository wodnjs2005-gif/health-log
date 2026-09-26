import type { Nutri } from '../lib/backend';
import { fmt, NUTRI_KEYS, NUTRI_LABEL } from '../lib/nutrition';
import s from './Nutri.module.css';

/** 칼로리·탄수화물·단백질·지방·나트륨 다섯 칸 */
export function NutriGrid({ n, label }: { n: Nutri; label?: string }) {
  return (
    <div className={s.grid} role="group" aria-label={label ?? '영양소'}>
      {NUTRI_KEYS.map((k) => (
        <div key={k} className={s.cell}>
          <span className={s.cellLabel}>{NUTRI_LABEL[k]}</span>
          <span className={s.cellValue}>{fmt(k, n[k])}</span>
        </div>
      ))}
    </div>
  );
}

/** 한 줄: 520kcal · 탄수화물 80g · 단백질 20g · 지방 12g · 나트륨 1,200mg */
export function NutriLine({ n }: { n: Nutri | null | undefined }) {
  if (!n) return <span className={s.none}>영양 정보 없음</span>;
  return (
    <span className={s.line}>
      <span className={s.lineKcal}>{fmt('kcal', n.kcal)}</span>
      {NUTRI_KEYS.filter((k) => k !== 'kcal').map((k) => (
        <span key={k}>
          {NUTRI_LABEL[k]} {fmt(k, n[k])}
        </span>
      ))}
    </span>
  );
}
