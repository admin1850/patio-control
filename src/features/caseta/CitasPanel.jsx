import { useState } from 'react'
import { apiFetch } from '../../lib/serverApi.js'
import { TIPOS_CITA } from '../../lib/citas.js'

const VACIO = { tipo: 'transportista', nombre: '', empresa: '', placa: '', eta: '' }

export default function CitasPanel() {
  const [form, setForm] = useState(VACIO)
  const [qr, setQr] = useState('')
  const [codigo, setCodigo] = useState('')
  const [msg, setMsg] = useState('')

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function crear(ev) {
    ev.preventDefault()
    setMsg('')
    try {
      const data = await apiFetch('/api/citas', { method: 'POST', json: { accion: 'crear', ...form } })
      setQr(data?.qr || data?.cita?.id || '')
      setMsg('Cita lista. Ese código es el QR que se presenta en caseta.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo crear.')
    }
  }

  async function validar(ev) {
    ev.preventDefault()
    setMsg('')
    try {
      const data = await apiFetch('/api/citas', { method: 'POST', json: { accion: 'validar', codigo } })
      setMsg(data?.mensaje || 'Pase autorizado.')
      setCodigo('')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo validar.')
    }
  }

  return (
    <section className="fieldset" style={{ marginBottom: 16 }}>
      <h2 className="subhead">Citas de terceros</h2>
      <p className="hint">Transportistas, proveedores y visitas. El código grande es el contenido del QR. En caseta se pega o se escribe y se valida una sola vez.</p>
      <form className="grid-2" onSubmit={(ev) => void crear(ev)}>
        <label className="field">
          <span>Tipo</span>
          <select className="input" value={form.tipo} onChange={(ev) => set('tipo', ev.target.value)}>
            {TIPOS_CITA.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
          </select>
        </label>
        <label className="field"><span>Nombre</span><input className="input" value={form.nombre} onChange={(ev) => set('nombre', ev.target.value)} required /></label>
        <label className="field"><span>Empresa</span><input className="input" value={form.empresa} onChange={(ev) => set('empresa', ev.target.value)} /></label>
        <label className="field"><span>Placa</span><input className="input" value={form.placa} onChange={(ev) => set('placa', ev.target.value)} /></label>
        <label className="field"><span>ETA</span><input className="input" type="datetime-local" value={form.eta} onChange={(ev) => set('eta', ev.target.value)} /></label>
        <button type="submit" className="btn primary">Crear cita</button>
      </form>
      {qr && <p className="unit-placa" data-field="qr-cita" style={{ fontSize: 28, letterSpacing: 1 }}>{qr}</p>}
      <form className="grid-2" onSubmit={(ev) => void validar(ev)} style={{ marginTop: 12 }}>
        <label className="field"><span>Código del QR en caseta</span><input className="input" value={codigo} onChange={(ev) => setCodigo(ev.target.value)} required /></label>
        <button type="submit" className="btn soft">Validar en caseta</button>
      </form>
      {msg && <p className="hint">{msg}</p>}
    </section>
  )
}
