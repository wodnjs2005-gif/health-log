// 휴대폰 알림 보내기 (Vercel 서버 함수)
//
// GET  /api/push        → 알림을 켤 때 휴대폰에 줄 공개 키 { key }. 키를 아직 넣지 않았으면 503
// POST /api/push {id}   → 데이터베이스가 알림 한 건을 줄에 넣고 부른다. 그 번호로 내용을 꺼내(push_take) 보내고,
//                         없어진 휴대폰(404·410)은 push_done 으로 지운다. 번호는 추측할 수 없고 한 번만 꺼낼 수 있다.
//
// Vercel 환경 변수 (Settings → Environment Variables):
//   VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY  알림 서명 키 (node scripts/vapid-keys.mjs 로 만든다. 비밀 키는 이곳에만 둔다)
//   VITE_SUPABASE_URL · VITE_SUPABASE_KEY 앱과 같은 값 (이미 있음)
import webpush from 'web-push';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function supabase() {
  const raw = (process.env.VITE_SUPABASE_URL || '').trim();
  const key = (process.env.VITE_SUPABASE_KEY || '').trim();
  if (!raw || !key) return null;
  let base;
  try {
    base = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw).origin;
  } catch {
    return null;
  }
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (/^eyJ/.test(key)) headers.Authorization = 'Bearer ' + key;
  return async (fn, args) => {
    const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
    const t = await r.text();
    if (!r.ok) throw new Error(`${fn}: ${r.status} ${t.slice(0, 200)}`);
    return t ? JSON.parse(t) : null;
  };
}

export default async function handler(req, res) {
  const pub = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const priv = (process.env.VAPID_PRIVATE_KEY || '').trim();
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    if (!pub || !priv) return res.status(503).json({ error: 'not ready' });
    return res.status(200).json({ key: pub });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;
  const id = body && typeof body.id === 'string' ? body.id : '';
  if (!UUID.test(id)) return res.status(400).json({ error: 'id' });
  const rpc = supabase();
  if (!pub || !priv || !rpc) return res.status(503).json({ error: 'not ready' });

  const job = await rpc('push_take', { p_id: id });
  if (!job) return res.status(200).json({ sent: 0 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://health-log-sand.vercel.app', pub, priv);
  const payload = JSON.stringify(job.payload);
  const results = await Promise.allSettled(
    job.subs.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: 'high' }),
    ),
  );
  const gone = [];
  let sent = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') sent++;
    else if (r.reason && (r.reason.statusCode === 404 || r.reason.statusCode === 410)) gone.push(job.subs[i].endpoint);
    else console.error('push failed', r.reason && (r.reason.statusCode || r.reason.message));
  });
  await rpc('push_done', { p_id: id, p_gone: gone }).catch((e) => console.error(e.message));
  return res.status(200).json({ sent, gone: gone.length });
}

function safeJson(t) {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}
