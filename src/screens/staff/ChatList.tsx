import { useEffect, useState } from 'react';
import { useApp } from '../../AppContext';
import { Avatar } from '../../components/Avatar';
import { chatWhen, ChatScreen } from '../../components/Chat';
import c from '../../components/Chat.module.css';
import type { useStaffChat } from '../../hooks/useChat';
import { cx } from '../../lib/cx';
import { EMPTY_FILTER, matchMember } from '../../lib/tags';
import ui from '../../styles/ui.module.css';
import s from './staff.module.css';

interface Props {
  mode: 'trainer' | 'admin';
  chat: ReturnType<typeof useStaffChat>;
  /** false 면 제목 줄을 빼고 (창 제목이 따로 있을 때) */
  heading?: boolean;
}

/**
 * 대화방 목록: 최근 대화 순서, 안 읽은 수 (트레이너만).
 * 트레이너는 이름을 찾아 아직 대화가 없는 분과도 새 대화를 시작할 수 있다. 관리자는 보기만.
 */
export function ChatList({ mode, chat, heading = true }: Props) {
  const { data, today, staffId } = useApp();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const tone = mode === 'trainer' ? 'orange' : 'navy';
  const nameOf = (mid: string) => data.members.find((m) => m.id === mid)?.name ?? '';
  const match = (mid: string) => {
    const m = data.members.find((x) => x.id === mid);
    return !!m && matchMember(m, { ...EMPTY_FILTER, q });
  };
  const rooms = chat.rooms.filter((r) => match(r.mid));
  // 트레이너: 담당 이용자 중 아직 대화가 없는 분도 보여준다 (새 대화). 이름으로 찾을 수 있다
  const mine = mode === 'trainer' ? data.members.filter((m) => data.assign[m.id] === staffId) : [];
  const others = mine.filter((m) => !chat.rooms.some((r) => r.mid === m.id) && matchMember(m, { ...EMPTY_FILTER, q }));
  const opened = open ? data.members.find((m) => m.id === open) : null;

  // 열어 둔 대화방의 새 메시지는 알림을 띄우지 않는다
  const openMid = chat.openMid;
  useEffect(() => {
    openMid.current = open;
    return () => {
      openMid.current = null;
    };
  }, [open, openMid]);
  const close = () => {
    setOpen(null);
    void chat.reload();
  };

  return (
    <>
      {heading && (
        <div className={ui.row} style={{ padding: '0.25rem', alignItems: 'center' }}>
          <h2 className={ui.h2}>{mode === 'trainer' ? '이용자와 대화' : '대화 기록'}</h2>
          {chat.unread > 0 && <span className={c.badge}>{chat.unread}</span>}
        </div>
      )}
      {mode === 'admin' && <div className={ui.muted}>이용자와 트레이너가 나눈 대화를 볼 수 있어요. 관리자는 보기만 해요.</div>}
      {mode === 'trainer' && mine.length === 0 && (
        <div className={ui.empty}>담당 이용자가 없어요. 관리자에게 담당을 정해 달라고 해 주세요. 대화는 담당 이용자와만 할 수 있어요.</div>
      )}
      {(chat.rooms.length > 0 || mine.length > 0) && (
        <input
          type="search"
          className={s.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름으로 찾기"
          aria-label="대화할 이용자 찾기"
          autoComplete="off"
          enterKeyHint="search"
        />
      )}
      {!chat.loaded && <div className={ui.empty}>불러오는 중…</div>}
      {chat.loaded && chat.rooms.length === 0 && mode === 'admin' && <div className={ui.empty}>아직 나눈 대화가 없어요.</div>}
      {chat.loaded && q.trim() && rooms.length === 0 && others.length === 0 && <div className={ui.empty}>찾는 이용자가 없어요.</div>}

      <div className={c.rooms}>
        {rooms.map((r) => (
          <button key={r.mid} type="button" className={cx(ui.card, c.room)} onClick={() => setOpen(r.mid)}>
            <Avatar id={r.mid} name={nameOf(r.mid)} tone={tone} />
            <span className={c.roomMain}>
              <span className={c.roomTop}>
                <span className={c.roomName}>{nameOf(r.mid)}</span>
                <span className={c.roomWhen}>{chatWhen(r.last.at, today)}</span>
              </span>
              <span className={c.roomLast}>
                {r.last.from === 'trainer' ? `${r.last.by.split(' ')[0] || '트레이너'}: ` : ''}
                {r.last.text}
              </span>
            </span>
            {r.unread > 0 && (
              <span className={c.badge} aria-label={`안 읽은 메시지 ${r.unread}개`}>
                {r.unread}
              </span>
            )}
          </button>
        ))}
        {others.length > 0 && rooms.length > 0 && <div className={ui.small}>아직 대화가 없는 담당 이용자</div>}
        {others.map((m) => (
          <button key={m.id} type="button" className={cx(ui.card, c.room)} onClick={() => setOpen(m.id)}>
            <Avatar id={m.id} name={m.name} tone={tone} />
            <span className={c.roomMain}>
              <span className={c.roomName}>{m.name}</span>
              <span className={c.roomLast}>새 대화 시작하기</span>
            </span>
          </button>
        ))}
      </div>

      {opened && <ChatScreen mid={opened.id} name={opened.name} mode={mode} ring={chat.ring} onClose={close} />}
    </>
  );
}
