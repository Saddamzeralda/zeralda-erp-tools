// Zeralda ERP Service Worker v3.0 (Network-first to guarantee live updates)
const CACHE_NAME = 'zeralda-erp-cache-v26';
const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls, SSE, JS scripts, HTML pages, or CSS
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/sse') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.css') ||
    url.pathname === '/'
  ) {
    return; // Pass through directly to network
  }

  // Network-first with cache fallback only for static media/fonts
  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
      }
      return networkResponse;
    }).catch(() => caches.match(event.request))
  );
});

// ── Mobile Web Push Notifications Handler ──────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {
    title: 'Zeralda ERP',
    body: 'إشعار جديد من نظام Zeralda ERP',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    url: '/zeralda_erp_dashboard.html',
    tag: 'zeralda-alert',
    timestamp: Date.now()
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = Object.assign(data, parsed);
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    vibrate: [200, 100, 200, 100, 250],
    data: {
      url: data.url || '/zeralda_erp_dashboard.html',
      receivedAt: Date.now()
    },
    actions: [
      { action: 'open', title: 'فتح في النظام ↗' },
      { action: 'dismiss', title: 'إغلاق ✕' }
    ],
    tag: data.tag || 'zeralda-notification',
    renotify: true,
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Zeralda ERP', options)
  );
});

// ── Notification Click: Focus or Open Target ERP Page ──────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/zeralda_erp_dashboard.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a tab is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      // If no window open, open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
