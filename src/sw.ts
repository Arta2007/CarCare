/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope

// Precache the whole app so it opens with no connection at all
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${import.meta.env.BASE_URL}index.html`)))

self.skipWaiting()
clientsClaim()

interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  badge?: number
}

self.addEventListener('push', (event) => {
  let data: PushPayload = { title: 'کارکر', body: 'یک یادآور جدید داری' }
  try {
    if (event.data) data = { ...data, ...(event.data.json() as PushPayload) }
  } catch {
    // Keep the generic text; iOS requires a visible notification for every push
  }
  const nav = self.navigator as WorkerNavigator & { setAppBadge?: (n?: number) => Promise<void> }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, {
        body: data.body,
        tag: data.tag,
        icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
        data: { url: data.url ?? '' },
        lang: 'fa',
        dir: 'rtl',
      }),
      nav.setAppBadge?.(data.badge).catch(() => {}),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = `${self.registration.scope}${(event.notification.data?.url as string) ?? ''}`
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of windows) {
        if ('focus' in w) {
          await w.focus()
          await (w as WindowClient).navigate(target).catch(() => {})
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
