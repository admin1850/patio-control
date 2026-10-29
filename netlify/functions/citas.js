/**
 * GET /api/citas
 * POST { accion: 'crear', tipo, nombre, empresa, placa, eta }
 * POST { accion: 'validar', codigo }  — caseta. El código es el texto del QR.
 */

import { json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'
import { crearCita, validarEnCaseta } from '../../src/lib/citas.js'

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error
  const repo = deps?.repo ?? getSheetsRepo()
  const method = String(event.httpMethod || '').toUpperCase()
  try {
    const citas = await repo.listCitas()
    if (method === 'GET') return json(event, 200, { citas }, auth.headers)
    if (method !== 'POST') return json(event, 405, { error: 'Usa GET o POST.' }, auth.headers)
    const body = parseJsonBody(event)
    const accion = String(body.accion || 'crear').trim().toLowerCase()
    if (accion === 'validar') {
      const codigo = String(body.codigo || '').trim().toUpperCase()
      const cita = citas.find((item) => item.id === codigo)
      const resultado = validarEnCaseta(cita || null)
      if (!resultado.ok) return json(event, 409, { error: resultado.mensaje }, auth.headers)
      await repo.updateCita(resultado.cita)
      return json(event, 200, { ok: true, mensaje: resultado.mensaje, cita: resultado.cita }, auth.headers)
    }
    const cita = crearCita(body)
    await repo.appendCita(cita)
    return json(event, 200, { cita, qr: cita.id }, auth.headers)
  } catch (err) {
    const known = /tipo es|Falta el nombre/.test(String(err?.message || ''))
    const status = Number(err?.status) || (known ? 400 : 500)
    return json(event, status, { error: err?.message || 'No se pudo guardar la cita.' }, auth.headers)
  }
}
