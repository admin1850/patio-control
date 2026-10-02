/** Viajes cortos de yarda. El tipo sigue siendo salida o entrada. */

export const MOTIVOS_RAPIDO = Object.freeze([
  { id: 'lavado', label: 'Lavado' },
  { id: 'llantas', label: 'Llantas' },
  { id: 'otros', label: 'Otros', requiereDetalle: true },
])

export function esMovimientoRapido(mov) {
  return mov?.rapido === true || mov?.cumplimiento?.rapido === true
}

export function motivoRapidoDe(mov) {
  return String(mov?.motivoRapido || mov?.cumplimiento?.motivoRapido || '')
    .trim()
    .toLowerCase()
}

export function detalleMotivoRapidoDe(mov) {
  return String(mov?.motivoRapidoDetalle || mov?.cumplimiento?.motivoRapidoDetalle || '')
    .trim()
}

export function etiquetaMotivoRapido(id) {
  const key = String(id || '')
    .trim()
    .toLowerCase()
  return MOTIVOS_RAPIDO.find((item) => item.id === key)?.label || ''
}

export function motivoRapidoValido(id) {
  return MOTIVOS_RAPIDO.some((item) => item.id === id)
}

export function motivoRapidoRequiereDetalle(id) {
  return MOTIVOS_RAPIDO.some((item) => item.id === id && item.requiereDetalle === true)
}

/** Si observaciones va vacía, el historial igual ve el motivo. */
export function observacionesRapidas(texto, motivoId, detalle) {
  const nota = String(texto || '').trim()
  const extra = String(detalle || '').trim()
  if (nota) return nota
  const label = etiquetaMotivoRapido(motivoId)
  if (motivoRapidoRequiereDetalle(motivoId) && extra) {
    return label ? `Rápido · ${label}: ${extra}` : extra
  }
  return label ? `Rápido · ${label}` : 'Rápido'
}

export function tituloMovimiento(mov) {
  if (esMovimientoRapido(mov)) {
    return String(mov?.tipo || '').toLowerCase() === 'salida' ? 'Salida rápida' : 'Retorno rápido'
  }
  const tipo = String(mov?.tipo || '').toLowerCase()
  if (tipo === 'entrada') return 'Entrada'
  if (tipo === 'salida') return 'Salida'
  if (tipo === 'parado') return 'Parado'
  if (tipo === 'baja') return 'Baja'
  return 'Movimiento'
}

/**
 * Pool de placas con salida rápida abierta: último movimiento es salida + rapido.
 * El retorno rápido solo puede elegir de este conjunto.
 */
export function poolSalidaRapidaAbierta(movimientos, equipos, { yardaId, empresaId } = {}) {
  const byId = new Map((equipos || []).map((eq) => [eq.id, eq]))
  const latest = new Map()
  for (const mov of movimientos || []) {
    if (!mov?.equipoId) continue
    const parsed = Date.parse(mov.fechaHora || mov.horaServidor || mov.creadoEn || '')
    const time = Number.isFinite(parsed) ? parsed : 0
    const prev = latest.get(mov.equipoId)
    if (!prev || time >= prev.time) latest.set(mov.equipoId, { mov, time })
  }
  const rows = []
  for (const { mov } of latest.values()) {
    if (String(mov.tipo || '').toLowerCase() !== 'salida') continue
    if (!esMovimientoRapido(mov)) continue
    if (yardaId && mov.yardaId && mov.yardaId !== yardaId) continue
    if (empresaId != null && (mov.empresaId ?? 'api') !== empresaId) continue
    const equipo = byId.get(mov.equipoId)
    if (!equipo) continue
    const motivoId = motivoRapidoDe(mov)
    rows.push({
      equipo,
      salida: mov,
      motivoId,
      motivo: etiquetaMotivoRapido(motivoId),
      detalle: detalleMotivoRapidoDe(mov),
    })
  }
  rows.sort((a, b) => String(a.equipo.placa).localeCompare(String(b.equipo.placa)))
  return rows
}
