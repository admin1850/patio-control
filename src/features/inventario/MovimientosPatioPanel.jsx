import { useEffect, useState } from 'react'
import { apiFetch, isBackendUnavailable } from '../../lib/serverApi.js'

const VACIO = { placa: '', desde: '', hacia: '' }

export default function MovimientosPatioPanel() {
  const [ordenes, setOrdenes] = useState([])
  const [mapa, setMapa] = useState([])
  const [form, setForm] = useState(VACIO)
  const [msg, setMsg] = useState('')

  async function cargar() {
    try {
      const data = await apiFetch('/api/movimientos-patio')
      setOrdenes(Array.isArray(data?.ordenes) ? data.ordenes : [])
      setMapa(Array.isArray(data?.mapa) ? data.mapa : [])
      setMsg('')
    } catch (err) {
      setMsg(isBackendUnavailable(err)
        ? 'Falta la pestaña MovimientosPatio. En la máquina del dueño: npm run migrate:patio'
        : (err instanceof Error ? err.message : 'No se pudo leer.'))
    }
  }

  useEffect(() => { void cargar() }, [])

  async function post(json) {
    setMsg('')
    try {
      await apiFetch('/api/movimientos-patio', { method: 'POST', json })
      await cargar()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo guardar.')
    }
  }

  return (
    <section className="fieldset" style={{ marginBottom: 16 }}>
      <h2 className="subhead">Movimientos internos</h2>
      <p className="hint">Desde el celular: crea la orden, tómala y ciérrala. Al cerrar, el mapa de spots usa el destino.</p>
      {msg && <p className="banner warn">{msg}</p>}
      <form className="grid-2" onSubmit={(ev) => { ev.preventDefault(); void post({ accion: 'crear', ...form }) }}>
        <label className="field"><span>Placa</span><input className="input" value={form.placa} onChange={(ev) => setForm({ ...form, placa: ev.target.value })} required /></label>
        <label className="field"><span>Desde</span><input className="input" value={form.desde} onChange={(ev) => setForm({ ...form, desde: ev.target.value })} placeholder="A1" /></label>
        <label className="field"><span>Hacia</span><input className="input" value={form.hacia} onChange={(ev) => setForm({ ...form, hacia: ev.target.value })} placeholder="B3" required /></label>
        <button type="submit" className="btn primary">Crear orden</button>
      </form>
      <ul className="history-list">
        {ordenes.filter((orden) => orden.estatus !== 'CERRADA').map((orden) => (
          <li key={orden.id}>
            <p className="unit-meta">{orden.placa} · {orden.desde || '—'} → {orden.hacia} · {orden.estatus}</p>
            {orden.estatus === 'ABIERTA' && <button type="button" className="btn soft" onClick={() => void post({ accion: 'tomar', id: orden.id })}>Tomar</button>}
            {orden.estatus === 'TOMADA' && <button type="button" className="btn primary" onClick={() => void post({ accion: 'cerrar', id: orden.id })}>Cerrar</button>}
          </li>
        ))}
      </ul>
      {mapa.length > 0 && (
        <div>
          <p className="label">Mapa de spots</p>
          <ul className="history-list">
            {mapa.map((item) => <li key={item.placa}><p className="unit-meta">{item.placa} · {item.spot}</p></li>)}
          </ul>
        </div>
      )}
    </section>
  )
}
