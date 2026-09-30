#!/usr/bin/env node
/**
 * Pruebas Fase 0 cierre — Local solo lectura, lista de movimientos por API
 * y GET /api/estado-unidades (sin red real).
 * node scripts/test-fase0-cierre.mjs
 */

import assert from 'node:assert/strict'

import { SESSION_COOKIE, signSession } from '../netlify/functions/lib/session.js'
import { handler as estadoHandler } from '../netlify/functions/estado-unidades.js'
import { ApiError } from '../src/lib/serverApi.js'
import {
  fetchEstadoUnidadesOpcional,
  listEstadoUnidadesServer,
  listMovimientosServer,
} from '../src/lib/serverApi.js'
import {
  LOCAL_READONLY_BANNER,
  activeServerUser,
  assertWritable,
  hasServerSession,
  indexEstadosUnidad,
  isLocalReadOnly,
  loadMovimientosRefresh,
  movimientoWriteMode,
  puedeVerPagina,
  shouldSkipSheetsAppend,
} from '../src/lib/patioSync.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const SECRET = 'test-secret-fase0-cierre-0123456789'

const guardia = {
  email: 'guardia@camircapital.com',
  rol: 'guardia',
  permisos: { entrada: true, salida: true, parado: false, baja: false, historial: true, workspace: false },
}

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

function cookieFor(session = guardia) {
  const token = signSession(session, SECRET)
  return `${SESSION_COOKIE}=${token}`
}

function httpEvent(method, { cookie = '', query } = {}) {
  return {
    httpMethod: method,
    headers: cookie ? { cookie } : {},
    queryStringParameters: query,
  }
}

const serverUser = {
  email: 'guardia@camircapital.com',
  sesionServidor: true,
  rol: 'guardia',
  permisos: { entrada: true },
}

test('Local sin sesión de servidor es solo lectura', () => {
  assert.equal(LOCAL_READONLY_BANNER, 'Conecta Cloud con tu cuenta autorizada para registrar')
  assert.equal(isLocalReadOnly({ mode: 'local', user: null }), true)
  assert.equal(isLocalReadOnly({ mode: 'local', user: { email: 'a@b.com', rol: 'guardia' } }), true)
  assert.equal(isLocalReadOnly({ mode: 'local', user: { email: '', sesionServidor: true } }), true)
  assert.equal(hasServerSession({ email: 'a@b.com' }), false)

  assert.throws(() => assertWritable({ mode: 'local' }), (e) => {
    assert.equal(e.code, 'LOCAL_READONLY')
    assert.equal(e.message, LOCAL_READONLY_BANNER)
    return true
  })
  assert.equal(movimientoWriteMode({ mode: 'local', user: null }), 'deny')
  assert.equal(movimientoWriteMode({ mode: 'local', user: { email: 'a@b.com' } }), 'deny')
  assert.equal(shouldSkipSheetsAppend(null), false)
})

test('Local con sesión de servidor sí puede registrar y no usa Sheets', () => {
  assert.equal(isLocalReadOnly({ mode: 'local', user: serverUser }), false)
  assert.doesNotThrow(() => assertWritable({ mode: 'local', user: serverUser }))
  assert.equal(movimientoWriteMode({ mode: 'local', user: serverUser }), 'server')
  assert.equal(shouldSkipSheetsAppend(serverUser), true)
  const cached = activeServerUser(null, serverUser)
  assert.equal(cached.sesionServidor, true)
  assert.equal(movimientoWriteMode({ mode: 'local', user: cached }), 'server')
})

test('Workspace solo con OAuth de Sheets conserva el híbrido', () => {
  const sheetsUser = { email: 'caseta@camircapital.com', rol: 'guardia', permisos: { entrada: true } }
  assert.equal(isLocalReadOnly({ mode: 'workspace', user: null }), false)
  assert.equal(isLocalReadOnly({ mode: 'workspace', user: sheetsUser }), false)
  assert.doesNotThrow(() => assertWritable({ mode: 'workspace', user: sheetsUser }))
  assert.equal(movimientoWriteMode({ mode: 'workspace', user: sheetsUser }), 'hybrid')
  assert.equal(movimientoWriteMode({ mode: 'workspace', user: null }), 'hybrid')
  assert.equal(shouldSkipSheetsAppend(sheetsUser), false)
  assert.equal(movimientoWriteMode({ mode: 'workspace', user: serverUser }), 'server')
})

test('Cloud sigue en el menú aunque el kardex niegue workspace', () => {
  assert.equal(puedeVerPagina(guardia, 'workspace'), true)
  assert.equal(puedeVerPagina(guardia, 'dashboard'), true)
  assert.equal(puedeVerPagina(guardia, 'mantenimiento'), true)
  assert.equal(puedeVerPagina(guardia, 'entrada'), true)
  assert.equal(puedeVerPagina(guardia, 'parado'), false)
  assert.equal(puedeVerPagina(null, 'entrada'), true)
  assert.equal(puedeVerPagina(null, 'workspace'), true)
})

test('refresh con sesión usa la lista del API y no lee Sheets', async () => {
  let sheets = 0
  let server = 0
  const loaded = await loadMovimientosRefresh({
    user: serverUser,
    listServer: async () => {
      server++
      return [{ id: 'm1', tipo: 'entrada', equipoId: 'eq-1' }]
    },
    listSheets: async () => {
      sheets++
      return [{ id: 'sheet', tipo: 'entrada' }]
    },
  })
  assert.equal(loaded.source, 'server')
  assert.equal(server, 1)
  assert.equal(sheets, 0)
  assert.equal(loaded.movimientos[0].id, 'm1')
})

test('refresh cae a Sheets si el API de movimientos no está', async () => {
  for (const status of [404, 405, 503]) {
    let sheets = 0
    const loaded = await loadMovimientosRefresh({
      user: serverUser,
      listServer: async () => {
        throw new ApiError('no', status, {})
      },
      listSheets: async () => {
        sheets++
        return [{ id: 'legacy', tipo: 'salida' }]
      },
    })
    assert.equal(loaded.source, 'sheets-fallback', String(status))
    assert.equal(sheets, 1)
    assert.equal(loaded.movimientos[0].id, 'legacy')
  }

  const red = await loadMovimientosRefresh({
    user: serverUser,
    listServer: async () => {
      throw new TypeError('Failed to fetch')
    },
    listSheets: async () => [{ id: 'red' }],
  })
  assert.equal(red.source, 'sheets-fallback')
  assert.equal(red.movimientos[0].id, 'red')
})

test('401 de la lista no cae a Sheets (la sesión se rechazó)', async () => {
  let sheets = 0
  const err = await loadMovimientosRefresh({
    user: serverUser,
    listServer: async () => {
      throw new ApiError('Sesión requerida', 401, { needsLogin: true })
    },
    listSheets: async () => {
      sheets++
      return []
    },
  }).catch((e) => e)
  assert.ok(err instanceof ApiError)
  assert.equal(err.status, 401)
  assert.equal(sheets, 0)
})

test('sin sesión el refresh no llama al API', async () => {
  let server = 0
  const loaded = await loadMovimientosRefresh({
    user: { email: 'a@b.com' },
    listServer: async () => {
      server++
      return []
    },
    listSheets: async () => [{ id: 'solo-sheets' }],
  })
  assert.equal(server, 0)
  assert.equal(loaded.source, 'sheets')
  assert.equal(loaded.movimientos[0].id, 'solo-sheets')

  const keep = await loadMovimientosRefresh({
    user: serverUser,
    listServer: async () => {
      throw new ApiError('caído', 503, {})
    },
  })
  assert.equal(keep.source, 'server-unavailable')
  assert.equal(keep.movimientos, null)
})

test('indexEstadosUnidad indexa unidad y placa', () => {
  const map = indexEstadosUnidad([
    { unidadId: 'eq-1', placa: 'abc123a', estatusOperativo: 'EN_MANTENIMIENTO' },
    null,
    { estatusOperativo: 'DISPONIBLE' },
  ])
  assert.equal(map['eq-1'].estatusOperativo, 'EN_MANTENIMIENTO')
  assert.equal(map.ABC123A.estatusOperativo, 'EN_MANTENIMIENTO')
})

test('GET /api/estado-unidades lista filas y exige sesión', async () => {
  const repo = {
    async listEstadoUnidad() {
      return [
        {
          unidadId: 'eq-1',
          tipo: 'camion',
          yarda: 'chihuahua',
          zona: 'A',
          slot: '3',
          ubicacion: '',
          estatusOperativo: 'EN_MANTENIMIENTO',
          estatusCarga: '',
          desde: '2026-09-30T12:00:00.000Z',
          otAbiertaId: 'ot-1',
          actualizadoEn: '2026-09-30T12:00:00.000Z',
        },
      ]
    },
  }

  await withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    const ok = await estadoHandler(httpEvent('GET', { cookie: cookieFor() }), { repo })
    assert.equal(ok.statusCode, 200)
    assert.equal(ok.headers['Cache-Control'], 'no-store')
    const body = JSON.parse(ok.body)
    assert.equal(body.estados.length, 1)
    assert.equal(body.estados[0].unidadId, 'eq-1')
    assert.equal(body.estados[0].estatusOperativo, 'EN_MANTENIMIENTO')

    const anon = await estadoHandler(httpEvent('GET'), { repo })
    assert.equal(anon.statusCode, 401)

    const post = await estadoHandler(httpEvent('POST', { cookie: cookieFor() }), { repo })
    assert.equal(post.statusCode, 405)

    const pre = await estadoHandler(httpEvent('OPTIONS', { cookie: cookieFor() }), { repo })
    assert.equal(pre.statusCode, 204)
  })

  await withEnv({ PATIO_SESSION_SECRET: null }, async () => {
    const res = await estadoHandler(httpEvent('GET'), { repo })
    assert.equal(res.statusCode, 503)
  })

  await withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    const broken = {
      async listEstadoUnidad() {
        const err = new Error('Backend Sheets no configurado')
        err.status = 503
        throw err
      },
    }
    const res = await estadoHandler(httpEvent('GET', { cookie: cookieFor() }), { repo: broken })
    assert.equal(res.statusCode, 503)
    assert.match(JSON.parse(res.body).error, /Sheets/)
  })
})

test('cliente: lista de estados y fallback si el API no está', async () => {
  const realFetch = globalThis.fetch
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), '/api/estado-unidades')
      assert.equal(init.method, 'GET')
      assert.equal(init.credentials, 'include')
      return new Response(JSON.stringify({ estados: [{ unidadId: 'eq-9', estatusOperativo: 'DISPONIBLE' }] }), { status: 200 })
    }
    const data = await listEstadoUnidadesServer()
    assert.equal(data.estados[0].unidadId, 'eq-9')
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ estados: [{ unidadId: 'eq-9', estatusOperativo: 'BAJA' }] }), { status: 200 })
    const list = await fetchEstadoUnidadesOpcional()
    assert.equal(list[0].estatusOperativo, 'BAJA')

    for (const status of [401, 404, 503]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ error: 'no' }), { status })
      assert.equal(await fetchEstadoUnidadesOpcional(), null, String(status))
    }

    globalThis.fetch = async (url) => {
      assert.match(String(url), /\/api\/movimientos\?limit=20$/)
      return new Response(JSON.stringify({ movimientos: [{ id: 'srv' }] }), { status: 200 })
    }
    const movs = await listMovimientosServer(20)
    assert.equal(movs.movimientos[0].id, 'srv')
  } finally {
    globalThis.fetch = realFetch
  }
})

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
