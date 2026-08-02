// Service Worker — handles background push notifications
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: '⏰ RemindAI Task Due!', body: 'A task is due now.' };
  try { if (event.data) data = event.data.json(); } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'https://api.iconify.design/noto:bell.svg',
      badge: 'https://api.iconify.design/noto:bell.svg',
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,
      renotify: true,
      tag: `push_${Date.now()}`
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action !== 'dismiss') {
    event.waitUntil(clients.openWindow('/'));
  }
});
