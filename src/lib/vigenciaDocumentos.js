/**
 * Vigencia de documentos de unidad y operador.
 * Alerta a 30 y a 15 días. El día del vencimiento ya bloquea la salida
 * (el override de encargado/admin sigue valiendo: no es un motivo duro).
 */

export const DOCUMENTOS_VIGENCIA = Object.freeze([
  { id: 'licencia', label: 'Licencia' },
  { id: 'seguro', label: 'Seguro' },
  { id: 'tarjeta_circulacion', label: 'Tarjeta de circulación' },
  { id: 'verificacion_fisico_mecanica', label: 'Verificación físico-mecánica' },
  { id: 'emisiones', label: 'Verificación de emisiones' },
  { id: 'permiso_sict', label: 'Permiso SICT' },
])

export const SUJETOS_VIGENCIA = Object.freeze(['unidad', 'operador'])

const IDS = new Set(DOCUMENTOS_VIGENCIA.map((item) => item.id))

export function etiquetaDocumento(id) {
  return DOCUMENTOS_VIGENCIA.find((item) => item.id === id)?.label || id
}

export function fechaMxISO(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(value)
}

export function normalizarFechaVigencia(raw) {
  const text = String(raw ?? '').trim()
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return ''
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return ''
  return `${match[1]}-${match[2]}-${match[3]}`
}

export function diasHastaVigencia(vence, hoy) {
  const fecha = normalizarFechaVigencia(vence)
  const base = normalizarFechaVigencia(hoy) || fechaMxISO(hoy)
  if (!fecha || !base) return null
  const a = Date.parse(`${fecha}T00:00:00Z`)
  const b = Date.parse(`${base}T00:00:00Z`)
  return Math.round((a - b) / 86400000)
}

/** @returns {'ok'|'aviso30'|'aviso15'|'vencido'|null} */
export function nivelVigencia(vence, hoy) {
  const dias = diasHastaVigencia(vence, hoy)
  if (dias == null) return null
  if (dias < 0) return 'vencido'
  if (dias === 0) return 'vencido'
  if (dias <= 15) return 'aviso15'
  if (dias <= 30) return 'aviso30'
  return 'ok'
}

function mismo(a, b) {
  return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase()
}

function aplica(fila, { equipoId, placa, operadorIds }) {
  const tipo = String(fila?.sujetoTipo || '').trim().toLowerCase()
  const id = String(fila?.sujetoId || '').trim()
  if (!id || !IDS.has(String(fila?.documento || '').trim())) return false
  if (tipo === 'unidad') return mismo(id, equipoId) || mismo(id, placa)
  if (tipo === 'operador') return (operadorIds || []).some((item) => mismo(id, item))
  return false
}

/**
 * @param {object[]} filas
 * @param {{ hoy?: Date|string, equipoId?: string, placa?: string, operadorIds?: string[] }} ctx
 */
export function evaluarVigencias(filas, ctx = {}) {
  const hoy = ctx.hoy instanceof Date ? fechaMxISO(ctx.hoy) : normalizarFechaVigencia(ctx.hoy) || fechaMxISO()
  const motivos = []
  const avisos = []
  for (const fila of filas || []) {
    if (!aplica(fila, ctx)) continue
    const documento = String(fila.documento).trim()
    const vence = normalizarFechaVigencia(fila.vence)
    const nivel = nivelVigencia(vence, hoy)
    if (!nivel || nivel === 'ok') continue
    const dias = diasHastaVigencia(vence, hoy)
    const quien = `${fila.sujetoTipo} ${fila.sujetoId}`
    const nombre = etiquetaDocumento(documento)
    if (nivel === 'vencido') {
      motivos.push({
        codigo: 'DOC_VENCIDO',
        mensaje: `${nombre} de ${quien} venció el ${vence}.`,
      })
    }
    const cuando = nivel === 'vencido' ? `venció el ${vence}` : `vence en ${dias} día${dias === 1 ? '' : 's'} (${vence})`
    avisos.push({
      unidadId: String(fila.sujetoId),
      mensaje: `${nombre} de ${quien} ${cuando}.`,
      dedupeKey: `DOC_POR_VENCER|${fila.sujetoTipo}|${String(fila.sujetoId).trim().toUpperCase()}|${documento}|${nivel}|${hoy}`,
    })
  }
  return { hoy, motivos, avisos }
}
