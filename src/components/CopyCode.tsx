import { useApp } from '../AppContext';
import { cx } from '../lib/cx';
import s from './CopyCode.module.css';

/** 클립보드에 복사. 막힌 브라우저에서는 예전 방식으로 한 번 더 시도한다 */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

interface Props {
  code: string;
  /** '개인 번호' — 안내 문구에 쓴다 */
  label: string;
  /** 번호 칸 모양 (관리자 화면의 code · codeGuardian 등) */
  className?: string;
}

/** 누르면 번호가 복사되는 번호 칸 (관리자 화면) */
export function CopyCode({ code, label, className }: Props) {
  const { toast } = useApp();
  if (!code) return <span className={className}>—</span>;
  return (
    <button
      type="button"
      className={cx(s.btn, className)}
      aria-label={`${label} ${code.split('').join(' ')}, 누르면 복사`}
      onClick={async () => toast((await copyText(code)) ? `${label}를 복사했어요 (${code})` : '복사하지 못했어요. 길게 눌러 복사해주세요')}
    >
      <span>{code}</span>
      <svg className={s.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="12" height="12" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
      </svg>
    </button>
  );
}
