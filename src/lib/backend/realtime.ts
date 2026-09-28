// 대화 초인종: Supabase 실시간(Phoenix 웹소켓)의 한 채널을 듣다가 신호가 오면 onRing 을 부른다.
// 신호에는 내용이 없다 (메시지는 번호·로그인을 확인하는 RPC 로 따로 가져온다). 라이브러리 없이 최소한만 구현한다.

const HEARTBEAT_MS = 25_000;
const RETRY_MS = [1_000, 3_000, 10_000, 30_000];

/** base = https://<ref>.supabase.co, key = anon/publishable 키, topic = 채널 이름 */
export function listenRing(base: string, key: string, topic: string, onRing: () => void): () => void {
  const url = base.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(key) + '&vsn=1.0.0';
  const full = 'realtime:' + topic;
  let ws: WebSocket | null = null;
  let beat: number | undefined;
  let retry: number | undefined;
  let tries = 0;
  let ref = 0;
  let stopped = false;

  const send = (msg: object) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ...msg, ref: String(++ref) }));
  };

  const connect = () => {
    if (stopped) return;
    try {
      ws = new WebSocket(url);
    } catch {
      return schedule();
    }
    ws.onopen = () => {
      send({ topic: full, event: 'phx_join', join_ref: '1', payload: { config: { broadcast: { self: false }, presence: { key: '' }, private: false } } });
      beat = window.setInterval(() => send({ topic: 'phoenix', event: 'heartbeat', payload: {} }), HEARTBEAT_MS);
    };
    ws.onmessage = (e) => {
      let m: { topic?: string; event?: string; payload?: { status?: string } };
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.topic !== full) return;
      if (m.event === 'phx_reply' && m.payload?.status === 'ok') {
        // 연결될 때마다 한 번 울려 끊긴 사이에 온 메시지를 가져오게 한다
        if (tries > 0) onRing();
        tries = 0;
      }
      if (m.event === 'broadcast') onRing();
    };
    ws.onclose = () => {
      window.clearInterval(beat);
      ws = null;
      schedule();
    };
  };

  const schedule = () => {
    if (stopped) return;
    window.clearTimeout(retry);
    retry = window.setTimeout(connect, RETRY_MS[Math.min(tries, RETRY_MS.length - 1)]);
    tries++;
  };

  connect();
  return () => {
    stopped = true;
    window.clearTimeout(retry);
    window.clearInterval(beat);
    ws?.close();
  };
}
