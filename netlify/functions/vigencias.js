/**
 * GET /api/vigencias
 * POST /api/vigencias  { sujetoTipo, sujetoId, documento, vence }
 * La pestaña Vigencias la crea `npm run migrate:vigencias`. Sin ella responde 503.
 */

import { json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'
import { DOCUMENTOS_VIGENCIA, SUJETOS_VIGENCIA, evaluarVigencias, normalizarFechaVigencia } from '../../src/lib/vigenciaDocumentos.js'
import { createAvisosService } from './lib/avisosService.js'

function repoOf(deps) {
  return deps?.repo ?? getSheetsRepo()
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error
  const method = String(event.httpMethod || '').toUpperCase()
  const repo = repoOf(deps)

  try {
    if (method === 'GET') {
      const filas = await repo.listVigencias()
      const q = event.queryStringParameters || {}
      const evaluadas = evaluarVigencias(filas, {
        equipoId: q.equipoId,
        placa: q.placa,
        operadorIds: [q.operador, q.chofer].filter(Boolean),
      })
      const filtradas = q.sujetoId
        ? filas.filter((fila) => String(fila.sujetoId).trim().toUpperCase() === String(q.sujetoId).trim().toUpperCase())
        : filas
      return json(event, 200, { vigencias: filtradas, documentos: DOCUMENTOS_VIGENCIA, evaluadas }, auth.headers)
    }
    if (method !== 'POST') return json(event, 405, { error: 'Usa GET o POST.' }, auth.headers)

    const body = parseJsonBody(event)
    const sujetoTipo = String(body.sujetoTipo || '').trim().toLowerCase()
    const sujetoId = String(body.sujetoId || '').trim()
    const documento = String(body.documento || '').trim()
    const vence = normalizarFechaVigencia(body.vence)
    if (!SUJETOS_VIGENCIA.includes(sujetoTipo)) return json(event, 400, { error: 'sujetoTipo debe ser unidad u operador.' }, auth.headers)
    if (!sujetoId) return json(event, 400, { error: 'Falta sujetoId (placa o nombre del operador).' }, auth.headers)
    if (!DOCUMENTOS_VIGENCIA.some((item) => item.id === documento)) {
      return json(event, 400, { error: 'Documento no reconocido.' }, auth.headers)
    }
    if (!vence) return json(event, 400, { error: 'La fecha de vencimiento va en formato YYYY-MM-DD.' }, auth.headers)

    const item = {
      sujetoTipo,
      sujetoId,
      documento,
      vence,
      actualizadoEn: new Date().toISOString(),
    }
    await repo.upsertVigencia(item)
    try {
      if (typeof repo.listAvisosLog === 'function' && typeof repo.appendAvisoLog === 'function') {
        const vig = evaluarVigencias([item], {
          equipoId: sujetoTipo === 'unidad' ? sujetoId : '',
          placa: sujetoTipo === 'unidad' ? sujetoId : '',
          operadorIds: sujetoTipo === 'operador' ? [sujetoId] : [],
        })
        const avisos = createAvisosService(repo)
        for (const aviso of vig.avisos) await avisos.enqueue('DOC_POR_VENCER', aviso)
      }
    } catch (err) {
      console.warn('[vigencias] Aviso no encolado:', err?.message || err)
    }
    return json(event, 200, { vigencia: item }, auth.headers)
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudieron leer las vigencias.', code: err?.code }, auth.headers)
  }
}
