#!/usr/bin/env node
/**
 * Smoke de producción PatioControl (sin secretos en stdout).
 * Uso: node scripts/smoke-prod.mjs
 */
const BASE = process.env.PATIO_URL || 'https://patiocontrol.netlify.app'
const EMAIL = process.env.PATIO_SMOKE_EMAIL || 'nestor.riggs@gmail.com'
const CLAVE = process.env.PATIO_SMOKE_CLAVE || 'Patio2026'

function fail(msg) {
  console.error('FAIL', msg)
  process.exit(1)
}

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, clave: CLAVE }),
  })
  if (!login.ok) fail(`login ${login.status}`)
  const cookie = (login.headers.getSetCookie?.() || [])
    .map((c) => c.split(';')[0])
    .join('; ')
  const raw = login.headers.get('set-cookie') || ''
  const cookieHeader = cookie || raw.split(',').map((p) => p.split(';')[0].trim()).filter((p) => p.includes('=')).join('; ')
  if (!cookieHeader.includes('patio_session')) fail('sin cookie patio_session')

  const headers = { Cookie: cookieHeader, Accept: 'application/json' }
  for (const path of ['/api/auth/me', '/api/equipos', '/api/movimientos?limit=5']) {
    const res = await fetch(`${BASE}${path}`, { headers })
    if (!res.ok) fail(`${path} ${res.status}`)
  }

  const ocr = await fetch(`${BASE}/api/ocr-placa`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl: 'data:image/jpeg;base64,/9j/4AAQ' }),
  })
  if (ocr.status !== 400) fail(`ocr sin imagen debía ser 400, fue ${ocr.status}`)

  const html = await fetch(BASE)
  const page = await html.text()
  const asset = page.match(/\/assets\/index-[^"]+\.js/)?.[0]
  if (!asset) fail('sin asset JS')
  const js = await (await fetch(`${BASE}${asset}`)).text()
  for (const needle of ['placa-rapido', 'retorno-rapido', 'salida-rapida', 'Lavado', 'Llantas', 'Otros']) {
    if (!js.includes(needle)) fail(`bundle sin ${needle}`)
  }

  console.log('OK', BASE, 'login+apis+ocr-auth+bundle')
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)))
