/**
 * Handler compartido — POST /api/patio-grok
 * Acciones: redactar-observaciones | ayuda (dudas/help).
 * Grok solo responde texto; no guarda movimientos.
 */

import { callXai, extractOutputText } from './grok.js'
import { buildObservacionesPrompt } from './brains/patio.js'
import { buildAyudaPrompt } from './brains/ayuda.js'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }
}

function json(statusCode, body) {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(body) }
}

async function redactarObservaciones(body) {
  const { system, user } = buildObservacionesPrompt({
    movement: body.movement || body.movimiento || {},
    draft: body.draft || body.notes || body.observaciones || '',
  })
  const xai = await callXai({
    store: false,
    input: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  const text = extractOutputText(xai).trim()
  if (!text) {
    return json(502, { error: 'Grok no devolvió texto', text: '' })
  }
  return json(200, {
    text,
    saved: false,
    action: 'redactar-observaciones',
  })
}

async function ayudaDudas(body) {
  const question = String(body.question || body.pregunta || body.q || body.text || '').trim()
  if (!question) {
    return json(400, { error: 'question requerida', text: '', action: 'ayuda', saved: false })
  }
  const { system, user } = buildAyudaPrompt({
    question,
    page: body.page || body.pantalla || '',
  })
  const xai = await callXai({
    store: false,
    input: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  const text = extractOutputText(xai).trim()
  if (!text) {
    return json(502, { error: 'Grok no devolvió texto', text: '', action: 'ayuda', saved: false })
  }
  return json(200, {
    text,
    action: 'ayuda',
    saved: false,
  })
}

/**
 * @param {{ httpMethod?: string, body?: string }} event
 */
export async function handlePatioGrok(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'POST only' })
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const action = String(body.action || 'redactar-observaciones').toLowerCase()

  try {
    if (action === 'redactar-observaciones' || action === 'observaciones' || action === 'redactar') {
      return await redactarObservaciones(body)
    }
    if (action === 'ayuda' || action === 'dudas' || action === 'help') {
      return await ayudaDudas(body)
    }
    return json(400, { error: `Acción no soportada: ${action}` })
  } catch (err) {
    const isAyuda = action === 'ayuda' || action === 'dudas' || action === 'help'
    if (err?.code === 'NO_KEY') {
      return json(503, {
        error: err.message,
        needsKey: true,
        text: '',
        saved: false,
        ...(isAyuda ? { action: 'ayuda' } : {}),
      })
    }
    return json(err?.status && err.status >= 400 ? 502 : 500, {
      error: err?.message || 'patio-grok falló',
      text: '',
      saved: false,
      ...(isAyuda ? { action: 'ayuda' } : {}),
    })
  }
}
