import { addDays, dayParts, longLabel } from '../lib/date';
import s from './DateNav.module.css';

interface Props {
  date: string;
  today: string;
  /** 오늘보다 뒤의 날짜는 오늘로 맞춰서 넘긴다 */
  onChange: (date: string) => void;
}

/** ‹ 9월 25일 목요일 [오늘] ›  — 가운데를 누르면 오늘로 */
export function DateNav({ date, today, onChange }: Props) {
  const isToday = date >= today;
  const move = (d: string) => onChange(d > today ? today : d);
  const p = dayParts(date);

  return (
    <div className={s.dateRow}>
      <button type="button" className={s.dayArrow} aria-label="전날" onClick={() => move(addDays(date, -1))}>
        ‹
      </button>
      <button type="button" className={s.dateBtn} onClick={() => move(today)} aria-label={`${longLabel(date)}, 누르면 오늘로`}>
        {/* 좁은 화면에서 '9월 25일 / 목요일 오늘' 처럼 단어 단위로 줄이 바뀌게 따로 둔다 */}
        <span>{p.md}</span>
        <span className={s.dateWd}>
          {p.wd}
          {isToday && <span className={s.todayBadge}>오늘</span>}
        </span>
      </button>
      <button type="button" className={s.dayArrow} aria-label="다음날" disabled={isToday} onClick={() => move(addDays(date, 1))}>
        ›
      </button>
    </div>
  );
}
