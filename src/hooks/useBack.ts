import { useEffect, useRef } from 'react';

// 휴대폰 「뒤로」(삼성 내비게이션 바·제스처·한 손 조작 등) 로 앱이 꺼지지 않고 이전 화면으로 가도록,
// 창·상세 화면·대화방을 열 때마다 브라우저 기록을 한 칸 쌓고, 뒤로가 오면 맨 위 것부터 닫는다.
// 화면 안의 버튼(닫기·‹ 목록 등)으로 닫으면 쌓아 둔 기록을 조용히 한 칸 되돌린다.

interface Entry {
  close: () => void;
  /** 뒤로(popstate)로 이미 빠졌으면 true: 닫힐 때 기록을 되돌리지 않는다 */
  popped: boolean;
}

const stack: Entry[] = [];
/** 우리가 되돌린 기록 때문에 오는 popstate 는 무시한다 */
let ignore = 0;
let pendingBack = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignore > 0) {
      ignore--;
      return;
    }
    const top = stack.pop();
    if (!top) return;
    top.popped = true;
    top.close();
  });
}

/** 같은 순간에 여러 개가 닫히면 한 번에 되돌린다 (history.back 을 여러 번 부르면 한 번만 되는 브라우저가 있다) */
const goBack = () => {
  pendingBack++;
  if (pendingBack > 1) return;
  queueMicrotask(() => {
    const n = pendingBack;
    pendingBack = 0;
    ignore++;
    history.go(-n);
  });
};

/** active 인 동안 「뒤로」를 누르면 onBack 을 부른다 */
export function useBack(active: boolean, onBack: () => void) {
  const cb = useRef(onBack);
  cb.current = onBack;

  useEffect(() => {
    if (!active) return;
    const entry: Entry = { close: () => cb.current(), popped: false };
    stack.push(entry);
    try {
      history.pushState({ healthlog: stack.length }, '');
    } catch {
      /* 기록을 쌓지 못하는 환경 */
    }
    return () => {
      if (entry.popped) return;
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      goBack();
    };
  }, [active]);
}
