/**
 * Minimal Web Push sender for Cloudflare Workers using only WebCrypto:
 * VAPID (RFC 8292) authentication and aes128gcm payload encryption (RFC 8291).
 */

export interface PushSubscriptionJSON {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface VapidKeys {
  /** Uncompressed P-256 public key, base64url */
  publicKey: string
  /** Private key as a JWK JSON string */
  privateJwk: string
  /** "mailto:you@example.com" or an https URL — Apple rejects pushes without a valid one */
  subject: string
}

const encoder = new TextEncoder()
const utf8 = (s: string): Uint8Array<ArrayBuffer> => new Uint8Array(encoder.encode(s))

export function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

/** HKDF with a single expand block (all outputs here are ≤ 32 bytes) */
async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
  const prk = await hmac(salt, ikm)
  return new Uint8Array((await hmac(prk, concat(info, new Uint8Array([1])))).subarray(0, length))
}

export interface EncryptOptions {
  /** Test hooks for deterministic output (RFC 8291 Appendix A) */
  salt?: Uint8Array<ArrayBuffer>
  serverKeys?: CryptoKeyPair
}

export async function encryptPayload(sub: PushSubscriptionJSON, plaintext: Uint8Array<ArrayBuffer>, opts: EncryptOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = fromB64url(sub.keys.p256dh)
  const authSecret = fromB64url(sub.keys.auth)
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const serverKeys = opts.serverKeys ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair)
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', serverKeys.publicKey)) as ArrayBuffer)

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as Parameters<SubtleCrypto['deriveBits']>[0], serverKeys.privateKey, 256))

  const keyInfo = concat(utf8('WebPush: info\0'), uaPublic, asPublic)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12)

  // Single record: plaintext followed by the 0x02 last-record delimiter
  const record = concat(plaintext, new Uint8Array([2]))
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record))

  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext)
}

async function vapidHeader(endpoint: string, vapid: VapidKeys): Promise<string> {
  const aud = new URL(endpoint).origin
  const header = b64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64url(utf8(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.subject })))
  const key = await crypto.subtle.importKey('jwk', JSON.parse(vapid.privateJwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  // WebCrypto already returns the raw r||s form JWS expects
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${header}.${claims}`)))
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${vapid.publicKey}`
}

export async function sendPush(sub: PushSubscriptionJSON, payload: unknown, vapid: VapidKeys, ttlSeconds = 86_400): Promise<Response> {
  const body = await encryptPayload(sub, utf8(JSON.stringify(payload)))
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(sub.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSeconds),
      Urgency: 'normal',
    },
    body,
  })
}
