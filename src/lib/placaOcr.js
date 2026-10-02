/**
 * OCR de placas MX — sin guiones.
 * Orden: Netlify (Vision / servidor) → Plate Recognizer local (token opcional en Cloud).
 * Flujo UI: capture=environment → compress JPEG → OCR → campo.
 */

export const PLATE_TOKEN_KEY = 'patio-plate-recognizer-token'

/** @typedef {'placa'|'placaCamionTrasera'|'placaCaja1'|'placaCaja2'|'placaRefrigerada'} PlacaField */

export const PLACA_SLOT_FIELDS = /** @type {Record<string, PlacaField>} */ ({
  'placa-camion-frontal': 'placa',
  'placa-camion-trasera': 'placaCamionTrasera',
  'placa-caja-1-trasera': 'placaCaja1',
  'placa-caja-2-trasera': 'placaCaja2',
  'placa-refrigerada': 'placaRefrigerada',
  'parado-placa': 'placa',
  'placa-rapido': 'placa',
})

/** Quita guiones/espacios → ABC123A */
export function normalizePlacaMX(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/\|/g, 'I')
    .replace(/[\s\-_.·•/,;:]+/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)
}

const PLATE_PATTERNS = [
  /^[A-Z]{3}\d{4}$/,
  /^[A-Z]{3}\d{3}[A-Z]$/,
  /^[A-Z]{3}\d{3,4}[A-Z]?$/,
  /^\d{2,3}[A-Z]{3}\d{1,2}$/,
  /^[A-Z]{2}\d{5}$/,
  /^[A-Z]{4}\d{2,3}$/,
  /^\d{3}[A-Z]{3}$/,
]

export function scorePlaca(raw) {
  const t = normalizePlacaMX(raw)
  if (t.length < 5 || t.length > 10) return 0
  const letters = (t.match(/[A-Z]/g) ?? []).length
  const digits = (t.match(/[0-9]/g) ?? []).length
  if (letters === 0 || digits === 0) return 0.1
  let s = 0.4
  if (t.length >= 6 && t.length <= 9) s += 0.2
  if (letters >= 2 && digits >= 2) s += 0.15
  for (const re of PLATE_PATTERNS) {
    if (re.test(t)) {
      s += 0.35
      break
    }
  }
  return Math.min(1, s)
}

function extractBestPlaca(texts) {
  /** @type {{ placa: string, confidence: number } | null} */
  let best = null
  const bag = []
  for (const raw of texts) {
    if (!raw) continue
    bag.push(raw)
    bag.push(...String(raw).split(/[\s\n|,;/·•]+/).filter(Boolean))
    const compact = normalizePlacaMX(raw)
    for (let len = 5; len <= Math.min(10, compact.length); len++) {
      for (let i = 0; i + len <= compact.length; i++) {
        bag.push(compact.slice(i, i + len))
      }
    }
  }
  for (const piece of bag) {
    const placa = normalizePlacaMX(piece)
    const confidence = scorePlaca(placa)
    if (!placa || confidence < 0.4) continue
    if (!best || confidence > best.confidence) best = { placa, confidence }
  }
  return best
}

export function isPlateSlot(slot) {
  return slot?.silhouette === 'plate' || Boolean(PLACA_SLOT_FIELDS[slot?.id])
}

export function getPlateRecognizerToken() {
  try {
    return (typeof localStorage !== 'undefined' && localStorage.getItem(PLATE_TOKEN_KEY)) || ''
  } catch {
    return ''
  }
}

export function setPlateRecognizerToken(token) {
  localStorage.setItem(PLATE_TOKEN_KEY, String(token || '').trim())
}

/** Comprime File → JPEG dataURL (mismo pipeline caseta) */
export function compressImageFile(file, maxW = 1600, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('No canvas'))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = /** @type {string} */ (reader.result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** @deprecated alias — placas usaban 1280 */
export function compressPlateImage(file, maxW = 1280, quality = 0.72) {
  return compressImageFile(file, maxW, quality)
}

async function ocrWithPlateRecognizer(dataUrl) {
  const token = getPlateRecognizerToken().trim()
  if (!token) return null
  const blob = await (await fetch(dataUrl)).blob()
  const form = new FormData()
  form.append('upload', blob, 'placa.jpg')
  form.append('regions', 'mx')
  const res = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
    body: form,
  })
  if (!res.ok) return null
  const top = (await res.json()).results?.[0]
  if (!top?.plate) return null
  const placa = normalizePlacaMX(top.plate)
  if (!placa) return null
  return {
    placa,
    confidence: Math.max(scorePlaca(placa), top.score ?? 0.7),
    engine: 'platerecognizer',
    rawText: top.plate,
  }
}

async function ocrWithNetlifyFunction(dataUrl) {
  const res = await fetch('/api/ocr-placa', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ dataUrl }),
  })
  if (res.status === 401) {
    throw new Error('Sesión expirada. Vuelve a entrar con correo y clave, luego reintenta la foto.')
  }
  if (!res.ok) {
    let msg = ''
    try {
      const j = await res.json()
      msg = String(j.error || j.message || '')
      if (j.needsManual && !msg) msg = 'OCR no disponible; escribe la placa a mano.'
    } catch {
      /* ignore */
    }
    if (msg) throw new Error(msg)
    return null
  }
  const j = await res.json()
  const placa = normalizePlacaMX(j.placa || j.rawText || '')
  if (!placa) return null
  return {
    placa,
    confidence: Math.max(scorePlaca(placa), 0.55),
    engine: j.source || 'vision',
    rawText: j.rawText || '',
  }
}

/**
 * @param {string} dataUrl
 * @returns {Promise<{ placa: string, confidence: number, engine: string, rawText?: string }>}
 */
export async function readPlacaFromDataUrl(dataUrl) {
  let lastErr = null
  // 1) Servidor (Vision en Netlify) — no requiere token en la tablet
  try {
    const nv = await ocrWithNetlifyFunction(dataUrl)
    if (nv?.placa && nv.confidence >= 0.45) {
      return { ...nv, placa: normalizePlacaMX(nv.placa) }
    }
  } catch (err) {
    lastErr = err
  }
  // 2) Plate Recognizer opcional (token en Cloud de este dispositivo)
  try {
    const pr = await ocrWithPlateRecognizer(dataUrl)
    if (pr?.placa && pr.confidence >= 0.5) {
      return { ...pr, placa: normalizePlacaMX(pr.placa) }
    }
  } catch (err) {
    lastErr = err
  }
  if (lastErr instanceof Error && /sesión|login|expirad/i.test(lastErr.message)) {
    throw lastErr
  }
  throw new Error(
    'No se pudo leer la placa. Acerca más, con buena luz, o escribe a mano.',
  )
}

/** @deprecated alias */
export async function ocrPlacaFromDataUrl(dataUrl) {
  try {
    const r = await readPlacaFromDataUrl(dataUrl)
    return { placa: r.placa, rawText: r.rawText || '', source: r.engine }
  } catch {
    return { placa: '', rawText: '', source: 'manual' }
  }
}

export function applyPlacaOcrToForm(slotId, placa, setters) {
  const field = PLACA_SLOT_FIELDS[slotId] || 'placa'
  const v = normalizePlacaMX(placa)
  if (!v) return null
  if (field === 'placa') setters.setPlaca?.(v)
  if (field === 'placaCamionTrasera') setters.setPlacaCamionTrasera?.(v)
  if (field === 'placaCaja1') setters.setPlacaCaja1?.(v)
  if (field === 'placaCaja2') setters.setPlacaCaja2?.(v)
  if (field === 'placaRefrigerada') setters.setPlacaRefrigerada?.(v)
  return { field, placa: v }
}

export { extractBestPlaca }
