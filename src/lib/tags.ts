// 해시태그와 이용자 검색 도우미 (직원 화면 전용)
import type { Member } from './backend';

export const TAG_MAX_LEN = 20;
export const TAGS_PER_MEMBER = 10;

/**
 * ' ##오전 반' → '오전반'. 띄어쓰기를 먼저 지운 뒤 앞의 #을 지우고 20자까지.
 * (순서가 바뀌면 앞에 띄어쓰기가 있을 때 #이 남는다. 서버 staff_set_tags 와 같은 규칙)
 */
export const normTag = (s: string) => s.replace(/\s+/g, '').replace(/^#+/, '').slice(0, TAG_MAX_LEN);

/** 빈 태그·중복을 빼고 입력한 순서대로 */
export const normTags = (list: string[]) => [...new Set(list.map(normTag).filter(Boolean))];

/** 등록된 모든 해시태그와 인원 수. 많이 쓴 태그 먼저, 같으면 가나다순 */
export const allTags = (members: Member[]) => {
  const count = new Map<string, number>();
  for (const m of members) for (const t of m.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count.entries()]
    .map(([tag, n]) => ({ tag, n }))
    .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, 'ko'));
};

// --- 검색: 이름, 초성(ㄱㅅㅈ → 김순자), #태그 ---------------------------------
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

const chosungOf = (s: string) =>
  Array.from(s, (ch) => {
    const c = ch.charCodeAt(0) - 0xac00;
    return c >= 0 && c <= 11171 ? CHO[Math.floor(c / 588)] : ch;
  }).join('');

const isChosungOnly = (s: string) => /^[ㄱ-ㅎ]+$/.test(s);

export interface MemberFilterValue {
  q: string;
  /** 고른 해시태그 (없으면 전체) */
  tag: string | null;
}

export const EMPTY_FILTER: MemberFilterValue = { q: '', tag: null };

/** 검색어는 이름·초성·해시태그에서 찾는다. '#' 으로 시작하면 해시태그에서만 찾는다. */
export const matchMember = (m: Member, f: MemberFilterValue) => {
  const tags = m.tags ?? [];
  if (f.tag && !tags.includes(f.tag)) return false;
  const q = f.q.replace(/\s+/g, '');
  if (!q) return true;
  if (q.startsWith('#')) {
    const t = normTag(q);
    return !t || tags.some((x) => x.includes(t));
  }
  const name = m.name.replace(/\s+/g, '');
  return (
    name.includes(q) ||
    (isChosungOnly(q) && chosungOf(name).includes(q)) ||
    tags.some((x) => x.includes(q))
  );
};
