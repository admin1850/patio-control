/**
 * POST /api/auth/login
 *   { email, clave, dispositivoId? }   — correo + Clave del kardex (sin Google)
 *   { idToken, clave, dispositivoId? } — Google ID token + Clave del kardex
 * Si llegan los dos, manda el idToken y el correo de Google tiene que ser el mismo.
 * Env: PATIO_SESSION_SECRET, PATIO_SPREADSHEET_ID y backend de Sheets
 * (GOOGLE_SERVICE_ACCOUNT_* o PATIO_APPS_SCRIPT_URL + PATIO_APPS_SCRIPT_SECRET),
 *      PATIO_GOOGLE_CLIENT_ID (solo ruta Google), PATIO_GOOGLE_HOSTED_DOMAIN (opcional),
 *      PATIO_SESSION_TTL_SEC (opcional, default 43200).
 */

import { verifyGoogleIdToken } from './lib/googleAuth.js'
import {
  clientIp,
  enforceRateLimit,
  getSessionSecret,
  isSecureRequest,
  json,
  parseJsonBody,
  preflight,
} from './lib/http.js'
import { verifyClave } from './lib/password.js'
import { storedClaveOf, toPublicUser } from './lib/permisos.js'
import { buildSessionCookie, DEFAULT_TTL_SEC, signSession } from './lib/session.js'
import { appendAuditoria, loadAutorizados } from './lib/sheetsRepo.js'

function sessionTtl() {
  const n = Number(process.env.PATIO_SESSION_TTL_SEC)
  return Number.isFinite(n) && n > 60 ? Math.floor(n) : DEFAULT_TTL_SEC
}

function normalizeEmail(raw) {
  return String(raw ?? '').trim().toLowerCase()
}

function correoValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function auditar(entry) {
  try {
    await appendAuditoria(entry)
  } catch (err) {
    console.warn('[auth-login] Auditoria no disponible:', err?.message)
  }
}

async function entrarConKardex(event, { email, clave, dispositivoId, perfilGoogle }) {
  let autorizados
  try {
    autorizados = await loadAutorizados()
  } catch (err) {
    return json(event, err?.status === 503 ? 503 : 502, {
      error: `No se pudo leer la hoja Autorizados. ${err?.message ?? ''}`.trim(),
    })
  }

  const denegar = async (message, motivo) => {
    await auditar({
      usuarioEmail: email,
      accion: 'login_denegado',
      entidad: 'sesion',
      despues: { motivo },
      dispositivoId,
    })
    return json(event, 403, { error: message })
  }

  if (!autorizados.length) {
    return json(event, 403, { error: 'El kardex Autorizados está vacío. Agrega correos en la hoja antes de usar la app.' })
  }
  const match = autorizados.find((a) => a.email === email)
  if (!match) return denegar(`Acceso denegado: ${email} no está en el kardex de Autorizados.`, 'no_autorizado')
  if (!match.activo) return denegar(`Acceso denegado: ${email} está inactivo en el kardex (Activo ≠ SI).`, 'inactivo')
  const stored = storedClaveOf(match)
  if (!stored) {
    return denegar(`Acceso denegado: ${email} no tiene Clave en el kardex. Pide al admin que te asigne una.`, 'sin_clave')
  }
  if (!(await verifyClave(clave, stored))) {
    return denegar('Clave incorrecta. Revisa con el admin la columna Clave de tu fila en Autorizados.', 'clave_incorrecta')
  }

  const nombreKardex = [match.nombre, match.apellido].filter(Boolean).join(' ')
  const user = perfilGoogle
    ? toPublicUser(match, perfilGoogle)
    : toPublicUser(match, { name: nombreKardex })
  const ttl = sessionTtl()
  const token = signSession(
    {
      email: user.email,
      name: user.name,
      rol: user.rol,
      ubicacion: user.ubicacion,
      permisos: user.permisos,
      dispositivoId,
    },
    getSessionSecret(),
    ttl,
  )

  await auditar({
    usuarioEmail: user.email,
    rol: user.rol,
    accion: 'login',
    entidad: 'sesion',
    despues: { ubicacion: user.ubicacion },
    dispositivoId,
  })

  return json(
    event,
    200,
    { user, expiresInSec: ttl },
    {
      'Set-Cookie': buildSessionCookie(token, { maxAge: ttl, secure: isSecureRequest(event) }),
      'Cache-Control': 'no-store',
    },
  )
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (event.httpMethod !== 'POST') return json(event, 405, { error: 'POST only' })

  const secret = getSessionSecret()
  if (!secret) return json(event, 503, { error: 'Sesiones no configuradas en el servidor (PATIO_SESSION_SECRET).' })

  const ipLimited = enforceRateLimit(event, `login-ip:${clientIp(event)}`, 20)
  if (ipLimited) return ipLimited

  const { body, error } = parseJsonBody(event)
  if (error) return error

  const idToken = String(body.idToken ?? '').trim()
  const emailIn = normalizeEmail(body.email)
  const clave = String(body.clave ?? '').trim()
  const dispositivoId = String(body.dispositivoId ?? '').trim().slice(0, 128) || undefined
  if (!idToken && !emailIn) {
    return json(event, 400, { error: 'Escribe tu correo o entra con Google.' })
  }
  if (!clave) return json(event, 400, { error: 'Escribe la clave que te asignó el admin (columna Clave del kardex).' })
  if (emailIn && !correoValido(emailIn)) return json(event, 400, { error: 'Escribe un correo válido.' })

  let email = emailIn
  let perfilGoogle = null
  if (idToken) {
    try {
      perfilGoogle = await verifyGoogleIdToken(idToken, {
        clientId: process.env.PATIO_GOOGLE_CLIENT_ID,
        hostedDomain: process.env.PATIO_GOOGLE_HOSTED_DOMAIN,
      })
    } catch (err) {
      const status = err?.code === 'CONFIG' ? 503 : 401
      return json(event, status, { error: err?.message || 'Token de Google inválido' })
    }
    if (emailIn && emailIn !== perfilGoogle.email) {
      const mismatchLimited = enforceRateLimit(event, `login-email:${perfilGoogle.email}`, 10)
      if (mismatchLimited) return mismatchLimited
      await auditar({
        usuarioEmail: perfilGoogle.email,
        accion: 'login_denegado',
        entidad: 'sesion',
        despues: { motivo: 'correo_no_coincide' },
        dispositivoId,
      })
      return json(event, 403, { error: 'El correo de Google no coincide con el correo que escribiste.' })
    }
    email = perfilGoogle.email
  }

  const emailLimited = enforceRateLimit(event, `login-email:${email}`, 10)
  if (emailLimited) return emailLimited

  return entrarConKardex(event, { email, clave, dispositivoId, perfilGoogle })
}
