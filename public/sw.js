// Service Worker — handles background reminder checking & push notifications
const REMINDER_CHECK_INTERVAL = 10000; // Check every 10 seconds
let checkIntervalId = null;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

// Listen for messages from main app
self.addEventListener('message', (event) => {
  const { type, reminders } = event.data || {};

  if (type === 'SYNC_REMINDERS') {
    // Store reminders in the service worker scope
    self._reminders = reminders || [];
    startChecking();
  }

  if (type === 'START_CHECKING') {
    startChecking();
  }
});

function startChecking() {
  if (checkIntervalId) clearInterval(checkIntervalId);
  checkIntervalId = setInterval(() => checkReminders(), REMINDER_CHECK_INTERVAL);
}

async function checkReminders() {
  // Try to get fresh reminders from any open client
  const clients = await self.clients.matchAll({ type: 'window' });

  if (clients.length === 0) {
    // App is closed — check from our cached copy
    const reminders = self._reminders || [];
    const now = new Date();
    let changed = false;

    reminders.forEach((r) => {
      if (!r.completed && !r.notified && new Date(r.time) <= now) {
        // Show notification
        self.registration.showNotification('⏰ RemindAI Task Due!', {
          body: r.title,
          icon: 'https://api.iconify.design/noto:bell.svg',
          badge: 'https://api.iconify.design/noto:bell.svg',
          vibrate: [300, 100, 300, 100, 300],
          requireInteraction: true,
          renotify: true,
          tag: `rem_${r.id}`,
          data: { reminderId: r.id }
        });
        r.notified = true;
        changed = true;
      }
    });

    if (changed) {
      self._reminders = reminders;
    }
  }
  // If clients are open, the main app handles it
}

// Push event (for future server-side push support)
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

// Click notification to open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/') && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow('/');
    })
  );
});
