import { useState } from 'react';
import { useApp } from '../../AppContext';
import { Sheet } from '../../components/Layout';
import type { Member } from '../../lib/backend';
import { cx } from '../../lib/cx';
import { allTags, normTag, TAG_MAX_LEN, TAGS_PER_MEMBER } from '../../lib/tags';
import ui from '../../styles/ui.module.css';
import s from './staff.module.css';

/** 한 이용자의 해시태그 붙이기·떼기 (관리자·트레이너) */
export function TagSheet({ member, onClose }: { member: Member; onClose: () => void }) {
  const { be, data, staffToken, setData, toast, fail } = useApp();
  const [tags, setTags] = useState<string[]>(member.tags ?? []);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const suggestions = allTags(data.members)
    .map((x) => x.tag)
    .filter((t) => !tags.includes(t));

  const add = (raw: string) => {
    const t = normTag(raw);
    if (!t) return setError('해시태그를 입력해주세요.');
    if (tags.includes(t)) return setError('이미 달려 있는 해시태그예요.');
    if (tags.length >= TAGS_PER_MEMBER) return setError(`해시태그는 ${TAGS_PER_MEMBER}개까지 달 수 있어요.`);
    setTags([...tags, t]);
    setInput('');
    setError('');
  };

  const save = async () => {
    if (saving) return;
    // 입력칸에 적어 두고 '추가'를 안 누른 경우도 함께 저장
    const pending = normTag(input);
    const next = pending && !tags.includes(pending) ? [...tags, pending] : tags;
    if (next.length > TAGS_PER_MEMBER) return setError(`해시태그는 ${TAGS_PER_MEMBER}개까지 달 수 있어요.`);
    setSaving(true);
    try {
      const saved = await be.staffSetTags(staffToken, member.id, next);
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
      {tags.length > 0 && (
        <div className={ui.field}>
          <div className={ui.label}>달린 해시태그</div>
          <div className={s.tagList}>
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                className={s.editTag}
                aria-label={`#${t} 빼기`}
                onClick={() => {
                  setTags(tags.filter((x) => x !== t));
                  setError('');
                }}
              >
                #{t}
                <span className={s.x} aria-hidden="true">
                  ×
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={ui.field}>
        <label className={ui.label} htmlFor="tag-input">
          새 해시태그
        </label>
        <div className={s.addRow}>
          <div className={s.hashInput}>
            <input
              id="tag-input"
              className={ui.input}
              value={input}
              onChange={(e) => {
                setInput(e.target.value.slice(0, TAG_MAX_LEN + 1));
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add(input);
              }}
              placeholder="예: 오전반, 무릎조심"
              autoComplete="off"
              enterKeyHint="done"
            />
          </div>
          <button type="button" className={cx(ui.btn, ui.navy)} style={{ minHeight: '3.5rem' }} onClick={() => add(input)}>
            추가
          </button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className={ui.field}>
          <div className={ui.label}>
            자주 쓴 해시태그
          </div>
          <div className={s.tagList}>
            {suggestions.map((t) => (
              <button key={t} type="button" className={s.suggest} onClick={() => add(t)}>
                + #{t}
              </button>
            ))}
          </div>
        </div>
      )}

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
