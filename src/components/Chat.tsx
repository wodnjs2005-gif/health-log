import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { CHAT_MAX, type ChatMessage, type ChatRange, type ChatSeen, type ChatTrainer } from '../lib/backend';
import { trainerTitle } from '../lib/rank';
import { cx } from '../lib/cx';
import ui from '../styles/ui.module.css';
import { Avatar } from './Avatar';
import s from './Chat.module.css';

/** user = 이용자 본인, trainer = 트레이너 (보내기 가능), admin = 관리자 (보기만) */
export type ChatMode = 'user' | 'trainer' | 'admin';

const PAGE = 50;
const POLL_MS = 30_000;
const COLOR: Record<ChatMode, string> = { user: 'var(--green)', trainer: 'var(--orange)', admin: 'var(--navy)' };

const dayFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' });
const timeFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' });
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });

export const chatDay = (at: string) => dayFmt.format(new Date(at));
export const chatTime = (at: string) => timeFmt.format(new Date(at));
/** 목록에 쓰는 짧은 때: 오늘이면 시각, 아니면 날짜 */
export const chatWhen = (at: string, today: string) => {
  const d = new Date(at);
  return dayKey.format(d) === today ? timeFmt.format(d) : `${d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' })}`;
};

interface Props {
  /** 이용자 id */
  mid: string;
  /** 이용자 이름 (직원 화면에서 상대 이름) */
  name: string;
  mode: ChatMode;
  /** 초인종이 울릴 때마다 1 늘어나는 수 */
  ring: number;
  onClose: () => void;
  /** 이용자 화면: 담당 트레이너 (null 이면 담당이 없어 보낼 수 없다, undefined 면 아직 모름) */
  trainer?: ChatTrainer | null;
}

/** 대화방 (화면 전체). 새 메시지는 초인종이 울리거나 30초마다, 다시 화면에 나타날 때 가져온다 */
export function ChatScreen({ mid, name, mode, ring, onClose, trainer }: Props) {
  const { be, userCode, staffToken, staffId, fail } = useApp();
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [seen, setSeen] = useState<ChatSeen>({ member: null, trainer: null });
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastAt = useRef<string | undefined>(undefined);
  /** 다음 그리기 뒤 스크롤: 'bottom' = 맨 아래로, number = 예전 메시지를 붙인 뒤 보던 곳 그대로 */
  const scrollNext = useRef<'bottom' | number | null>('bottom');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const get = useCallback(
    (r?: ChatRange) => (mode === 'user' ? be.userChatGet(userCode, r) : be.staffChatGet(staffToken, mid, r)),
    [be, mode, userCode, staffToken, mid],
  );

  const getSeen = useCallback(
    () => (mode === 'user' ? be.userChatSeen(userCode) : be.staffChatSeen(staffToken, mid)),
    [be, mode, userCode, staffToken, mid],
  );
  /** 읽음 표시는 따로 가져온다 (실패해도 대화는 그대로) */
  const loadSeen = useCallback(() => {
    getSeen()
      .then(setSeen)
      .catch(() => {});
  }, [getSeen]);

  const merge = (list: ChatMessage[]) =>
    setMsgs((prev) => {
      const byId = new Map(prev.map((x) => [x.id, x]));
      list.forEach((x) => byId.set(x.id, x));
      const next = [...byId.values()].sort((a, b) => a.at.localeCompare(b.at));
      lastAt.current = next.at(-1)?.at;
      return next;
    });

  const nearBottom = () => {
    const el = listRef.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const loadNew = useCallback(async () => {
    try {
      const after = lastAt.current;
      const list = await get(after ? { after } : undefined);
      if (!after) setHasOlder(list.length >= PAGE);
      if (!after || list.some((x) => x.at > after)) {
        if (!after || nearBottom()) scrollNext.current = 'bottom';
        merge(list);
      }
      setLoaded(true);
      setError(false);
      loadSeen();
    } catch (e) {
      if (!lastAt.current) {
        setLoaded(true);
        setError(true);
      }
      if ((e as { auth?: boolean })?.auth) fail(e);
    }
  }, [get, fail, loadSeen]);

  useEffect(() => {
    void loadNew();
  }, [loadNew, ring]);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadNew();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [loadNew]);

  const loadOlder = async () => {
    const first = msgs[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const list = await get({ before: first.at });
      const el = listRef.current;
      scrollNext.current = el ? el.scrollHeight - el.scrollTop : null;
      setHasOlder(list.filter((x) => !msgs.some((m) => m.id === x.id)).length > 0 && list.length >= PAGE);
      merge(list);
    } catch (e) {
      fail(e);
    }
    setLoadingOlder(false);
  };

  useLayoutEffect(() => {
    const el = listRef.current;
    const want = scrollNext.current;
    if (!el || want === null) return;
    el.scrollTop = want === 'bottom' ? el.scrollHeight : el.scrollHeight - want;
    scrollNext.current = null;
  }, [msgs, loaded]);

  // 뒤 화면이 같이 움직이지 않게 막고, Esc 로 닫는다
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // 적는 칸은 네 줄까지 늘어난다
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight + 4, 8 * 16) + 'px';
  }, [text]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      const m = mode === 'user' ? await be.userChatSend(userCode, t) : await be.trainerChatSend(staffToken, mid, t);
      scrollNext.current = 'bottom';
      merge([m]);
      setText('');
      setSendError('');
      loadSeen();
    } catch (e) {
      const t = e instanceof Error ? e.message : '';
      if (/no trainer/.test(t)) setSendError('아직 담당 트레이너가 정해지지 않았어요. 관리자에게 알려 주세요.');
      else if (/not assigned/.test(t)) setSendError('담당 이용자가 아니어서 보낼 수 없어요.');
      else fail(e);
    }
    setSending(false);
  };

  /** 오른쪽(내 쪽)에 둘 메시지: 이용자는 자기가 보낸 것, 직원 화면은 트레이너가 보낸 것 */
  const right = (m: ChatMessage) => (mode === 'user' ? m.from === 'member' : m.from === 'trainer');

  /** 상대가 읽었나: 이용자가 보낸 것은 트레이너가, 트레이너가 보낸 것은 이용자가 */
  const readBy = (m: ChatMessage) => {
    const t = m.from === 'member' ? seen.trainer : seen.member;
    return !!t && t >= m.at;
  };
  // 읽음 표시는 내 쪽(오른쪽) 메시지에만, 관리자는 양쪽 모두
  const showRead = (m: ChatMessage) => mode === 'admin' || right(m);

  const rows: React.ReactNode[] = [];
  msgs.forEach((m, i) => {
    const prev = msgs[i - 1];
    const day = chatDay(m.at);
    const newDay = !prev || chatDay(prev.at) !== day;
    if (newDay)
      rows.push(
        <div key={'d' + m.at} className={s.day}>
          {day}
        </div>,
      );
    const mine = right(m);
    const sameSender = !newDay && prev && prev.from === m.from && prev.tid === m.tid;
    // 왼쪽: 상대 이름·사진. 직원 화면의 오른쪽: 다른 트레이너가 보냈으면 그 이름
    const who = m.from === 'member' ? `${name} 님` : m.by || '트레이너';
    const showName = !sameSender && (!mine || (mode !== 'user' && (mode === 'admin' || m.tid !== staffId)));
    rows.push(
      <div key={m.id} className={cx(s.row, mine && s.mine, sameSender && s.cont)}>
        {!mine && (
          <span className={s.face}>{!sameSender && <Avatar id={m.from === 'member' ? m.mid : m.tid} name={who} size="sm" tone={m.from === 'member' ? 'green' : 'orange'} />}</span>
        )}
        <div className={s.body}>
          {showName && <div className={s.name}>{who}</div>}
          <div className={s.line}>
            <div className={s.bubble}>{m.text}</div>
            <span className={s.meta}>
              {showRead(m) && <ReadMark read={readBy(m)} />}
              <span className={s.time}>{chatTime(m.at)}</span>
            </span>
          </div>
        </div>
      </div>,
    );
  });

  const trainerName = trainer ? trainerTitle(trainer.name, trainer.rank) : '';
  const noTrainer = mode === 'user' && trainer === null;
  const note =
    mode === 'user'
      ? noTrainer
        ? '아직 담당 트레이너가 정해지지 않아 메시지를 보낼 수 없어요. 관리자에게 알려 주세요.'
        : `담당 ${trainerName}님과 나누는 대화예요. 관리자도 볼 수 있어요. 급한 일은 전화로 연락해 주세요.`
      : mode === 'trainer'
        ? `${name} 님과 담당 트레이너가 나누는 대화예요. 관리자도 볼 수 있어요.`
        : '관리자는 대화를 보기만 할 수 있어요.';

  return (
    <div className={s.screen} role="dialog" aria-modal="true" aria-label={mode === 'user' ? '트레이너와 대화' : `${name} 님 대화`} style={{ ['--c' as string]: COLOR[mode] }}>
      <div className={s.head}>
        <button type="button" className={ui.btnSmall} onClick={onClose}>
          ‹ 닫기
        </button>
        {mode === 'user' && trainer && <Avatar id={trainer.id} name={trainer.name} size="md" tone="orange" />}
        <h2 className={s.title}>{mode === 'user' ? (trainer ? `${trainerName}님` : '트레이너와 대화') : `${name} 님`}</h2>
      </div>
      <div ref={listRef} className={s.list} aria-live="polite">
        <div className={s.note}>
          {note}
          <span className={s.legend}>
            안 읽었으면 <ReadMark read={false} />, 읽으면 <ReadMark read /> 가 보여요.
          </span>
        </div>
        {hasOlder && (
          <button type="button" className={cx(ui.btnSmall, s.older)} disabled={loadingOlder} onClick={() => void loadOlder()}>
            {loadingOlder ? '불러오는 중…' : '이전 대화 더 보기'}
          </button>
        )}
        {!loaded && <div className={s.empty}>불러오는 중…</div>}
        {loaded && error && <div className={s.empty}>대화를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</div>}
        {loaded && !error && msgs.length === 0 && (
          <div className={s.empty}>{mode === 'user' ? '궁금한 점을 적어 보내 보세요. 트레이너가 확인하고 답해 드려요.' : '아직 나눈 대화가 없어요.'}</div>
        )}
        {rows}
      </div>
      {sendError && (
        <div role="alert" className={s.sendError}>
          {sendError}
        </div>
      )}
      {mode !== 'admin' && !noTrainer && (
        <form
          className={s.inputBar}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            ref={inputRef}
            className={s.input}
            rows={1}
            value={text}
            maxLength={CHAT_MAX}
            placeholder={mode === 'user' ? `${trainerName || '트레이너'}님께 보낼 말` : `${name} 님께 보낼 말`}
            aria-label="보낼 말"
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className={s.send} disabled={sending || !text.trim()}>
            {sending ? '…' : '보내기'}
          </button>
        </form>
      )}
    </div>
  );
}

/** 읽음 표시: 상대가 안 읽었으면 1, 읽었으면 체크 */
function ReadMark({ read }: { read: boolean }) {
  return read ? (
    <span className={s.read} role="img" aria-label="읽음" title="읽음">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  ) : (
    <span className={s.unread} role="img" aria-label="안 읽음" title="안 읽음">
      1
    </span>
  );
}
