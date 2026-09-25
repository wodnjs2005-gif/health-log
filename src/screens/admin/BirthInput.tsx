import { useRef, useState } from 'react';
import { useApp } from '../../AppContext';
import { Sheet } from '../../components/Layout';
import { ageFromBirth, parseBirth } from '../../lib/age';
import type { Member } from '../../lib/backend';
import { cx } from '../../lib/cx';
import ui from '../../styles/ui.module.css';
import s from './admin.module.css';

export interface BirthParts {
  y: string;
  m: string;
  d: string;
}

export const EMPTY_BIRTH: BirthParts = { y: '', m: '', d: '' };

/** '1948-03-05' → { y: '1948', m: '3', d: '5' } */
const toParts = (birth?: string | null): BirthParts => {
  if (!birth) return EMPTY_BIRTH;
  const [y, m, d] = birth.split('-');
  return { y, m: String(Number(m)), d: String(Number(d)) };
};

interface Props {
  value: BirthParts;
  onChange: (v: BirthParts) => void;
  /** 마지막 칸에서 Enter */
  onEnter?: () => void;
  autoFocus?: boolean;
}

/** 생년월일 [1948] 년 [3] 월 [15] 일 + 만 나이 미리보기. 숫자만 받고, 칸이 차면 다음 칸으로 넘어간다. */
export function BirthInput({ value, onChange, onEnter, autoFocus }: Props) {
  const { today } = useApp();
  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const parsed = parseBirth(value.y, value.m, value.d, today);
  const previewAge = 'birth' in parsed ? ageFromBirth(parsed.birth, today) : null;

  const edit = (key: keyof BirthParts, raw: string) => {
    const v = raw.replace(/[^0-9]/g, '').slice(0, key === 'y' ? 4 : 2);
    onChange({ ...value, [key]: v });
    if (key === 'y' && v.length === 4) monthRef.current?.focus();
    if (key === 'm' && (v.length === 2 || Number(v) >= 2)) dayRef.current?.focus();
  };

  return (
    <div className={ui.field} role="group" aria-label="생년월일">
      <div className={s.birthHead}>
        <span className={ui.label}>생년월일</span>
        {previewAge !== null && <span className={s.agePreview}>만 {previewAge}세</span>}
      </div>
      <div className={s.birthGrid}>
        <input
          className={cx(ui.input, s.birthInput)}
          value={value.y}
          onChange={(e) => edit('y', e.target.value)}
          placeholder="1948"
          aria-label="태어난 해 (4자리)"
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
        />
        <span className={s.birthUnit}>년</span>
        <input
          ref={monthRef}
          className={cx(ui.input, s.birthInput)}
          value={value.m}
          onChange={(e) => edit('m', e.target.value)}
          placeholder="3"
          aria-label="태어난 월"
          inputMode="numeric"
          autoComplete="off"
        />
        <span className={s.birthUnit}>월</span>
        <input
          ref={dayRef}
          className={cx(ui.input, s.birthInput)}
          value={value.d}
          onChange={(e) => edit('d', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter?.();
          }}
          placeholder="15"
          aria-label="태어난 일"
          inputMode="numeric"
          autoComplete="off"
        />
        <span className={s.birthUnit}>일</span>
      </div>
    </div>
  );
}

/** 이미 등록된 이용자의 생년월일 입력·수정 시트 */
export function BirthSheet({ member, onClose }: { member: Member; onClose: () => void }) {
  const { be, staffToken, setData, toast, fail, today } = useApp();
  const [value, setValue] = useState(() => toParts(member.birth));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsed = parseBirth(value.y, value.m, value.d, today);
    if ('error' in parsed) return setError(parsed.error);
    if (saving) return;
    setSaving(true);
    try {
      await be.staffSetBirth(staffToken, member.id, parsed.birth);
      setData((d) => ({ ...d, members: d.members.map((x) => (x.id === member.id ? { ...x, birth: parsed.birth } : x)) }));
      toast('생년월일을 저장했어요');
      onClose();
    } catch (e) {
      setSaving(false);
      fail(e);
    }
  };

  return (
    <Sheet title={`${member.name} 님 생년월일`} onClose={onClose}>
      <BirthInput
        value={value}
        onChange={(v) => {
          setValue(v);
          setError('');
        }}
        onEnter={() => void save()}
        autoFocus
      />
      {error && (
        <div role="alert" className={ui.error}>
          {error}
        </div>
      )}
      <button type="button" className={cx(ui.btn, ui.btnSave, ui.navy)} disabled={saving} onClick={() => void save()}>
        {saving ? '저장하는 중…' : '저장하기'}
      </button>
    </Sheet>
  );
}
