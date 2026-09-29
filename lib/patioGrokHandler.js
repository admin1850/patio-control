/**
 * Handler compartido — POST /api/patio-grok
 * Acciones: redactar-observaciones (default).
 * Grok solo sugiere texto; el front pega en el campo. No guarda.
 */

import { callXai, extractOutputText } from './grok.js'
import { buildObservacionesPrompt } from './brains/patio.js'

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
    return json(400, { error: `Acción no soportada: ${action}` })
  } catch (err) {
    if (err?.code === 'NO_KEY') {
      return json(503, { error: err.message, needsKey: true, text: '', saved: false })
    }
    return json(err?.status && err.status >= 400 ? 502 : 500, {
      error: err?.message || 'patio-grok falló',
      text: '',
      saved: false,
    })
  }
}
