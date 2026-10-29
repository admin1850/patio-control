import { useEffect } from 'react'
import { apiFetch } from '../../lib/serverApi.js'
import { resumenDiesel } from '../../lib/dieselRendimiento.js'

function fmt(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(2)} km/L`
}

export default function DieselPanel({ movimientos }) {
  const res = resumenDiesel(movimientos)
  useEffect(() => {
    if (!res.anomalias.length) return
    apiFetch('/api/diesel/anomalias', { method: 'POST', json: {} }).catch(() => {})
  }, [res.anomalias.length])
  return (
    <section className="fieldset" style={{ marginTop: 16 }}>
      <h2 className="subhead">Rendimiento de diésel</h2>
      <p className="hint">km/L entre capturas con kilómetros y litros. Menos de 0.8 o más de 4.5 km/L se marca como anomalía.</p>
      {res.tramos.length === 0 && <p className="empty">Todavía no hay dos lecturas con km y litros de la misma unidad.</p>}
      {res.porUnidad.length > 0 && (
        <ul className="history-list">
          {res.porUnidad.map((item) => (
            <li key={item.id}>
              <p className="unit-meta">Unidad {item.id} · {fmt(item.kmPorLitro)} · {item.tramos} tramo(s){item.anomalias ? ` · ${item.anomalias} anomalía(s)` : ''}</p>
            </li>
          ))}
          {res.porOperador.map((item) => (
            <li key={`op-${item.id}`}>
              <p className="unit-meta">Operador {item.id} · {fmt(item.kmPorLitro)} · {item.tramos} tramo(s){item.anomalias ? ` · ${item.anomalias} anomalía(s)` : ''}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
