/**
 * GET /api/entrega.pdf?id=  → PDF (sesión)
 * POST /api/entrega.pdf { id } → encola ENTREGA_PDF con la URL, por WhatsApp/correo si están configurados
 */

import { json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'
import { createAvisosService } from './lib/avisosService.js'
import { pdfEntregaBytes } from '../../src/lib/entregaPdf.js'

function origen(event) {
  const proto = String(event.headers?.['x-forwarded-proto'] || event.headers?.['X-Forwarded-Proto'] || 'https')
  const host = String(event.headers?.host || event.headers?.Host || 'patiocontrol.netlify.app')
  return `${proto.split(',')[0].trim()}://${host}`
}

async function movimiento(repo, id) {
  if (typeof repo.findMovimientoById === 'function') return repo.findMovimientoById(id)
  const lista = typeof repo.listMovimientos === 'function' ? await repo.listMovimientos() : []
  return (lista || []).find((mov) => mov?.id === id) || null
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error
  const repo = deps?.repo ?? getSheetsRepo()
  const method = String(event.httpMethod || '').toUpperCase()
  const q = event.queryStringParameters || {}
  const body = method === 'POST' ? parseJsonBody(event) : {}
  const id = String(q.id || body.id || '').trim()
  if (!id) return json(event, 400, { error: 'Falta el id del movimiento.' }, auth.headers)
  try {
    const mov = await movimiento(repo, id)
    if (!mov) return json(event, 404, { error: 'No está ese movimiento.' }, auth.headers)
    if (method === 'GET') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="entrega-${id}.pdf"`,
          'Cache-Control': 'no-store',
          ...auth.headers,
        },
        body: pdfEntregaBytes(mov),
        isBase64Encoded: false,
      }
    }
    if (method !== 'POST') return json(event, 405, { error: 'Usa GET o POST.' }, auth.headers)
    const url = `${origen(event)}/api/entrega.pdf?id=${encodeURIComponent(id)}`
    if (typeof repo.appendAvisoLog === 'function' && typeof repo.listAvisosLog === 'function') {
      const avisos = createAvisosService(repo)
      await avisos.enqueue('ENTREGA_PDF', {
        unidadId: mov.equipoId || mov.placa || id,
        mensaje: `Entrega-recepción ${mov.placa || id}. PDF (hay que tener sesión): ${url}`,
        dedupeKey: `ENTREGA_PDF|${id}|${new Date().toISOString().slice(0, 10)}`,
      })
    }
    return json(event, 200, { url, placa: mov.placa || '' }, auth.headers)
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo armar el PDF.' }, auth.headers)
  }
}
