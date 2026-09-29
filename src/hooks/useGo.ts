import { useEffect, useRef } from 'react';

/**
 * 알림을 눌러 앱을 열었을 때 갈 곳 (주소 끝의 ?go=chat).
 * 앱이 이미 열려 있으면 서비스 워커가 신호를 보낸다. 앱을 보고 있는 동안 온 알림은 onPush 로 (화면을 새로 고칠 때).
 */
export function useGo(onGo: (go: string) => void, onPush?: (tag: string) => void) {
  const go = useRef(onGo);
  const push = useRef(onPush);
  go.current = onGo;
  push.current = onPush;

  useEffect(() => {
    try {
      const u = new URL(location.href);
      const g = u.searchParams.get('go');
      if (g) {
        u.searchParams.delete('go');
        history.replaceState(history.state, '', u.pathname + u.search + u.hash);
        go.current(g);
      }
    } catch {
      /* 무시 */
    }
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: string; tag?: string } | null;
      if (d?.type === 'healthlog-go' && d.url) {
        const g = new URL(d.url, location.origin).searchParams.get('go');
        if (g) go.current(g);
      } else if (d?.type === 'healthlog-push') push.current?.(d.tag ?? '');
    };
    sw.addEventListener('message', onMsg);
    return () => sw.removeEventListener('message', onMsg);
  }, []);
}
