// Pulled into the generated service worker (see workbox.importScripts in
// vite.config.js). Shows a notification-bar pop-up when the server pushes a
// new notification to a device whose app isn't open.

self.addEventListener('push', event => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  event.waitUntil((async () => {
    // The open app already plays the chime and shows its own card, and the
    // browser lets a push go unannounced when a page is on screen.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (windows.some(w => w.visibilityState === 'visible')) return

    await self.registration.showNotification(data.title || 'Savvy Works', {
      body: data.body || '',
      // Same tag as the page's own pop-up for this notification, so the two
      // replace each other instead of stacking.
      tag: data.tag,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { link: data.link || '/' },
      requireInteraction: true,
      vibrate: [200, 100, 200],
    })
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/'

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find(w => w.url.startsWith(self.location.origin))
    if (open) {
      await open.focus()
      open.postMessage({ type: 'open-link', link })
      return
    }
    await self.clients.openWindow(link)
  })())
})
