// Service worker to handle web push notifications background events
self.addEventListener('push', function(event) {
  let data = { title: 'Reminder due!', body: 'You have a scheduled task pending.' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Reminder!', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/logo.png', // Fallback icon path
    badge: '/badge.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      { action: 'explore', title: 'Open Dashboard' },
      { action: 'close', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
