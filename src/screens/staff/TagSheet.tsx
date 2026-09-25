import { useState } from 'react';
import { useApp } from '../../AppContext';
import { Sheet } from '../../components/Layout';
import type { Member } from '../../lib/backend';
import { cx } from '../../lib/cx';
import ui from '../../styles/ui.module.css';
import { TagEditor, tagsToSave, type TagDraft } from './TagEditor';

/** 한 이용자의 해시태그 붙이기·떼기 (관리자·트레이너) */
export function TagSheet({ member, onClose }: { member: Member; onClose: () => void }) {
  const { be, staffToken, setData, toast, fail } = useApp();
  const [draft, setDraft] = useState<TagDraft>({ tags: member.tags ?? [], input: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    const r = tagsToSave(draft);
    if ('error' in r) return setError(r.error);
    setSaving(true);
    try {
      const saved = await be.staffSetTags(staffToken, member.id, r.tags);
      setData((d) => ({ ...d, members: d.members.map((m) => (m.id === member.id ? { ...m, tags: saved } : m)) }));
      toast('해시태그를 저장했어요');
      onClose();
    } catch (e) {
      setSaving(false);
      fail(e);
    }
  };

  return (
    <Sheet title={`${member.name} 님 해시태그`} onClose={onClose}>
      <TagEditor value={draft} onChange={setDraft} onError={setError} label="새 해시태그" />
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
