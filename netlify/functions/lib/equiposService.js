/**
 * Catálogo de equipos y refrigeración (servidor).
 * Alta y cambio por id (columna A). La baja deja esa fila en blanco.
 * Nunca se limpia la pestaña ni se reescribe A2:I. No se busca por placa.
 */

import { equipoToRow, refrigeracionToRow, rowToEquipo, rowToRefrigeracion } from './sheetsRepo.js'

export const TIPOS_EQUIPO = Object.freeze(['camion', 'caja', 'dolly', 'otro'])
export const ESTATUS_REFRIGERACION = Object.freeze(['operando', 'taller', 'refaccion', 'baja'])

const PERMISO_EQUIPO = Object.freeze(['equipos', 'entrada', 'salida', 'parado', 'baja'])
const PERMISO_REFRIGERACION = Object.freeze(['equipos', 'entrada', 'salida'])

export class EquipoError extends Error {
  /**
   * @param {string} message
   * @param {number} [status]
   * @param {string} [code]
   */
  constructor(message, status = 400, code = 'EQUIPO') {
    super(message)
    this.name = 'EquipoError'
    this.status = status
    this.code = code
  }
}

function normToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function upperTrim(value) {
  return String(value ?? '').trim().toUpperCase()
}

function textOrEmpty(value) {
  return String(value ?? '').trim()
}

function cleanId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return ''
  return value.trim()
}

function exigirId(value, message) {
  const id = cleanId(value)
  if (!id) throw new EquipoError(message, 400, 'ID')
  return id
}

function exigirSesion(session) {
  if (!session?.email) throw new EquipoError('Sesión requerida.', 401, 'SESION')
}

function tieneAlguno(session, keys) {
  const permisos = session?.permisos
  if (!permisos || typeof permisos !== 'object') return false
  return keys.some((key) => permisos[key] === true)
}

function exigirPermiso(session, keys, message) {
  exigirSesion(session)
  if (!tieneAlguno(session, keys)) throw new EquipoError(message, 403, 'PERMISO')
}

function asRecord(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new EquipoError(`El cuerpo debe ser un ${label}.`, 400, 'BODY')
  }
  return input
}

function campoPresente(body, key) {
  return Object.prototype.hasOwnProperty.call(body, key) && body[key] != null
}

function pickText(body, key, previous) {
  if (!campoPresente(body, key)) return textOrEmpty(previous)
  return textOrEmpty(body[key])
}

function pickUpper(body, key, previous) {
  if (!campoPresente(body, key)) return upperTrim(previous)
  return upperTrim(body[key])
}

function pickEnum(body, key, allowed, previous, fallback, code, message) {
  if (!campoPresente(body, key) || String(body[key]).trim() === '') {
    const prev = normToken(previous)
    return allowed.includes(prev) ? prev : fallback
  }
  const token = normToken(body[key])
  if (!allowed.includes(token)) throw new EquipoError(message, 400, code)
  return token
}

function pickHorometro(body, existing) {
  if (!Object.prototype.hasOwnProperty.call(body, 'horometro')) {
    return existing ? (existing.horometro ?? null) : null
  }
  const value = body.horometro
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n)) throw new EquipoError('El horómetro no es un número válido.', 400, 'HOROMETRO')
  return n
}

function emailDe(session) {
  return String(session.email).trim().toLowerCase()
}

/**
 * @param {{ listEquipos: Function, appendEquipo: Function, updateEquipoById: Function, clearEquipoById: Function, listRefrigeracion: Function, appendRefrigeracion: Function, updateRefrigeracionById: Function, clearRefrigeracionById: Function, appendAuditoria?: Function }} repo
 * @param {{ now?: () => Date }} [options]
 */
export function createEquiposService(repo, options = {}) {
  function ahoraIso() {
    const clock = options.now ?? (() => new Date())
    const value = clock()
    return (value instanceof Date ? value : new Date(value)).toISOString()
  }

  async function auditar(entry) {
    if (typeof repo?.appendAuditoria !== 'function') return
    try {
      await repo.appendAuditoria(entry)
    } catch (err) {
      console.warn('[equipos] Auditoria no disponible:', err?.message || err)
    }
  }

  function pickCreadoEn(body, existing) {
    if (campoPresente(body, 'creadoEn') && String(body.creadoEn).trim() !== '') return String(body.creadoEn).trim()
    if (existing?.creadoEn) return String(existing.creadoEn)
    return ahoraIso()
  }

  async function listarEquipos() {
    const rows = await repo.listEquipos()
    return (rows ?? []).filter(Boolean)
  }

  async function listarRefrigeracion() {
    const rows = await repo.listRefrigeracion()
    return (rows ?? []).filter(Boolean)
  }

  async function guardarEquipo(session, input) {
    exigirPermiso(session, PERMISO_EQUIPO, 'No tienes permiso para registrar equipos.')
    const body = asRecord(input, 'equipo')
    const id = exigirId(body.id, 'Falta el id del equipo.')
    const placa = upperTrim(body.placa)
    if (!placa) throw new EquipoError('Falta la placa del equipo.', 400, 'PLACA')

    // Solo la columna A. Una placa repetida con otro id es otra unidad.
    const existing = (await listarEquipos()).find((item) => String(item?.id ?? '').trim() === id) || null
    const tipo = pickEnum(
      body,
      'tipo',
      TIPOS_EQUIPO,
      existing?.tipo,
      'camion',
      'TIPO',
      'Tipo de equipo no válido. Usa camión, caja, dolly u otro.',
    )
    const economico = pickUpper(body, 'numeroEconomico', existing?.numeroEconomico)
    const normalized = {
      id,
      tipo,
      placa,
      numeroEconomico: economico || placa,
      marca: pickText(body, 'marca', existing?.marca) || undefined,
      modelo: pickText(body, 'modelo', existing?.modelo) || undefined,
      notas: pickText(body, 'notas', existing?.notas) || undefined,
      creadoEn: pickCreadoEn(body, existing),
      operadorAsignado: pickText(body, 'operadorAsignado', existing?.operadorAsignado) || undefined,
    }
    const row = equipoToRow(normalized)
    if (existing) await repo.updateEquipoById(id, row)
    else await repo.appendEquipo(row)
    const saved = rowToEquipo(row)
    if (!saved) throw new EquipoError('No se pudo interpretar el equipo guardado.', 500, 'ROW')

    await auditar({
      usuarioEmail: emailDe(session),
      rol: session.rol || '',
      accion: existing ? 'actualizar_equipo' : 'crear_equipo',
      entidad: 'Equipo',
      entidadId: id,
      ...(existing ? { antes: existing } : {}),
      despues: saved,
      dispositivoId: session.dispositivoId || '',
    })
    return { equipo: saved, created: !existing }
  }

  async function eliminarEquipo(session, idRaw) {
    exigirSesion(session)
    const id = exigirId(idRaw, 'Falta el id del equipo.')
    if (session.permisos?.equipos !== true) {
      throw new EquipoError('No tienes permiso para eliminar equipos.', 403, 'PERMISO')
    }
    const existing = (await listarEquipos()).find((item) => String(item?.id ?? '').trim() === id)
    if (!existing) throw new EquipoError('No se encontró el equipo.', 404, 'NOT_FOUND')
    await repo.clearEquipoById(id)
    await auditar({
      usuarioEmail: emailDe(session),
      rol: session.rol || '',
      accion: 'eliminar_equipo',
      entidad: 'Equipo',
      entidadId: id,
      antes: existing,
      despues: null,
      dispositivoId: session.dispositivoId || '',
    })
    return { id }
  }

  async function guardarRefrigeracion(session, input) {
    exigirPermiso(session, PERMISO_REFRIGERACION, 'No tienes permiso para registrar refrigeración.')
    const body = asRecord(input, 'registro de refrigeración')
    const id = exigirId(body.id, 'Falta el id de la refrigeración.')
    const numeroActivo = upperTrim(body.numeroActivo)
    if (!numeroActivo) throw new EquipoError('Falta el número de activo.', 400, 'ACTIVO')

    const existing = (await listarRefrigeracion()).find((item) => String(item?.id ?? '').trim() === id) || null
    const horometro = pickHorometro(body, existing)
    const normalized = {
      id,
      marca: pickText(body, 'marca', existing?.marca),
      modelo: pickText(body, 'modelo', existing?.modelo),
      numeroActivo,
      economicoMontado: pickUpper(body, 'economicoMontado', existing?.economicoMontado),
      horometro,
      estatus: pickEnum(
        body,
        'estatus',
        ESTATUS_REFRIGERACION,
        existing?.estatus,
        'operando',
        'ESTATUS',
        'Estatus de refrigeración no válido. Usa operando, taller, refacción o baja.',
      ),
      notas: pickText(body, 'notas', existing?.notas) || undefined,
      creadoEn: pickCreadoEn(body, existing),
    }
    const row = refrigeracionToRow(normalized)
    if (existing) await repo.updateRefrigeracionById(id, row)
    else await repo.appendRefrigeracion(row)
    const saved = rowToRefrigeracion(row)
    if (!saved) throw new EquipoError('No se pudo interpretar la refrigeración guardada.', 500, 'ROW')

    await auditar({
      usuarioEmail: emailDe(session),
      rol: session.rol || '',
      accion: existing ? 'actualizar_refrigeracion' : 'crear_refrigeracion',
      entidad: 'Refrigeracion',
      entidadId: id,
      ...(existing ? { antes: existing } : {}),
      despues: saved,
      dispositivoId: session.dispositivoId || '',
    })
    return { refrigeracion: saved, created: !existing }
  }

  async function eliminarRefrigeracion(session, idRaw) {
    exigirSesion(session)
    const id = exigirId(idRaw, 'Falta el id de la refrigeración.')
    if (session.permisos?.equipos !== true) {
      throw new EquipoError('No tienes permiso para eliminar refrigeración.', 403, 'PERMISO')
    }
    const existing = (await listarRefrigeracion()).find((item) => String(item?.id ?? '').trim() === id)
    if (!existing) throw new EquipoError('No se encontró la refrigeración.', 404, 'NOT_FOUND')
    await repo.clearRefrigeracionById(id)
    await auditar({
      usuarioEmail: emailDe(session),
      rol: session.rol || '',
      accion: 'eliminar_refrigeracion',
      entidad: 'Refrigeracion',
      entidadId: id,
      antes: existing,
      despues: null,
      dispositivoId: session.dispositivoId || '',
    })
    return { id }
  }

  /**
   * Parchea el horómetro (columna F) de una fila ya existente.
   * Coincide por refrigeracionId o, si no viene, por numeroActivoThermo único.
   * Sin coincidencia, o con activos duplicados, no hace nada y no agrega filas.
   * No lanza: un fallo aquí no debe tumbar el movimiento.
   * @param {Record<string, any> | null | undefined} movimiento
   */
  async function aplicarHorometro(movimiento) {
    try {
      const mov = movimiento && typeof movimiento === 'object' && !Array.isArray(movimiento) ? movimiento : null
      if (!mov) return { updated: false }
      const ref = mov.refrigerada && typeof mov.refrigerada === 'object' && !Array.isArray(mov.refrigerada) ? mov.refrigerada : {}
      const raw = ref.horometroThermo ?? ref.horometro ?? mov.horometroThermo ?? mov.horometro
      if (raw == null || raw === '') return { updated: false }
      const horometro = typeof raw === 'number' ? raw : Number(String(raw).trim())
      if (!Number.isFinite(horometro)) return { updated: false }

      const refId = cleanId(ref.refrigeracionId ?? mov.refrigeracionId)
      const activo = upperTrim(ref.numeroActivoThermo ?? mov.numeroActivoThermo ?? '')
      if (!refId && !activo) return { updated: false }

      const all = await listarRefrigeracion()
      let target = null
      if (refId) {
        target = all.find((item) => String(item?.id ?? '').trim() === refId) || null
        if (!target) return { updated: false }
      } else {
        const matches = all.filter((item) => upperTrim(item?.numeroActivo) === activo)
        if (matches.length !== 1) return { updated: false }
        target = matches[0]
      }

      const row = refrigeracionToRow({ ...target, horometro })
      await repo.updateRefrigeracionById(target.id, row)
      return { updated: true, refrigeracion: rowToRefrigeracion(row) }
    } catch (err) {
      console.warn('[equipos] No se pudo aplicar el horómetro:', err?.message || err)
      return { updated: false }
    }
  }

  return {
    listarEquipos,
    guardarEquipo,
    eliminarEquipo,
    listarRefrigeracion,
    guardarRefrigeracion,
    eliminarRefrigeracion,
    aplicarHorometro,
  }
}
