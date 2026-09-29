// 맞춤 건강관리 · 휴대폰 알림을 받아 보여 주는 서비스 워커.
// 화면을 저장해 두는 일(오프라인)은 하지 않는다 (항상 새 화면을 받도록).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    (async () => {
      // 앱을 보고 있는 중이면 알림 대신 화면에 알린다 (대화는 초인종으로 이미 들어온다)
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const seen = wins.filter((w) => w.visibilityState === 'visible' && w.focused);
      if (seen.length) {
        seen.forEach((w) => w.postMessage({ type: 'healthlog-push', tag: d.tag || '', url: d.url || '/' }));
        return;
      }
      await self.registration.showNotification(d.title || '맞춤 건강관리', {
        body: d.body || '',
        icon: '/icon-192.png',
        badge: '/badge-96.png',
        tag: d.tag || 'healthlog',
        renotify: true,
        lang: 'ko',
        data: { url: d.url || '/' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin);
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const w = wins.find((x) => new URL(x.url).origin === url.origin);
      if (w) {
        await w.focus();
        w.postMessage({ type: 'healthlog-go', url: url.pathname + url.search });
        return;
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
