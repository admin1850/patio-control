/**
 * GET /api/estadias → reporte (horas y excedente)
 * POST /api/estadias { cliente, horasLibres } → horas libres de ese cliente
 */

import { json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'
import { reporteEstadias } from '../../src/lib/estadias.js'

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error
  const repo = deps?.repo ?? getSheetsRepo()
  const method = String(event.httpMethod || '').toUpperCase()
  try {
    if (method === 'POST') {
      const body = parseJsonBody(event)
      const cliente = String(body.cliente || '').trim()
      const horas = Number(body.horasLibres)
      if (!cliente) return json(event, 400, { error: 'Falta el cliente.' }, auth.headers)
      if (!Number.isFinite(horas) || horas < 0) return json(event, 400, { error: 'horasLibres tiene que ser un número ≥ 0.' }, auth.headers)
      await repo.upsertEstadia({
        id: `libre:${cliente}`,
        cliente,
        unidadId: '',
        placa: '',
        yardaId: '',
        llegada: '',
        salida: '',
        horasLibres: horas,
      })
      return json(event, 200, { cliente, horasLibres: horas }, auth.headers)
    }
    if (method !== 'GET') return json(event, 405, { error: 'Usa GET o POST.' }, auth.headers)
    const filas = await repo.listEstadias()
    return json(event, 200, { estadias: reporteEstadias(filas) }, auth.headers)
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudieron leer las estadías.', code: err?.code }, auth.headers)
  }
}
