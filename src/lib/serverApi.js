/**
 * Cliente del backend PatioControl (Netlify Functions bajo /api).
 * La sesión vive en la cookie httpOnly `patio_session`; el navegador nunca ve el token.
 */

export class ApiError extends Error {
  /** @param {string} message @param {number} status @param {any} data */
  constructor(message, status, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

/**
 * @param {string} path p. ej. `/api/auth/me`
 * @param {RequestInit & { json?: unknown }} [opts] `json` se serializa como body
 */
export async function apiFetch(path, opts = {}) {
  const { json, headers, ...rest } = opts
  const res = await fetch(path, {
    credentials: 'include',
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  })
  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `Error del servidor (${res.status})`, res.status, data)
  }
  return data
}

/**
 * @param {{ idToken: string, clave: string, dispositivoId?: string }} args
 * @returns {Promise<{ user: { email: string, name: string, rol: string, ubicacion: string, permisos: Record<string, boolean> }, expiresInSec: number }>}
 */
export function loginWithGoogleIdToken({ idToken, clave, dispositivoId }) {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    json: { idToken, clave, dispositivoId },
  })
}

/** Usuario de la sesión actual o `null` si no hay sesión (401) o el backend no está disponible. */
export async function fetchMe() {
  try {
    const data = await apiFetch('/api/auth/me', { method: 'GET' })
    return data?.user ?? null
  } catch (err) {
    if ((err instanceof ApiError && err.status === 401) || isBackendUnavailable(err)) return null
    throw err
  }
}

export async function logout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' })
  } catch {
    // La cookie expira sola; no bloquear el cierre local.
  }
}

/**
 * ¿El error indica que el backend no está disponible/configurado (y conviene usar el flujo legado)?
 * 503 = env faltante; 404/405 = sin Netlify Functions (p. ej. `vite dev`); 5xx/red = caído.
 * 400/401/403/429 son respuestas reales del backend y NO deben caer al legado.
 */
export function isBackendUnavailable(err) {
  if (!(err instanceof ApiError)) return true
  return [404, 405, 500, 502, 503, 504].includes(err.status) || Boolean(err.data?.raw)
}

/**
 * Usuario de /api/auth/login|me → perfil de auth que usa App.jsx
 * (misma forma que `assertUsuarioAutorizado`).
 */
export function mapServerUserToAuthProfile(user, { autorizadoEn = new Date().toISOString() } = {}) {
  if (!user?.email) return null
  const email = String(user.email).trim().toLowerCase()
  const name = user.name || user.nombreKardex || email
  return {
    email,
    name,
    ...(user.picture ? { picture: user.picture } : {}),
    rol: user.rol || 'guardia',
    ubicacion: user.ubicacion || 'todas',
    celular: user.celular || undefined,
    whatsapp: user.whatsapp || undefined,
    permisos: user.permisos,
    nombreKardex: user.nombreKardex || name,
    autorizadoEn,
    sesionServidor: true,
  }
}

/** `exp` (ms) de un JWT sin verificar firma — solo para decidir si reusar un ID token en el cliente. */
export function jwtExpiresAtMs(token) {
  try {
    const part = String(token).split('.')[1]
    if (!part) return 0
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0
  } catch {
    return 0
  }
}

const DEVICE_KEY = 'patio-dispositivo-id'

/** Id estable por dispositivo (localStorage) para auditoría. */
export function getDispositivoId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return ''
  }
}
