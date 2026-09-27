// 휴대폰 바탕화면에 앱처럼 추가하기.
// 크롬(안드로이드)은 설치 창을 띄울 수 있을 때 beforeinstallprompt 를 보내므로 앱을 여는 즉시 받아 둔다 (main.tsx 에서 import).
// 아이폰 사파리와 그 밖의 브라우저는 창을 띄울 수 없어 메뉴 위치를 글로 안내한다.
import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // 브라우저가 알아서 띄우는 작은 알림 대신 앱 안의 안내 카드에서 띄운다
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
}

/** 이미 바탕화면 아이콘으로 열었는지 */
export const isStandalone = () => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
};

/** ios = 아이폰·아이패드, kakao = 카카오톡 안의 브라우저 (바탕화면에 추가가 안 됨), samsung = 삼성 인터넷 */
export type Platform = 'ios' | 'android' | 'samsung' | 'kakao' | 'other';

export function platform(ua = navigator.userAgent): Platform {
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

export function useInstall() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const f = () => rerender((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return {
    /** 앱 안에서 설치 창을 띄울 수 있음 */
    canPrompt: !!deferred,
    installed: installed || isStandalone(),
    /** 설치 창 띄우기. 설치했으면 true */
    prompt: async () => {
      const e = deferred;
      if (!e) return false;
      deferred = null;
      await e.prompt();
      const r = await e.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
      notify();
      return r.outcome === 'accepted';
    },
  };
}
