import { useState } from 'react';
import { useApp } from '../../AppContext';
import { Sheet } from '../../components/Layout';
import { isAuthError, type Program } from '../../lib/backend';
import { cx } from '../../lib/cx';
import ui from '../../styles/ui.module.css';
import { MemberPicker } from './MemberPicker';
import type { StaffColor } from './ProgramSheet';

/** 이미 등록한 영상의 대상 이용자 바꾸기 */
export function TargetSheet({ program, onClose, color = 'orange' }: { program: Program; onClose: () => void; color?: StaffColor }) {
  const { be, data, staffToken, setData, toast, fail, refresh } = useApp();
  // 그사이 삭제된 이용자는 처음부터 빼 둔다
  const [mids, setMids] = useState(() => program.mids.filter((mid) => data.members.some((m) => m.id === mid)));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!mids.length) return setError('대상 이용자를 골라주세요.');
    if (saving) return;
    setSaving(true);
    try {
      const saved = await be.staffSetProgramMembers(staffToken, program.id, mids);
      setData((d) => ({ ...d, programs: d.programs.map((p) => (p.id === program.id ? { ...p, mids: saved } : p)) }));
      toast('대상 이용자를 바꿨어요');
      onClose();
    } catch (e) {
      setSaving(false);
      if (isAuthError(e)) return fail(e);
      setError('저장하지 못했어요. 영상이 지워졌거나 인터넷이 끊겼는지 확인해주세요.');
      void refresh();
    }
  };

  return (
    <Sheet title={`${program.title} · 대상 이용자`} onClose={onClose}>
      <MemberPicker
        members={data.members}
        selected={mids}
        onChange={(v) => {
          setMids(v);
          setError('');
        }}
        color={color}
      />
      {error && (
        <div role="alert" className={ui.error}>
          {error}
        </div>
      )}
      <button type="button" className={cx(ui.btn, ui.btnSave, color === 'navy' ? ui.navy : ui.orange)} disabled={saving} onClick={() => void save()}>
        {saving ? '저장하는 중…' : '저장하기'}
      </button>
    </Sheet>
  );
}
