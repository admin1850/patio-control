import { useEffect, useState } from 'react'
import { fetchKpisCsv, fetchKpisOpcional } from '../lib/serverApi.js'

function hoyMx() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
}

function hace30Mx() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(Date.now() - 30 * 86400000))
}

function pct(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(1)}%`
}

function horas(value) {
  if (value == null || Number.isNaN(value)) return '—'
  if (value < 1) return `${Math.round(value * 60)} min`
  return `${value.toFixed(1)} h`
}

function csvLocal(kpis) {
  const celda = (value) => {
    const text = value == null || Number.isNaN(value) ? '' : String(Math.round(value * 10) / 10)
    return text
  }
  const filas = [
    ['Indicador', 'Valor'],
    ['Yarda', kpis.yarda || 'todas'],
    ['Disponibilidad %', kpis.disponibilidadPct == null ? '' : celda(kpis.disponibilidadPct)],
    ['Downtime (horas)', celda(kpis.downtimeHoras)],
    ['MTTR (horas)', celda(kpis.mttrHoras)],
    ['OT dentro del ETR original %', kpis.otDentroEtrPct == null ? '' : celda(kpis.otDentroEtrPct)],
    ['Dwell promedio (horas)', kpis.dwellPromedioHoras == null ? '' : celda(kpis.dwellPromedioHoras)],
    ['Fuente dwell', kpis.fuenteDwell || ''],
  ]
  return filas.map((fila) => fila.join(',')).join('\n')
}

function descargar(nombre, texto) {
  const blob = new Blob([`\uFEFF${texto}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nombre
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Tarjetas del API. Si el servidor no responde, no pinta nada: siguen los KPIs del dispositivo.
 */
export default function KpiMantenimiento({ yarda = 'todas' }) {
  const [desde, setDesde] = useState(hace30Mx)
  const [hasta, setHasta] = useState(hoyMx)
  const [kpis, setKpis] = useState(undefined)
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    let cancel = false
    setKpis(undefined)
    fetchKpisOpcional({ yarda, desde, hasta })
      .then((data) => {
        if (!cancel) setKpis(data)
      })
      .catch(() => {
        if (!cancel) setKpis(null)
      })
    return () => {
      cancel = true
    }
  }, [yarda, desde, hasta])

  if (!kpis) return null

  const fuente = kpis.fuenteDwell === 'horaServidor'
    ? 'Dwell con hora del servidor'
    : kpis.fuenteDwell === 'mixta'
      ? 'Parte con hora del servidor'
      : 'Dwell con hora del dispositivo'

  async function exportar() {
    setExportando(true)
    try {
      const texto = await fetchKpisCsv({ yarda, desde, hasta })
      descargar(`kpis-${kpis.yarda || 'todas'}.csv`, texto.replace(/^\uFEFF/, ''))
    } catch {
      descargar(`kpis-${kpis.yarda || 'todas'}.csv`, csvLocal(kpis))
    } finally {
      setExportando(false)
    }
  }

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <h2>Mantenimiento (servidor)</h2>
        <button type="button" className="btn soft" disabled={exportando} onClick={() => void exportar()}>
          {exportando ? 'Exportando…' : 'Exportar CSV'}
        </button>
      </div>
      <p className="hint">Disponibilidad, MTTR y ETR del periodo. El dwell usa la hora del servidor cuando la entrada y la salida la traen.</p>
      <div className="grid-2" style={{ margin: '12px 0' }}>
        <label className="field">
          <span>Desde</span>
          <input className="input" type="date" value={desde} onChange={(ev) => setDesde(ev.target.value)} />
        </label>
        <label className="field">
          <span>Hasta</span>
          <input className="input" type="date" value={hasta} onChange={(ev) => setHasta(ev.target.value)} />
        </label>
      </div>
      <div className="stats kpi-grid">
        <article className="stat">
          <p className="stat-label">Disponibilidad</p>
          <p className="stat-value">{pct(kpis.disponibilidadPct)}</p>
          <p className="hint">{kpis.unidades ?? 0} unidades en el periodo</p>
        </article>
        <article className="stat">
          <p className="stat-label">Downtime / MTTR</p>
          <p className="stat-value">{horas(kpis.mttrHoras)}</p>
          <p className="hint">Downtime {horas(kpis.downtimeHoras)} · {kpis.otsCerradas ?? 0} OT cerradas</p>
        </article>
        <article className="stat">
          <p className="stat-label">OT dentro del ETR original</p>
          <p className="stat-value">{pct(kpis.otDentroEtrPct)}</p>
          <p className="hint">{kpis.otsDentroEtr ?? 0} de {kpis.otsCerradas ?? 0}</p>
        </article>
        <article className="stat">
          <p className="stat-label">Dwell (servidor)</p>
          <p className="stat-value">{horas(kpis.dwellPromedioHoras)}</p>
          <p className="hint">P95 {horas(kpis.dwellP95Horas)} · {fuente}</p>
        </article>
      </div>
    </section>
  )
}
