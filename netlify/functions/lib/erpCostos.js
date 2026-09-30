/**
 * Export de costos de OT para el pull diario de sys.carbalmotors.com.
 * Una fila por concepto con importe numérico: refacciones, mano de obra, externo
 * (o estimado si esos tres no vienen).
 */

import { fechaMx } from './avisosService.js'

const CONCEPTOS = [
  ['refacciones', 'costoRefacciones'],
  ['mano de obra', 'costoManoObra'],
  ['externo', 'costoExterno'],
]

export function fechaQuery(value, name) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const err = new Error(`${name} debe ser YYYY-MM-DD.`)
    err.status = 400
    err.code = 'FECHA'
    throw err
  }
  return text
}

export function fechaCostoOt(ot) {
  const raw = String(ot?.fechaLiberada || ot?.fechaLista || ot?.fechaEntradaTaller || '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10)
  return fechaMx(date)
}

function importeDe(value) {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(n) ? n : null
}

function enRango(fecha, desde, hasta) {
  if (!desde && !hasta) return true
  if (!fecha) return false
  if (desde && fecha < desde) return false
  if (hasta && fecha > hasta) return false
  return true
}

/**
 * @param {object[]} ots
 * @param {{ desde?: string, hasta?: string }} [rango]
 */
export function filasCostoOt(ots, { desde = '', hasta = '' } = {}) {
  const rows = []
  for (const ot of ots || []) {
    if (!ot || String(ot.activo || 'SI').toUpperCase() === 'NO') continue
    const fecha = fechaCostoOt(ot)
    if (!enRango(fecha, desde, hasta)) continue
    const base = {
      unidad: String(ot.unidadId || ot.unidad || ''),
      otFolio: String(ot.folio || ot.id || ''),
      fecha,
      proveedor: String(ot.proveedorId || ot.proveedor || ''),
    }
    let alguno = false
    for (const [concepto, campo] of CONCEPTOS) {
      const importe = importeDe(ot[campo])
      if (importe == null) continue
      alguno = true
      rows.push({ ...base, concepto, importe })
    }
    if (!alguno) {
      const estimado = importeDe(ot.costoEstimado)
      if (estimado != null) rows.push({ ...base, concepto: 'estimado', importe: estimado })
    }
  }
  rows.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.otFolio.localeCompare(b.otFolio) || a.concepto.localeCompare(b.concepto))
  return rows
}

function csvCell(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text) || /^[=+\-@]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function costosOtToCsv(rows) {
  const header = ['unidad', 'otFolio', 'fecha', 'concepto', 'importe', 'proveedor']
  const lines = [header.join(',')]
  for (const row of rows || []) {
    lines.push(header.map((key) => csvCell(row[key])).join(','))
  }
  return lines.join('\n')
}
