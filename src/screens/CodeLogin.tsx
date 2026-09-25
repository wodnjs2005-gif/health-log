import { useApp } from '../AppContext';
import { Layout } from '../components/Layout';
import { CODE_LEN, normCode } from '../lib/code';
import { cx } from '../lib/cx';
import ui from '../styles/ui.module.css';
import s from './screens.module.css';

type CodeColor = 'green' | 'plum' | 'orange';

const BTN: Record<CodeColor, string> = { green: ui.green, plum: ui.plum, orange: ui.orange };
const INPUT: Record<CodeColor, string | undefined> = { green: undefined, plum: s.codeInputPlum, orange: s.codeInputOrange };

interface Props {
  title: string;
  heading: string;
  desc: string;
  value: string;
  error: string;
  busy: boolean;
  /** 개발용 가짜 서버의 로그인 안내 (배포에서는 없음) */
  devHint?: string;
  /** 이용자=초록, 보호자=보라, 트레이너=주황 */
  color?: CodeColor;
  /** 이용자·보호자 6자리, 트레이너 8자리 */
  length?: number;
  onChange: (v: string) => void;
  onSubmit: () => void;
}

/** 번호 입력 화면 (이용자·보호자·트레이너 공용) */
export function CodeLogin({ title, heading, desc, value, error, busy, devHint, color = 'green', length = CODE_LEN, onChange, onSubmit }: Props) {
  const { goEntry } = useApp();
  return (
    <Layout title={title} onBack={goEntry}>
      <div className={ui.pageHead}>
        <h2 className={ui.h1}>{heading}</h2>
        <div className={ui.lead}>{desc}</div>
      </div>
      <CodeInput value={value} onChange={onChange} onSubmit={onSubmit} invalid={!!error} color={color} length={length} autoFocus />
      {error && (
        <div role="alert" className={cx(s.loginError, s.center)}>
          {error}
        </div>
      )}
      <button type="button" className={cx(ui.btn, ui.btnBig, BTN[color])} disabled={busy} onClick={onSubmit}>
        {busy ? '확인하는 중…' : '들어가기'}
      </button>
      <div className={s.hint}>한 번 들어가면 이 휴대폰에서는 다시 묻지 않아요.</div>
      {devHint && <div className={ui.note}>개발용 · {devHint}</div>}
    </Layout>
  );
}

interface CodeInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  invalid?: boolean;
  color?: CodeColor;
  length?: number;
  autoFocus?: boolean;
}

const PLACEHOLDER = 'AB3K7QMP';

/** 큰 고정폭 번호 입력칸. 대문자로 바꾸고 영문·숫자 외 글자는 지운다. */
export function CodeInput({ value, onChange, onSubmit, invalid, color = 'green', length = CODE_LEN, autoFocus }: CodeInputProps) {
  return (
    <input
      className={cx(s.codeInput, INPUT[color], length > CODE_LEN && s.codeInputLong)}
      value={value}
      onChange={(e) => onChange(normCode(e.target.value).slice(0, length))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmit();
      }}
      autoCapitalize="characters"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="go"
      aria-label={`${length}자리 번호`}
      aria-invalid={invalid}
      placeholder={PLACEHOLDER.slice(0, length)}
      autoFocus={autoFocus}
    />
  );
}
