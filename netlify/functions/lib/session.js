/**
 * Sesiones firmadas con HMAC-SHA256 (sin estado en servidor).
 * Token: base64url(JSON payload).base64url(firma)
 * Payload: { email, rol, ubicacion, permisos, exp, iat, name?, dispositivoId? } — exp/iat en segundos.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'patio_session'
export const DEFAULT_TTL_SEC = 43200

function b64urlEncode(input) {
  return Buffer.from(input).toString('base64url')
}

function b64urlDecode(input) {
  return Buffer.from(input, 'base64url')
}

function hmac(data, secret) {
  return createHmac('sha256', secret).update(data).digest()
}

/**
 * @param {{ email: string, rol: string, ubicacion?: string, permisos?: object, dispositivoId?: string }} payload
 * @param {string} secret
 * @param {number} [ttlSec]
 */
export function signSession(payload, secret, ttlSec = DEFAULT_TTL_SEC) {
  if (!secret) throw new Error('signSession: secret requerido')
  if (!payload?.email) throw new Error('signSession: email requerido')
  const iat = Math.floor(Date.now() / 1000)
  const body = {
    email: String(payload.email).toLowerCase(),
    rol: payload.rol,
    ubicacion: payload.ubicacion,
    permisos: payload.permisos,
    ...(payload.name ? { name: String(payload.name).slice(0, 120) } : {}),
    ...(payload.dispositivoId ? { dispositivoId: String(payload.dispositivoId).slice(0, 128) } : {}),
    iat,
    exp: iat + Math.max(1, Math.floor(ttlSec)),
  }
  const encoded = b64urlEncode(JSON.stringify(body))
  const sig = b64urlEncode(hmac(encoded, secret))
  return `${encoded}.${sig}`
}

/**
 * @param {string} token
 * @param {string} secret
 * @returns {null | { email: string, rol: string, ubicacion?: string, permisos?: object, exp: number, iat: number, dispositivoId?: string }}
 */
export function verifySession(token, secret) {
  if (!token || !secret || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const [encoded, sig] = parts
  const expected = hmac(encoded, secret)
  let given
  try {
    given = b64urlDecode(sig)
  } catch {
    return null
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let payload
  try {
    payload = JSON.parse(b64urlDecode(encoded).toString('utf8'))
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object' || !payload.email) return null
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp <= now) return null
  return payload
}

/**
 * @param {string} token
 * @param {{ maxAge?: number, secure?: boolean }} [opts]
 */
export function buildSessionCookie(token, { maxAge = DEFAULT_TTL_SEC, secure = true } = {}) {
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    `Max-Age=${Math.floor(maxAge)}`,
    'HttpOnly',
    ...(secure ? ['Secure'] : []),
    'SameSite=Lax',
  ].join('; ')
}

export function buildClearSessionCookie({ secure = true } = {}) {
  return [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    ...(secure ? ['Secure'] : []),
    'SameSite=Lax',
  ].join('; ')
}

/** @param {string | undefined} header */
export function parseCookies(header) {
  /** @type {Record<string, string>} */
  const out = {}
  if (!header) return out
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    if (!k) continue
    const v = part.slice(i + 1).trim()
    try {
      out[k] = decodeURIComponent(v)
    } catch {
      out[k] = v
    }
  }
  return out
}
