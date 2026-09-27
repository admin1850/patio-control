/**
 * OCR de placas MX — cliente.
 * Flujo: foto (capture=environment) → re(file,1280,0.72) → ocrPlacaFromDataUrl → campo.
 */

/** @typedef {'placa'|'placaCamionTrasera'|'placaCaja1'|'placaCaja2'} PlacaField */

/** Slot id → campo del movimiento */
export const PLACA_SLOT_FIELDS = /** @type {Record<string, PlacaField>} */ ({
  'placa-camion-frontal': 'placa',
  'placa-camion-trasera': 'placaCamionTrasera',
  'placa-caja-1-trasera': 'placaCaja1',
  'placa-caja-2-trasera': 'placaCaja2',
  'parado-placa': 'placa',
})

export function isPlateSlot(slot) {
  return slot?.silhouette === 'plate' || Boolean(PLACA_SLOT_FIELDS[slot?.id])
}

/**
 * Normaliza texto OCR a placa mexicana legible.
 * Acepta formatos tipo ABC-12-34, ABC123A, 123-ABC, etc.
 */
export function normalizePlacaMX(raw) {
  if (!raw || typeof raw !== 'string') return ''
  let t = raw
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '')

  // confusiones OCR frecuentes
  // (no forzamos 0↔O / 1↔I globalmente; solo en candidatos)

  if (!t) return ''

  const candidates = extractPlacaCandidates(t)
  if (candidates.length) return candidates[0]

  // si el texto ya es corto y alfanumérico, úsalo
  if (t.length >= 5 && t.length <= 10) return t
  return ''
}

function extractPlacaCandidates(compact) {
  const patterns = [
    // Nuevo federal: ABC123A / ABC12D3
    /[A-Z]{3}\d{2}[A-Z0-9]{1,2}/g,
    /[A-Z]{3}\d{3}[A-Z]/g,
    // Clásico: ABC1234 / ABC123
    /[A-Z]{3}\d{3,4}/g,
    // Numérico-letra: 123ABC / 12ABC3
    /\d{2,3}[A-Z]{3}\d?/g,
    // Remolque / frontera suelta
    /[A-Z]{2}\d{4}[A-Z]?/g,
  ]
  /** @type {string[]} */
  const found = []
  for (const re of patterns) {
    const m = compact.match(re)
    if (m) found.push(...m)
  }
  // únicos, preferir longitud 6–8
  return [...new Set(found)].sort((a, b) => scorePlaca(b) - scorePlaca(a))
}

function scorePlaca(p) {
  let s = 0
  if (p.length >= 6 && p.length <= 8) s += 10
  if (/^[A-Z]{3}\d{3,4}[A-Z]?$/.test(p)) s += 5
  if (/^[A-Z]{3}\d{2}[A-Z0-9]{1,2}$/.test(p)) s += 6
  return s + Math.min(p.length, 8)
}

/**
 * Llama Netlify Function. Fallback: vacío (UI permite captura manual).
 * @param {string} dataUrl JPEG data URL post-re()
 * @returns {Promise<{ placa: string, rawText: string, source: string }>}
 */
export async function ocrPlacaFromDataUrl(dataUrl) {
  if (!dataUrl?.startsWith('data:image')) {
    return { placa: '', rawText: '', source: 'none' }
  }

  try {
    const res = await fetch('/.netlify/functions/ocr-placa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl }),
    })
    if (res.ok) {
      const j = await res.json()
      const placa = normalizePlacaMX(j.placa || j.rawText || '')
      return {
        placa,
        rawText: j.rawText || '',
        source: j.source || 'netlify',
      }
    }
  } catch {
    // red / función ausente en local sin netlify dev
  }

  // Fallback local: si el host no tiene función, no bloquea el gate
  return { placa: '', rawText: '', source: 'manual' }
}

/**
 * Aplica lectura OCR al setter correcto del formulario.
 * @param {string} slotId
 * @param {string} placa
 * @param {{ setPlaca?: (v: string) => void, setPlacaCamionTrasera?: (v: string) => void, setPlacaCaja1?: (v: string) => void, setPlacaCaja2?: (v: string) => void }} setters
 */
export function applyPlacaOcrToForm(slotId, placa, setters) {
  const field = PLACA_SLOT_FIELDS[slotId]
  const v = normalizePlacaMX(placa)
  if (!field || !v) return null
  if (field === 'placa') setters.setPlaca?.(v)
  if (field === 'placaCamionTrasera') setters.setPlacaCamionTrasera?.(v)
  if (field === 'placaCaja1') setters.setPlacaCaja1?.(v)
  if (field === 'placaCaja2') setters.setPlacaCaja2?.(v)
  return { field, placa: v }
}
