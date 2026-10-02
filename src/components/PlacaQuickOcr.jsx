import { useRef, useState } from 'react'
import { compressPlateImage, normalizePlacaMX, readPlacaFromDataUrl } from '../lib/placaOcr.js'

export const PLACA_HINT = 'Ingresar sin guiones (letras o números nada más)'

/**
 * Debajo de cualquier campo de placa:
 * leyenda + botón cámara → Plate Recognizer / Vision → llena sin guiones.
 * El tecleo manual en el input de arriba siempre sigue disponible.
 */
export default function PlacaQuickOcr({
  slotId = 'placa',
  onPlaca,
  onPhoto,
  label = 'Tomar foto y leer placa',
  showHint = true,
}) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [preview, setPreview] = useState(null)

  async function onFile(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErr('Solo imágenes de cámara')
      return
    }
    setBusy(true)
    setErr(null)
    setMsg('Leyendo placa…')
    try {
      const dataUrl = await compressPlateImage(file)
      setPreview(dataUrl)
      onPhoto?.(slotId, dataUrl)
      const result = await readPlacaFromDataUrl(dataUrl)
      const placa = normalizePlacaMX(result.placa)
      if (result.confidence >= 0.4 && placa) {
        onPlaca(placa)
        setMsg(
          `Placa: ${placa} (${Math.round(result.confidence * 100)}% · ${result.engine}). Confirma o edita.`,
        )
      } else {
        setMsg(
          `Lectura débil (${Math.round((result.confidence || 0) * 100)}% · ${result.engine}${
            placa ? `: ${placa}` : ''
          }). No se llenó el campo. Acerca más o teclea a mano.`,
        )
      }
    } catch (e) {
      setMsg(null)
      setErr(e instanceof Error ? e.message : 'No se pudo leer la placa')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="placa-quick-ocr">
      {showHint ? <p className="placa-hint">{PLACA_HINT}</p> : null}
      <button
        type="button"
        className="btn soft placa-ocr-btn"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Leyendo…' : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {preview ? (
        <img className="placa-quick-preview" src={preview} alt="Placa capturada" />
      ) : null}
      {msg ? <p className="ocr-msg hint">{msg}</p> : null}
      {err ? <p className="field-error">{err}</p> : null}
    </div>
  )
}
