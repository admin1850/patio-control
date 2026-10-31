/**
 * Helpers HTTP compartidos por las Netlify Functions.
 */

import { timingSafeEqual } from 'node:crypto'
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Patio-Key',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

/**
 * Secreto HMAC de la cookie de sesión. Solo el valor de `PATIO_SESSION_SECRET`.
 * Vacío si no está definido: no hay secreto por defecto.
 */
export function getSessionSecret() {
  return String(process.env.PATIO_SESSION_SECRET ?? '').trim()
}

export const MISSING_SESSION_SECRET_LOG =
  '[patio-auth] Falta PATIO_SESSION_SECRET. No se emite ni se acepta la sesión (fail closed). ' +
  'Configúrala en Netlify Production con un valor aleatorio; no hay secreto por defecto.'

export function logMissingSessionSecret() {
  console.error(MISSING_SESSION_SECRET_LOG)
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
 * @returns {{ session: null | object, authMode: 'required' | 'unconfigured', error: null | object, headers: Record<string,string> }}
 *   `error` es una respuesta HTTP lista para devolver (401/503).
 *   Sin `PATIO_SESSION_SECRET` no se acepta la sesión: 503 y error en el log.
 *   El segundo argumento se ignora; el modo opcional ya no existe.
 */
export function requireSession(event) {
  const secret = getSessionSecret()
  if (!secret) {
    logMissingSessionSecret()
    const headers = { 'X-Patio-Auth': 'unconfigured' }
    return {
      session: null,
      authMode: 'unconfigured',
      headers,
      error: json(event, 503, { error: 'Sesiones no configuradas (PATIO_SESSION_SECRET).' }, headers),
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

function secretEquals(given, expected) {
  const left = Buffer.from(String(given))
  const right = Buffer.from(String(expected))
  if (left.length !== right.length) {
    timingSafeEqual(left, left)
    return false
  }
  return timingSafeEqual(left, right)
}

/** Valor del header `X-Patio-Key` (App Chofer, Frotcom, ERP). */
export function readIntegrationKey(event) {
  return String(header(event, 'x-patio-key') ?? '').trim()
}

export function integrationKeyOk(event, env = process.env) {
  const expected = String(env.PATIO_INTEGRATION_KEY ?? '').trim()
  const given = readIntegrationKey(event)
  if (!expected || !given) return false
  return secretEquals(given, expected)
}

function integrationSession() {
  return {
    email: 'integracion@patio.local',
    rol: 'integracion',
    name: 'Integración',
    permisos: { entrada: true, salida: true, parado: true, baja: true, historial: true, kpis: true, equipos: true },
    via: 'integration-key',
  }
}

/**
 * Sesión de patio o header `X-Patio-Key` igual a `PATIO_INTEGRATION_KEY`.
 * Sin secreto de sesión y sin llave: 503. No hay modo anónimo.
 * El segundo argumento se ignora.
 * @param {object} event
 */
export function requireSessionOrIntegration(event) {
  if (integrationKeyOk(event)) {
    return {
      session: integrationSession(),
      authMode: 'integration',
      error: null,
      headers: { 'X-Patio-Auth': 'integration-key' },
    }
  }
  const secret = getSessionSecret()
  const keyConfigured = Boolean(String(process.env.PATIO_INTEGRATION_KEY ?? '').trim())
  const sessionAuth = secret ? requireSession(event) : null
  if (sessionAuth && !sessionAuth.error) return sessionAuth
  if (!secret && !keyConfigured) {
    logMissingSessionSecret()
    console.error(
      '[patio-auth] Tampoco está PATIO_INTEGRATION_KEY. Se rechaza la solicitud anónima (fail closed).',
    )
    const headers = { 'X-Patio-Auth': 'unconfigured' }
    return {
      session: null,
      authMode: 'unconfigured',
      headers,
      error: json(
        event,
        503,
        { error: 'Integraciones sin configurar (PATIO_SESSION_SECRET o PATIO_INTEGRATION_KEY).' },
        headers,
      ),
    }
  }
  if (readIntegrationKey(event)) {
    const headers = { 'X-Patio-Auth': 'integration-key' }
    return {
      session: null,
      authMode: 'integration',
      headers,
      error: json(event, 401, { error: 'Llave de integración inválida. Usa el header X-Patio-Key.' }, headers),
    }
  }
  if (sessionAuth?.error) return sessionAuth
  if (!secret) logMissingSessionSecret()
  const headers = { 'X-Patio-Auth': 'integration-key' }
  return {
    session: null,
    authMode: 'integration',
    headers,
    error: json(event, 401, { error: 'Se requiere sesión de patio o el header X-Patio-Key.' }, headers),
  }
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
