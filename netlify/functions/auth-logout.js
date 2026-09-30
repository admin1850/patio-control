/**
 * POST /api/auth/logout — borra la cookie de sesión.
 * Las sesiones son stateless: un token copiado sigue siendo válido hasta `exp`.
 */

import { isSecureRequest, json, preflight } from './lib/http.js'
import { buildClearSessionCookie } from './lib/session.js'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (event.httpMethod !== 'POST') return json(event, 405, { error: 'POST only' })
  return json(
    event,
    200,
    { ok: true },
    {
      'Set-Cookie': buildClearSessionCookie({ secure: isSecureRequest(event) }),
      'Cache-Control': 'no-store',
    },
  )
}
