/**
 * CarCare push relay — optional Cloudflare Worker.
 *
 * The phone uploads its Web Push subscription plus the reminder texts and
 * times for the next 60 days; a cron trigger sends whatever is due. No car
 * data is stored here, only the notification text.
 */
import { sendPush, type PushSubscriptionJSON } from './webpush'

interface Env {
  PUSH_KV: KVNamespace
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_JWK: string
  VAPID_SUBJECT: string
  /** e.g. https://yourname.github.io — defaults to * */
  ALLOWED_ORIGIN?: string
}

interface Reminder {
  id: string
  at: number
  title: string
  body: string
  url: string
}

interface Stored {
  subscription: PushSubscriptionJSON
  reminders: Reminder[]
  updatedAt: number
}

// Only real push services, so the relay can't be used to POST anywhere else
const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /^push\.services\.mozilla\.com$/]

function cors(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
  }
}

function json(env: Env, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...cors(env) } })
}

async function keyFor(endpoint: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)))
  return `sub:${[...digest].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

function validSubscription(s: unknown): s is PushSubscriptionJSON {
  const sub = s as PushSubscriptionJSON
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return false
  try {
    const u = new URL(sub.endpoint)
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname))
  } catch {
    return false
  }
}

function cleanReminders(raw: unknown): Reminder[] {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, 200)
    .filter((r) => r && typeof r.id === 'string' && typeof r.at === 'number')
    .map((r) => ({ id: String(r.id).slice(0, 120), at: r.at, title: String(r.title ?? '').slice(0, 120), body: String(r.body ?? '').slice(0, 300), url: String(r.url ?? '').slice(0, 120) }))
}

async function deliverDue(env: Env): Promise<void> {
  const now = Date.now()
  const vapid = { publicKey: env.VAPID_PUBLIC_KEY, privateJwk: env.VAPID_PRIVATE_JWK, subject: env.VAPID_SUBJECT }
  let cursor: string | undefined
  do {
    const page = await env.PUSH_KV.list({ prefix: 'sub:', cursor })
    for (const { name } of page.keys) {
      const stored = await env.PUSH_KV.get<Stored>(name, 'json')
      if (!stored) continue
      const due = stored.reminders.filter((r) => r.at <= now)
      if (!due.length) continue
      const remaining = stored.reminders.filter((r) => r.at > now)
      let gone = false
      // Stale reminders (phone was off, relay was down) are merged into one
      const fresh = due.filter((r) => now - r.at < 2 * 86_400_000).slice(-3)
      for (const r of fresh) {
        const res = await sendPush(stored.subscription, { title: r.title, body: r.body, url: r.url, tag: r.id, badge: remaining.length ? undefined : 1 }, vapid)
        if (res.status === 404 || res.status === 410) {
          gone = true
          break
        }
      }
      if (gone) await env.PUSH_KV.delete(name)
      else await env.PUSH_KV.put(name, JSON.stringify({ ...stored, reminders: remaining }))
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url)
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(env) })

    if (pathname === '/api/vapid' && req.method === 'GET') return json(env, { publicKey: env.VAPID_PUBLIC_KEY })

    if (pathname === '/api/sync' && req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as { subscription?: unknown; reminders?: unknown } | null
      if (!validSubscription(body?.subscription)) return json(env, { error: 'invalid subscription' }, 400)
      const stored: Stored = { subscription: body.subscription, reminders: cleanReminders(body.reminders), updatedAt: Date.now() }
      // Drop subscriptions nobody has synced for 6 months
      await env.PUSH_KV.put(await keyFor(stored.subscription.endpoint), JSON.stringify(stored), { expirationTtl: 180 * 86_400 })
      return json(env, { ok: true, count: stored.reminders.length })
    }

    if (pathname === '/api/unsubscribe' && req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as { endpoint?: string } | null
      if (body?.endpoint) await env.PUSH_KV.delete(await keyFor(body.endpoint))
      return json(env, { ok: true })
    }

    if (pathname === '/api/test' && req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as { subscription?: unknown } | null
      if (!validSubscription(body?.subscription)) return json(env, { error: 'invalid subscription' }, 400)
      const res = await sendPush(body.subscription, { title: 'کارکر', body: 'اعلان‌ها درست کار می‌کنند ✓' }, { publicKey: env.VAPID_PUBLIC_KEY, privateJwk: env.VAPID_PRIVATE_JWK, subject: env.VAPID_SUBJECT })
      return json(env, { status: res.status }, res.ok ? 200 : 502)
    }

    return json(env, { error: 'not found' }, 404)
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(deliverDue(env))
  },
} satisfies ExportedHandler<Env>
