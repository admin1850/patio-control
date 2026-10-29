import { useState } from 'react'
import { apiFetch } from '../../lib/serverApi.js'

export default function EntregaShare({ movimientos = [] }) {
  const recientes = [...movimientos].slice(0, 5)
  const [msg, setMsg] = useState('')

  async function compartir(id) {
    setMsg('')
    try {
      const data = await apiFetch('/api/entrega.pdf', { method: 'POST', json: { id } })
      setMsg(data?.url ? `Listo para enviar: ${data.url}` : 'Aviso encolado.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo compartir.')
    }
  }

  if (!recientes.length) return null
  return (
    <section className="fieldset" style={{ marginBottom: 12 }}>
      <h2 className="subhead">PDF de entrega-recepción</h2>
      <p className="hint">Incluye sello, daños marcados, firma y las fotos. Compartir usa el aviso de WhatsApp o correo que ya está configurado.</p>
      <ul className="history-list">
        {recientes.map((mov) => (
          <li key={mov.id}>
            <p className="unit-meta">{mov.placa} · {mov.tipo} · {mov.selloNumero || 'sin sello'}</p>
            <a className="text-btn" href={`/api/entrega.pdf?id=${encodeURIComponent(mov.id)}`} target="_blank" rel="noreferrer">Abrir PDF</a>
            {' '}
            <button type="button" className="text-btn" onClick={() => void compartir(mov.id)}>Compartir</button>
          </li>
        ))}
      </ul>
      {msg && <p className="hint">{msg}</p>}
    </section>
  )
}
