/**
 * Verificación de Google ID tokens (JWT RS256) contra las JWKS públicas de Google.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose'

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

let remoteJwks = null
function getGoogleJwks() {
  if (!remoteJwks) remoteJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL))
  return remoteJwks
}

function authError(message, code = 'GOOGLE_TOKEN_INVALID') {
  const err = new Error(message)
  err.code = code
  return err
}

/**
 * @param {string} idToken
 * @param {{ clientId: string | string[], hostedDomain?: string, jwks?: Parameters<typeof jwtVerify>[1] }} opts
 *   `clientId` acepta lista separada por comas. `jwks` solo para pruebas.
 * @returns {Promise<{ email: string, name: string, picture?: string, hd?: string, sub: string }>}
 */
export async function verifyGoogleIdToken(idToken, { clientId, hostedDomain, jwks } = {}) {
  const audience = (Array.isArray(clientId) ? clientId : String(clientId ?? '').split(','))
    .map((s) => s.trim())
    .filter(Boolean)
  if (!audience.length) throw authError('Falta PATIO_GOOGLE_CLIENT_ID en el servidor', 'CONFIG')
  if (!idToken || typeof idToken !== 'string') throw authError('idToken requerido')

  let payload
  try {
    ;({ payload } = await jwtVerify(idToken, jwks || getGoogleJwks(), {
      issuer: GOOGLE_ISSUERS,
      audience,
      algorithms: ['RS256'],
      clockTolerance: 30,
    }))
  } catch (err) {
    throw authError(`Token de Google inválido: ${err?.code || err?.message || 'verificación falló'}`)
  }

  const email = String(payload.email ?? '').trim().toLowerCase()
  if (!email) throw authError('El token de Google no trae email')
  if (payload.email_verified !== true && payload.email_verified !== 'true') {
    throw authError('El email de Google no está verificado')
  }

  const domain = String(hostedDomain ?? '').trim().toLowerCase()
  if (domain) {
    const hd = String(payload.hd ?? '').trim().toLowerCase()
    if (!email.endsWith(`@${domain}`) && hd !== domain) {
      throw authError(`Solo se permiten cuentas @${domain}`, 'DOMAIN')
    }
  }

  return {
    email,
    name: String(payload.name ?? '') || email,
    ...(payload.picture ? { picture: String(payload.picture) } : {}),
    ...(payload.hd ? { hd: String(payload.hd) } : {}),
    sub: String(payload.sub ?? ''),
  }
}
