/**
 * Helpers HTTP compartidos por las Netlify Functions.
 */

import { SESSION_COOKIE, parseCookies, verifySession } from './session.js'

function header(event, name) {
  const h = event?.headers ?? {}
  const lower = name.toLowerCase()
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === lower) return h[k]
  }
  return undefined
}

function allowedOrigins() {
  return String(process.env.PATIO_ALLOWED_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * CORS: si PATIO_ALLOWED_ORIGIN está definido (lista separada por comas) solo se
 * refleja un origen permitido y se habilitan credenciales.
 * Sin la variable se responde `*` (modo compatibilidad, sin cookies cross-origin);
 * la app se sirve del mismo origen, así que las cookies funcionan igual.
 * TODO(fase0): fijar PATIO_ALLOWED_ORIGIN=https://patiocontrol.netlify.app en producción.
 */
export function corsHeaders(event) {
  const base = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Content-Type': 'application/json',
  }
  const list = allowedOrigins()
  if (!list.length) return { ...base, 'Access-Control-Allow-Origin': '*' }
  const origin = header(event, 'origin')
  return {
    ...base,
    'Access-Control-Allow-Origin': origin && list.includes(origin) ? origin : list[0],
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  }
}

export function json(event, statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...corsHeaders(event), ...extraHeaders },
    body: JSON.stringify(body),
  }
}

export function preflight(event) {
  return { statusCode: 204, headers: corsHeaders(event), body: '' }
}

export function getSessionSecret() {
  return String(process.env.PATIO_SESSION_SECRET ?? '')
}

/** Cookie `patio_session` o `Authorization: Bearer <token>`. */
export function getSessionToken(event) {
  const auth = String(header(event, 'authorization') ?? '')
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (m) return m[1].trim()
  const cookies = parseCookies(header(event, 'cookie'))
  return cookies[SESSION_COOKIE] || ''
}

/** ¿La petición llega por HTTPS? (para decidir la bandera Secure en local). */
export function isSecureRequest(event) {
  const proto = String(header(event, 'x-forwarded-proto') ?? '').toLowerCase()
  if (proto) return proto.split(',')[0].trim() === 'https'
  const host = String(header(event, 'host') ?? '')
  return !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
}

/**
 * @param {object} event
 * @param {{ optionalWithoutSecret?: boolean }} [opts]
 * @returns {{ session: null | object, authMode: 'required' | 'optional', error: null | object, headers: Record<string,string> }}
 *   `error` es una respuesta HTTP lista para devolver (401/500).
 *   Sin PATIO_SESSION_SECRET y `optionalWithoutSecret` (default) → compat: session null, sin error,
 *   header `X-Patio-Auth: optional`.
 */
export function requireSession(event, { optionalWithoutSecret = true } = {}) {
  const secret = getSessionSecret()
  if (!secret) {
    const headers = { 'X-Patio-Auth': 'optional' }
    if (optionalWithoutSecret) return { session: null, authMode: 'optional', error: null, headers }
    return {
      session: null,
      authMode: 'optional',
      headers,
      error: json(event, 503, { error: 'Sesiones no configuradas (PATIO_SESSION_SECRET)' }, headers),
    }
  }
  const headers = { 'X-Patio-Auth': 'required' }
  const session = verifySession(getSessionToken(event), secret)
  if (!session) {
    return {
      session: null,
      authMode: 'required',
      headers,
      error: json(event, 401, { error: 'Sesión requerida o expirada. Vuelve a conectar con Google.', needsLogin: true }, headers),
    }
  }
  return { session, authMode: 'required', error: null, headers }
}

const buckets = new Map()

/**
 * Límite en memoria por instancia (ventana fija). Suficiente como freno básico;
 * cada instancia fría de Netlify arranca con su propio Map.
 * @returns {{ ok: boolean, remaining: number, retryAfterSec: number }}
 */
export function rateLimit(key, max, windowMs = 60_000) {
  const now = Date.now()
  let b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs }
    buckets.set(key, b)
  }
  b.count++
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k)
  }
  return {
    ok: b.count <= max,
    remaining: Math.max(0, max - b.count),
    retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
  }
}

export function clientIp(event) {
  return String(
    header(event, 'x-nf-client-connection-ip') ||
      String(header(event, 'x-forwarded-for') ?? '').split(',')[0] ||
      'unknown',
  ).trim()
}

/**
 * Aplica rateLimit y devuelve respuesta 429 o null.
 * @param {object} event
 * @param {string} key
 * @param {number} max
 * @param {Record<string,string>} [extraHeaders]
 */
export function enforceRateLimit(event, key, max, extraHeaders = {}) {
  const r = rateLimit(key, max)
  if (r.ok) return null
  return json(
    event,
    429,
    { error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.', retryAfterSec: r.retryAfterSec },
    { ...extraHeaders, 'Retry-After': String(r.retryAfterSec) },
  )
}

export function parseJsonBody(event) {
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body
    return { body: JSON.parse(raw || '{}'), error: null }
  } catch {
    return { body: null, error: json(event, 400, { error: 'JSON inválido' }) }
  }
}
