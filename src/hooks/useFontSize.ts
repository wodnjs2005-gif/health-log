import { useCallback, useState } from 'react';
import { LS, lsGet, lsSet } from '../lib/storage';

export const FONT_SIZES = [
  { pct: 100, size: '0.9375rem', aria: '보통 글자' },
  { pct: 120, size: '1.125rem', aria: '큰 글자' },
  { pct: 140, size: '1.375rem', aria: '아주 큰 글자' },
];

const clampIndex = (n: number) => Math.min(FONT_SIZES.length - 1, Math.max(0, n));

export function readSavedFontSize() {
  const i = parseInt(lsGet(LS.fs) ?? '', 10);
  return clampIndex(Number.isNaN(i) ? 0 : i);
}

export function applyFontSize(i: number) {
  document.documentElement.style.fontSize = FONT_SIZES[clampIndex(i)].pct + '%';
}

export function useFontSize() {
  const [fs, setFsState] = useState(readSavedFontSize);
  const setFs = useCallback((i: number) => {
    const v = clampIndex(i);
    applyFontSize(v);
    lsSet(LS.fs, String(v));
    setFsState(v);
  }, []);
  return { fs, setFs };
}
