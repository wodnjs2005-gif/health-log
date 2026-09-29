import { useState } from 'react';
import { LS, lsGet, lsSet } from '../lib/storage';

/** 목록(자세히) / 격자(짧게) 보기. 화면마다 고른 것을 기기에 기억한다 (처음에는 목록) */
export function useViewMode(key: string) {
  const k = key.startsWith('healthlog.') ? key : LS.view + key;
  const [tile, setTile] = useState(() => lsGet(k) === 'tile');
  const pick = (t: boolean) => {
    setTile(t);
    lsSet(k, t ? 'tile' : 'list');
  };
  return [tile, pick] as const;
}
