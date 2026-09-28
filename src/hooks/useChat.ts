import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import type { ChatRoom } from '../lib/backend';

/** 앱이 다시 화면에 나타나면 (휴대폰을 다시 켜면) 부른다 */
function useOnVisible(fn: () => void) {
  useEffect(() => {
    const on = () => {
      if (document.visibilityState === 'visible') fn();
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [fn]);
}

/**
 * 이용자: 안 읽은 수와 초인종. 초인종이 울리면 ring 이 1 늘어난다 (열린 대화방이 새 메시지를 가져가도록).
 * open 이면 대화방이 보고 있으므로 안 읽은 수는 0 으로 본다.
 */
export function useUserChat(open: boolean) {
  const { be, userCode } = useApp();
  const [key, setKey] = useState('');
  const [unread, setUnread] = useState(0);
  const [ring, setRing] = useState(0);

  const load = useCallback(async () => {
    if (!userCode) return;
    try {
      const s = await be.userChatStatus(userCode);
      setKey(s.key);
      setUnread(s.unread);
    } catch {
      /* 연결이 안 되면 다음에 */
    }
  }, [be, userCode]);

  useEffect(() => {
    if (!open) void load(); // 대화방을 닫으면 다시 센다
  }, [load, open]);

  const bump = useCallback(() => {
    setRing((r) => r + 1);
    void load();
  }, [load]);

  useEffect(() => (key ? be.chatListen(key, bump) : undefined), [be, key, bump]);
  useOnVisible(bump);

  return { unread: open ? 0 : unread, ring };
}

/** 트레이너·관리자: 대화방 목록과 초인종 (enabled 일 때만 연결) */
export function useStaffChat(enabled = true) {
  const { be, staffToken } = useApp();
  const [key, setKey] = useState('');
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [ring, setRing] = useState(0);

  const load = useCallback(async () => {
    if (!staffToken || !enabled) return;
    try {
      const r = await be.staffChatList(staffToken);
      setKey(r.key);
      setRooms(r.rooms);
    } catch {
      /* 연결이 안 되면 다음에 */
    }
    setLoaded(true);
  }, [be, staffToken, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const bump = useCallback(() => {
    setRing((r) => r + 1);
    void load();
  }, [load]);

  useEffect(() => (key && enabled ? be.chatListen(key, bump) : undefined), [be, key, enabled, bump]);
  useOnVisible(bump);

  const unread = rooms.reduce((a, r) => a + r.unread, 0);
  return { rooms, loaded, unread, ring, reload: load };
}
