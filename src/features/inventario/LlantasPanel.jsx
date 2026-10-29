import { useState } from 'react'
import { apiFetch } from '../../lib/serverApi.js'
import { POSICIONES_LLANTA } from '../../lib/llantas.js'

const VACIO = { placa: '', posicion: 'DI', numero: '', dot: '', profundidad: '', presion: '' }

export default function LlantasPanel() {
  const [form, setForm] = useState(VACIO)
  const [msg, setMsg] = useState('')

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function guardar(ev) {
    ev.preventDefault()
    setMsg('')
    try {
      const data = await apiFetch('/api/llantas', { method: 'POST', json: form })
      setMsg(data?.alerta ? 'Se guardó y se avisó: cambió la llanta sin OT abierta.' : 'Lectura guardada.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo guardar.')
    }
  }

  return (
    <section className="fieldset" style={{ marginBottom: 16 }}>
      <h2 className="subhead">Llantas en la entrada</h2>
      <p className="hint">Número, DOT, profundidad y presión por posición. Si el número o el DOT cambian y no hay OT abierta, entra un aviso.</p>
      {msg && <p className="hint">{msg}</p>}
      <form className="grid-2" onSubmit={(ev) => void guardar(ev)}>
        <label className="field"><span>Placa</span><input className="input" value={form.placa} onChange={(ev) => set('placa', ev.target.value)} required /></label>
        <label className="field">
          <span>Posición</span>
          <select className="input" value={form.posicion} onChange={(ev) => set('posicion', ev.target.value)}>
            {POSICIONES_LLANTA.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="field"><span>Número</span><input className="input" value={form.numero} onChange={(ev) => set('numero', ev.target.value)} /></label>
        <label className="field"><span>DOT</span><input className="input" value={form.dot} onChange={(ev) => set('dot', ev.target.value)} /></label>
        <label className="field"><span>Profundidad (mm)</span><input className="input" inputMode="decimal" value={form.profundidad} onChange={(ev) => set('profundidad', ev.target.value)} /></label>
        <label className="field"><span>Presión</span><input className="input" inputMode="decimal" value={form.presion} onChange={(ev) => set('presion', ev.target.value)} /></label>
        <button type="submit" className="btn primary">Guardar lectura</button>
      </form>
    </section>
  )
}
