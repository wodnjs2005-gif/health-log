import { useApp } from '../AppContext';
import { cx } from '../lib/cx';
import s from './Avatar.module.css';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';
type Tone = 'green' | 'orange' | 'navy' | 'plum';

interface Props {
  /** 이용자 또는 트레이너 id */
  id: string | null | undefined;
  name: string;
  size?: AvatarSize;
  /** 사진이 없을 때 이름 첫 글자 동그라미 색 */
  tone?: Tone;
}

/** 프로필 사진 (없으면 이름 첫 글자) */
export function Avatar({ id, name, size = 'md', tone = 'green' }: Props) {
  const { photoOf } = useApp();
  const src = photoOf(id);
  return (
    <span className={cx(s.avatar, s[size], !src && s[tone])} aria-hidden="true">
      {src ? <img className={s.img} src={src} alt="" /> : (name.trim()[0] ?? '?')}
    </span>
  );
}
