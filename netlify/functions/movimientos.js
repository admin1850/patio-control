/**
 * Entrada HTTP de /api/movimientos.
 * Netlify redirige por ruta, no por método: este handler reparte GET y POST
 * a movimientos-list.js y movimientos-create.js.
 */

import { json } from './lib/http.js'
import { handler as createHandler } from './movimientos-create.js'
import { handler as listHandler } from './movimientos-list.js'

export async function handler(event, deps) {
  const method = String(event?.httpMethod || '').toUpperCase()
  if (method === 'POST') return createHandler(event, deps)
  if (method === 'GET' || method === 'OPTIONS') return listHandler(event, deps)
  return json(event, 405, { error: 'Método no permitido. Usa GET o POST.' })
}
