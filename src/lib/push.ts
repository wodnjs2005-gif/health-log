// 휴대폰 알림 (웹 푸시): 서비스 워커 등록, 이 휴대폰의 알림 주소 만들기, 켠 상태를 기기에 기억하기.
// 실제로 보내는 일은 서버(데이터베이스 → Vercel /api/push)가 한다.
import type { Backend, PushSub } from './backend';
import { lsGet, lsSet } from './storage';

export type PushRole = 'user' | 'guardian' | 'trainer';

/** 누구로 켰는지: 이용자·보호자는 번호, 트레이너는 로그인 표 */
export interface PushWho {
  role: PushRole;
  /** 이용자 번호 / 트레이너 로그인 표 */
  code?: string;
  /** 보호자 번호들 (한 휴대폰에서 여러 분을 본다) */
  codes?: string[];
  /** 기기에 켠 상태를 기억할 이름 (이용자는 번호, 트레이너는 id, 보호자는 'g'). 번호를 새로 받으면 다시 켜야 한다 */
  id: string;
}

const LS_PUSH = 'healthlog.push';

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const isIos = () =>
  typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** 앱을 열 때 한 번. 알림을 받으려면 서비스 워커가 있어야 한다 */
export function registerSW() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {
    /* 막힌 브라우저 */
  });
}

// --- 기기에 기억하는 켠 상태 ---------------------------------------------------------
type Saved = Record<string, { remind?: boolean }>;
const readSaved = (): Saved => {
  try {
    const v = JSON.parse(lsGet(LS_PUSH) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};
const keyOf = (w: PushWho) => w.role + ':' + w.id;
export const savedPush = (w: PushWho) => readSaved()[keyOf(w)] ?? null;
const writeSaved = (w: PushWho, v: { remind?: boolean } | null) => {
  const s = readSaved();
  if (v) s[keyOf(w)] = v;
  else delete s[keyOf(w)];
  lsSet(LS_PUSH, JSON.stringify(s));
};

// --- 알림 주소 ---------------------------------------------------------------------
const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

const sameKey = (sub: PushSubscription, key: string) => {
  const k = sub.options?.applicationServerKey;
  if (!k) return true;
  const a = new Uint8Array(k);
  const b = b64ToBytes(key);
  return a.length === b.length && a.every((x, i) => x === b[i]);
};

const ready = () =>
  Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('service worker')), 10000)),
  ]);

/** 이 휴대폰의 알림 주소. create 면 없을 때 만든다 (서버 키가 바뀌었으면 새로 만든다) */
async function subscription(key: string, create: boolean): Promise<PushSub | null> {
  const reg = await ready();
  let s = await reg.pushManager.getSubscription();
  if (s && !sameKey(s, key)) {
    await s.unsubscribe().catch(() => {});
    s = null;
  }
  if (!s && create) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  if (!s) return null;
  const j = s.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return null;
  return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth };
}

async function send(be: Backend, w: PushWho, sub: PushSub, on: boolean, remind: boolean) {
  if (w.role === 'user') await be.userPushSet(w.code!, sub, on, remind);
  else if (w.role === 'trainer') await be.trainerPushSet(w.code!, sub, on);
  else await Promise.all((w.codes ?? []).map((c) => be.guardianPushSet(c, sub, on)));
}

/** 켜기 (버튼을 눌렀을 때만 부른다: 알림 허용 창이 뜬다) */
export async function pushOn(be: Backend, w: PushWho, remind = false): Promise<'on' | 'denied' | 'unavailable'> {
  const key = await be.pushKey();
  if (!key) return 'unavailable';
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const sub = await subscription(key, true);
  if (!sub) throw new Error('no subscription');
  await send(be, w, sub, true, remind);
  writeSaved(w, { remind });
  return 'on';
}

/** 끄기: 서버에서 이 사람 몫만 지운다 (같은 휴대폰의 다른 사람 알림은 그대로) */
export async function pushOff(be: Backend, w: PushWho) {
  writeSaved(w, null);
  const key = await be.pushKey();
  if (!key || !pushSupported()) return;
  const sub = await subscription(key, false);
  if (sub) await send(be, w, sub, false, false);
}

/** 보호자가 목록에서 한 분을 뺐을 때: 그 번호 몫만 서버에서 지운다 (기기의 켠 상태는 그대로) */
export async function pushOffGuardianCode(be: Backend, code: string) {
  const key = await be.pushKey();
  if (!key || !pushSupported()) return;
  const sub = await subscription(key, false);
  if (sub) await be.guardianPushSet(code, sub, false);
}

/** 앱을 열 때: 켜 두었으면 서버와 다시 맞춘다 (알림 주소가 바뀌었거나 보호자 번호가 늘었을 때). 허용이 풀렸으면 끈 것으로 */
export async function pushSync(be: Backend, w: PushWho): Promise<boolean> {
  const saved = savedPush(w);
  if (!saved || !pushSupported()) return false;
  if (Notification.permission !== 'granted') {
    writeSaved(w, null);
    return false;
  }
  const key = await be.pushKey();
  if (!key) return true;
  const sub = await subscription(key, true);
  if (sub) await send(be, w, sub, true, !!saved.remind);
  return true;
}
