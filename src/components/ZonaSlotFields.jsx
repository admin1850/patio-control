import { useEffect, useState } from 'react'
import { sessionLikelyAvailable } from '../lib/serverApi.js'

export function ZonaSlotFields({ zona, slot, onZona, onSlot }) {
  return (
    <fieldset className="fieldset">
      <legend>Zona y slot (opcional)</legend>
      <div className="grid-2">
        <label className="field">
          <span>Zona</span>
          <input
            className="input"
            value={zona}
            onChange={(e) => onZona(e.target.value)}
            placeholder="Norte, andén, lavado…"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Slot</span>
          <input className="input" value={slot} onChange={(e) => onSlot(e.target.value)} placeholder="A-12" autoComplete="off" />
        </label>
      </div>
      <p className="hint">
        Con sesión de servidor se guarda en el inventario después del movimiento. Si el servidor no responde, el movimiento sí queda.
      </p>
    </fieldset>
  )
}

/** Solo se muestra cuando hay sesión de servidor (cookie probable). */
export function useZonaSlotFields() {
  const [server, setServer] = useState(() => sessionLikelyAvailable())
  const [zona, setZona] = useState('')
  const [slot, setSlot] = useState('')
  useEffect(() => {
    setServer(sessionLikelyAvailable())
  }, [])
  return {
    server,
    zona,
    slot,
    node: server ? <ZonaSlotFields zona={zona} slot={slot} onZona={setZona} onSlot={setSlot} /> : null,
  }
}
