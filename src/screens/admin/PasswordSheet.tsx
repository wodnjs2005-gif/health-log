import { useState } from 'react';
import { useApp } from '../../AppContext';
import { Sheet } from '../../components/Layout';
import { cx } from '../../lib/cx';
import ui from '../../styles/ui.module.css';

const MIN_LEN = 8;

/** 관리자 비밀번호 바꾸기. 바꾸면 다른 기기의 로그인은 끝난다 (서버 admin_change_password) */
export function PasswordSheet({ onClose }: { onClose: () => void }) {
  const { be, staffToken, toast, fail } = useApp();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const edit = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    fn(e.target.value);
    setError('');
  };

  const save = async () => {
    if (!oldPw) return setError('지금 비밀번호를 입력해주세요.');
    if (newPw.length < MIN_LEN) return setError(`새 비밀번호는 ${MIN_LEN}자 이상이어야 해요.`);
    if (newPw !== newPw2) return setError('새 비밀번호가 서로 달라요.');
    if (newPw === oldPw) return setError('지금과 다른 비밀번호를 입력해주세요.');
    if (saving) return;
    setSaving(true);
    try {
      const r = await be.adminChangePassword(staffToken, oldPw, newPw);
      if (r === 'wrong') {
        setSaving(false);
        return setError('지금 비밀번호가 맞지 않아요.');
      }
      if (r === 'short') {
        setSaving(false);
        return setError(`새 비밀번호는 ${MIN_LEN}자 이상이어야 해요.`);
      }
      toast('비밀번호를 바꿨어요');
      onClose();
    } catch (e) {
      setSaving(false);
      fail(e);
    }
  };

  return (
    <Sheet title="비밀번호 변경" onClose={onClose}>
      <form
        className={ui.stack}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {/* 비밀번호 관리 프로그램이 어느 계정인지 알 수 있게 */}
        <input type="text" autoComplete="username" hidden readOnly />
        <label className={ui.field}>
          <span className={ui.label}>지금 비밀번호</span>
          <input type="password" className={ui.input} value={oldPw} onChange={edit(setOldPw)} autoComplete="current-password" autoFocus />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>
            새 비밀번호 <span className={ui.labelSub}>({MIN_LEN}자 이상)</span>
          </span>
          <input type="password" className={ui.input} value={newPw} onChange={edit(setNewPw)} autoComplete="new-password" />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>새 비밀번호 한 번 더</span>
          <input type="password" className={ui.input} value={newPw2} onChange={edit(setNewPw2)} autoComplete="new-password" enterKeyHint="done" />
        </label>
        {error && (
          <div role="alert" className={ui.error}>
            {error}
          </div>
        )}
        <button type="submit" className={cx(ui.btn, ui.btnSave, ui.navy)} disabled={saving}>
          {saving ? '바꾸는 중…' : '비밀번호 바꾸기'}
        </button>
      </form>
    </Sheet>
  );
}
