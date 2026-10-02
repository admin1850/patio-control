/**
 * GET /api/ot/:id
 * PATCH /api/ot/:id — estatus, etr (motivo obligatorio) o cierre
 */

import { json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { intentarAviso } from './lib/avisosService.js'
import { createOtService } from './lib/otService.js'
import { createPreventivoService } from './lib/preventivoService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

function serviceFrom(deps) {
  if (deps?.service) return deps.service
  return createOtService(deps?.repo ?? getSheetsRepo())
}

function repoParaHooks(deps) {
  if (deps?.repo) return deps.repo
  if (deps?.service) return null
  return getSheetsRepo()
}

export function extractOtId(event) {
  const fromQuery = event?.queryStringParameters?.id
  if (fromQuery) return String(fromQuery).trim()
  const candidates = [event?.path, event?.rawPath, event?.rawUrl]
  for (const candidate of candidates) {
    if (!candidate) continue
    const path = String(candidate).split('?')[0]
    const match = path.match(/\/(?:\.netlify\/functions\/ot-item\/|api\/ot\/)([^/]+)$/)
    if (match?.[1] && match[1] !== 'tablero') {
      try {
        return decodeURIComponent(match[1])
      } catch {
        return match[1]
      }
    }
  }
  return ''
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  const method = String(event.httpMethod || '').toUpperCase()
  if (method !== 'GET' && method !== 'PATCH') return json(event, 405, { error: 'Usa GET o PATCH.' })

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error

  const id = extractOtId(event)
  if (!id) return json(event, 400, { error: 'Falta el id de la orden.' }, auth.headers)

  try {
    const svc = serviceFrom(deps)
    if (method === 'GET') {
      const found = await svc.getOT(id)
      return json(event, 200, found, { ...auth.headers, 'Cache-Control': 'no-store' })
    }

    const parsed = parseJsonBody(event)
    if (parsed.error) return parsed.error
    const body = parsed.body || {}
    const accion = String(body.accion || '').trim().toLowerCase()
    let result = null

    if (body.etr != null && String(body.etr).trim() !== '') {
      result = await svc.updateEtr(auth.session, id, { etr: body.etr, motivo: body.motivo })
    } else if (body.actualizar === true || accion === 'actualizar' || accion === 'datos') {
      result = await svc.updateDatos(auth.session, id, body)
    } else if (body.cerrar === true || accion === 'cerrar') {
      result = await svc.updateEstatus(auth.session, id, {
        estatus: 'CERRADA',
        motivo: body.motivo,
        fotosDespuesJson: body.fotosDespuesJson ?? body.fotosDespues,
        kmSalida: body.kmSalida,
        horometroSalida: body.horometroSalida,
        notas: body.notas,
      })
    } else if (body.estatus) {
      result = await svc.updateEstatus(auth.session, id, {
        estatus: body.estatus,
        motivo: body.motivo,
        fotosDespuesJson: body.fotosDespuesJson ?? body.fotosDespues,
        kmSalida: body.kmSalida,
        horometroSalida: body.horometroSalida,
        notas: body.notas,
      })
    }
    if (!result) return json(event, 400, { error: 'Indica estatus, etr, datos o cierre.' }, auth.headers)
    const repo = repoParaHooks(deps)
    if (repo && result.ot && !result.unchanged) {
      if (result.ot.estatus === 'LISTA') {
        await intentarAviso(repo, (avisos) => avisos.enqueue('UNIDAD_LISTA', {
          yarda: result.ot.yarda,
          unidadId: result.ot.unidadId,
          mensaje: `Unidad lista · ${result.ot.folio || result.ot.id} · ${result.ot.unidadId}`,
          dedupeKey: `UNIDAD_LISTA|${result.ot.id}`,
        }))
      }
      if ((result.ot.estatus === 'CERRADA' || result.ot.estatus === 'CANCELADA') && typeof repo.listServiciosProgramados === 'function') {
        try {
          await createPreventivoService(repo).sincronizarCierreOt(result.ot)
        } catch (err) {
          if (Number(err?.status) !== 503) console.warn('[preventivo]', err?.message || err)
        }
      }
    }
    return json(event, 200, { orden: result.ot, estado: result.estado || null, unchanged: Boolean(result.unchanged) }, { ...auth.headers, 'Cache-Control': 'no-store' })
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo actualizar la orden.', code: err?.code }, auth.headers)
  }
}
