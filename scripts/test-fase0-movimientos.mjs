#!/usr/bin/env node
/**
 * Pruebas Fase 0.2 — API de movimientos (sin red real).
 * node scripts/test-fase0-movimientos.mjs
 */

import assert from 'node:assert/strict'
import { exportPKCS8, generateKeyPair } from 'jose'

import { SESSION_COOKIE, signSession } from '../netlify/functions/lib/session.js'
import {
  MOVIMIENTO_COLUMNS,
  createSheetsRepo,
  findOpenEntradaIn,
  movimientoToRow,
  rowToMovimiento,
} from '../netlify/functions/lib/sheetsRepo.js'
import { createMovimientosService } from '../netlify/functions/lib/movimientosService.js'
import { handler as listHandler } from '../netlify/functions/movimientos-list.js'
import { handler as createHandler } from '../netlify/functions/movimientos-create.js'
import { handler as movimientosHandler } from '../netlify/functions/movimientos.js'
import {
  ApiError,
  isBackendUnavailable,
  listMovimientosServer,
  tryCreateMovimientoViaServer,
} from '../src/lib/serverApi.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const SECRET = 'test-secret-movimientos-0123456789'
const NOW = new Date('2026-09-30T18:00:00.000Z')

const guardia = {
  email: 'Guardia@CamirCapital.com',
  rol: 'guardia',
  permisos: { entrada: true, salida: true, parado: false, baja: false, historial: true },
  dispositivoId: 'ipad-1',
}
const admin = {
  email: 'admin@camircapital.com',
  rol: 'admin',
  permisos: { entrada: true, salida: true, parado: true, baja: true, historial: true },
  dispositivoId: 'ipad-2',
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

function baseMov(over = {}) {
  return {
    id: 'mov-1',
    tipo: 'entrada',
    equipoId: 'eq-1',
    placa: 'ABC123A',
    numeroEconomico: 'E-10',
    equipoTipo: 'camion',
    fechaHora: '2026-09-30T15:00:00.000Z',
    operador: 'Juan',
    chofer: 'Pedro',
    cliente: 'Camir',
    origen: 'Chihuahua',
    destino: 'Calera',
    kilometros: 1000,
    dieselPorcentaje: 80,
    dieselLitros: 40,
    checklist: [{ id: 'llantas', ok: true }],
    fotos: ['https://drive.google.com/uc?id=1'],
    fotosEvidencia: [{ slotId: 'placa-camion-frontal', label: 'Placa', url: 'https://drive.google.com/uc?id=1' }],
    condicionGeneral: 'buena',
    observaciones: 'todo bien',
    creadoEn: '2026-09-30T15:00:01.000Z',
    yardaId: 'chihuahua',
    selloNumero: 'SELLO1',
    firmaNombre: 'Juan Pérez',
    firmaUrl: 'https://drive.google.com/uc?id=firma',
    geoLat: 28.63,
    geoLng: -106.08,
    cumplimiento: { cartaPorte: true },
    selloCoincideEntrada: true,
    placaCamionTrasera: 'XYZ987A',
    traePlacaTrasera: false,
    motivoSinPlacaTrasera: 'sin tornillo',
    empresaId: 'api',
    whatsapp: '+526141112233',
    llevaRefrigerada: true,
    refrigerada: { inocuidad: [{ id: 'temp', ok: true }], horometroThermo: 12 },
    motivoParo: 'otro',
    motivoParoOtro: 'falta pieza',
    paradoDesde: '2026-09-29T12:00:00.000Z',
    zonaSlot: 'A-3',
    usuarioEmail: 'cliente-no-confiar@x.com',
    horaServidor: '1999-01-01T00:00:00.000Z',
    ...over,
  }
}

function memoryRepo(initialRows = []) {
  const rows = initialRows.map((r) => r.slice())
  const auditoria = []
  return {
    rows,
    auditoria,
    async listMovimientos() {
      return rows.map(rowToMovimiento).filter(Boolean)
    },
    async findMovimientoById(id) {
      const want = String(id ?? '').trim()
      const all = await this.listMovimientos()
      return all.find((m) => String(m.id) === want) ?? null
    },
    async findOpenEntrada(equipoId) {
      return findOpenEntradaIn(await this.listMovimientos(), equipoId)
    },
    async appendMovimiento(row) {
      rows.push(row.slice())
    },
    async appendAuditoria(entry) {
      auditoria.push(entry)
      return 'audit-id'
    },
  }
}

function service(repo = memoryRepo()) {
  const svc = createMovimientosService(repo, { now: () => NOW })
  return { svc, repo }
}

function cookieFor(permisos, email = 'guardia@camircapital.com', rol = 'guardia') {
  const token = signSession({ email, rol, permisos, dispositivoId: 'ipad-1' }, SECRET)
  return `${SESSION_COOKIE}=${token}`
}

function httpEvent(method, { cookie = '', body, query } = {}) {
  return {
    httpMethod: method,
    headers: cookie ? { cookie } : {},
    body: body === undefined ? '' : JSON.stringify(body),
    queryStringParameters: query,
  }
}

test('columnas A:AJ y round-trip de movimiento', () => {
  assert.equal(MOVIMIENTO_COLUMNS.length, 36)
  assert.equal(MOVIMIENTO_COLUMNS.indexOf('motivoParo'), 30)
  assert.equal(MOVIMIENTO_COLUMNS.indexOf('viajeId'), 35)
  assert.deepEqual(MOVIMIENTO_COLUMNS.slice(30), ['motivoParo', 'paradoDesde', 'zonaSlot', 'usuarioEmail', 'horaServidor', 'viajeId'])
  assert.equal(MOVIMIENTO_COLUMNS.indexOf('whatsapp'), 29)
  assert.equal(MOVIMIENTO_COLUMNS.indexOf('geoLat'), 22)
  assert.equal(MOVIMIENTO_COLUMNS.indexOf('fotosEvidenciaJson'), 23)
  assert.equal(MOVIMIENTO_COLUMNS.indexOf('geoLng'), 24)

  assert.equal(rowToMovimiento(null), null)
  assert.equal(rowToMovimiento(['solo-id']), null)

  const row = movimientoToRow(baseMov())
  assert.equal(row.length, 36)
  assert.equal(row[35], '')
  assert.equal(row[MOVIMIENTO_COLUMNS.indexOf('id')], 'mov-1')
  assert.equal(row[30], 'otro|falta pieza')
  assert.equal(row[34], '1999-01-01T00:00:00.000Z')
  assert.match(row[9], /Camir/)
  assert.match(row[26], /traePlacaTrasera":false/)
  assert.match(row[28], /inocuidad/)

  const back = rowToMovimiento(row)
  assert.equal(back.id, 'mov-1')
  assert.equal(back.tipo, 'entrada')
  assert.equal(back.equipoId, 'eq-1')
  assert.equal(back.placa, 'ABC123A')
  assert.equal(back.kilometros, 1000)
  assert.equal(back.dieselLitros, 40)
  assert.equal(back.geoLat, 28.63)
  assert.equal(back.geoLng, -106.08)
  assert.equal(back.cliente, 'Camir')
  assert.equal(back.origen, 'Chihuahua')
  assert.equal(back.destino, 'Calera')
  assert.deepEqual(back.checklist, [{ id: 'llantas', ok: true }])
  assert.equal(back.fotos[0], 'https://drive.google.com/uc?id=1')
  assert.equal(back.fotosEvidencia[0].slotId, 'placa-camion-frontal')
  assert.equal(back.cumplimiento.cartaPorte, true)
  assert.equal(back.selloCoincideEntrada, true)
  assert.equal(back.traePlacaTrasera, false)
  assert.equal(back.motivoSinPlacaTrasera, 'sin tornillo')
  assert.equal(back.placaCamionTrasera, 'XYZ987A')
  assert.equal(back.llevaRefrigerada, true)
  assert.equal(back.refrigerada.horometroThermo, 12)
  assert.equal(back.whatsapp, '+526141112233')
  assert.equal(back.motivoParo, 'otro')
  assert.equal(back.motivoParoOtro, 'falta pieza')
  assert.equal(back.paradoDesde, '2026-09-29T12:00:00.000Z')
  assert.equal(back.zonaSlot, 'A-3')
  assert.equal(back.usuarioEmail, 'cliente-no-confiar@x.com')
  assert.equal(back.horaServidor, '1999-01-01T00:00:00.000Z')
  assert.equal(back.chofer, 'Pedro')

  const zero = movimientoToRow(baseMov({ kilometros: 0, dieselLitros: 0, geoLat: 0 }))
  assert.equal(zero[10], 0)
  assert.equal(rowToMovimiento(zero).kilometros, 0)
  assert.equal(rowToMovimiento(zero).geoLat, 0)

  const minimal = rowToMovimiento(movimientoToRow({ id: '1', tipo: 'entrada', equipoId: 'e' }))
  assert.equal(minimal.equipoTipo, 'camion')
  assert.equal(minimal.empresaId, 'api')
  assert.equal(minimal.yardaId, 'chihuahua')
})

test('findOpenEntradaIn: salida, parado y baja cierran; otro equipo no', () => {
  const entrada = (id, equipoId) => ({ id, tipo: 'entrada', equipoId, placa: 'P' + id })
  assert.equal(findOpenEntradaIn([entrada('a', 'eq')], 'eq').id, 'a')
  assert.equal(findOpenEntradaIn([entrada('a', 'eq'), { id: 's', tipo: 'salida', equipoId: 'eq' }], 'eq'), null)
  assert.equal(findOpenEntradaIn([entrada('a', 'eq'), { id: 'p', tipo: 'parado', equipoId: 'eq' }], 'eq'), null)
  assert.equal(findOpenEntradaIn([entrada('a', 'eq'), { id: 'b', tipo: 'baja', equipoId: 'eq' }], 'eq'), null)
  assert.equal(
    findOpenEntradaIn([entrada('a', 'eq'), { id: 's', tipo: 'Salida', equipoId: 'eq' }, entrada('c', 'eq')], 'eq').id,
    'c',
  )
  assert.equal(findOpenEntradaIn([entrada('a', 'eq1'), entrada('b', 'eq2')], 'eq2').id, 'b')
  assert.equal(findOpenEntradaIn([entrada('a', 'eq1')], 'eq2'), null)
})

test('crear: sella usuarioEmail y horaServidor; no pisa fechaHora', async () => {
  const { svc, repo } = service()
  const result = await svc.crear(guardia, baseMov({ tipo: 'Entrada' }))
  assert.equal(result.idempotent, false)
  assert.equal(result.movimiento.usuarioEmail, 'guardia@camircapital.com')
  assert.equal(result.movimiento.horaServidor, NOW.toISOString())
  assert.equal(result.movimiento.fechaHora, '2026-09-30T15:00:00.000Z')
  assert.equal(result.movimiento.tipo, 'entrada')
  assert.equal(repo.rows[0][33], 'guardia@camircapital.com')
  assert.equal(repo.rows[0][34], NOW.toISOString())
  assert.equal(repo.rows[0][6], '2026-09-30T15:00:00.000Z')
  assert.notEqual(repo.rows[0][34], '1999-01-01T00:00:00.000Z')
})

test('crear idempotente: mismo id no duplica fila ni auditoría', async () => {
  const { svc, repo } = service()
  const first = await svc.crear(guardia, baseMov({ id: 'same', placa: 'AAA111A' }))
  const rows = repo.rows.length
  const audits = repo.auditoria.length
  const second = await svc.crear(
    guardia,
    baseMov({ id: 'same', placa: 'ZZZ999Z', horaServidor: '2099-01-01T00:00:00.000Z', usuarioEmail: 'otro@x.com' }),
  )
  assert.equal(first.idempotent, false)
  assert.equal(second.idempotent, true)
  assert.equal(second.movimiento.placa, 'AAA111A')
  assert.equal(second.movimiento.horaServidor, first.movimiento.horaServidor)
  assert.equal(second.movimiento.usuarioEmail, 'guardia@camircapital.com')
  assert.equal(repo.rows.length, rows)
  assert.equal(repo.auditoria.length, audits)
})

test('rechaza segunda entrada abierta; salida, parado y baja cierran', async () => {
  const { svc, repo } = service()
  await svc.crear(guardia, baseMov({ id: 'e1', equipoId: 'eq-a', placa: 'AAA111A' }))
  await svc.crear(guardia, baseMov({ id: 'e-otro', equipoId: 'eq-b', placa: 'BBB222B' }))
  const dup = await svc.crear(guardia, baseMov({ id: 'e2', equipoId: 'eq-a', placa: 'AAA111A' })).catch((e) => e)
  assert.equal(dup.status, 409)
  assert.match(dup.message, /entrada abierta/)
  assert.match(dup.message, /AAA111A/)
  assert.equal(repo.rows.length, 2)
  assert.equal(repo.auditoria.length, 2)

  await svc.crear(guardia, baseMov({ id: 's1', tipo: 'salida', equipoId: 'eq-a', kilometros: 1000 }))
  await svc.crear(guardia, baseMov({ id: 'e3', equipoId: 'eq-a', placa: 'AAA111A' }))

  await svc.crear(admin, baseMov({ id: 'p1', tipo: 'parado', equipoId: 'eq-b' }))
  await svc.crear(guardia, baseMov({ id: 'e4', equipoId: 'eq-b', placa: 'BBB222B' }))
  assert.equal(repo.rows.length, 6)
})

test('salida: kilómetros >= último del equipo; vacío se acepta', async () => {
  const { svc, repo } = service()
  await svc.crear(guardia, baseMov({ id: 'e1', equipoId: 'eq-km', kilometros: 1000 }))
  const bajo = await svc.crear(guardia, baseMov({ id: 's-bajo', tipo: 'salida', equipoId: 'eq-km', kilometros: 999 })).catch(
    (e) => e,
  )
  assert.equal(bajo.status, 400)
  assert.match(bajo.message, /999/)
  assert.match(bajo.message, /1000/)
  assert.equal(repo.rows.length, 1)

  await svc.crear(guardia, baseMov({ id: 's-igual', tipo: 'salida', equipoId: 'eq-km', kilometros: 1000 }))
  await svc.crear(guardia, baseMov({ id: 'e2', equipoId: 'eq-km2', kilometros: null }))
  await svc.crear(guardia, baseMov({ id: 's-libre', tipo: 'salida', equipoId: 'eq-km2', kilometros: 10 }))
  await svc.crear(guardia, baseMov({ id: 'e3', equipoId: 'eq-km3', kilometros: 50 }))
  await svc.crear(guardia, baseMov({ id: 's-vacio', tipo: 'salida', equipoId: 'eq-km3', kilometros: null }))
  await svc.crear(guardia, baseMov({ id: 's-otro', tipo: 'salida', equipoId: 'eq-otro', kilometros: 1 }))
  const invalido = await svc
    .crear(guardia, baseMov({ id: 's-nan', tipo: 'salida', equipoId: 'eq-otro', kilometros: 'abc' }))
    .catch((e) => e)
  assert.equal(invalido.status, 400)
  assert.match(invalido.message, /no son un número válido/)

  const spaced = await svc.crear(guardia, baseMov({ id: 's-sp', tipo: 'salida', equipoId: 'eq-km', kilometros: ' 1500 ' }))
  assert.equal(spaced.movimiento.kilometros, 1500)
  assert.equal(repo.rows.filter((r) => r[0] === 's-bajo').length, 0)
})

test('permiso: guardia no registra parado ni baja; no escribe ni audita', async () => {
  const { svc, repo } = service()
  for (const tipo of ['parado', 'baja']) {
    const err = await svc.crear(guardia, baseMov({ id: `x-${tipo}`, tipo, equipoId: `eq-${tipo}` })).catch((e) => e)
    assert.equal(err.status, 403, tipo)
    assert.match(err.message, /permiso/i)
  }
  const sin = await svc.crear({ email: 'a@x.com', rol: 'guardia' }, baseMov()).catch((e) => e)
  assert.equal(sin.status, 403)
  const tipo = await svc.crear(guardia, baseMov({ tipo: 'inventario' })).catch((e) => e)
  assert.equal(tipo.status, 400)
  const falta = await svc.crear(guardia, baseMov({ id: '' })).catch((e) => e)
  assert.equal(falta.status, 400)
  assert.equal(repo.rows.length, 0)
  assert.equal(repo.auditoria.length, 0)
  await svc.crear(admin, baseMov({ id: 'baja-ok', tipo: 'baja', equipoId: 'eq-baja' }))
  assert.equal(repo.rows.length, 1)
})

test('auditoría crear_movimiento sin data URLs; si falla, el movimiento queda', async () => {
  const { svc, repo } = service()
  const big = `data:image/jpeg;base64,${'A'.repeat(4000)}`
  await svc.crear(
    guardia,
    baseMov({
      id: 'mov-foto',
      equipoId: 'eq-foto',
      firmaUrl: big,
      fotos: ['https://drive.google.com/uc?id=1', big],
      fotosEvidencia: [
        { slotId: 'frontal', label: 'Frontal', url: 'https://drive.google.com/uc?id=1' },
        { slotId: 'x', label: 'X', url: big },
      ],
    }),
  )
  assert.equal(repo.auditoria.length, 1)
  const entry = repo.auditoria[0]
  assert.equal(entry.accion, 'crear_movimiento')
  assert.equal(entry.entidad, 'Movimiento')
  assert.equal(entry.entidadId, 'mov-foto')
  assert.equal(entry.usuarioEmail, 'guardia@camircapital.com')
  assert.equal(entry.rol, 'guardia')
  assert.equal(entry.dispositivoId, 'ipad-1')
  const dumped = JSON.stringify(entry.despues)
  assert.equal(dumped.includes('base64,'), false)
  assert.equal(dumped.includes('AAAA'), false)
  assert.match(dumped, /"dataUrl":true/)
  assert.match(dumped, /drive\.google\.com/)
  assert.equal(repo.rows[0][21].includes('base64,'), true)

  const repo2 = memoryRepo()
  repo2.appendAuditoria = async () => {
    throw new Error('audit down')
  }
  const svc2 = createMovimientosService(repo2, { now: () => NOW })
  const saved = await svc2.crear(guardia, baseMov({ id: 'aud-fail', equipoId: 'eq-aud' }))
  assert.equal(saved.movimiento.id, 'aud-fail')
  assert.equal(repo2.rows.length, 1)
})

test('listar: más reciente primero y respeta limit', async () => {
  const { svc } = service()
  await svc.crear(guardia, baseMov({ id: 'a', equipoId: 'e1', fechaHora: '2026-09-01T00:00:00.000Z', kilometros: 1 }))
  await svc.crear(
    guardia,
    baseMov({ id: 'b', tipo: 'salida', equipoId: 'e1', fechaHora: '2026-09-03T00:00:00.000Z', kilometros: 5 }),
  )
  await svc.crear(guardia, baseMov({ id: 'c', equipoId: 'e2', fechaHora: '2026-09-02T00:00:00.000Z', kilometros: 1 }))
  const top = await svc.listar({ limit: 1 })
  assert.equal(top.length, 1)
  assert.equal(top[0].id, 'b')
  const all = await svc.listar({ limit: 50 })
  assert.deepEqual(
    all.map((m) => m.id),
    ['b', 'c', 'a'],
  )
})

test('HTTP: sesión, permiso, idempotencia, 409 y listado', async () => {
  await withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    const repo = memoryRepo()
    const deps = { repo }
    const cookie = cookieFor({ entrada: true, salida: true, parado: false, baja: false })

    assert.equal((await movimientosHandler(httpEvent('OPTIONS'))).statusCode, 204)
    assert.equal((await movimientosHandler(httpEvent('PUT'))).statusCode, 405)
    assert.equal((await createHandler(httpEvent('GET'))).statusCode, 405)
    assert.equal((await listHandler(httpEvent('GET'))).statusCode, 401)
    assert.equal((await createHandler(httpEvent('POST', { body: {} }))).statusCode, 401)

    const mov = baseMov({ id: 'http-1', equipoId: 'eq-http', horaServidor: '1999-01-01T00:00:00.000Z' })
    const created = await createHandler(httpEvent('POST', { cookie, body: mov }), deps)
    assert.equal(created.statusCode, 200, created.body)
    const body = JSON.parse(created.body)
    assert.equal(body.idempotent, false)
    assert.equal(body.movimiento.fechaHora, mov.fechaHora)
    assert.notEqual(body.movimiento.horaServidor, '1999-01-01T00:00:00.000Z')
    assert.equal(body.movimiento.usuarioEmail, 'guardia@camircapital.com')
    assert.ok(Math.abs(Date.parse(body.movimiento.horaServidor) - Date.now()) < 10_000)

    const again = await movimientosHandler(httpEvent('POST', { cookie, body: { ...mov, placa: 'OTRA999' } }), deps)
    assert.equal(again.statusCode, 200)
    assert.equal(JSON.parse(again.body).idempotent, true)
    assert.equal(JSON.parse(again.body).movimiento.placa, 'ABC123A')
    assert.equal(repo.rows.length, 1)

    const denied = await createHandler(
      httpEvent('POST', { cookie, body: baseMov({ id: 'http-p', tipo: 'parado', equipoId: 'eq-http' }) }),
      deps,
    )
    assert.equal(denied.statusCode, 403)
    assert.match(JSON.parse(denied.body).error, /permiso/i)

    const conflict = await createHandler(
      httpEvent('POST', { cookie, body: baseMov({ id: 'http-2', equipoId: 'eq-http' }) }),
      deps,
    )
    assert.equal(conflict.statusCode, 409)
    assert.match(JSON.parse(conflict.body).error, /entrada abierta/)
    assert.equal(repo.rows.length, 1)

    const listed = await listHandler(httpEvent('GET', { cookie, query: { limit: '1' } }), deps)
    assert.equal(listed.statusCode, 200)
    assert.equal(JSON.parse(listed.body).movimientos.length, 1)
    assert.equal(listed.headers['Cache-Control'], 'no-store')
  })

  await withEnv({ PATIO_SESSION_SECRET: null }, async () => {
    const res = await createHandler(httpEvent('POST', { body: baseMov() }))
    assert.equal(res.statusCode, 503)
  })
})

test('cliente: tryCreate cae a null en 503/404 y no en 403', async () => {
  const realFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ movimiento: { id: 'srv-1', placa: 'ABC' } }), { status: 200 })
    const ok = await tryCreateMovimientoViaServer({ id: 'srv-1' })
    assert.equal(ok.id, 'srv-1')

    globalThis.fetch = async (url, init) => {
      assert.match(String(url), /\/api\/movimientos\?limit=12$/)
      assert.equal(init.method, 'GET')
      return new Response(JSON.stringify({ movimientos: [] }), { status: 200 })
    }
    assert.deepEqual(await listMovimientosServer(12), { movimientos: [] })

    for (const status of [404, 405, 503]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ error: 'no' }), { status })
      assert.equal(await tryCreateMovimientoViaServer({ id: 'x' }), null, String(status))
    }
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    assert.equal(await tryCreateMovimientoViaServer({ id: 'x' }), null)
    globalThis.fetch = async () => new Response('<html>spa</html>', { status: 200 })
    assert.equal(await tryCreateMovimientoViaServer({ id: 'x' }), null)

    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'sin permiso' }), { status: 403 })
    const denied = await tryCreateMovimientoViaServer({ id: 'x' }).catch((e) => e)
    assert.ok(denied instanceof ApiError)
    assert.equal(denied.status, 403)
    assert.equal(isBackendUnavailable(denied), false)
    assert.equal(isBackendUnavailable(new ApiError('conflicto', 409, {})), false)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('sheetsRepo: append RAW de Movimientos y nunca clear; grid → 503', async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  const saKey = await exportPKCS8(privateKey)
  const rows = [movimientoToRow(baseMov({ id: 'e1', tipo: 'entrada', equipoId: 'eq', kilometros: 10 }))]
  const urls = []
  const fetchImpl = async (url, init = {}) => {
    const u = String(url)
    urls.push({ url: u, method: init.method || 'GET' })
    const ok = (obj) => new Response(JSON.stringify(obj), { status: 200 })
    if (u === 'https://oauth2.googleapis.com/token') return ok({ access_token: 'sa-token', expires_in: 3600 })
    if (u.includes(':clear') || init.method === 'DELETE') throw new Error('no se debe limpiar la hoja')
    if (u.includes('/values/Movimientos') && u.includes(':append')) {
      const values = JSON.parse(init.body).values
      rows.push(values[0])
      return ok({})
    }
    if (u.includes('/values/Movimientos')) return ok({ values: rows })
    throw new Error(`fetch inesperado ${u}`)
  }
  const repo = createSheetsRepo({
    email: 'sa@test.iam.gserviceaccount.com',
    privateKey: saKey,
    spreadsheetId: 'sheet-test',
    fetch: fetchImpl,
  })
  const list = await repo.listMovimientos()
  assert.equal(list[0].id, 'e1')
  assert.equal(list[0].motivoParo, 'otro')
  assert.equal((await repo.findMovimientoById('e1')).placa, 'ABC123A')
  assert.equal((await repo.findOpenEntrada('eq')).id, 'e1')
  await repo.appendMovimiento(movimientoToRow(baseMov({ id: 's1', tipo: 'salida', equipoId: 'eq', kilometros: 12 })))
  assert.equal(await repo.findOpenEntrada('eq'), null)
  const append = urls.find((u) => u.url.includes(':append'))
  assert.ok(append, 'debe haber append')
  assert.equal(append.method, 'POST')
  assert.match(append.url, /valueInputOption=RAW/)
  assert.match(decodeURIComponent(append.url), /Movimientos!A:AJ:append/)
  assert.equal(urls.some((u) => u.url.includes(':clear') || u.method === 'DELETE'), false)

  const repoGrid = createSheetsRepo({
    email: 'sa@test.iam.gserviceaccount.com',
    privateKey: saKey,
    spreadsheetId: 'sheet-test',
    fetch: async (url) => {
      const u = String(url)
      if (u === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'sa-token', expires_in: 3600 }), { status: 200 })
      }
      return new Response('Range exceeds grid limits', { status: 400 })
    },
  })
  const gridErr = await repoGrid.appendMovimiento(['id', 'entrada']).catch((e) => e)
  assert.equal(gridErr.status, 503)
  assert.match(gridErr.message, /migrate:fase0/)
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
