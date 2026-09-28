import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import type { ChatRoom, ChatTrainer } from '../lib/backend';
import { trainerTitle } from '../lib/rank';

const TITLE = '맞춤 건강관리';

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

/** 안 읽은 수를 브라우저 탭 제목에도: (2) 맞춤 건강관리 */
function useTitleCount(n: number) {
  useEffect(() => {
    document.title = n > 0 ? `(${n}) ${TITLE}` : TITLE;
    return () => {
      document.title = TITLE;
    };
  }, [n]);
}

/** 새 메시지 알림: 화면 위 알림 + (되는 휴대폰은) 짧은 진동 */
function useNotify() {
  const { toast } = useApp();
  return useCallback(
    (msg: string) => {
      toast(msg);
      try {
        navigator.vibrate?.(200);
      } catch {
        /* 진동이 안 되는 기기 */
      }
    },
    [toast],
  );
}

/**
 * 이용자: 안 읽은 수, 담당 트레이너, 초인종. 초인종이 울리면 ring 이 1 늘어난다 (열린 대화방이 새 메시지를 가져가도록).
 * open 이면 대화방이 보고 있으므로 안 읽은 수는 0 으로 보고 알림도 띄우지 않는다.
 */
export function useUserChat(open: boolean) {
  const { be, userCode } = useApp();
  const notify = useNotify();
  const [key, setKey] = useState('');
  const [unread, setUnread] = useState(0);
  const [trainer, setTrainer] = useState<ChatTrainer | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [ring, setRing] = useState(0);
  const prev = useRef<number | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const load = useCallback(async () => {
    if (!userCode) return;
    try {
      const s = await be.userChatStatus(userCode);
      setKey(s.key);
      setTrainer(s.trainer);
      setUnread(s.unread);
      setLoaded(true);
      // 대화방을 보고 있지 않을 때 새 답장이 오면 알린다 (처음 불러올 때는 빼고)
      if (prev.current !== null && s.unread > prev.current && !openRef.current)
        notify(s.trainer ? `${trainerTitle(s.trainer.name, s.trainer.rank)}님이 답장을 보냈어요` : '새 메시지가 왔어요');
      prev.current = s.unread;
    } catch {
      /* 연결이 안 되면 다음에 */
    }
  }, [be, userCode, notify]);

  useEffect(() => {
    if (open) prev.current = 0;
    else void load(); // 대화방을 닫으면 다시 센다
  }, [load, open]);

  const bump = useCallback(() => {
    setRing((r) => r + 1);
    void load();
  }, [load]);

  useEffect(() => (key ? be.chatListen(key, bump) : undefined), [be, key, bump]);
  useOnVisible(bump);
  useTitleCount(open ? 0 : unread);

  return { unread: open ? 0 : unread, trainer, loaded, ring };
}

/**
 * 트레이너·관리자: 대화방 목록과 초인종 (enabled 일 때만 연결).
 * 트레이너는 담당 이용자의 새 메시지가 오면 알림이 뜬다 (지금 열어 둔 대화방은 빼고: openMid 에 넣는다).
 */
export function useStaffChat(enabled = true) {
  const { be, data, staffToken, staffRole } = useApp();
  const notify = useNotify();
  const [key, setKey] = useState('');
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [ring, setRing] = useState(0);
  const openMid = useRef<string | null>(null);
  const prev = useRef<Map<string, number> | null>(null);
  const members = useRef(data.members);
  members.current = data.members;

  const load = useCallback(async () => {
    if (!staffToken || !enabled) return;
    try {
      const r = await be.staffChatList(staffToken);
      setKey(r.key);
      setRooms(r.rooms);
      if (staffRole === 'trainer') {
        const before = prev.current;
        if (before) {
          const news = r.rooms.filter((x) => x.mid !== openMid.current && x.unread > (before.get(x.mid) ?? 0));
          if (news.length) {
            const name = members.current.find((m) => m.id === news[0].mid)?.name ?? '이용자';
            notify(news.length > 1 ? `${name} 님 외 ${news.length - 1}명이 메시지를 보냈어요` : `${name} 님이 메시지를 보냈어요`);
          }
        }
        prev.current = new Map(r.rooms.map((x) => [x.mid, x.unread]));
      }
    } catch {
      /* 연결이 안 되면 다음에 */
    }
    setLoaded(true);
  }, [be, staffToken, staffRole, enabled, notify]);

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
  useTitleCount(staffRole === 'trainer' ? unread : 0);
  return { rooms, loaded, unread, ring, reload: load, openMid };
}
