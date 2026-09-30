/**
 * Handler compartido — POST /api/patio-grok
 * Acciones: redactar-observaciones | ayuda (dudas/help).
 * Grok solo responde texto; no guarda movimientos.
 * Con PATIO_SESSION_SECRET → requiere sesión; sin él, compat (X-Patio-Auth: optional).
 */

import { callXai, extractOutputText } from './grok.js'
import { buildObservacionesPrompt } from './brains/patio.js'
import { buildAyudaPrompt } from './brains/ayuda.js'
import {
  clientIp,
  corsHeaders,
  enforceRateLimit,
  requireSession,
} from '../netlify/functions/lib/http.js'

const GROK_MAX_PER_MIN = 30

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
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
    return { statusCode: 204, headers: corsHeaders(event), body: '' }
  }
  const auth = requireSession(event)
  if (auth.error) return auth.error
  const res = await handleAuthorized(event, auth)
  return { ...res, headers: { ...corsHeaders(event), ...res.headers, ...auth.headers } }
}

async function handleAuthorized(event, auth) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'POST only' })
  }

  const rateKey = auth.session ? `grok:${auth.session.email}` : `grok-ip:${clientIp(event)}`
  const limited = enforceRateLimit(event, rateKey, GROK_MAX_PER_MIN)
  if (limited) return limited

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
