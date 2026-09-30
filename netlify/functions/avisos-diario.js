/**
 * Resumen diario por yarda. Cron Netlify `0 13 * * *` = 07:00 America/Mexico_City (UTC−6).
 * Netlify manda el cuerpo `{ "next_run": "..." }`.
 * Disparo manual con sesión: POST /api/avisos/resumen-diario
 */

import { json } from './lib/http.js'
import { createAvisosService } from './lib/avisosService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

export const config = {
  schedule: '0 13 * * *',
}

function cuerpo(event) {
  try {
    const raw = event?.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event?.body
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function header(event, name) {
  const headers = event?.headers || {}
  const lower = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key]
  }
  return undefined
}

export function esInvocacionProgramada(event) {
  if (header(event, 'x-nf-scheduled') || header(event, 'x-netlify-scheduled')) return true
  const body = cuerpo(event)
  return Boolean(body?.next_run)
}

export async function handler(event, deps) {
  const secret = process.env.AVISOS_CRON_SECRET
  const headerSecret = header(event, 'x-avisos-cron')
  const autorizado = Boolean(deps?.allow) || esInvocacionProgramada(event) || (secret && headerSecret === secret)
  if (!autorizado) {
    return json(event, 401, {
      error: 'Este resumen corre a las 7:00 (hora del centro). Para dispararlo a mano usa POST /api/avisos/resumen-diario con sesión de encargado.',
    })
  }
  try {
    const repo = deps?.repo ?? getSheetsRepo()
    const resumen = await createAvisosService(repo, { now: deps?.now }).resumenDiario()
    return json(event, 200, resumen)
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo armar el resumen diario.', code: err?.code })
  }
}
