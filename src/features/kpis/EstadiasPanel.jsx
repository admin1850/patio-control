import { useEffect, useState } from 'react'
import { apiFetch, isBackendUnavailable } from '../../lib/serverApi.js'

export default function EstadiasPanel() {
  const [filas, setFilas] = useState(null)
  const [cliente, setCliente] = useState('')
  const [horas, setHoras] = useState('24')
  const [msg, setMsg] = useState('')

  async function cargar() {
    try {
      const data = await apiFetch('/api/estadias')
      setFilas(Array.isArray(data?.estadias) ? data.estadias : [])
      setMsg('')
    } catch (err) {
      setFilas([])
      setMsg(isBackendUnavailable(err)
        ? 'El reloj de Frotcom aparece cuando existe la pestaña Estadías (npm run migrate:estadias) y hay FROTCOM_API_URL, FROTCOM_TOKEN y PATIO_GEOCERCAS_JSON.'
        : (err instanceof Error ? err.message : 'No se pudo leer el reporte.'))
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  async function guardar(ev) {
    ev.preventDefault()
    try {
      await apiFetch('/api/estadias', { method: 'POST', json: { cliente, horasLibres: Number(horas) } })
      setMsg(`Horas libres de ${cliente}: ${horas}.`)
      await cargar()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo guardar.')
    }
  }

  return (
    <section className="fieldset" style={{ marginTop: 16 }}>
      <h2 className="subhead">Estadías por cliente</h2>
      <p className="hint">El reloj arranca cuando Frotcom ve la unidad dentro de la geocerca. El excedente es el tiempo arriba de las horas libres del cliente (24 si no se definieron).</p>
      <form className="grid-2" onSubmit={(ev) => void guardar(ev)}>
        <label className="field"><span>Cliente</span><input className="input" value={cliente} onChange={(ev) => setCliente(ev.target.value)} required /></label>
        <label className="field"><span>Horas libres</span><input className="input" inputMode="decimal" value={horas} onChange={(ev) => setHoras(ev.target.value)} required /></label>
        <button type="submit" className="btn soft">Guardar horas libres</button>
      </form>
      {msg && <p className="hint">{msg}</p>}
      {filas?.length > 0 && (
        <ul className="history-list">
          {filas.map((fila) => (
            <li key={fila.id}>
              <p className="unit-meta">{fila.cliente} · {fila.placa} · {fila.horas} h · libre {fila.horasLibres} h · excedente {fila.excedente} h</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
