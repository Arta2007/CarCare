// Generates a VAPID key pair for the push relay. Prints the values to paste
// into `wrangler secret put` — nothing is written to disk.
const { subtle } = globalThis.crypto

const keys = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const raw = new Uint8Array(await subtle.exportKey('raw', keys.publicKey))
const jwk = await subtle.exportKey('jwk', keys.privateKey)
const b64url = (b) => Buffer.from(b).toString('base64url')

console.log('VAPID_PUBLIC_KEY:\n' + b64url(raw) + '\n')
console.log('VAPID_PRIVATE_JWK (keep secret, do not commit):\n' + JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }) + '\n')
console.log('Next:\n  npx wrangler secret put VAPID_PUBLIC_KEY\n  npx wrangler secret put VAPID_PRIVATE_JWK\n  npx wrangler secret put VAPID_SUBJECT   (e.g. mailto:you@example.com)')
