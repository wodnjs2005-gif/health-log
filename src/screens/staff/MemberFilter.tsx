import { useState } from 'react';
import type { Member } from '../../lib/backend';
import { allTags, EMPTY_FILTER, matchMember, type MemberFilterValue } from '../../lib/tags';
import s from './staff.module.css';

/**
 * 검색·해시태그 조건과 그에 맞는 이용자.
 * 고른 해시태그를 모든 이용자에게서 떼면 그 태그 버튼이 사라지므로, 그때는 전체로 돌아간다.
 */
export function useMemberFilter(members: Member[]) {
  const [raw, setFilter] = useState<MemberFilterValue>(EMPTY_FILTER);
  const tag = raw.tag && members.some((m) => m.tags?.includes(raw.tag!)) ? raw.tag : null;
  const filter = tag === raw.tag ? raw : { ...raw, tag };
  const shown = members.filter((m) => matchMember(m, filter));
  return { filter, setFilter, shown };
}

/** #오전반 #무릎조심 … (보기 전용) */
export function TagList({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null;
  return (
    <div className={s.tagList} aria-label="해시태그">
      {tags.map((t) => (
        <span key={t} className={s.tag}>
          #{t}
        </span>
      ))}
    </div>
  );
}

interface Props {
  members: Member[];
  value: MemberFilterValue;
  onChange: (v: MemberFilterValue) => void;
  /** 검색 결과 수 안내 (예: '3명 중 2명') */
  shown?: number;
}

/** 이름·초성·#해시태그 검색 + 해시태그별로 골라 보기 */
export function MemberFilter({ members, value, onChange, shown }: Props) {
  const tags = allTags(members);
  const filtering = !!value.q.trim() || !!value.tag;

  return (
    <div className={s.filter}>
      <input
        type="search"
        className={s.search}
        value={value.q}
        onChange={(e) => onChange({ ...value, q: e.target.value })}
        placeholder="이름·초성·#해시태그로 찾기"
        aria-label="이용자 찾기"
        autoComplete="off"
        enterKeyHint="search"
      />
      {tags.length > 0 && (
        <div className={s.tagFilter} role="group" aria-label="해시태그로 골라 보기">
          <button type="button" className={s.tagBtn} aria-pressed={!value.tag} onClick={() => onChange({ ...value, tag: null })}>
            전체<span className={s.tagCount}>{members.length}</span>
          </button>
          {tags.map(({ tag, n }) => (
            <button
              key={tag}
              type="button"
              className={s.tagBtn}
              aria-pressed={value.tag === tag}
              onClick={() => onChange({ ...value, tag: value.tag === tag ? null : tag })}
            >
              #{tag}
              <span className={s.tagCount}>{n}</span>
            </button>
          ))}
        </div>
      )}
      {filtering && shown !== undefined && (
        <div className={s.resultNote} role="status">
          {members.length}명 중 {shown}명
        </div>
      )}
    </div>
  );
}
