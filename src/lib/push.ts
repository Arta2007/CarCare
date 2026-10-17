import { getSettings, updateSettings } from './db'
import { allReminders } from './store'

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function serverUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

/**
 * Subscribes this device to Web Push through the self-hosted relay in
 * worker/. Must run from a user tap, inside the Home Screen app on iOS.
 */
export async function enablePush(server: string): Promise<void> {
  const base = serverUrl(server)
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('اجازه‌ی اعلان داده نشد')
  const res = await fetch(`${base}/api/vapid`)
  if (!res.ok) throw new Error('سرور اعلان در دسترس نیست')
  const { publicKey } = (await res.json()) as { publicKey: string }
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(publicKey) }))
  await updateSettings({ pushServer: base })
  await syncPush(sub)
}

export async function disablePush(): Promise<void> {
  const settings = await getSettings()
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub && settings.pushServer) {
    await fetch(`${settings.pushServer}/api/unsubscribe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {})
  }
  await sub?.unsubscribe()
  await updateSettings({ pushServer: undefined, lastPushSync: undefined })
}

/**
 * Uploads the next 60 days of reminders. The relay only learns reminder
 * text and times — the car data itself never leaves the phone.
 */
export async function syncPush(sub?: PushSubscription | null): Promise<boolean> {
  const settings = await getSettings()
  if (!settings.pushServer || !pushSupported()) return false
  const reg = await navigator.serviceWorker.ready
  sub ??= await reg.pushManager.getSubscription()
  if (!sub) return false
  const reminders = (await allReminders(60)).slice(0, 200).map(({ id, at, title, body, url }) => ({ id, at, title, body, url }))
  const res = await fetch(`${settings.pushServer}/api/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), reminders }),
  })
  if (!res.ok) return false
  await updateSettings({ lastPushSync: Date.now() })
  return true
}

/** Red badge on the Home Screen icon (iOS 16.4+, needs notification permission) */
export async function updateBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  try {
    if (count > 0) await nav.setAppBadge?.(count)
    else await nav.clearAppBadge?.()
  } catch {
    // Badging is best-effort
  }
}

export async function testPush(): Promise<boolean> {
  const settings = await getSettings()
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!settings.pushServer || !sub) return false
  const res = await fetch(`${settings.pushServer}/api/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) })
  return res.ok
}
