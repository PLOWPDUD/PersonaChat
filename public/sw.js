// Service Worker for Background Notifications and PWA functionality
self.addEventListener('push', function(event) {
  const data = event.data?.json() || {};
  const title = data.title || 'New Notification';
  const options = {
    body: data.message || 'Check the app for updates.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});

const CACHE_NAME = 'personachat-v1';
const OFFLINE_URL = '/index.html';

// Basic install/fetch to satisfy PWA requirements
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([OFFLINE_URL]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }
  event.respondWith(fetch(event.request));
});
