// 해시태그 색: 지금 있는 해시태그를 가나다순으로 세워 차례로 색을 준다.
// 해시태그가 색 수(14개)보다 적으면 서로 겹치지 않는다. 새 해시태그가 생기면 뒤쪽 색이 한 칸씩 밀릴 수 있다.
import type { Member } from './backend';

export interface TagColor {
  /** 배경 (연한 색) */
  bg: string;
  /** 글자·테두리 (진한 색) */
  ink: string;
}

export const TAG_PALETTE: TagColor[] = [
  { bg: '#E3EDFB', ink: '#1F4E8C' }, // 파랑
  { bg: '#E2F3E6', ink: '#1E6B3A' }, // 초록
  { bg: '#FDEBDD', ink: '#9A4A12' }, // 주황
  { bg: '#EFE6F7', ink: '#5E3A87' }, // 보라
  { bg: '#FBE4EC', ink: '#9A2F57' }, // 분홍
  { bg: '#DDF2F0', ink: '#16655E' }, // 청록
  { bg: '#FBF1CF', ink: '#735500' }, // 노랑
  { bg: '#FBE3E1', ink: '#A12D22' }, // 빨강
  { bg: '#E6E8FA', ink: '#3A3F9A' }, // 남보라
  { bg: '#F1E7DE', ink: '#6B4A2F' }, // 갈색
  { bg: '#EDF1DA', ink: '#4F5C14' }, // 올리브
  { bg: '#E4ECF0', ink: '#3E5968' }, // 회청
  { bg: '#F7E6F5', ink: '#853A7A' }, // 자주
  { bg: '#E0F0FA', ink: '#0F5F8A' }, // 하늘
];

/** 해시태그 → 색 */
export function tagColorMap(members: Member[]): Map<string, TagColor> {
  const tags = [...new Set(members.flatMap((m) => m.tags ?? []))].sort((a, b) => a.localeCompare(b, 'ko'));
  return new Map(tags.map((t, i) => [t, TAG_PALETTE[i % TAG_PALETTE.length]]));
}

/** 인라인 style 로 넣는 색 변수 (CSS 의 --tag-bg, --tag-ink) */
export const tagStyle = (c: TagColor | undefined) => (c ? ({ '--tag-bg': c.bg, '--tag-ink': c.ink } as React.CSSProperties) : undefined);
