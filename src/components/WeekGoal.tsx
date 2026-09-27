import { WEEK_GOAL } from '../lib/constants';
import ui from '../styles/ui.module.css';
import s from './WeekGoal.module.css';

/**
 * 그 주 운동 목표: 「이번 주 105분 / 150분」 막대 + 「목표까지 45분 남았어요」.
 * 오늘 운동한 분(큰 숫자)과 헷갈리지 않게 옅은 상자에 따로 둔다.
 */
export function WeekGoal({ min, thisWeek }: { min: number; thisWeek: boolean }) {
  const pct = Math.min(100, Math.round((min / WEEK_GOAL) * 100));
  const left = WEEK_GOAL - min;
  const label = thisWeek ? '이번 주' : '그 주';
  return (
    <div className={s.box}>
      <div className={s.head}>
        <span className={s.label}>{label} 운동</span>
        <span className={s.value}>
          <b>{min}분</b> / 목표 {WEEK_GOAL}분
        </span>
      </div>
      <div className={ui.bar} role="progressbar" aria-label={`${label} 운동 목표`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={ui.barFill} style={{ width: `${pct}%` }} />
      </div>
      <div className={s.msg} data-done={left <= 0}>
        {left <= 0 ? `${label} 목표를 채웠어요! 잘하셨어요.` : thisWeek ? `목표까지 ${left}분 남았어요.` : `목표까지 ${left}분 모자랐어요.`}
      </div>
    </div>
  );
}
