/**
 * KPIs de mantenimiento y dwell (Fase 4).
 * El dwell usa horaServidor cuando entrada y salida la traen; si no, fechaHora.
 */

const MS_HORA = 36e5
const MS_DIA = 86400000

export class KpiError extends Error {
  constructor(message, status = 400, code = 'KPI') {
    super(message)
    this.name = 'KpiError'
    this.status = status
    this.code = code
  }
}

function clockOf(options) {
  const fn = options?.now ?? (() => new Date())
  const value = fn()
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

/** Fecha sola `YYYY-MM-DD` se lee en hora del centro (UTC−6, sin horario de verano). */
export function parseInstanteMx(value, { finDia = false } = {}) {
  if (value == null || String(value).trim() === '') return null
  const text = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const hora = finDia ? '23:59:59.999' : '00:00:00.000'
    return new Date(`${text}T${hora}-06:00`)
  }
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function yardaOk(valor, filtro) {
  if (!filtro) return true
  return String(valor || '').trim().toLowerCase() === filtro
}

function norm(value) {
  return String(value ?? '').trim().toUpperCase()
}

function horasEntre(inicioIso, finIso) {
  const a = Date.parse(inicioIso || '')
  const b = Date.parse(finIso || '')
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return (b - a) / MS_HORA
}

function horasSolapadas(inicioIso, finIso, startMs, endMs) {
  const a = Date.parse(inicioIso || '')
  const b = Date.parse(finIso || '')
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
  const from = Math.max(a, startMs)
  const to = Math.min(b, endMs)
  if (to <= from) return 0
  return (to - from) / MS_HORA
}

function promedio(valores) {
  if (!valores.length) return null
  return valores.reduce((acc, n) => acc + n, 0) / valores.length
}

function percentil95(valores) {
  if (!valores.length) return null
  const sorted = [...valores].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
}

function redondear(n) {
  if (n == null || Number.isNaN(n)) return ''
  return Math.round(n * 10) / 10
}

function instanteMovimiento(mov, preferirServidor) {
  if (preferirServidor) {
    const servidor = Date.parse(mov?.horaServidor || '')
    if (Number.isFinite(servidor)) return servidor
  }
  const dispositivo = Date.parse(mov?.fechaHora || mov?.creadoEn || '')
  return Number.isFinite(dispositivo) ? dispositivo : NaN
}

export function ciclosDwell(movimientos, { yarda = '', desdeMs, hastaMs } = {}) {
  const ordenados = [...(movimientos || [])].sort((a, b) => {
    const ta = instanteMovimiento(a, false)
    const tb = instanteMovimiento(b, false)
    return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0)
  })
  const abiertas = new Map()
  const ciclos = []
  for (const mov of ordenados) {
    const tipo = String(mov?.tipo || '').trim().toLowerCase()
    const equipoId = String(mov?.equipoId || '').trim()
    if (!equipoId) continue
    if (tipo === 'entrada') {
      abiertas.set(equipoId, mov)
      continue
    }
    if (tipo !== 'salida') continue
    const entrada = abiertas.get(equipoId)
    if (!entrada) continue
    abiertas.delete(equipoId)
    if (!yardaOk(mov.yardaId || mov.yarda, yarda)) continue
    const usaServidor = Number.isFinite(Date.parse(entrada.horaServidor || '')) && Number.isFinite(Date.parse(mov.horaServidor || ''))
    const inicio = instanteMovimiento(entrada, usaServidor)
    const fin = instanteMovimiento(mov, usaServidor)
    if (!Number.isFinite(inicio) || !Number.isFinite(fin)) continue
    if (hastaMs != null && fin > hastaMs) continue
    if (desdeMs != null && fin < desdeMs) continue
    ciclos.push({
      equipoId,
      placa: mov.placa || entrada.placa || '',
      yardaId: mov.yardaId || mov.yarda || entrada.yardaId || '',
      horas: Math.max(0, (fin - inicio) / MS_HORA),
      fuente: usaServidor ? 'horaServidor' : 'fechaHora',
    })
  }
  return ciclos
}

export function kpisToCsv(kpis) {
  const filas = [
    ['Indicador', 'Valor'],
    ['Yarda', kpis.yarda || 'todas'],
    ['Desde', kpis.desde || ''],
    ['Hasta', kpis.hasta || ''],
    ['Disponibilidad %', redondear(kpis.disponibilidadPct)],
    ['Downtime (horas)', redondear(kpis.downtimeHoras)],
    ['MTTR (horas)', redondear(kpis.mttrHoras)],
    ['OT cerradas', kpis.otsCerradas ?? ''],
    ['OT dentro del ETR original', kpis.otsDentroEtr ?? ''],
    ['OT dentro del ETR original %', redondear(kpis.otDentroEtrPct)],
    ['Dwell promedio (horas)', redondear(kpis.dwellPromedioHoras)],
    ['Dwell P95 (horas)', redondear(kpis.dwellP95Horas)],
    ['Ciclos dwell', kpis.ciclosDwell ?? ''],
    ['Ciclos con hora de servidor', kpis.ciclosConHoraServidor ?? ''],
    ['Fuente dwell', kpis.fuenteDwell || ''],
    ['Unidades', kpis.unidades ?? ''],
  ]
  return filas.map((fila) => fila.map(csvCelda).join(',')).join('\n') + '\n'
}

function csvCelda(value) {
  const text = value == null ? '' : String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

/**
 * @param {{ listOrdenesTrabajo: Function, listEstadoUnidad: Function, listMovimientos: Function }} repo
 * @param {{ now?: () => Date }} [options]
 */
export function createKpiService(repo, options = {}) {
  async function resumen(filtros = {}) {
    const ahora = clockOf(options)
    const hasta = parseInstanteMx(filtros.hasta, { finDia: true }) || ahora
    const desde = parseInstanteMx(filtros.desde, { finDia: false }) || new Date(hasta.getTime() - 30 * MS_DIA)
    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
      throw new KpiError('El rango de fechas no es válido.', 400, 'FECHA')
    }
    if (desde.getTime() > hasta.getTime()) {
      throw new KpiError('La fecha inicial no puede ser posterior a la final.', 400, 'FECHA')
    }
    const yarda = filtros.yarda && filtros.yarda !== 'todas' ? String(filtros.yarda).trim().toLowerCase() : ''
    const [ots, estados, movimientos] = await Promise.all([
      repo.listOrdenesTrabajo(),
      repo.listEstadoUnidad(),
      repo.listMovimientos(),
    ])

    const otsYarda = ots.filter((ot) => ot.activo !== 'NO' && yardaOk(ot.yarda, yarda))
    const cerradas = otsYarda.filter((ot) => {
      if (ot.estatus !== 'CERRADA') return false
      const fin = Date.parse(ot.fechaLiberada || '')
      return Number.isFinite(fin) && fin >= desde.getTime() && fin <= hasta.getTime()
    })
    const abiertas = otsYarda.filter((ot) => !['CERRADA', 'CANCELADA'].includes(ot.estatus))

    let downtimeHoras = 0
    for (const ot of cerradas) {
      downtimeHoras += horasSolapadas(ot.fechaEntradaTaller || ot.fechaLiberada, ot.fechaLiberada, desde.getTime(), hasta.getTime())
    }
    for (const ot of abiertas) {
      downtimeHoras += horasSolapadas(ot.fechaEntradaTaller, hasta.toISOString(), desde.getTime(), hasta.getTime())
    }

    const reparaciones = cerradas
      .map((ot) => horasEntre(ot.fechaEntradaTaller, ot.fechaLiberada))
      .filter((horas) => horas != null)
    const mttrHoras = promedio(reparaciones)

    const dentro = cerradas.filter((ot) => {
      const limite = Date.parse(ot.etrOriginal || ot.etr || '')
      const fin = Date.parse(ot.fechaLiberada || '')
      return Number.isFinite(limite) && Number.isFinite(fin) && fin <= limite
    })
    const otDentroEtrPct = cerradas.length ? (100 * dentro.length) / cerradas.length : null

    const ids = new Set()
    for (const estado of estados) {
      if (estado.estatusOperativo === 'BAJA') continue
      if (!yardaOk(estado.yarda, yarda)) continue
      if (estado.unidadId) ids.add(norm(estado.unidadId))
    }
    if (ids.size === 0) {
      for (const ot of [...cerradas, ...abiertas]) {
        if (ot.unidadId) ids.add(norm(ot.unidadId))
      }
    }
    const horasPeriodo = Math.max((hasta.getTime() - desde.getTime()) / MS_HORA, 1 / 60)
    const capacidad = ids.size * horasPeriodo
    const disponibilidadPct = ids.size === 0 ? null : Math.min(100, Math.max(0, 100 * (1 - downtimeHoras / capacidad)))

    const ciclos = ciclosDwell(movimientos, { yarda, desdeMs: desde.getTime(), hastaMs: hasta.getTime() })
    const horasDwell = ciclos.map((ciclo) => ciclo.horas)
    const conServidor = ciclos.filter((ciclo) => ciclo.fuente === 'horaServidor').length
    let fuenteDwell = null
    if (ciclos.length && conServidor === ciclos.length) fuenteDwell = 'horaServidor'
    else if (ciclos.length && conServidor === 0) fuenteDwell = 'fechaHora'
    else if (ciclos.length) fuenteDwell = 'mixta'

    return {
      yarda: yarda || 'todas',
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
      disponibilidadPct,
      downtimeHoras,
      mttrHoras,
      otsCerradas: cerradas.length,
      otsDentroEtr: dentro.length,
      otDentroEtrPct,
      dwellPromedioHoras: promedio(horasDwell),
      dwellP95Horas: percentil95(horasDwell),
      ciclosDwell: ciclos.length,
      ciclosConHoraServidor: conServidor,
      fuenteDwell,
      unidades: ids.size,
      horasPeriodo,
    }
  }

  return { resumen, toCsv: kpisToCsv }
}
