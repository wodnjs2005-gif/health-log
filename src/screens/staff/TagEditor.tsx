import { useId, type ReactNode } from 'react';
import { useApp } from '../../AppContext';
import { cx } from '../../lib/cx';
import { allTags, normTag, TAG_MAX_LEN, TAGS_PER_MEMBER } from '../../lib/tags';
import ui from '../../styles/ui.module.css';
import s from './staff.module.css';

export interface TagDraft {
  tags: string[];
  input: string;
}

export const EMPTY_TAG_DRAFT: TagDraft = { tags: [], input: '' };

/** 입력칸에 적어 두고 '추가'를 안 누른 해시태그까지 합친 목록. 너무 많으면 오류 문구 */
export function tagsToSave(d: TagDraft): { tags: string[] } | { error: string } {
  const pending = normTag(d.input);
  const next = pending && !d.tags.includes(pending) ? [...d.tags, pending] : d.tags;
  if (next.length > TAGS_PER_MEMBER) return { error: `해시태그는 ${TAGS_PER_MEMBER}개까지 달 수 있어요.` };
  return { tags: next };
}

interface Props {
  value: TagDraft;
  onChange: (d: TagDraft) => void;
  /** 오류 문구를 보여줄 곳이 바깥에 있으므로 알리기만 한다 ('' = 오류 없음) */
  onError: (msg: string) => void;
  /** 입력칸 위 제목 */
  label: ReactNode;
}

/** 해시태그 붙이기·떼기 (해시태그 창, 이용자 등록에서 함께 씀) */
export function TagEditor({ value, onChange, onError, label }: Props) {
  const { data } = useApp();
  const inputId = useId();
  const { tags, input } = value;

  const suggestions = allTags(data.members)
    .map((x) => x.tag)
    .filter((t) => !tags.includes(t));

  const add = (raw: string) => {
    const t = normTag(raw);
    if (!t) return onError('해시태그를 입력해주세요.');
    if (tags.includes(t)) return onError('이미 달려 있는 해시태그예요.');
    if (tags.length >= TAGS_PER_MEMBER) return onError(`해시태그는 ${TAGS_PER_MEMBER}개까지 달 수 있어요.`);
    onChange({ tags: [...tags, t], input: '' });
    onError('');
  };

  return (
    <>
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
                  onChange({ ...value, tags: tags.filter((x) => x !== t) });
                  onError('');
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
        <label className={ui.label} htmlFor={inputId}>
          {label}
        </label>
        <div className={s.addRow}>
          <div className={s.hashInput}>
            <input
              id={inputId}
              className={ui.input}
              value={input}
              onChange={(e) => {
                onChange({ ...value, input: e.target.value.slice(0, TAG_MAX_LEN + 1) });
                onError('');
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
          <div className={ui.label}>자주 쓴 해시태그</div>
          <div className={s.tagList}>
            {suggestions.map((t) => (
              <button key={t} type="button" className={s.suggest} onClick={() => add(t)}>
                + #{t}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
