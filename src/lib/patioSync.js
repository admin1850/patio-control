/**
 * Política de lectura/escritura del patio en el cierre de Fase 0.
 * Con `sesionServidor` los movimientos salen del API. Sin ella, Workspace
 * sigue en el camino híbrido (Sheets). Modo Local sin sesión solo mira la caché.
 */

import { isBackendUnavailable } from './serverApi.js'

export const LOCAL_READONLY_BANNER = 'Conecta Cloud con tu cuenta autorizada para registrar'

/** Login que pasó por `/api/auth/login` (cookie httpOnly en el navegador). */
export function hasServerSession(user) {
  return user?.sesionServidor === true && Boolean(String(user?.email || '').trim())
}

/**
 * Prefiere el usuario en memoria. Si todavía no rehidrató, usa el perfil
 * guardado con `sesionServidor` para no caer al append de Sheets.
 */
export function activeServerUser(user, cached) {
  if (hasServerSession(user)) return user
  if (hasServerSession(cached)) {
    return {
      ...user,
      ...cached,
      sesionServidor: true,
      email: user?.email || cached.email,
    }
  }
  return user || null
}

/**
 * Modo Local sin sesión de servidor: se ve el dashboard y el historial
 * desde la caché, pero no se registra ni se edita el catálogo.
 * Workspace sin `sesionServidor` (solo OAuth de Sheets) no es solo lectura.
 */
export function isLocalReadOnly({ mode, user } = {}) {
  if (mode === 'workspace') return false
  return !hasServerSession(user)
}

export function localReadOnlyError() {
  const err = new Error(LOCAL_READONLY_BANNER)
  err.code = 'LOCAL_READONLY'
  return err
}

export function assertWritable({ mode, user } = {}) {
  if (isLocalReadOnly({ mode, user })) throw localReadOnlyError()
}

/**
 * Cómo persistir un movimiento.
 * - `deny`: Local sin sesión.
 * - `server`: hay sesión de servidor; no se hace append a Sheets desde el navegador.
 * - `hybrid`: Workspace con solo OAuth de Sheets (API si responde, si no el legado).
 */
export function movimientoWriteMode({ mode, user } = {}) {
  if (hasServerSession(user)) return 'server'
  if (mode === 'workspace') return 'hybrid'
  return 'deny'
}

export function shouldSkipSheetsAppend(user) {
  return hasServerSession(user)
}

/**
 * Origen de la lista de movimientos al refrescar.
 * Con sesión se pide el API. Si el backend no está, se usa Sheets para no
 * trabar la caseta. Sin sesión, solo Sheets.
 * `movimientos: null` significa "no reemplazar la caché".
 * @returns {Promise<{ source: 'server' | 'sheets-fallback' | 'server-unavailable' | 'sheets', movimientos: any[] | null }>}
 */
export async function loadMovimientosRefresh({ user, listServer, listSheets }) {
  if (hasServerSession(user)) {
    try {
      const rows = await listServer()
      if (Array.isArray(rows)) return { source: 'server', movimientos: rows }
    } catch (err) {
      if (!isBackendUnavailable(err)) throw err
    }
    if (typeof listSheets !== 'function') {
      return { source: 'server-unavailable', movimientos: null }
    }
    const rows = await listSheets()
    return { source: 'sheets-fallback', movimientos: Array.isArray(rows) ? rows : [] }
  }
  if (typeof listSheets !== 'function') {
    return { source: 'sheets', movimientos: null }
  }
  const rows = await listSheets()
  return { source: 'sheets', movimientos: Array.isArray(rows) ? rows : [] }
}

/** Mapa unidadId/placa → fila EstadoUnidad para los chips del patio. */
export function indexEstadosUnidad(estados) {
  const map = {}
  for (const est of estados || []) {
    if (!est || typeof est !== 'object') continue
    for (const key of [est.unidadId, est.equipoId, est.placa]) {
      if (!key) continue
      const text = String(key)
      map[text] = est
      map[text.toUpperCase()] = est
    }
  }
  return map
}

/**
 * Cloud/Workspace siempre visible para poder entrar.
 * Dashboard y mantenimiento también: el patio se puede consultar sin permiso de alta.
 */
export function puedeVerPagina(user, key) {
  if (key === 'dashboard' || key === 'mantenimiento' || key === 'inventario' || key === 'workspace') return true
  if (!user?.permisos) return true
  return !!user.permisos[key]
}
