import { describe, expect, it } from 'vitest'
import { b64url, encryptPayload, fromB64url } from '../worker/webpush'

// RFC 8291 Appendix A
const V = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

describe('encryptPayload', () => {
  it('matches the RFC 8291 test vector', async () => {
    const pub = fromB64url(V.asPublic)
    const jwk = { kty: 'EC', crv: 'P-256', d: V.asPrivate, x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), ext: true }
    const serverKeys = {
      privateKey: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
      publicKey: await crypto.subtle.importKey('raw', pub, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
    }
    const body = await encryptPayload(
      { endpoint: 'https://push.example.net/x', keys: { p256dh: V.uaPublic, auth: V.auth } },
      new TextEncoder().encode(V.plaintext),
      { salt: fromB64url(V.salt), serverKeys },
    )
    expect(b64url(body)).toBe(V.body)
  })
})
