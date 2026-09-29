import { cx } from '../../lib/cx';
import s from './staff.module.css';

interface Props {
  tile: boolean;
  onChange: (tile: boolean) => void;
  /** 트레이너=주황, 관리자=남색 */
  color?: 'orange' | 'navy';
}

/** 목록 / 격자 보기 버튼 (아이콘만) */
export function ViewToggle({ tile, onChange, color = 'orange' }: Props) {
  return (
    <div className={cx(s.viewSwitch, color === 'navy' && s.viewSwitchNavy)} role="group" aria-label="보기 방식">
      <button type="button" className={s.viewBtn} aria-pressed={!tile} aria-label="목록으로 보기" title="목록" onClick={() => onChange(false)}>
        <ViewIcon tile={false} />
      </button>
      <button type="button" className={s.viewBtn} aria-pressed={tile} aria-label="격자로 보기" title="격자" onClick={() => onChange(true)}>
        <ViewIcon tile />
      </button>
    </div>
  );
}

function ViewIcon({ tile }: { tile: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      {tile ? (
        <>
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </>
      ) : (
        <path d="M4 6h16M4 12h16M4 18h16" />
      )}
    </svg>
  );
}
