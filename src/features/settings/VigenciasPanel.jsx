import { useEffect, useState } from 'react'
import { apiFetch, isBackendUnavailable } from '../../lib/serverApi.js'
import { DOCUMENTOS_VIGENCIA } from '../../lib/vigenciaDocumentos.js'

const VACIO = {
  sujetoTipo: 'unidad',
  sujetoId: '',
  documento: 'seguro',
  vence: '',
}

export default function VigenciasPanel({ readOnly = false }) {
  const [form, setForm] = useState(VACIO)
  const [filas, setFilas] = useState([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function cargar() {
    try {
      const data = await apiFetch('/api/vigencias')
      setFilas(Array.isArray(data?.vigencias) ? data.vigencias : [])
      setError('')
    } catch (err) {
      if (isBackendUnavailable(err)) {
        setError('Las vigencias no están en el Sheet todavía. En la máquina del dueño: npm run migrate:vigencias')
        return
      }
      setError(err instanceof Error ? err.message : 'No se pudieron leer las vigencias.')
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  async function guardar(ev) {
    ev.preventDefault()
    setMsg('')
    setError('')
    setBusy(true)
    try {
      await apiFetch('/api/vigencias', { method: 'POST', json: form })
      setMsg('Vencimiento guardado.')
      setForm((prev) => ({ ...prev, vence: '' }))
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setBusy(false)
    }
  }

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <section className="fieldset" style={{ marginBottom: 16 }}>
      <h2 className="subhead">Documentos por vencer</h2>
      <p className="hint">
        Licencia, seguro, tarjeta de circulación, verificación físico-mecánica, emisiones y permiso SICT.
        Aviso a 30 y a 15 días. Si ya venció, la salida pide autorización del encargado.
      </p>
      {error && <p className="banner warn">{error}</p>}
      {msg && <p className="banner success">{msg}</p>}
      {!readOnly && (
        <form className="grid-2" onSubmit={(ev) => void guardar(ev)}>
          <label className="field">
            <span>De quién</span>
            <select className="input" value={form.sujetoTipo} onChange={(ev) => set('sujetoTipo', ev.target.value)}>
              <option value="unidad">Unidad</option>
              <option value="operador">Operador</option>
            </select>
          </label>
          <label className="field">
            <span>{form.sujetoTipo === 'unidad' ? 'Placa o id de la unidad' : 'Nombre del operador'}</span>
            <input className="input" value={form.sujetoId} onChange={(ev) => set('sujetoId', ev.target.value)} required />
          </label>
          <label className="field">
            <span>Documento</span>
            <select className="input" value={form.documento} onChange={(ev) => set('documento', ev.target.value)}>
              {DOCUMENTOS_VIGENCIA.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Vence</span>
            <input className="input" type="date" value={form.vence} onChange={(ev) => set('vence', ev.target.value)} required />
          </label>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar vencimiento'}</button>
        </form>
      )}
      {filas.length > 0 && (
        <ul className="history-list" style={{ marginTop: 12 }}>
          {filas.slice(0, 12).map((fila) => (
            <li key={fila.id}>
              <p className="unit-meta">{fila.sujetoTipo} · {fila.sujetoId} · {fila.documento} · vence {fila.vence}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
