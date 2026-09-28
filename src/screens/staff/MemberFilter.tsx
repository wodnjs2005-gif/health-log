import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../../AppContext';
import { tagColorMap, tagStyle } from '../../lib/tagColors';
import type { Member } from '../../lib/backend';
import { cx } from '../../lib/cx';
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

/** 해시태그마다 다른 색 (모든 이용자의 해시태그 기준) */
export function useTagColors() {
  const { data } = useApp();
  return useMemo(() => tagColorMap(data.members), [data.members]);
}

/** #오전반 #무릎조심 … (보기 전용) */
export function TagList({ tags }: { tags?: string[] }) {
  const colors = useTagColors();
  if (!tags?.length) return null;
  return (
    <div className={s.tagList} aria-label="해시태그">
      {tags.map((t) => (
        <span key={t} className={s.tag} style={tagStyle(colors.get(t))}>
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
  /** 해시태그 줄 오른쪽에 붙일 것 (예: 목록·타일 버튼) */
  side?: ReactNode;
  /** 트레이너: 「내 담당」 버튼 (맨 앞) */
  mine?: { on: boolean; count: number; onToggle: () => void };
}

/** 이름·초성·#해시태그 검색 + 해시태그별로 골라 보기 */
export function MemberFilter({ members, value, onChange, shown, side, mine }: Props) {
  const tags = allTags(members);
  const colors = useTagColors();
  const filtering = !!value.q.trim() || !!value.tag;
  // 해시태그가 한 줄을 넘으면 한 줄만 보이고 ▼ 로 펼친다
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const tagRef = useRef<HTMLDivElement>(null);
  const tagId = useId();
  const tagKey = tags.map((t) => t.tag).join(' ');
  useLayoutEffect(() => {
    const el = tagRef.current;
    if (!el) return setMore(false);
    const check = () => {
      const kids = el.children;
      setMore(kids.length > 1 && (kids[kids.length - 1] as HTMLElement).offsetTop > (kids[0] as HTMLElement).offsetTop);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tagKey]);

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
      {(tags.length > 0 || side || mine) && (
        <div className={cx(s.tagRow, more && open && s.tagRowOpen)}>
          {/* 펼치면 버튼은 오른쪽 위에 두고 해시태그가 그 둘레로 흐르도록 버튼을 먼저 둔다 (닫혔을 때는 order 로 뒤에) */}
          {side && <div className={s.tagSide}>{side}</div>}
          {more && (
            <button
              type="button"
              className={s.tagMore}
              aria-expanded={open}
              aria-controls={tagId}
              aria-label={open ? '해시태그 접기' : '해시태그 모두 보기'}
              onClick={() => setOpen((v) => !v)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
              </svg>
            </button>
          )}
          {(tags.length > 0 || mine) && (
            <div ref={tagRef} id={tagId} className={cx(s.tagFilter, more && !open && s.tagFilterShut)} role="group" aria-label="해시태그로 골라 보기">
              {mine && (
                <button type="button" className={cx(s.tagBtn, s.mineBtn)} aria-pressed={mine.on} onClick={mine.onToggle}>
                  내 담당<span className={s.tagCount}>{mine.count}</span>
                </button>
              )}
              {tags.length > 0 && (
                <button type="button" className={s.tagBtn} aria-pressed={!value.tag} onClick={() => onChange({ ...value, tag: null })}>
                  전체<span className={s.tagCount}>{members.length}</span>
                </button>
              )}
              {tags.map(({ tag, n }) => (
                <button
                  key={tag}
                  type="button"
                  className={cx(s.tagBtn, s.tagBtnColor)}
                  style={tagStyle(colors.get(tag))}
                  aria-pressed={value.tag === tag}
                  onClick={() => onChange({ ...value, tag: value.tag === tag ? null : tag })}
                >
                  #{tag}
                  <span className={s.tagCount}>{n}</span>
                </button>
              ))}
            </div>
          )}
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
