import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 되돌릴 수 없는 동작은 두 번 눌러야 실행한다.
 * 첫 번째 누르면 pending 이 그 id 가 되고, 4초 안에 다시 누르지 않으면 풀린다.
 */
export function useConfirm(timeoutMs = 4000) {
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const set = useCallback((v: string | null) => {
    pendingRef.current = v;
    setPending(v);
  }, []);

  const tap = useCallback(
    (id: string, fn: () => void) => {
      window.clearTimeout(timer.current);
      if (pendingRef.current === id) {
        set(null);
        fn();
      } else {
        set(id);
        timer.current = window.setTimeout(() => set(null), timeoutMs);
      }
    },
    [set, timeoutMs],
  );

  const reset = useCallback(() => {
    window.clearTimeout(timer.current);
    set(null);
  }, [set]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { pending, tap, reset };
}
