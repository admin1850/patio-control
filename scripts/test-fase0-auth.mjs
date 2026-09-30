#!/usr/bin/env node
/**
 * Pruebas Fase 0 (sin red): node scripts/test-fase0-auth.mjs
 */

import assert from 'node:assert/strict'
import { SignJWT, createLocalJWKSet, exportJWK, exportPKCS8, generateKeyPair } from 'jose'

import { hashClave, isBcryptHash, verifyClave } from '../netlify/functions/lib/password.js'
import {
  SESSION_COOKIE,
  buildClearSessionCookie,
  buildSessionCookie,
  parseCookies,
  signSession,
  verifySession,
} from '../netlify/functions/lib/session.js'
import {
  defaultPermisosPorRol,
  normalizeRol,
  parseAutorizadoRow,
  parseSiNo,
  storedClaveOf,
  toPublicUser,
} from '../netlify/functions/lib/permisos.js'
import { verifyGoogleIdToken } from '../netlify/functions/lib/googleAuth.js'
import { rateLimit, requireSession } from '../netlify/functions/lib/http.js'
import { normalizePrivateKey } from '../netlify/functions/lib/sheetsRepo.js'
import { rehydrateEvent, serializeEvent } from '../src/lib/outbox.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const SECRET = 'test-secret-0123456789abcdef'
const CLIENT_ID = 'test-client.apps.googleusercontent.com'

function withEnv(vars, fn) {
  const prev = {}
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k]
    if (vars[k] == null) delete process.env[k]
    else process.env[k] = vars[k]
  }
  const restore = () => {
    for (const k of Object.keys(prev)) {
      if (prev[k] == null) delete process.env[k]
      else process.env[k] = prev[k]
    }
  }
  return Promise.resolve()
    .then(fn)
    .finally(restore)
}

// Fila Autorizados A:R con permisos J:Q vacíos (→ defaults por rol)
function row({ email = 'guardia@camircapital.com', rol = 'Guardia', clave = 'clave-guardia', activo = 'SI', permisos = [], claveHash } = {}) {
  const r = [email, 'Juan', 'Pérez', '614 123 4567', '', rol, 'Chihuahua', clave, activo]
  for (let i = 0; i < 8; i++) r.push(permisos[i] ?? '')
  r.push('nota')
  if (claveHash !== undefined) r.push(claveHash)
  return r
}

// ---------- password ----------
test('hashClave/verifyClave: bcrypt round-trip', async () => {
  const h = await hashClave('clave-segura')
  assert.ok(isBcryptHash(h))
  assert.notEqual(h, 'clave-segura')
  assert.equal(await verifyClave('clave-segura', h), true)
  assert.equal(await verifyClave('otra', h), false)
})

test('verifyClave: texto plano legado (migración)', async () => {
  assert.equal(await verifyClave('clave-guardia', 'clave-guardia'), true)
  assert.equal(await verifyClave(' clave-guardia ', 'clave-guardia'), true)
  assert.equal(await verifyClave('clave-guardiaX', 'clave-guardia'), false)
  assert.equal(await verifyClave('', ''), false)
  assert.equal(await verifyClave('clave-guardia', ''), false)
})

test('hashClave rechaza vacío', async () => {
  await assert.rejects(() => hashClave(''))
})

// ---------- session ----------
test('signSession/verifySession: válido', () => {
  const t = signSession(
    { email: 'A@Camircapital.com', rol: 'guardia', ubicacion: 'chihuahua', permisos: { entrada: true }, dispositivoId: 'dev-1' },
    SECRET,
  )
  assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  const p = verifySession(t, SECRET)
  assert.equal(p.email, 'a@camircapital.com')
  assert.equal(p.rol, 'guardia')
  assert.equal(p.dispositivoId, 'dev-1')
  assert.equal(p.exp - p.iat, 43200)
})

test('verifySession: firma/payload alterados, otro secreto o basura → null', () => {
  const t = signSession({ email: 'a@x.com', rol: 'guardia' }, SECRET)
  const [body, sig] = t.split('.')
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), rol: 'admin' })).toString('base64url')
  assert.equal(verifySession(`${forged}.${sig}`, SECRET), null)
  assert.equal(verifySession(`${body}.${sig.slice(0, -2)}xx`, SECRET), null)
  assert.equal(verifySession(t, 'otro-secreto'), null)
  assert.equal(verifySession('', SECRET), null)
  assert.equal(verifySession('abc', SECRET), null)
  assert.equal(verifySession(t, ''), null)
})

test('verifySession: expirado → null', () => {
  const realNow = Date.now
  try {
    const t = signSession({ email: 'a@x.com', rol: 'guardia' }, SECRET, 60)
    Date.now = () => realNow() + 61_000
    assert.equal(verifySession(t, SECRET), null)
  } finally {
    Date.now = realNow
  }
})

test('cookies: flags httpOnly/Secure/SameSite y parseo', () => {
  const c = buildSessionCookie('tok.en', { maxAge: 100 })
  assert.ok(c.startsWith(`${SESSION_COOKIE}=tok.en;`))
  for (const f of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=100']) assert.ok(c.includes(f), f)
  assert.ok(buildClearSessionCookie().includes('Max-Age=0'))
  assert.deepEqual(parseCookies('a=1; patio_session=x.y; b=%20z'), { a: '1', patio_session: 'x.y', b: ' z' })
})

// ---------- permisos ----------
test('parseAutorizadoRow: guardia con permisos vacíos → defaults de guardia', () => {
  const a = parseAutorizadoRow(row())
  assert.equal(a.email, 'guardia@camircapital.com')
  assert.equal(a.rol, 'guardia')
  assert.equal(a.ubicacion, 'chihuahua')
  assert.equal(a.celular, '+526141234567')
  assert.equal(a.whatsapp, '+526141234567')
  assert.equal(a.activo, true)
  assert.deepEqual(a.permisos, {
    entrada: true,
    salida: true,
    parado: false,
    baja: false,
    historial: true,
    kpis: false,
    equipos: false,
    workspace: true,
  })
  assert.deepEqual(a.permisos, defaultPermisosPorRol('guardia'))
  assert.equal(a.notas, 'nota')
  assert.equal(a.claveHash, undefined)
})

test('parseAutorizadoRow: SI/NO en J:Q sobreescriben defaults', () => {
  const a = parseAutorizadoRow(row({ permisos: ['NO', '', 'SI', '', '', 'sí', '', '0'] }))
  assert.equal(a.permisos.entrada, false)
  assert.equal(a.permisos.salida, true)
  assert.equal(a.permisos.parado, true)
  assert.equal(a.permisos.kpis, true)
  assert.equal(a.permisos.workspace, false)
})

test('parseAutorizadoRow: ClaveHash (índice 18), inactivo, filas inválidas', async () => {
  const h = await hashClave('9999')
  const a = parseAutorizadoRow(row({ claveHash: h, activo: 'NO' }))
  assert.equal(a.claveHash, h)
  assert.equal(a.activo, false)
  assert.equal(storedClaveOf(a), h)
  assert.equal(await verifyClave('9999', storedClaveOf(a)), true)
  assert.equal(storedClaveOf(parseAutorizadoRow(row())), 'clave-guardia')
  assert.equal(parseAutorizadoRow(['sin-arroba']), null)
  assert.equal(parseAutorizadoRow([]), null)
})

test('normalizeRol / parseSiNo', () => {
  assert.equal(normalizeRol('Caseta'), 'guardia')
  assert.equal(normalizeRol('Encargado Yarda'), 'encargado_yarda')
  assert.equal(normalizeRol('supervisor'), 'admin')
  assert.equal(normalizeRol(''), 'guardia')
  assert.equal(parseSiNo('', true), true)
  assert.equal(parseSiNo('no', true), false)
  assert.equal(parseSiNo('quizá', false), false)
})

test('toPublicUser: nunca incluye clave ni claveHash', () => {
  const a = parseAutorizadoRow(row({ claveHash: '$2a$10$abc' }))
  const u = toPublicUser(a, { name: 'Juan G' })
  assert.equal(u.clave, undefined)
  assert.equal(u.claveHash, undefined)
  assert.ok(!JSON.stringify(u).includes('clave-guardia'))
  assert.ok(!JSON.stringify(u).includes('$2a$'))
  assert.equal(u.name, 'Juan G')
  assert.equal(u.nombreKardex, 'Juan Pérez')
})

// ---------- Google ID token ----------
const google = await (async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
  const jwksJson = { keys: [jwk] }
  const jwks = createLocalJWKSet(jwksJson)
  const sign = (claims, { aud = CLIENT_ID, iss = 'https://accounts.google.com', exp = '1h' } = {}) =>
    new SignJWT({ email_verified: true, sub: '123', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(iss)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(privateKey)
  return { jwks, jwksJson, sign }
})()

test('verifyGoogleIdToken: válido', async () => {
  const t = await google.sign({ email: 'Guardia@CamirCapital.com', name: 'Guardia', hd: 'camircapital.com' })
  const p = await verifyGoogleIdToken(t, { clientId: CLIENT_ID, hostedDomain: 'camircapital.com', jwks: google.jwks })
  assert.equal(p.email, 'guardia@camircapital.com')
  assert.equal(p.name, 'Guardia')
})

test('verifyGoogleIdToken: aud incorrecto, email no verificado, dominio ajeno, issuer falso', async () => {
  const opts = { clientId: CLIENT_ID, hostedDomain: 'camircapital.com', jwks: google.jwks }
  await assert.rejects(
    async () => verifyGoogleIdToken(await google.sign({ email: 'a@camircapital.com' }, { aud: 'otro' }), opts),
    /Token de Google inválido/,
  )
  await assert.rejects(
    async () => verifyGoogleIdToken(await google.sign({ email: 'a@camircapital.com', email_verified: false }), opts),
    /no está verificado/,
  )
  await assert.rejects(async () => verifyGoogleIdToken(await google.sign({ email: 'a@gmail.com' }), opts), /@camircapital\.com/)
  await assert.rejects(async () =>
    verifyGoogleIdToken(await google.sign({ email: 'a@camircapital.com' }, { iss: 'https://evil.example' }), opts),
  )
  await assert.rejects(() => verifyGoogleIdToken('x.y.z', opts))
  await assert.rejects(() => verifyGoogleIdToken('tok', { jwks: google.jwks }), /PATIO_GOOGLE_CLIENT_ID/)
})

test('verifyGoogleIdToken: hd claim basta aunque el email sea alias de otro dominio', async () => {
  const t = await google.sign({ email: 'alias@camir.mx', hd: 'camircapital.com' })
  const p = await verifyGoogleIdToken(t, { clientId: `otro,${CLIENT_ID}`, hostedDomain: 'camircapital.com', jwks: google.jwks })
  assert.equal(p.email, 'alias@camir.mx')
})

// ---------- http ----------
test('requireSession: sin PATIO_SESSION_SECRET → compat (optional)', () =>
  withEnv({ PATIO_SESSION_SECRET: null }, () => {
    const r = requireSession({ headers: {} })
    assert.equal(r.error, null)
    assert.equal(r.authMode, 'optional')
    assert.equal(r.headers['X-Patio-Auth'], 'optional')
    const strict = requireSession({ headers: {} }, { optionalWithoutSecret: false })
    assert.equal(strict.error.statusCode, 503)
  }))

test('requireSession: con secreto exige cookie o Bearer válidos', () =>
  withEnv({ PATIO_SESSION_SECRET: SECRET }, () => {
    assert.equal(requireSession({ headers: {} }).error.statusCode, 401)
    const t = signSession({ email: 'a@x.com', rol: 'guardia' }, SECRET)
    assert.equal(requireSession({ headers: { cookie: `foo=1; ${SESSION_COOKIE}=${t}` } }).session.email, 'a@x.com')
    assert.equal(requireSession({ headers: { Authorization: `Bearer ${t}` } }).session.email, 'a@x.com')
    const bad = signSession({ email: 'a@x.com', rol: 'guardia' }, 'otro')
    assert.equal(requireSession({ headers: { cookie: `${SESSION_COOKIE}=${bad}` } }).error.statusCode, 401)
  }))

test('rateLimit: bloquea después de max por ventana', () => {
  const key = `t-${Math.random()}`
  for (let i = 0; i < 3; i++) assert.equal(rateLimit(key, 3).ok, true)
  const r = rateLimit(key, 3)
  assert.equal(r.ok, false)
  assert.ok(r.retryAfterSec >= 1)
})

test('normalizePrivateKey: \\n literales → saltos reales', () => {
  assert.equal(normalizePrivateKey('"-----BEGIN-----\\nABC\\n-----END-----\\n"'), '-----BEGIN-----\nABC\n-----END-----\n')
})

// ---------- handlers ----------
const { handler: meHandler } = await import('../netlify/functions/auth-me.js')
const { handler: logoutHandler } = await import('../netlify/functions/auth-logout.js')
const { handler: ocrHandler } = await import('../netlify/functions/ocr-placa.js')
const { handlePatioGrok } = await import('../lib/patioGrokHandler.js')
const { handler: loginHandler } = await import('../netlify/functions/auth-login.js')

test('auth-me: 401 sin sesión, 200 con cookie (sin clave)', () =>
  withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    assert.equal((await meHandler({ httpMethod: 'GET', headers: {} })).statusCode, 401)
    const t = signSession({ email: 'a@x.com', name: 'A', rol: 'guardia', ubicacion: 'calera', permisos: { entrada: true } }, SECRET)
    const res = await meHandler({ httpMethod: 'GET', headers: { cookie: `${SESSION_COOKIE}=${t}` } })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.user.email, 'a@x.com')
    assert.equal(body.user.ubicacion, 'calera')
    assert.equal(body.user.clave, undefined)
  }))

test('auth-logout: limpia cookie', async () => {
  const res = await logoutHandler({ httpMethod: 'POST', headers: { host: 'patiocontrol.netlify.app' } })
  assert.equal(res.statusCode, 200)
  assert.ok(res.headers['Set-Cookie'].includes('Max-Age=0'))
})

test('ocr-placa / patio-grok: 401 con secreto y sin sesión; compat sin secreto', async () => {
  await withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    const ocr = await ocrHandler({ httpMethod: 'POST', headers: {}, body: '{}' })
    assert.equal(ocr.statusCode, 401)
    assert.equal(ocr.headers['X-Patio-Auth'], 'required')
    const grok = await handlePatioGrok({ httpMethod: 'POST', headers: {}, body: '{}' })
    assert.equal(grok.statusCode, 401)
  })
  await withEnv({ PATIO_SESSION_SECRET: null }, async () => {
    const ocr = await ocrHandler({ httpMethod: 'POST', headers: {}, body: '{}' })
    assert.equal(ocr.statusCode, 400)
    assert.equal(ocr.headers['X-Patio-Auth'], 'optional')
    const grok = await handlePatioGrok({ httpMethod: 'POST', headers: {}, body: '{"action":"ayuda"}' })
    assert.equal(grok.statusCode, 400)
    assert.equal(grok.headers['X-Patio-Auth'], 'optional')
  })
})

test('ocr-placa: rate limit 60/min por email', () =>
  withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    const t = signSession({ email: `rl-${Date.now()}@x.com`, rol: 'guardia' }, SECRET)
    const ev = { httpMethod: 'POST', headers: { cookie: `${SESSION_COOKIE}=${t}` }, body: '{}' }
    for (let i = 0; i < 60; i++) assert.equal((await ocrHandler(ev)).statusCode, 400)
    assert.equal((await ocrHandler(ev)).statusCode, 429)
  }))

test('auth-login: flujo completo con Google + Sheets simulados', async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  const saKey = await exportPKCS8(privateKey)
  const hash = await hashClave('secreta')
  const rows = [
    row({ email: 'guardia@camircapital.com', clave: 'clave-guardia' }),
    row({ email: 'hash@camircapital.com', rol: 'admin', clave: '', claveHash: hash }),
    row({ email: 'inactivo@camircapital.com', activo: 'NO' }),
  ]
  const appended = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    const ok = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } })
    if (u.startsWith('https://www.googleapis.com/oauth2/v3/certs')) return ok(google.jwksJson)
    if (u === 'https://oauth2.googleapis.com/token') return ok({ access_token: 'sa-token', expires_in: 3600 })
    if (u.includes('/values/Autorizados')) return ok({ values: rows })
    if (u.includes('/values/Auditoria') && u.includes(':append')) {
      appended.push(JSON.parse(init.body).values[0])
      return ok({})
    }
    if (u.includes('/values/Auditoria')) return ok({ values: [['id']] })
    throw new Error(`fetch inesperado: ${u}`)
  }
  try {
    await withEnv(
      {
        PATIO_SESSION_SECRET: SECRET,
        PATIO_GOOGLE_CLIENT_ID: CLIENT_ID,
        PATIO_GOOGLE_HOSTED_DOMAIN: 'camircapital.com',
        GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@proj.iam.gserviceaccount.com',
        GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: saKey.replace(/\n/g, '\\n'),
        PATIO_SPREADSHEET_ID: 'sheet-test',
      },
      async () => {
        const login = async (email, clave) =>
          loginHandler({
            httpMethod: 'POST',
            headers: { host: 'patiocontrol.netlify.app', 'x-nf-client-connection-ip': `10.0.0.${Math.random()}` },
            body: JSON.stringify({ idToken: await google.sign({ email, hd: 'camircapital.com' }), clave, dispositivoId: 'ipad-1' }),
          })

        const ok = await login('guardia@camircapital.com', 'clave-guardia')
        assert.equal(ok.statusCode, 200, ok.body)
        const body = JSON.parse(ok.body)
        assert.equal(body.user.rol, 'guardia')
        assert.equal(body.user.permisos.parado, false)
        assert.ok(!ok.body.includes('clave-guardia'))
        const cookie = ok.headers['Set-Cookie']
        assert.ok(cookie.includes('HttpOnly') && cookie.includes('Secure'))
        const token = cookie.split(';')[0].split('=')[1]
        const sess = verifySession(token, SECRET)
        assert.equal(sess.email, 'guardia@camircapital.com')
        assert.equal(sess.dispositivoId, 'ipad-1')

        assert.equal((await login('hash@camircapital.com', 'secreta')).statusCode, 200)
        assert.equal((await login('guardia@camircapital.com', 'mala')).statusCode, 403)
        assert.equal((await login('inactivo@camircapital.com', 'clave-guardia')).statusCode, 403)
        assert.equal((await login('nadie@camircapital.com', 'clave-guardia')).statusCode, 403)

        const acciones = appended.map((r) => r[4])
        assert.deepEqual(acciones, ['login', 'login', 'login_denegado', 'login_denegado', 'login_denegado'])
        assert.equal(appended[0].length, 10)
        assert.equal(appended[0][2], 'guardia@camircapital.com')
        assert.ok(!JSON.stringify(appended).includes('secreta'))
      },
    )
  } finally {
    globalThis.fetch = realFetch
  }
})

test('auth-login: 503 sin PATIO_SESSION_SECRET, 400 sin clave', async () => {
  await withEnv({ PATIO_SESSION_SECRET: null }, async () => {
    assert.equal((await loginHandler({ httpMethod: 'POST', headers: {}, body: '{}' })).statusCode, 503)
  })
  await withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    const r = await loginHandler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ idToken: 'x' }) })
    assert.equal(r.statusCode, 400)
  })
})

// ---------- outbox ----------
test('outbox: Blob ↔ ArrayBuffer', async () => {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
  const s = await serializeEvent({ tipo: 'movimiento', payload: { placa: 'ABC123A' }, blobs: { frontal: blob } })
  assert.equal(s.blobs.frontal.__blob, true)
  assert.ok(s.blobs.frontal.data instanceof ArrayBuffer)
  assert.equal(s.payload.placa, 'ABC123A')
  const back = rehydrateEvent(s)
  assert.ok(back.blobs.frontal instanceof Blob)
  assert.equal(back.blobs.frontal.type, 'image/jpeg')
  assert.deepEqual([...new Uint8Array(await back.blobs.frontal.arrayBuffer())], [1, 2, 3])
})

// ---------- runner ----------
let failed = 0
for (const t of tests) {
  try {
    await t.fn()
    console.log(`✓ ${t.name}`)
  } catch (err) {
    failed++
    console.error(`✗ ${t.name}\n  ${err?.stack || err}`)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} pruebas OK`)
process.exit(failed ? 1 : 0)
