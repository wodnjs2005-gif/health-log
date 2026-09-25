import { useCallback, useEffect, useRef, useState } from 'react';

export function useToast(ms = 2000) {
  const [toast, setToast] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const showToast = useCallback(
    (t: string) => {
      window.clearTimeout(timer.current);
      setToast(t);
      timer.current = window.setTimeout(() => setToast(''), ms);
    },
    [ms],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { toast, showToast };
}
