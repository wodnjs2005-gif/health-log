import { cx } from '../../lib/cx';
import s from './admin.module.css';

interface Props {
  /** 'OOO 님 · 등록했어요' */
  heading: string;
  /** '개인 번호' / '보호자 번호' / '트레이너 번호' */
  label: string;
  code: string;
  /** '이 번호를 ○○에게 알려주세요.' */
  tell: string;
  /** 새로 등록한 이용자의 보호자 번호처럼 함께 알려줄 번호 */
  sub?: { label: string; code: string };
  onClose: () => void;
}

/** 방금 발급한 번호를 크게 보여주는 남색 안내 카드 */
export function IssuedCard({ heading, label, code, tell, sub, onClose }: Props) {
  return (
    <section role="status" className={s.issued}>
      <div className={s.issuedName}>{heading}</div>
      <div className={s.issuedLabel}>{label}</div>
      <div className={cx(s.issuedCode, code.length > 6 && s.issuedCodeLong)} aria-label={`${label} ${code.split('').join(' ')}`}>
        {code}
      </div>
      <div style={{ fontSize: '1rem', textWrap: 'pretty' }}>{tell}</div>
      {sub && (
        <div className={s.issuedSub}>
          <span>{sub.label}</span>
          <span className={s.issuedSubCode}>{sub.code}</span>
        </div>
      )}
      <button type="button" className={s.issuedOk} onClick={onClose}>
        확인
      </button>
    </section>
  );
}
