// Service worker: caches the app shell for fast, offline-capable starts, and
// shows push notifications even when Weee is closed.
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// Vibration per kind (Android). iPhone uses its standard notification sound.
const VIBRATE = {
  chat: [80, 60, 80],
  reminder: [200, 100, 200, 100, 400],
  nudge: [70, 110, 70, 700, 70, 110, 70],   // a heartbeat
  countdown: [100, 60, 100, 60, 300],
  item: [100],
  plan: [100, 60, 100],
  test: [100, 60, 100],
};

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  // Always a full, audible notification. (Quieting it when the app looked "open"
  // made iPhone deliver notifications silently while Weee was closed in the
  // background, because iOS can still report a suspended app as visible.)
  event.waitUntil(self.registration.showNotification(data.title || 'Weee', {
    body: data.body || '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: data.tag,
    // A notification replacing an older one with the same tag (e.g. the chat)
    // is silent unless renotify is set: always alert again.
    renotify: Boolean(data.tag),
    silent: false,
    vibrate: VIBRATE[data.kind] || [100],
    timestamp: Date.now(),
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of windows) {
      if ('focus' in w) {
        await w.focus();
        if (url !== '/' && 'navigate' in w) await w.navigate(url);
        return;
      }
    }
    return self.clients.openWindow(url);
  })());
});
