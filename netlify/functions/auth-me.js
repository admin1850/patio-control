/**
 * GET /api/auth/me — sesión actual (cookie patio_session o Authorization: Bearer).
 */

import { json, preflight, requireSession } from './lib/http.js'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (event.httpMethod !== 'GET') return json(event, 405, { error: 'GET only' })

  const { session, error, headers } = requireSession(event, { optionalWithoutSecret: false })
  if (error) return error

  return json(
    event,
    200,
    {
      user: {
        email: session.email,
        name: session.name || session.email,
        rol: session.rol,
        ubicacion: session.ubicacion,
        permisos: session.permisos,
      },
      exp: session.exp,
      horaServidor: new Date().toISOString(),
    },
    { ...headers, 'Cache-Control': 'no-store' },
  )
}
