import { useEffect, useState } from 'react'
import { fetchLlegadasOpcional } from '../lib/serverApi.js'

function placasDe(llegada) {
  if (Array.isArray(llegada.placas)) return llegada.placas.filter(Boolean).join(', ')
  return String(llegada.placas || '').trim()
}

/** Panel del patio. No se muestra si el API no responde o no hay preavisos. */
export default function LlegadasEsperadas({ yarda = 'todas' }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let cancel = false
    fetchLlegadasOpcional(yarda)
      .then((list) => {
        if (!cancel) setRows(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancel) setRows([])
      })
    return () => {
      cancel = true
    }
  }, [yarda])

  const visibles = (rows || []).filter((row) => {
    if (!row?.viajeId) return false
    if (yarda === 'todas' || !row.yardaId) return true
    return String(row.yardaId).toLowerCase() === String(yarda).toLowerCase()
  })
  if (!visibles.length) return null

  return (
    <section className="panel llegadas-panel" data-panel="llegadas-esperadas">
      <div className="panel-head">
        <h2>Llegadas esperadas</h2>
      </div>
      <ul className="unit-list">
        {visibles.slice(0, 8).map((row) => (
          <li className="unit-row" key={row.id || row.viajeId}>
            <div>
              <p className="unit-placa">{row.viajeId}</p>
              <p className="unit-meta">
                {placasDe(row) || 'sin placas'}
                {row.eta ? ` · ETA ${row.eta}` : ''}
                {row.sello ? ` · sello ${row.sello}` : ''}
                {row.yardaId ? ` · ${row.yardaId}` : ''}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
