/**
 * Netlify Function — OCR de placa (Vision API).
 * POST { dataUrl: "data:image/jpeg;base64,..." }
 * Env: GOOGLE_VISION_API_KEY (o GCP_VISION_API_KEY)
 *
 * Sin key → 503 con { needsManual: true } (mismo espíritu que Carta Porte).
 */

const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate'

function normalizePlacaMX(raw) {
  if (!raw || typeof raw !== 'string') return ''
  const t = raw
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '')
  if (!t) return ''

  const patterns = [
    /[A-Z]{3}\d{2}[A-Z0-9]{1,2}/g,
    /[A-Z]{3}\d{3}[A-Z]/g,
    /[A-Z]{3}\d{3,4}/g,
    /\d{2,3}[A-Z]{3}\d?/g,
    /[A-Z]{2}\d{4}[A-Z]?/g,
  ]
  const found = []
  for (const re of patterns) {
    const m = t.match(re)
    if (m) found.push(...m)
  }
  const uniq = [...new Set(found)].sort((a, b) => score(b) - score(a))
  if (uniq.length) return uniq[0]
  if (t.length >= 5 && t.length <= 10) return t
  return ''
}

function score(p) {
  let s = 0
  if (p.length >= 6 && p.length <= 8) s += 10
  if (/^[A-Z]{3}\d{3,4}[A-Z]?$/.test(p)) s += 5
  if (/^[A-Z]{3}\d{2}[A-Z0-9]{1,2}$/.test(p)) s += 6
  return s + Math.min(p.length, 8)
}

function stripDataUrl(dataUrl) {
  if (!dataUrl) return ''
  const i = dataUrl.indexOf('base64,')
  return i >= 0 ? dataUrl.slice(i + 7) : dataUrl
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }
  }

  const content = stripDataUrl(body.dataUrl || body.imageBase64 || '')
  if (!content || content.length < 100) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Imagen requerida (dataUrl JPEG post-compresión)' }),
    }
  }

  const apiKey = process.env.GOOGLE_VISION_API_KEY || process.env.GCP_VISION_API_KEY
  if (!apiKey) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        needsManual: true,
        error: 'OCR no configurado (GOOGLE_VISION_API_KEY). Captura la placa manualmente.',
        placa: '',
        rawText: '',
        source: 'unconfigured',
      }),
    }
  }

  try {
    const visionRes = await fetch(`${VISION_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content },
            features: [
              { type: 'TEXT_DETECTION', maxResults: 5 },
              { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 },
            ],
            imageContext: { languageHints: ['es', 'en'] },
          },
        ],
      }),
    })

    const visionJson = await visionRes.json()
    if (!visionRes.ok) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: visionJson?.error?.message || 'Vision API error',
          needsManual: true,
          placa: '',
          rawText: '',
          source: 'vision-error',
        }),
      }
    }

    const ann = visionJson.responses?.[0] || {}
    const rawText =
      ann.fullTextAnnotation?.text ||
      ann.textAnnotations?.[0]?.description ||
      ''

    const placa = normalizePlacaMX(rawText)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        placa,
        rawText: String(rawText).slice(0, 2000),
        source: 'google-vision',
        needsManual: !placa,
      }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: err?.message || 'OCR falló',
        needsManual: true,
        placa: '',
        rawText: '',
        source: 'exception',
      }),
    }
  }
}
