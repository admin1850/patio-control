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

/** Lista de movimientos en el servidor (sesión). Con `sesionServidor` el refresh del patio usa esta lista. */
export function listMovimientosServer(limit = 500) {
  const n = Number(limit)
  const q = Number.isFinite(n) && n > 0 ? `?limit=${encodeURIComponent(String(Math.floor(n)))}` : ''
  return apiFetch(`/api/movimientos${q}`, { method: 'GET' })
}

/** Inventario de la yarda (agregados, unidades y slots). */
export function fetchInventario(yarda) {
  const q = yarda && yarda !== 'todas' ? `?yarda=${encodeURIComponent(yarda)}` : ''
  return apiFetch(`/api/inventario${q}`, { method: 'GET' })
}

/** Alta o actualización de un slot de yarda. */
export function guardarZonaSlot(slot) {
  return apiFetch('/api/zonas-slots', { method: 'POST', json: slot })
}

export function iniciarConteo(body) {
  return apiFetch('/api/conteo/iniciar', { method: 'POST', json: body })
}

export function capturarConteo(id, body) {
  return apiFetch(`/api/conteo/${encodeURIComponent(id)}/captura`, { method: 'POST', json: body })
}

export function cerrarConteo(id, body = {}) {
  return apiFetch(`/api/conteo/${encodeURIComponent(id)}/cerrar`, { method: 'POST', json: body })
}

/** Escribe zona/slot/ubicación en EstadoUnidad. No lanza: devuelve un aviso en español o null. */
export async function ubicarTrasMovimiento(mov) {
  const tipo = String(mov?.tipo || '').trim().toLowerCase()
  if (!['entrada', 'salida', 'parado'].includes(tipo)) return null
  const ubicacion = mov.ubicacionInventario || (tipo === 'salida' ? (mov.trasladoTallerExterno ? 'EN_TALLER_EXTERNO' : 'EN_RUTA') : 'EN_PATIO')
  const body = {
    unidadId: mov.equipoId || mov.unidadId || '',
    placa: mov.placa || '',
    tipo: mov.equipoTipo || mov.tipoUnidad || '',
    yarda: mov.yardaId || mov.yarda || '',
    tipoMovimiento: tipo,
    ubicacion,
    movimientoId: mov.id || '',
  }
  if (mov.zona) body.zona = mov.zona
  if (mov.slot) body.slot = mov.slot
  if (tipo !== 'salida' && mov.placaCaja1) body.enganchadaA = mov.placaCaja1
  if (mov.cliente && tipo === 'entrada') body.clienteCarga = mov.cliente
  try {
    await apiFetch('/api/inventario/ubicar', { method: 'POST', json: body })
    return null
  } catch (err) {
    if (!(err instanceof ApiError) || [401, 404, 405, 500, 502, 503, 504].includes(err.status) || err.data?.raw) {
      return 'Movimiento guardado. El inventario del servidor no está disponible; la zona y el slot no se actualizaron. El patio sigue operando.'
    }
    return `Movimiento guardado. No se actualizó la ubicación en inventario: ${err.message}`
  }
}

/** Filas de EstadoUnidad para los chips del patio. */
export function listEstadoUnidadesServer() {
  return apiFetch('/api/estado-unidades', { method: 'GET' })
}

/**
 * Estados de unidad, o `null` si el API no está (503, sin funciones, sin sesión).
 * El tablero de OT sigue como respaldo de los chips.
 */
export async function fetchEstadoUnidadesOpcional() {
  try {
    const data = await listEstadoUnidadesServer()
    if (!data || data.raw || !Array.isArray(data.estados)) return null
    return data.estados
  } catch (err) {
    if (isGateUnavailable(err)) return null
    throw err
  }
}

/** Alta append-only. `mov` es el movimiento ya con fotos en URL http o `/api/media`. */
export function createMovimientoServer(mov) {
  return apiFetch('/api/movimientos', { method: 'POST', json: mov })
}

/** Lista de órdenes de trabajo (sesión). */
export function listOrdenesServidor(query = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== '') params.set(key, String(value))
  }
  const q = params.toString()
  return apiFetch(`/api/ot${q ? `?${q}` : ''}`, { method: 'GET' })
}

/** Abre una OT. El ETR es obligatorio; si ya hay una abierta de la unidad, el servidor la enlaza. */
export function crearOrdenServidor(orden) {
  return apiFetch('/api/ot', { method: 'POST', json: orden })
}

/** Cambia estatus, mueve el ETR (con motivo) o cierra la OT. */
export function actualizarOrdenServidor(id, patch) {
  return apiFetch(`/api/ot/${encodeURIComponent(id)}`, { method: 'PATCH', json: patch })
}

/** Tablero En mantenimiento. `yarda` opcional. */
export function fetchTableroMantenimiento(yarda) {
  const q = yarda && yarda !== 'todas' ? `?yarda=${encodeURIComponent(yarda)}` : ''
  return apiFetch(`/api/ot/tablero${q}`, { method: 'GET' })
}

/**
 * Tablero para la UI. `null` si el backend no está (503, sin funciones, sin sesión):
 * el patio sigue y no se muestra chip.
 */
export async function fetchTableroOpcional(yarda) {
  try {
    const data = await fetchTableroMantenimiento(yarda)
    if (!data || data.raw || !data.tablero) return null
    return data
  } catch (err) {
    if (isGateUnavailable(err)) return null
    throw err
  }
}

/**
 * Gate de salida. 503/404/red/sin sesión → se permite con aviso (no se traba la caseta).
 * BLOQUEADO y REQUIERE_AUTORIZACION sí detienen el guardado.
 * @param {{ equipoId?: string, placa?: string, relacionados?: unknown[], overrideMotivo?: string, trasladoTallerExterno?: boolean, consultar?: boolean }} body
 */
export async function validarSalidaAntesDeGuardar(body) {
  try {
    const data = await apiFetch('/api/gate/validar-salida', { method: 'POST', json: body })
    if (data?.raw || !data?.resultado) {
      return {
        ok: true,
        offline: true,
        resultado: 'SIN_VALIDACION',
        warning: 'Sin validación de servidor. La salida se registra igual; confirma en patio que la unidad no está en taller.',
      }
    }
    const resultado = data.resultado
    if (resultado === 'PERMITIDO') {
      const via = data?.via
      const warning =
        via === 'TRASLADO_TALLER_EXTERNO'
          ? 'Salida permitida: traslado a taller externo. Queda en la bitácora.'
          : via === 'OVERRIDE'
            ? 'Salida autorizada por encargado. Queda en la bitácora.'
            : null
      return { ok: true, resultado, via, warning, data }
    }
    return {
      ok: false,
      blocked: true,
      resultado: resultado || 'BLOQUEADO',
      puedeAutorizar: Boolean(data?.puedeAutorizar),
      message: data?.mensaje || 'Salida bloqueada por el estado de la unidad.',
      data,
    }
  } catch (err) {
    if (isGateUnavailable(err)) {
      return {
        ok: true,
        offline: true,
        resultado: 'SIN_VALIDACION',
        warning: 'Sin validación de servidor. La salida se registra igual; confirma en patio que la unidad no está en taller.',
      }
    }
    throw err
  }
}

/**
 * El gate no debe atascar la caseta si el API no está.
 * 401 = modo local sin cookie de servidor. 503 = sin configurar.
 * @param {unknown} err
 */
export function isGateUnavailable(err) {
  if (!(err instanceof ApiError)) return true
  if (err.data?.raw) return true
  return [401, 404, 405, 500, 502, 503, 504].includes(err.status)
}

/**
 * Sube una foto comprimida (data URL) al backend. El archivo queda privado en Drive.
 * @param {{ fileName: string, dataUrl: string, yardaId?: string, movimientoId?: string, slotId?: string }} args
 * @returns {Promise<{ fileId: string, viewPath: string }>}
 */
export function uploadMediaServer({ fileName, dataUrl, yardaId, movimientoId, slotId }) {
  return apiFetch('/api/media/upload', {
    method: 'POST',
    json: { fileName, dataUrl, yardaId, movimientoId, slotId },
  })
}

/**
 * Fallo de red (fetch no llegó a una respuesta HTTP). 503/404 son backend ausente, no esto.
 * @param {unknown} err
 */
export function isNetworkFailure(err) {
  return !(err instanceof ApiError)
}

const AUTH_PROFILE_KEY = 'patio-control-auth-profile'

/** Hay perfil guardado de un login que pasó por `/api/auth/login` (cookie httpOnly probable). */
export function sessionLikelyAvailable() {
  try {
    if (typeof localStorage === 'undefined') return false
    const raw = localStorage.getItem(AUTH_PROFILE_KEY)
    if (!raw) return false
    const profile = JSON.parse(raw)
    return profile?.sesionServidor === true && Boolean(profile?.email)
  } catch {
    return false
  }
}

/**
 * Intenta crear en el servidor. Devuelve el movimiento público si el API respondió.
 * Devuelve `null` si el backend no está (404/405/503, red, HTML del SPA) para que el
 * caller siga con el append legado a Sheets. 400/401/403/409 se propagan: no se duplica la fila.
 * @param {Record<string, any>} mov
 * @returns {Promise<null | Record<string, any>>}
 */
export async function tryCreateMovimientoViaServer(mov) {
  try {
    const data = await createMovimientoServer(mov)
    if (data?.movimiento?.id) return data.movimiento
    return null
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/**
 * ¿El error indica que el backend no está disponible/configurado (y conviene usar el flujo legado)?
 * 503 = env faltante; 404/405 = sin Netlify Functions (p. ej. `vite dev`); 5xx/red = caído.
 * 400/401/403/409/429 son respuestas reales del backend y NO deben caer al legado.
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
