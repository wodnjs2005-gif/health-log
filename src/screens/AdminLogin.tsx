import { useState } from 'react';
import { useApp } from '../AppContext';
import { Layout } from '../components/Layout';
import { cx } from '../lib/cx';
import ui from '../styles/ui.module.css';
import s from './screens.module.css';

interface Props {
  error: string;
  busy: boolean;
  /** 개발용 가짜 서버의 로그인 안내 (배포에서는 없음) */
  devHint?: string;
  onEdit: () => void;
  onSubmit: (loginId: string, pw: string) => void;
}

/** 관리자 아이디·비밀번호 로그인. 비밀번호는 기기에 저장하지 않는다 */
export function AdminLogin({ error, busy, devHint, onEdit, onSubmit }: Props) {
  const { goEntry } = useApp();
  const [loginId, setLoginId] = useState('');
  const [pw, setPw] = useState('');

  return (
    <Layout title="관리자" onBack={goEntry}>
      <div className={ui.pageHead}>
        <h2 className={ui.h1}>관리자 로그인</h2>
      </div>
      <form
        className={ui.stack}
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onSubmit(loginId, pw);
        }}
      >
        <label className={ui.field}>
          <span className={ui.label}>아이디</span>
          <input
            className={s.pwInput}
            value={loginId}
            onChange={(e) => {
              setLoginId(e.target.value);
              onEdit();
            }}
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>비밀번호</span>
          <input
            type="password"
            className={s.pwInput}
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              onEdit();
            }}
            autoComplete="current-password"
            enterKeyHint="go"
            aria-invalid={!!error}
          />
        </label>
        {error && (
          <div role="alert" className={s.loginError}>
            {error}
          </div>
        )}
        <button type="submit" className={cx(ui.btn, ui.btnBig, ui.navy)} disabled={busy}>
          {busy ? '확인하는 중…' : '로그인'}
        </button>
      </form>
      {devHint && <div className={ui.note}>개발용 · {devHint}</div>}
    </Layout>
  );
}
