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

// Basic install/fetch to satisfy PWA requirements
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // We don't cache much for now to avoid stale data, but listener is required for PWA installability
  return;
});
