import { useState } from 'react'

const CHIPS = [
  '¿Cómo registro una entrada?',
  '¿Cómo hago una salida?',
  '¿Para qué sirve Cloud?',
  '¿Qué es el sello?',
  '¿Qué hace Redactar con Grok?',
  '¿Qué pasa si estoy offline?',
]

/**
 * FAB ¿Dudas? — ayuda Grok acotada a PatioControl (no chat libre).
 */
export default function GrokDudas({ page = '' }) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  function pickChip(text) {
    setQuestion(text)
    setError(null)
  }

  async function preguntar(ev) {
    ev?.preventDefault?.()
    const q = question.trim()
    if (!q || busy) return
    setBusy(true)
    setError(null)
    setAnswer(null)
    try {
      const res = await fetch('/api/patio-grok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ayuda', question: q, page }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      if (!j.text) {
        throw new Error('Sin respuesta')
      }
      setAnswer(String(j.text))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo consultar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grok-dudas">
      <button
        type="button"
        className={`grok-dudas-fab${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Cerrar dudas' : 'Abrir dudas'}
      >
        {open ? '×' : '¿Dudas?'}
      </button>
      {open && (
        <div className="grok-dudas-panel" role="dialog" aria-label="Ayuda PatioControl">
          <div className="grok-dudas-head">
            <strong>¿Dudas?</strong>
            <button type="button" className="text-btn" onClick={() => setOpen(false)} aria-label="Cerrar">
              Cerrar
            </button>
          </div>
          <p className="hint grok-dudas-lede">
            Ayuda de PatioControl (entrada, salida, Cloud, sello, Grok, offline). No es chat libre.
          </p>
          <div className="grok-dudas-chips" role="list">
            {CHIPS.map((c) => (
              <button key={c} type="button" className="chip" role="listitem" onClick={() => pickChip(c)}>
                {c}
              </button>
            ))}
          </div>
          <form className="grok-dudas-form" onSubmit={preguntar}>
            <label className="field full">
              <span>Tu pregunta</span>
              <textarea
                className="input textarea"
                rows={3}
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value)
                  setError(null)
                }}
                placeholder="Ej. ¿Cómo conecto Cloud?"
              />
            </label>
            {error && <p className="banner error">{error}</p>}
            {answer && (
              <p className="banner success grok-dudas-answer" style={{ whiteSpace: 'pre-wrap' }}>
                {answer}
              </p>
            )}
            <button type="submit" className="btn primary" disabled={busy || !question.trim()}>
              {busy ? 'Consultando…' : 'Preguntar'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
