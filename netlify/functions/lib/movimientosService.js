/**
 * Reglas de negocio de movimientos (servidor).
 * Append-only: si el id ya existe se devuelve tal cual, sin volver a escribir.
 */

import { movimientoToRow, rowToMovimiento } from './sheetsRepo.js'

export const TIPOS_MOVIMIENTO = Object.freeze(['entrada', 'salida', 'parado', 'baja'])

const ETIQUETA_TIPO = {
  entrada: 'una entrada',
  salida: 'una salida',
  parado: 'un parado',
  baja: 'una baja',
}

export class MovimientoError extends Error {
  /**
   * @param {string} message
   * @param {number} [status]
   * @param {string} [code]
   */
  constructor(message, status = 400, code = 'MOVIMIENTO') {
    super(message)
    this.name = 'MovimientoError'
    this.status = status
    this.code = code
  }
}

function isDataUrl(value) {
  return typeof value === 'string' && (value.startsWith('data:') || value.includes(';base64,'))
}

/** Copia el valor reemplazando data URLs por { dataUrl, length } para Auditoria. */
export function stripDataUrls(value) {
  if (typeof value === 'string') {
    if (isDataUrl(value)) return { dataUrl: true, length: value.length }
    return value
  }
  if (Array.isArray(value)) return value.map(stripDataUrls)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = stripDataUrls(v)
    }
    return out
  }
  return value ?? null
}

export function resumenAuditoria(mov) {
  return stripDataUrls(mov)
}

function readKm(value) {
  if (value == null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n)) return 'invalid'
  return n
}

function lastKilometros(movimientos, equipoId) {
  const want = String(equipoId ?? '').trim()
  let last = null
  for (const m of movimientos ?? []) {
    if (String(m?.equipoId ?? '').trim() !== want) continue
    if (m.kilometros == null || m.kilometros === '') continue
    const n = Number(m.kilometros)
    if (Number.isFinite(n)) last = n
  }
  return last
}

function timeOf(m) {
  const t = Date.parse(m?.fechaHora || m?.horaServidor || m?.creadoEn || '')
  return Number.isFinite(t) ? t : 0
}

const ROLES_CAPTURA_TARDIA = new Set([
  'encargado_yarda',
  'encargado',
  'yarda',
  'admin',
  'administrador',
  'supervisor',
])

function rolPuedeCapturaTardia(rol) {
  const t = String(rol ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
  return ROLES_CAPTURA_TARDIA.has(t)
}

/**
 * Captura tardía: se conserva la fechaHora que reclama el encargado y
 * horaServidor sigue siendo el reloj del servidor. El motivo queda en
 * cumplimiento y en observaciones. El guardia no puede usarla.
 */
function aplicarCapturaTardia(mov, session) {
  const desdeCumplimiento =
    mov?.cumplimiento && typeof mov.cumplimiento === 'object' ? mov.cumplimiento.capturaTardiaMotivo : ''
  const motivo = String(mov?.capturaTardiaMotivo ?? desdeCumplimiento ?? '').trim()
  if (!motivo) return mov
  if (!rolPuedeCapturaTardia(session?.rol)) {
    throw new MovimientoError(
      'La captura tardía solo la registra un encargado de yarda o un admin.',
      403,
      'CAPTURA_TARDIA',
    )
  }
  const cumplimiento = {
    ...(mov.cumplimiento && typeof mov.cumplimiento === 'object' && !Array.isArray(mov.cumplimiento)
      ? mov.cumplimiento
      : {}),
    capturaTardiaMotivo: motivo,
  }
  const dispositivo = String(mov.fechaCapturaDispositivo ?? cumplimiento.fechaCapturaDispositivo ?? '').trim()
  if (dispositivo) cumplimiento.fechaCapturaDispositivo = dispositivo
  const nota = `Captura tardía: ${motivo}`
  const obs = String(mov.observaciones ?? '').trim()
  const observaciones = obs.includes(nota) ? obs : obs ? `${obs}\n${nota}` : nota
  return { ...mov, cumplimiento, observaciones, capturaTardiaMotivo: motivo }
}

/**
 * @param {{ listMovimientos: Function, findMovimientoById: Function, findOpenEntrada: Function, appendMovimiento: Function, appendAuditoria: Function }} repo
 * @param {{ now?: () => Date }} [options]
 */
export function createMovimientosService(repo, options = {}) {
  async function crear(session, input, callOpts = {}) {
    if (!session?.email) {
      throw new MovimientoError('Sesión requerida para registrar movimientos.', 401, 'SESION')
    }
    const mov = input && typeof input === 'object' && !Array.isArray(input) ? input : null
    if (!mov) throw new MovimientoError('El cuerpo debe ser un movimiento.', 400, 'BODY')

    const tipo = String(mov.tipo ?? '').trim().toLowerCase()
    if (!TIPOS_MOVIMIENTO.includes(tipo)) {
      throw new MovimientoError('Tipo de movimiento no válido. Usa entrada, salida, parado o baja.', 400, 'TIPO')
    }
    const permisos = session.permisos && typeof session.permisos === 'object' ? session.permisos : null
    if (!permisos || !permisos[tipo]) {
      throw new MovimientoError(`No tienes permiso para registrar ${ETIQUETA_TIPO[tipo]}.`, 403, 'PERMISO')
    }

    const id = String(mov.id ?? '').trim()
    if (!id) throw new MovimientoError('Falta el id del movimiento.', 400, 'ID')
    const equipoId = String(mov.equipoId ?? '').trim()
    if (!equipoId) throw new MovimientoError('Falta el equipo (equipoId) del movimiento.', 400, 'EQUIPO')

    const existing = await repo.findMovimientoById(id)
    if (existing) return { movimiento: existing, idempotent: true }

    if (tipo === 'entrada') {
      const open = await repo.findOpenEntrada(equipoId)
      if (open && String(open.id) !== id) {
        const placa = open.placa ? ` (${open.placa})` : ''
        throw new MovimientoError(
          `Este equipo ya tiene una entrada abierta${placa}. Registra salida, parado o baja antes de otra entrada.`,
          409,
          'ENTRADA_ABIERTA',
        )
      }
    }

    if (tipo === 'salida') {
      const km = readKm(mov.kilometros)
      if (km === 'invalid') {
        throw new MovimientoError('Los kilómetros de la salida no son un número válido.', 400, 'KM')
      }
      if (km != null) {
        const all = await repo.listMovimientos()
        const last = lastKilometros(all, equipoId)
        if (last != null && km < last) {
          throw new MovimientoError(
            `Los kilómetros (${km}) no pueden ser menores que el último registro (${last}).`,
            400,
            'KM',
          )
        }
      }
    }

    const clock = callOpts.now ?? options.now ?? (() => new Date())
    const now = clock()
    const horaServidor = (now instanceof Date ? now : new Date(now)).toISOString()
    // fechaHora reclamada se conserva; horaServidor es el sello del servidor.
    const preparado = aplicarCapturaTardia(mov, session)
    const stamped = {
      ...preparado,
      id,
      tipo,
      equipoId,
      usuarioEmail: String(session.email).trim().toLowerCase(),
      horaServidor,
    }

    const row = movimientoToRow(stamped)
    await repo.appendMovimiento(row)
    const saved = rowToMovimiento(row)
    if (!saved) throw new MovimientoError('No se pudo interpretar el movimiento guardado.', 500, 'ROW')

    try {
      await repo.appendAuditoria({
        usuarioEmail: stamped.usuarioEmail,
        rol: session.rol || '',
        accion: 'crear_movimiento',
        entidad: 'Movimiento',
        entidadId: id,
        despues: resumenAuditoria(saved),
        dispositivoId: session.dispositivoId || '',
      })
    } catch (err) {
      console.warn('[movimientos] Auditoria no disponible:', err?.message || err)
    }

    return { movimiento: saved, idempotent: false }
  }

  async function listar({ limit = 500 } = {}) {
    const all = await repo.listMovimientos()
    const sorted = [...all].sort((a, b) => timeOf(b) - timeOf(a))
    const n = Number(limit)
    const cap = Number.isFinite(n) && n > 0 ? Math.min(2000, Math.floor(n)) : 500
    return sorted.slice(0, cap)
  }

  return { crear, listar }
}
