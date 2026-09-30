#!/usr/bin/env node
/**
 * Pruebas Fase 5 — App Chofer, Frotcom y ERP (sin red real).
 * node scripts/test-fase5.mjs
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { exportPKCS8, generateKeyPair } from 'jose'

import { SESSION_COOKIE, signSession } from '../netlify/functions/lib/session.js'
import {
  LLEGADAS_ESPERADAS_COLUMNS,
  MOVIMIENTO_COLUMNS,
  MOVIMIENTOS_APPEND_RANGE,
  columnLetter,
  createSheetsRepo,
  llegadaToRow,
  movimientoToRow,
  rowToAvisoLog,
  rowToLlegada,
  rowToMovimiento,
} from '../netlify/functions/lib/sheetsRepo.js'
import { TIPOS_AVISO } from '../netlify/functions/lib/avisosService.js'
import { normalizarPosiciones, proveedorGPS } from '../netlify/functions/lib/gpsProvider.js'
import { conciliarGpsConMovimientos, distanciaMetros, posicionEnGeocerca } from '../netlify/functions/lib/frotcomService.js'
import { extraerViajeId } from '../netlify/functions/lib/llegadasService.js'
import { costosOtToCsv, filasCostoOt } from '../netlify/functions/lib/erpCostos.js'
import { handler as preavisoHandler } from '../netlify/functions/chofer-preaviso.js'
import { handler as frotcomHandler } from '../netlify/functions/frotcom-conciliar.js'
import { handler as erpHandler } from '../netlify/functions/erp-costos-ot.js'
import { handler as createMovimientoHandler } from '../netlify/functions/movimientos-create.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const SECRET = 'test-secret-fase5-integraciones-0123456789'
const KEY = 'patio-integration-key-fase5'
const NOW = new Date('2026-09-30T18:12:00.000Z')

function cookieFor(rol = 'guardia') {
  const token = signSession(
    {
      email: 'guardia@camircapital.com',
      rol,
      permisos: { entrada: true, salida: true, parado: true, baja: true, kpis: true },
      dispositivoId: 'ipad-caseta',
    },
    SECRET,
  )
  return `${SESSION_COOKIE}=${token}`
}

function memoryRepo() {
  const llegadas = []
  const avisos = []
  const movimientos = []
  const ots = []
  return {
    llegadas,
    avisos,
    movimientos,
    ots,
    async listLlegadasEsperadas() {
      return llegadas.map(rowToLlegada).filter(Boolean)
    },
    async appendLlegadaEsperada(row) {
      llegadas.push(row.slice())
    },
    async updateLlegadaEsperadaById(id, row) {
      const idx = llegadas.findIndex((item) => String(item[0]) === String(id))
      if (idx < 0) {
        const err = new Error(`no llegada ${id}`)
        err.status = 404
        throw err
      }
      llegadas[idx] = row.slice()
    },
    async listMovimientos() {
      return movimientos.slice()
    },
    async appendMovimiento(row) {
      const mov = rowToMovimiento(row)
      if (mov) movimientos.push(mov)
    },
    async findMovimientoById(id) {
      return movimientos.find((item) => item.id === id) || null
    },
    async findOpenEntrada() {
      return null
    },
    async appendAuditoria() {
      return 'audit'
    },
    async listAvisosLog() {
      return avisos.map(rowToAvisoLog).filter(Boolean)
    },
    async appendAvisoLog(row) {
      avisos.push(row.slice())
    },
    async listOrdenesTrabajo() {
      return ots.slice()
    },
  }
}

function httpEvent(method, { cookie = '', key = '', body, query, rawBody } = {}) {
  const headers = {}
  if (cookie) headers.cookie = cookie
  if (key) headers['x-patio-key'] = key
  return {
    httpMethod: method,
    headers,
    body: rawBody !== undefined ? rawBody : body === undefined ? '' : JSON.stringify(body),
    queryStringParameters: query || null,
  }
}

async function withEnv(vars, fn) {
  const prev = {}
  for (const name of Object.keys(vars)) {
    prev[name] = process.env[name]
    if (vars[name] == null) delete process.env[name]
    else process.env[name] = vars[name]
  }
  try {
    return await fn()
  } finally {
    for (const name of Object.keys(prev)) {
      if (prev[name] == null) delete process.env[name]
      else process.env[name] = prev[name]
    }
  }
}

test('viajeId queda en la columna AJ y el preaviso redondea', () => {
  assert.equal(columnLetter(35), 'AJ')
  assert.equal(MOVIMIENTO_COLUMNS.length, 36)
  assert.equal(MOVIMIENTO_COLUMNS[35], 'viajeId')
  assert.equal(MOVIMIENTOS_APPEND_RANGE, 'Movimientos!A:AJ')
  assert.equal(LLEGADAS_ESPERADAS_COLUMNS[1], 'viajeId')
  assert.equal(LLEGADAS_ESPERADAS_COLUMNS[5], 'sello')
  assert.ok(TIPOS_AVISO.includes('MOV_NO_REGISTRADO'))
  assert.ok(TIPOS_AVISO.includes('SIN_CONFIRMACION_GPS'))

  const row = movimientoToRow({ id: 'mov-1', tipo: 'entrada', equipoId: 'eq-1', viajeId: 'VJ-9' })
  assert.equal(row.length, 36)
  assert.equal(row[35], 'VJ-9')
  assert.equal(rowToMovimiento(row).viajeId, 'VJ-9')

  const llegada = rowToLlegada(llegadaToRow({
    id: 'll-1',
    viajeId: 'VJ-9',
    placas: ['abc123'],
    cajas: ['CAJA1'],
    dolly: 'DOLLY1',
    sello: 'sello1',
    cartaPorte: 'uuid',
    eta: '2026-09-30T18:30:00.000Z',
    yardaId: 'Chihuahua',
    horaServidor: NOW.toISOString(),
    estatus: 'PENDIENTE',
  }))
  assert.equal(llegada.viajeId, 'VJ-9')
  assert.deepEqual(llegada.placas, ['abc123'])
  assert.equal(llegada.sello, 'SELLO1')
  assert.equal(llegada.yardaId, 'chihuahua')
  assert.equal(llegada.estatus, 'PENDIENTE')
  assert.equal(extraerViajeId('{"viajeId":"VJ-9","sello":"X"}'), 'VJ-9')
  assert.equal(extraerViajeId('https://chofer.example/v?viajeId=VJ-9'), 'VJ-9')
})

test('preaviso: guarda, lista, actualiza y el QR devuelve el sello esperado', async () => {
  const repo = memoryRepo()
  await withEnv({ PATIO_SESSION_SECRET: SECRET, PATIO_INTEGRATION_KEY: KEY }, async () => {
    const anon = await preavisoHandler(httpEvent('GET'), { repo })
    assert.equal(anon.statusCode, 401)

    const bad = await preavisoHandler(httpEvent('POST', { key: 'otra', body: { viajeId: 'VJ-1' } }), { repo })
    assert.equal(bad.statusCode, 401)
    assert.match(JSON.parse(bad.body).error, /X-Patio-Key/)

    const missing = await preavisoHandler(httpEvent('POST', { key: KEY, body: { placas: ['ABC'] } }), { repo })
    assert.equal(missing.statusCode, 400)

    const created = await preavisoHandler(httpEvent('POST', {
      key: KEY,
      body: {
        viajeId: 'VJ-100',
        placas: ['ABC123A', 'DEF456B'],
        cajas: ['CAJA1'],
        dolly: 'DOLLY1',
        sello: 'sello9',
        cartaPorte: 'cp-1',
        eta: '2026-09-30T19:00:00.000Z',
        yardaId: 'Chihuahua',
      },
    }), { repo, now: () => NOW })
    assert.equal(created.statusCode, 200)
    const createdBody = JSON.parse(created.body)
    assert.equal(createdBody.ok, true)
    assert.equal(createdBody.actualizada, false)
    assert.equal(createdBody.llegada.sello, 'SELLO9')
    assert.equal(created.headers['X-Patio-Auth'], 'integration-key')

    const otraYarda = await preavisoHandler(httpEvent('POST', {
      cookie: cookieFor(),
      body: { viajeId: 'VJ-200', placas: 'GHI789C', sello: 'OTRO', yardaId: 'calera' },
    }), { repo, now: () => NOW })
    assert.equal(otraYarda.statusCode, 200)
    assert.equal(JSON.parse(otraYarda.body).llegada.placas[0], 'GHI789C')

    const updated = await preavisoHandler(httpEvent('POST', {
      key: KEY,
      body: { viajeId: 'vj-100', sello: 'nuevo', placas: ['ABC123A'] },
    }), { repo, now: () => NOW })
    assert.equal(JSON.parse(updated.body).actualizada, true)
    assert.equal(repo.llegadas.length, 2)

    const list = JSON.parse((await preavisoHandler(httpEvent('GET', { cookie: cookieFor() }), { repo })).body)
    assert.equal(list.llegadas.length, 2)
    const chihuahua = JSON.parse((await preavisoHandler(httpEvent('GET', { key: KEY, query: { yarda: 'chihuahua' } }), { repo })).body)
    assert.equal(chihuahua.llegadas.length, 1)
    assert.equal(chihuahua.llegadas[0].sello, 'NUEVO')

    const qr = JSON.parse((await preavisoHandler(httpEvent('GET', {
      key: KEY,
      query: { q: '{"viajeId":"VJ-100"}' },
    }), { repo })).body)
    assert.equal(qr.match.selloEsperado, 'NUEVO')
    assert.equal(qr.match.viajeId, 'VJ-100')
    assert.equal(qr.match.dolly, 'DOLLY1')

    const url = JSON.parse((await preavisoHandler(httpEvent('GET', {
      cookie: cookieFor(),
      query: { viajeId: 'https://chofer.example/llegada?viajeId=VJ-200' },
    }), { repo })).body)
    assert.equal(url.match.yardaId, 'calera')
    assert.equal(url.match.selloEsperado, 'OTRO')

    const none = JSON.parse((await preavisoHandler(httpEvent('GET', { key: KEY, query: { q: 'NO-EXISTE' } }), { repo })).body)
    assert.equal(none.match, null)
  })
})

test('entrada con viajeId marca la llegada como recibida', async () => {
  const repo = memoryRepo()
  await withEnv({ PATIO_SESSION_SECRET: SECRET, PATIO_INTEGRATION_KEY: null }, async () => {
    await preavisoHandler(httpEvent('POST', {
      cookie: cookieFor(),
      body: { viajeId: 'VJ-300', sello: 'ABC', placas: ['ABC123A'], yardaId: 'chihuahua' },
    }), { repo, now: () => NOW })
    const saved = await createMovimientoHandler(httpEvent('POST', {
      cookie: cookieFor(),
      body: {
        id: 'mov-entrada-1',
        tipo: 'entrada',
        equipoId: 'eq-1',
        placa: 'ABC123A',
        viajeId: 'VJ-300',
        fechaHora: NOW.toISOString(),
        kilometros: 10,
      },
    }), { repo })
    assert.equal(saved.statusCode, 200, saved.body)
    const mov = JSON.parse(saved.body).movimiento
    assert.equal(mov.viajeId, 'VJ-300')
    const lista = JSON.parse((await preavisoHandler(httpEvent('GET', { cookie: cookieFor() }), { repo })).body)
    assert.equal(lista.llegadas.length, 0)
    const match = JSON.parse((await preavisoHandler(httpEvent('GET', { cookie: cookieFor(), query: { q: 'VJ-300' } }), { repo })).body)
    assert.equal(match.match.estatus, 'RECIBIDA')
  })
})

test('sin PATIO_SESSION_SECRET ni llave el preaviso sigue en modo opcional', async () => {
  const repo = memoryRepo()
  await withEnv({ PATIO_SESSION_SECRET: null, PATIO_INTEGRATION_KEY: null }, async () => {
    const res = await preavisoHandler(httpEvent('POST', { body: { viajeId: 'LIBRE', sello: 'S' } }), { repo, now: () => NOW })
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['X-Patio-Auth'], 'optional')
  })
})

test('Frotcom sin credenciales es dry-run vacío; con GPS escribe las dos alertas', async () => {
  const repo = memoryRepo()
  repo.movimientos.push(
    {
      id: 'm1',
      tipo: 'entrada',
      equipoId: 'eq-1',
      placa: 'ABC123',
      yardaId: 'chihuahua',
      horaServidor: '2026-09-30T18:10:00.000Z',
    },
    {
      id: 'm2',
      tipo: 'salida',
      equipoId: 'eq-3',
      placa: 'OUT123',
      yardaId: 'chihuahua',
      horaServidor: '2026-09-30T18:05:00.000Z',
    },
  )
  const geo = { yardaId: 'chihuahua', lat: 28.635, lng: -106.089, radioMetros: 1000 }
  assert.ok(distanciaMetros(geo.lat, geo.lng, geo.lat, geo.lng) < 1)
  assert.equal(posicionEnGeocerca({ lat: geo.lat, lng: geo.lng }, geo), true)
  assert.equal(posicionEnGeocerca({ lat: 30, lng: -106 }, geo), false)

  const posiciones = [
    { unidadId: 'eq-1', placa: 'ABC123', lat: geo.lat, lng: geo.lng, hora: '2026-09-30T18:00:00.000Z' },
    { unidadId: 'eq-2', placa: 'SIN999', lat: geo.lat, lng: geo.lng, hora: '2026-09-30T18:00:00.000Z' },
  ]
  const propuestas = conciliarGpsConMovimientos({ posiciones, movimientos: repo.movimientos, geocercas: [geo], ahora: NOW })
  assert.deepEqual(propuestas.map((item) => item.tipo).sort(), ['MOV_NO_REGISTRADO', 'SIN_CONFIRMACION_GPS'])

  await withEnv({ PATIO_SESSION_SECRET: SECRET, PATIO_INTEGRATION_KEY: KEY }, async () => {
    const seco = await frotcomHandler(httpEvent('POST', { key: KEY, body: {} }), { repo, env: {}, now: () => NOW })
    assert.equal(seco.statusCode, 200)
    const secoBody = JSON.parse(seco.body)
    assert.equal(secoBody.ok, true)
    assert.equal(secoBody.dryRun, true)
    assert.deepEqual(secoBody.alertas, [])
    assert.match(secoBody.mensaje, /FROTCOM_API_URL/)
    assert.equal(repo.avisos.length, 0)

    const cron = await frotcomHandler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ next_run: '2026-09-30T18:30:00.000Z' }),
    }, { repo, env: {}, now: () => NOW })
    assert.equal(cron.statusCode, 200)
    assert.equal(JSON.parse(cron.body).dryRun, true)

    const provider = {
      id: 'frotcom',
      nombre: 'Frotcom',
      configurado: true,
      async ultimasPosiciones() {
        return { posiciones, dryRun: false, mensaje: '' }
      },
    }
    const live = await frotcomHandler(httpEvent('POST', { key: KEY, body: {} }), {
      repo,
      env: {
        FROTCOM_API_URL: 'https://frotcom.example/api',
        FROTCOM_TOKEN: 'token',
        PATIO_GEOCERCAS_JSON: JSON.stringify([geo]),
      },
      provider,
      now: () => NOW,
    })
    assert.equal(live.statusCode, 200, live.body)
    const liveBody = JSON.parse(live.body)
    assert.equal(liveBody.ok, true)
    assert.equal(liveBody.dryRun, false)
    assert.equal(liveBody.alertas.length, 2)
    assert.equal(repo.avisos.length, 2)
    const tipos = repo.avisos.map((row) => rowToAvisoLog(row).tipo).sort()
    assert.deepEqual(tipos, ['MOV_NO_REGISTRADO', 'SIN_CONFIRMACION_GPS'])
  })

  const stub = proveedorGPS({})
  assert.equal(stub.configurado, false)
  const lectura = await stub.ultimasPosiciones()
  assert.equal(lectura.dryRun, true)
  assert.deepEqual(lectura.posiciones, [])
  assert.deepEqual(normalizarPosiciones({
    positions: [{ vehicleId: 'u1', plate: 'AAA111', latitude: 1, longitude: 2, date: '2026-09-30T18:00:00.000Z' }],
  }), [{
    unidadId: 'u1',
    placa: 'AAA111',
    lat: 1,
    lng: 2,
    hora: '2026-09-30T18:00:00.000Z',
    proveedor: 'frotcom',
  }])
})

test('CSV de costos OT filtra fechas y exige sesión o llave', async () => {
  const repo = memoryRepo()
  repo.ots.push(
    {
      id: 'ot-1',
      folio: 'OT-2026-0001',
      unidadId: 'eq-1',
      proveedorId: 'Taller, Norte',
      fechaLiberada: '2026-09-30T18:00:00.000Z',
      costoRefacciones: 100,
      costoManoObra: 40,
      costoExterno: null,
      activo: 'SI',
    },
    {
      id: 'ot-2',
      folio: 'OT-2026-0002',
      unidadId: 'eq-2',
      proveedorId: 'Externo',
      fechaEntradaTaller: '2026-08-01T18:00:00.000Z',
      costoExterno: 10,
      activo: 'SI',
    },
    {
      id: 'ot-3',
      folio: 'OT-2026-0003',
      unidadId: 'eq-3',
      fechaLiberada: '2026-09-15T18:00:00.000Z',
      costoEstimado: 5,
      activo: 'NO',
    },
    {
      id: 'ot-4',
      folio: 'OT-2026-0004',
      unidadId: 'eq-4',
      proveedorId: 'Interno',
      fechaLiberada: '2026-09-15T18:00:00.000Z',
      costoEstimado: 80,
      activo: 'SI',
    },
  )
  const filas = filasCostoOt(repo.ots, { desde: '2026-09-01', hasta: '2026-09-30' })
  assert.deepEqual(filas.map((row) => [row.otFolio, row.concepto, row.importe]), [
    ['OT-2026-0004', 'estimado', 80],
    ['OT-2026-0001', 'mano de obra', 40],
    ['OT-2026-0001', 'refacciones', 100],
  ])
  assert.match(costosOtToCsv(filas), /"Taller, Norte"/)
  assert.match(costosOtToCsv(filas).split('\n')[0], /^unidad,otFolio,fecha,concepto,importe,proveedor$/)

  await withEnv({ PATIO_SESSION_SECRET: SECRET, PATIO_INTEGRATION_KEY: KEY }, async () => {
    const denied = await erpHandler(httpEvent('GET', { query: { desde: '2026-09-01', hasta: '2026-09-30' } }), { repo })
    assert.equal(denied.statusCode, 401)
    const badDate = await erpHandler(httpEvent('GET', { key: KEY, query: { desde: '30-09-2026' } }), { repo })
    assert.equal(badDate.statusCode, 400)
    const res = await erpHandler(httpEvent('GET', {
      cookie: cookieFor('admin'),
      query: { desde: '2026-09-01', hasta: '2026-09-30' },
    }), { repo })
    assert.equal(res.statusCode, 200)
    assert.match(res.headers['Content-Type'], /text\/csv/)
    assert.match(res.headers['Content-Disposition'], /costos-ot-2026-09-01_2026-09-30\.csv/)
    const csv = res.body.replace(/^\uFEFF/, '')
    const lines = csv.trim().split('\n')
    assert.equal(lines[0], 'unidad,otFolio,fecha,concepto,importe,proveedor')
    assert.equal(lines.length, 4)
    assert.match(csv, /eq-1,OT-2026-0001,2026-09-30,refacciones,100,"Taller, Norte"/)
    assert.doesNotMatch(csv, /OT-2026-0002/)
    assert.doesNotMatch(csv, /OT-2026-0003/)
  })
})

test('lectura de movimientos cae a A:AI si AJ no existe en la cuadrícula', async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  const saKey = await exportPKCS8(privateKey)
  const fila = movimientoToRow({ id: 'e1', tipo: 'entrada', equipoId: 'eq', placa: 'ABC123A', viajeId: 'VJ-1' }).slice(0, 35)
  const urls = []
  const repo = createSheetsRepo({
    email: 'sa@test.iam.gserviceaccount.com',
    privateKey: saKey,
    spreadsheetId: 'sheet-test',
    fetch: async (url, init = {}) => {
      const u = String(url)
      urls.push(u)
      if (u === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'sa-token', expires_in: 3600 }), { status: 200 })
      }
      if (decodeURIComponent(u).includes('Movimientos!A2:AJ')) {
        return new Response('Range exceeds grid limits', { status: 400 })
      }
      if (decodeURIComponent(u).includes('Movimientos!A2:AI')) {
        return new Response(JSON.stringify({ values: [fila] }), { status: 200 })
      }
      if (u.includes(':append') && decodeURIComponent(u).includes('Movimientos!A:AJ')) {
        return new Response('Range exceeds grid limits', { status: 400 })
      }
      if (u.includes(':append') && decodeURIComponent(u).includes('Movimientos!A:AI')) {
        const values = JSON.parse(init.body).values
        assert.equal(values[0].length, 35)
        return new Response(JSON.stringify({}), { status: 200 })
      }
      throw new Error(`fetch inesperado ${u}`)
    },
  })
  const list = await repo.listMovimientos()
  assert.equal(list[0].id, 'e1')
  assert.equal(list[0].viajeId, undefined)
  await repo.appendMovimiento(movimientoToRow({ id: 'e2', tipo: 'entrada', equipoId: 'eq2', viajeId: 'VJ-2' }))
  assert.ok(urls.some((url) => decodeURIComponent(url).includes('Movimientos!A:AI')))
})

test('migración Fase 5 en seco no borra filas', () => {
  const result = spawnSync(process.execPath, ['scripts/migrate-fase5-sheet.mjs', '--dry-run'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: '',
      PATIO_SPREADSHEET_ID: '',
    },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /dry-run/)
  assert.match(result.stdout, /LlegadasEsperadas/)
  assert.match(result.stdout, /viajeId/)
  assert.match(result.stdout, /AJ/)
  assert.match(result.stdout, /PENDIENTE/)
  assert.match(result.stdout, /no borra|No se usa/i)
})

let failed = 0
for (const item of tests) {
  try {
    await item.fn()
    console.log(`ok ${item.name}`)
  } catch (err) {
    failed++
    console.error(`FAIL ${item.name}`)
    console.error(err)
  }
}
if (failed) {
  console.error(`\n${failed} prueba(s) fallaron`)
  process.exit(1)
}
console.log(`\n${tests.length} pruebas Fase 5 ok`)
