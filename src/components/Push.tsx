import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { isAuthError } from '../lib/backend';
import { cx } from '../lib/cx';
import { isIos, isStandalone, pushOff, pushOn, pushSupported, pushSync, savedPush, type PushRole, type PushWho } from '../lib/push';
import { lsGet, lsSet } from '../lib/storage';
import ui from '../styles/ui.module.css';
import s from './cards.module.css';
import { Sheet } from './Layout';

type State = 'checking' | 'unsupported' | 'ios' | 'unavailable' | 'denied' | 'off' | 'on';
type Color = 'green' | 'orange' | 'plum';

const WHAT: Record<PushRole, string> = {
  user: '트레이너가 보낸 메시지와 한마디, 공지사항을 앱을 열지 않아도 알려 드려요.',
  guardian: '트레이너 한마디와 공지사항을 앱을 열지 않아도 알려 드려요.',
  trainer: '담당 이용자가 보낸 메시지를 앱을 열지 않아도 알려 드려요.',
};

function useWho(role: PushRole): PushWho | null {
  const { userCode, guardians, staffToken, staffId } = useApp();
  if (role === 'user') return userCode ? { role, code: userCode, id: userCode } : null;
  if (role === 'guardian') return guardians.length ? { role, codes: guardians.map((g) => g.code), id: 'g' } : null;
  return staffToken && staffId ? { role, code: staffToken, id: staffId } : null;
}

const whoKeyOf = (w: PushWho | null) => (w ? w.id + (w.codes ?? []).join(',') : '');

/** 앱을 열 때 한 번: 켜 둔 휴대폰이면 서버와 다시 맞춘다 (알림 주소가 바뀌었거나 보호자 번호가 늘었을 때) */
export function usePushSync(role: PushRole) {
  const { be, fail } = useApp();
  const who = useWho(role);
  const whoKey = whoKeyOf(who);
  useEffect(() => {
    if (who && savedPush(who)) pushSync(be, who).catch((e) => isAuthError(e) && fail(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [be, whoKey]);
}

/** 이 휴대폰의 알림 상태와 켜기·끄기 */
function usePush(role: PushRole) {
  const { be, toast, fail } = useApp();
  const who = useWho(role);
  const [state, setState] = useState<State>('checking');
  const [remind, setRemind] = useState(true);
  const [busy, setBusy] = useState(false);
  const whoKey = whoKeyOf(who);

  useEffect(() => {
    if (!who) return;
    let alive = true;
    void (async () => {
      if (!pushSupported()) return setState(isIos() && !isStandalone() ? 'ios' : 'unsupported');
      const key = await be.pushKey();
      if (!alive) return;
      if (!key) return setState('unavailable');
      if (Notification.permission === 'denied') return setState('denied');
      const saved = savedPush(who);
      if (saved) setRemind(!!saved.remind);
      setState(saved && Notification.permission === 'granted' ? 'on' : 'off');
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [be, whoKey]);

  const run = async (fn: () => Promise<void>) => {
    if (busy || !who) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (isAuthError(e)) fail(e);
      else toast('알림 설정을 바꾸지 못했어요. 잠시 뒤 다시 해 주세요');
    } finally {
      setBusy(false);
    }
  };

  const enable = (r = remind) =>
    run(async () => {
      const res = await pushOn(be, who!, role === 'user' && r);
      if (res === 'denied') {
        setState('denied');
        return;
      }
      if (res === 'unavailable') {
        setState('unavailable');
        return;
      }
      setRemind(r);
      setState('on');
      toast('알림을 켰어요');
    });

  const disable = () =>
    run(async () => {
      await pushOff(be, who!);
      setState('off');
      toast('알림을 껐어요');
    });

  const changeRemind = (r: boolean) =>
    run(async () => {
      await pushOn(be, who!, r);
      setRemind(r);
      toast(r ? '저녁 7시 기록 알림을 켰어요' : '저녁 7시 기록 알림을 껐어요');
    });

  return { state, remind, setRemind, busy, enable, disable, changeRemind };
}

const askKey = (role: PushRole) => 'healthlog.pushAsk.' + role;
const ASK_AGAIN_DAYS = 14;

/**
 * 첫 화면: 알림이 꺼져 있으면 켜자고 안내한다. 「나중에」를 누르면 2주 동안 보이지 않는다. 켜 둔 휴대폰이면 보이지 않는다.
 */
export function PushCard({ role, color = 'green' }: { role: PushRole; color?: Color }) {
  const p = usePush(role);
  const [hidden, setHidden] = useState(() => {
    const t = Number(lsGet(askKey(role)) || 0);
    return t > 0 && Date.now() - t < ASK_AGAIN_DAYS * 864e5;
  });
  if (hidden || (p.state !== 'off' && p.state !== 'ios')) return null;
  const later = () => {
    lsSet(askKey(role), String(Date.now()));
    setHidden(true);
  };
  return (
    <section className={cx(s.install, s.pushCard)} data-color={color} aria-label="휴대폰 알림 받기">
      <div className={s.installHead}>
        <BellIcon />
        <div className={ui.sectionHead} style={{ gap: '0.125rem', minWidth: 0 }}>
          <h2 className={s.installTitle}>휴대폰 알림 받기</h2>
          <span className={ui.small}>{WHAT[role]}</span>
        </div>
      </div>
      {p.state === 'ios' ? (
        <div className={ui.small}>아이폰은 먼저 「홈 화면에 추가」를 한 뒤, 바탕화면의 아이콘으로 열면 알림을 켤 수 있어요.</div>
      ) : (
        role === 'user' && <RemindCheck checked={p.remind} onChange={p.setRemind} />
      )}
      <div className={s.installActions}>
        {p.state === 'off' && (
          <button type="button" className={cx(ui.btn, BTN[color])} disabled={p.busy} onClick={() => void p.enable()}>
            {p.busy ? '켜는 중…' : '알림 켜기'}
          </button>
        )}
        <button type="button" className={ui.btnGhost} onClick={later}>
          나중에
        </button>
      </div>
    </section>
  );
}

const BTN: Record<Color, string> = { green: ui.green, orange: ui.orange, plum: ui.plum };

function RemindCheck({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={s.pushRemind}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        저녁 7시에 <b>기록을 잊지 않게</b> 알려 주세요
        <span className={ui.small}> (그날 기록이 없을 때만)</span>
      </span>
    </label>
  );
}

/** 아래쪽 메뉴의 「휴대폰 알림」 버튼 + 설정 창 */
export function PushButton({ role, color = 'green' }: { role: PushRole; color?: Color }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={ui.btnGhost} onClick={() => setOpen(true)} aria-haspopup="dialog">
        휴대폰 알림 설정
      </button>
      {open && <PushSheet role={role} color={color} onClose={() => setOpen(false)} />}
    </>
  );
}

function PushSheet({ role, color, onClose }: { role: PushRole; color: Color; onClose: () => void }) {
  const p = usePush(role);
  return (
    <Sheet title="휴대폰 알림" onClose={onClose}>
      <div className={ui.muted}>{WHAT[role]}</div>
      {p.state === 'checking' && <div className={ui.empty}>확인하는 중…</div>}
      {p.state === 'unavailable' && <div className={ui.note}>알림 기능을 준비하고 있어요. 조금 뒤에 다시 확인해 주세요.</div>}
      {p.state === 'unsupported' && (
        <div className={ui.note}>이 화면에서는 알림을 받을 수 없어요. 카카오톡 안에서 열었다면 크롬이나 삼성 인터넷으로 열어 주세요.</div>
      )}
      {p.state === 'ios' && (
        <div className={ui.note}>
          아이폰은 사파리 아래의 <b>공유 버튼 → 홈 화면에 추가</b>를 한 뒤, 바탕화면의 아이콘으로 열어야 알림을 켤 수 있어요. (iOS 16.4 이상)
        </div>
      )}
      {p.state === 'denied' && (
        <div className={ui.note}>
          이 휴대폰에서 알림이 막혀 있어요. 휴대폰 <b>설정 → 애플리케이션 → (크롬 또는 인터넷) → 알림</b>에서 이 사이트를 허용한 뒤 다시 눌러 주세요.
        </div>
      )}
      {p.state === 'on' && (
        <>
          <div className={cx(ui.note, s.pushOn)} role="status">
            ✓ 이 휴대폰에서 알림을 받고 있어요.
          </div>
          {role === 'user' && <RemindCheck checked={p.remind} disabled={p.busy} onChange={(v) => void p.changeRemind(v)} />}
          <button type="button" className={ui.btnGhost} disabled={p.busy} onClick={() => void p.disable()}>
            알림 끄기
          </button>
        </>
      )}
      {(p.state === 'off' || p.state === 'denied') && (
        <>
          {role === 'user' && <RemindCheck checked={p.remind} onChange={p.setRemind} />}
          <button type="button" className={cx(ui.btn, BTN[color])} disabled={p.busy} onClick={() => void p.enable()}>
            {p.busy ? '켜는 중…' : '알림 켜기'}
          </button>
        </>
      )}
    </Sheet>
  );
}

function BellIcon() {
  return (
    <span className={s.pushBell} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    </span>
  );
}
