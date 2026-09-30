#!/usr/bin/env node
/**
 * Pruebas Fase 0 — API de equipos y refrigeración (sin red real).
 * node scripts/test-fase0-equipos.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { exportPKCS8, generateKeyPair } from 'jose'

import { corsHeaders } from '../netlify/functions/lib/http.js'
import { SESSION_COOKIE, signSession } from '../netlify/functions/lib/session.js'
import { createEquiposService } from '../netlify/functions/lib/equiposService.js'
import { handler as equiposHandler } from '../netlify/functions/equipos.js'
import { handler as refrigeracionHandler } from '../netlify/functions/refrigeracion.js'
import { handler as createMovimiento } from '../netlify/functions/movimientos-create.js'
import {
  EQUIPOS_APPEND_RANGE,
  EQUIPOS_COLUMNS,
  EQUIPOS_READ_RANGE,
  REFRIGERACION_APPEND_RANGE,
  REFRIGERACION_COLUMNS,
  REFRIGERACION_READ_RANGE,
  createSheetsRepo,
  equipoToRow,
  findOpenEntradaIn,
  refrigeracionToRow,
  rowToEquipo,
  rowToMovimiento,
  rowToRefrigeracion,
} from '../netlify/functions/lib/sheetsRepo.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const SECRET = 'test-secret-equipos-0123456789abcd'
const NOW = new Date('2026-09-30T18:00:00.000Z')
const CREADO = '2026-01-02T00:00:00.000Z'

const admin = {
  email: 'admin@camircapital.com',
  rol: 'admin',
  permisos: { equipos: true, entrada: true, salida: true, parado: true, baja: true },
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

function notFound(id) {
  const err = new Error(`No se encontró ${id}.`)
  err.status = 404
  err.code = 'NOT_FOUND'
  return err
}

function memoryRepo() {
  const equipos = []
  const refrigeracion = []
  const movimientos = []
  const auditoria = []
  let appendsEquipo = 0
  let appendsRefri = 0
  return {
    equipos,
    refrigeracion,
    movimientos,
    auditoria,
    get appendsEquipo() {
      return appendsEquipo
    },
    get appendsRefri() {
      return appendsRefri
    },
    async listEquipos() {
      return equipos.map(rowToEquipo).filter(Boolean)
    },
    async appendEquipo(row) {
      appendsEquipo += 1
      equipos.push(row.slice())
    },
    async updateEquipoById(id, row) {
      const idx = equipos.findIndex((item) => String(item[0] ?? '').trim() === String(id).trim())
      if (idx < 0) throw notFound(id)
      equipos[idx] = row.slice()
      return { rowNumber: idx + 2 }
    },
    async clearEquipoById(id) {
      const idx = equipos.findIndex((item) => String(item[0] ?? '').trim() === String(id).trim())
      if (idx < 0) throw notFound(id)
      equipos[idx] = Array(EQUIPOS_COLUMNS.length).fill('')
      return { rowNumber: idx + 2 }
    },
    async listRefrigeracion() {
      return refrigeracion.map(rowToRefrigeracion).filter(Boolean)
    },
    async appendRefrigeracion(row) {
      appendsRefri += 1
      refrigeracion.push(row.slice())
    },
    async updateRefrigeracionById(id, row) {
      const idx = refrigeracion.findIndex((item) => String(item[0] ?? '').trim() === String(id).trim())
      if (idx < 0) throw notFound(id)
      refrigeracion[idx] = row.slice()
      return { rowNumber: idx + 2 }
    },
    async clearRefrigeracionById(id) {
      const idx = refrigeracion.findIndex((item) => String(item[0] ?? '').trim() === String(id).trim())
      if (idx < 0) throw notFound(id)
      refrigeracion[idx] = Array(REFRIGERACION_COLUMNS.length).fill('')
      return { rowNumber: idx + 2 }
    },
    async listMovimientos() {
      return movimientos.map(rowToMovimiento).filter(Boolean)
    },
    async findMovimientoById(id) {
      const want = String(id ?? '').trim()
      const all = await this.listMovimientos()
      return all.find((item) => String(item.id) === want) ?? null
    },
    async findOpenEntrada(equipoId) {
      return findOpenEntradaIn(await this.listMovimientos(), equipoId)
    },
    async appendMovimiento(row) {
      movimientos.push(row.slice())
    },
    async appendAuditoria(entry) {
      auditoria.push(entry)
      return 'audit-id'
    },
  }
}

function service(repo = memoryRepo()) {
  return { svc: createEquiposService(repo, { now: () => NOW }), repo }
}

function cookieFor(permisos, email = 'guardia@camircapital.com', rol = 'guardia') {
  const token = signSession({ email, rol, permisos, dispositivoId: 'ipad-1' }, SECRET)
  return `${SESSION_COOKIE}=${token}`
}

function httpEvent(method, { cookie = '', body, query, headers = {} } = {}) {
  return {
    httpMethod: method,
    headers: { ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? '' : JSON.stringify(body),
    queryStringParameters: query ?? null,
  }
}

test('round-trip A:I de Equipos y Refrigeración', () => {
  assert.equal(EQUIPOS_COLUMNS.length, 9)
  assert.equal(REFRIGERACION_COLUMNS.length, 9)
  assert.equal(EQUIPOS_READ_RANGE, 'Equipos!A2:I')
  assert.equal(EQUIPOS_APPEND_RANGE, 'Equipos!A:I')
  assert.equal(REFRIGERACION_READ_RANGE, 'Refrigeracion!A2:I')
  assert.equal(REFRIGERACION_APPEND_RANGE, 'Refrigeracion!A:I')
  assert.equal(EQUIPOS_COLUMNS.indexOf('placa'), 2)
  assert.equal(REFRIGERACION_COLUMNS.indexOf('horometro'), 5)
  assert.equal(REFRIGERACION_COLUMNS[5], 'horometro')

  assert.equal(rowToEquipo(null), null)
  assert.equal(rowToEquipo(['', 'camion', 'ABC123']), null)
  assert.equal(rowToEquipo(['eq-1', 'camion', '']), null)
  assert.equal(rowToRefrigeracion(null), null)
  assert.equal(rowToRefrigeracion(['rf-1', 'TK', 'SB', '']), null)
  assert.equal(rowToRefrigeracion(['', 'TK', 'SB', 'ACT-1']), null)

  const equipo = {
    id: 'eq-1',
    tipo: 'caja',
    placa: 'ABC123A',
    numeroEconomico: 'E-10',
    marca: 'Kenworth',
    modelo: 'T680',
    notas: 'patio norte',
    creadoEn: CREADO,
    operadorAsignado: 'Luis Pérez',
  }
  const row = equipoToRow(equipo)
  assert.equal(row.length, 9)
  assert.deepEqual(rowToEquipo(row), equipo)
  const vacio = rowToEquipo(['eq-2', '', 'ABC', '', '', '', '', CREADO, ''])
  assert.equal(vacio.tipo, 'camion')
  assert.equal(vacio.numeroEconomico, 'ABC')
  assert.equal(vacio.marca, undefined)

  const refri = {
    id: 'rf-1',
    marca: 'Thermo King',
    modelo: 'SB-210',
    numeroActivo: 'ACT-1',
    economicoMontado: 'R-220',
    horometro: 12.5,
    estatus: 'taller',
    notas: 'servicio',
    creadoEn: CREADO,
  }
  const rowR = refrigeracionToRow(refri)
  assert.equal(rowR.length, 9)
  assert.equal(rowR[5], 12.5)
  assert.deepEqual(rowToRefrigeracion(rowR), refri)
  const cero = refrigeracionToRow({ ...refri, horometro: 0, notas: undefined })
  assert.equal(cero[5], 0)
  assert.equal(rowToRefrigeracion(cero).horometro, 0)
  const nulo = refrigeracionToRow({ ...refri, horometro: null })
  assert.equal(nulo[5], '')
  assert.equal(rowToRefrigeracion(nulo).horometro, null)
  const base = rowToRefrigeracion(['rf-2', '', '', 'ACT-2', '', '', '', '', CREADO])
  assert.equal(base.estatus, 'operando')
  assert.equal(base.horometro, null)
  assert.equal(base.notas, undefined)
})

test('alta y cambio por id: no hay segundo append ni match por placa', async () => {
  const { svc, repo } = service()
  const first = await svc.guardarEquipo(admin, { id: 'eq-1', placa: ' abc123 ', tipo: 'Caja', numeroEconomico: ' e-10 ' })
  assert.equal(first.created, true)
  assert.equal(first.equipo.placa, 'ABC123')
  assert.equal(first.equipo.tipo, 'caja')
  assert.equal(first.equipo.numeroEconomico, 'E-10')
  assert.equal(first.equipo.creadoEn, NOW.toISOString())

  const second = await svc.guardarEquipo(admin, { id: 'eq-1', placa: 'xyz789', tipo: 'dolly' })
  assert.equal(second.created, false)
  assert.equal(second.equipo.placa, 'XYZ789')
  assert.equal(second.equipo.tipo, 'dolly')
  assert.equal(second.equipo.creadoEn, NOW.toISOString())
  assert.equal(repo.appendsEquipo, 1)
  assert.equal(repo.equipos.filter((row) => String(row[0]).trim()).length, 1)

  const otra = await svc.guardarEquipo(admin, { id: 'eq-2', placa: 'XYZ789' })
  assert.equal(otra.created, true)
  assert.equal(repo.appendsEquipo, 2)
  assert.equal(repo.equipos[0][2], 'XYZ789')
  assert.equal(repo.equipos[1][0], 'eq-2')

  const sinTipo = await svc.guardarEquipo(admin, { id: 'eq-3', placa: 'def456' })
  assert.equal(sinTipo.equipo.tipo, 'camion')
  assert.equal(sinTipo.equipo.numeroEconomico, 'DEF456')
  const conserva = await svc.guardarEquipo(admin, { id: 'eq-3', placa: 'def456', marca: 'Volvo' })
  assert.equal(conserva.equipo.tipo, 'camion')
  assert.equal(conserva.equipo.marca, 'Volvo')
  assert.equal(conserva.equipo.creadoEn, NOW.toISOString())

  const tipo = await svc.guardarEquipo(admin, { id: 'eq-x', placa: 'AAA111', tipo: 'trailer' }).catch((err) => err)
  assert.equal(tipo.status, 400)
  assert.equal(tipo.code, 'TIPO')
  const placa = await svc.guardarEquipo(admin, { id: 'eq-y', placa: '   ' }).catch((err) => err)
  assert.equal(placa.status, 400)
  assert.equal(placa.code, 'PLACA')
  const id = await svc.guardarEquipo(admin, { placa: 'ABC123' }).catch((err) => err)
  assert.equal(id.status, 400)
  assert.equal(id.code, 'ID')

  assert.equal(repo.auditoria.some((item) => item.accion === 'crear_equipo' && item.entidad === 'Equipo' && item.entidadId === 'eq-1'), true)
  assert.equal(repo.auditoria.some((item) => item.accion === 'actualizar_equipo' && item.entidadId === 'eq-1'), true)
})

test('refrigeración: alta, cambio del mismo id y horómetro', async () => {
  const { svc, repo } = service()
  const first = await svc.guardarRefrigeracion(admin, {
    id: 'rf-1',
    numeroActivo: ' act-1 ',
    economicoMontado: ' r-220 ',
    estatus: 'Refacción',
    horometro: '15.5',
    creadoEn: CREADO,
  })
  assert.equal(first.created, true)
  assert.equal(first.refrigeracion.numeroActivo, 'ACT-1')
  assert.equal(first.refrigeracion.economicoMontado, 'R-220')
  assert.equal(first.refrigeracion.estatus, 'refaccion')
  assert.equal(first.refrigeracion.horometro, 15.5)
  assert.equal(first.refrigeracion.creadoEn, CREADO)

  const second = await svc.guardarRefrigeracion(admin, { id: 'rf-1', numeroActivo: 'act-1', estatus: 'operando' })
  assert.equal(second.created, false)
  assert.equal(second.refrigeracion.creadoEn, CREADO)
  assert.equal(second.refrigeracion.estatus, 'operando')
  assert.equal(second.refrigeracion.horometro, 15.5)
  assert.equal(repo.appendsRefri, 1)

  const cero = await svc.guardarRefrigeracion(admin, { id: 'rf-0', numeroActivo: 'Z', horometro: 0 })
  assert.equal(cero.refrigeracion.horometro, 0)
  assert.equal(cero.refrigeracion.estatus, 'operando')

  const malo = await svc.guardarRefrigeracion(admin, { id: 'rf-x', numeroActivo: 'A', horometro: 'no' }).catch((err) => err)
  assert.equal(malo.status, 400)
  assert.equal(malo.code, 'HOROMETRO')
  const falta = await svc.guardarRefrigeracion(admin, { id: 'rf-y' }).catch((err) => err)
  assert.equal(falta.status, 400)
  assert.equal(falta.code, 'ACTIVO')
  assert.equal(repo.auditoria.some((item) => item.accion === 'crear_refrigeracion' && item.entidad === 'Refrigeracion'), true)
  assert.equal(repo.auditoria.some((item) => item.accion === 'actualizar_refrigeracion' && item.entidadId === 'rf-1'), true)
})

test('DELETE deja en blanco solo la fila del id', async () => {
  const { svc, repo } = service()
  await svc.guardarEquipo(admin, { id: 'eq-1', placa: 'AAA111', tipo: 'camion' })
  await svc.guardarEquipo(admin, { id: 'eq-2', placa: 'BBB222', tipo: 'caja' })
  await svc.guardarRefrigeracion(admin, { id: 'rf-1', numeroActivo: 'A1', horometro: 4 })
  await svc.guardarRefrigeracion(admin, { id: 'rf-2', numeroActivo: 'B2', horometro: 8 })

  const deleted = await svc.eliminarEquipo(admin, 'eq-1')
  assert.equal(deleted.id, 'eq-1')
  assert.equal(repo.equipos.length, 2)
  assert.deepEqual(repo.equipos[0], Array(EQUIPOS_COLUMNS.length).fill(''))
  assert.equal(repo.equipos[1][0], 'eq-2')
  assert.equal(repo.equipos[1][2], 'BBB222')
  assert.deepEqual((await svc.listarEquipos()).map((item) => item.id), ['eq-2'])

  await svc.eliminarRefrigeracion(admin, 'rf-1')
  assert.deepEqual(repo.refrigeracion[0], Array(REFRIGERACION_COLUMNS.length).fill(''))
  assert.equal(repo.refrigeracion[1][0], 'rf-2')
  assert.equal(repo.refrigeracion[1][5], 8)
  assert.deepEqual((await svc.listarRefrigeracion()).map((item) => item.id), ['rf-2'])
  assert.equal(repo.auditoria.some((item) => item.accion === 'eliminar_equipo' && item.entidadId === 'eq-1'), true)
  assert.equal(repo.auditoria.some((item) => item.accion === 'eliminar_refrigeracion' && item.entidadId === 'rf-1'), true)
})

test('si Auditoria falla, el catálogo queda guardado', async () => {
  const repo = memoryRepo()
  repo.appendAuditoria = async () => {
    throw new Error('audit down')
  }
  const svc = createEquiposService(repo, { now: () => NOW })
  const saved = await svc.guardarEquipo(admin, { id: 'eq-a', placa: 'abc123' })
  assert.equal(saved.equipo.id, 'eq-a')
  assert.equal(repo.equipos.length, 1)
  const refri = await svc.guardarRefrigeracion(admin, { id: 'rf-a', numeroActivo: 'AA' })
  assert.equal(refri.refrigeracion.numeroActivo, 'AA')
})

test('aplicarHorometro parchea F si el activo es único; duplicados y faltantes no agregan filas', async () => {
  const { svc, repo } = service()
  const base = {
    marca: 'Thermo King',
    modelo: 'SB',
    economicoMontado: 'R-1',
    estatus: 'operando',
    creadoEn: CREADO,
  }
  repo.refrigeracion.push(refrigeracionToRow({ ...base, id: 'rf-1', numeroActivo: 'ACT-1', horometro: 10 }))
  repo.refrigeracion.push(refrigeracionToRow({ ...base, id: 'rf-2', numeroActivo: 'ACT-2', horometro: 3 }))
  repo.appendRefrigeracion = async () => {
    throw new Error('aplicarHorometro no debe agregar filas')
  }

  const unico = await svc.aplicarHorometro({
    refrigerada: { numeroActivoThermo: 'act-1', horometroThermo: 77 },
  })
  assert.equal(unico.updated, true)
  assert.equal(repo.refrigeracion.length, 2)
  assert.equal(repo.refrigeracion[0][REFRIGERACION_COLUMNS.indexOf('horometro')], 77)
  assert.equal(repo.refrigeracion[1][5], 3)
  assert.equal(repo.refrigeracion[0][3], 'ACT-1')

  const porId = await svc.aplicarHorometro({
    refrigerada: { refrigeracionId: 'rf-2', horometroThermo: 8 },
  })
  assert.equal(porId.updated, true)
  assert.equal(repo.refrigeracion[1][5], 8)
  assert.equal(repo.refrigeracion[0][5], 77)

  repo.refrigeracion.push(refrigeracionToRow({ ...base, id: 'rf-3', numeroActivo: 'ACT-1', horometro: 1 }))
  const antes = repo.refrigeracion.map((row) => row[5])
  const duplicado = await svc.aplicarHorometro({
    refrigerada: { numeroActivoThermo: 'ACT-1', horometroThermo: 100 },
  })
  assert.equal(duplicado.updated, false)
  assert.deepEqual(repo.refrigeracion.map((row) => row[5]), antes)
  assert.equal(repo.refrigeracion.length, 3)

  const ninguno = await svc.aplicarHorometro({
    refrigerada: { numeroActivoThermo: 'NO-EXISTE', horometroThermo: 9 },
  })
  assert.equal(ninguno.updated, false)
  assert.equal(repo.refrigeracion.length, 3)

  const idFalso = await svc.aplicarHorometro({
    refrigerada: { refrigeracionId: 'no-such', numeroActivoThermo: 'ACT-2', horometroThermo: 50 },
  })
  assert.equal(idFalso.updated, false)
  assert.equal(repo.refrigeracion[1][5], 8)

  const roto = memoryRepo()
  roto.listRefrigeracion = async () => {
    throw new Error('sin pestaña')
  }
  const silencio = await createEquiposService(roto).aplicarHorometro({
    refrigerada: { numeroActivoThermo: 'ACT-1', horometroThermo: 12 },
  })
  assert.equal(silencio.updated, false)
})

test('HTTP: cookie, llave, guardia, id vacío y el mismo id no duplica', async () => {
  await withEnv({ PATIO_SESSION_SECRET: SECRET, PATIO_INTEGRATION_KEY: 'llave-patio' }, async () => {
    const repo = memoryRepo()
    const deps = { repo }
    const adminCookie = cookieFor({ equipos: true, entrada: true, salida: true, parado: true, baja: true }, 'admin@camircapital.com', 'admin')
    const guardiaCookie = cookieFor({ equipos: false, entrada: true })

    const opt = await equiposHandler(httpEvent('OPTIONS'))
    assert.equal(opt.statusCode, 204)
    assert.match(opt.headers['Access-Control-Allow-Methods'], /DELETE/)
    assert.match(corsHeaders({ headers: {} })['Access-Control-Allow-Methods'], /DELETE/)
    assert.equal((await equiposHandler(httpEvent('PUT'))).statusCode, 405)

    assert.equal((await equiposHandler(httpEvent('POST', { body: { id: 'x', placa: 'ABC123' } }), deps)).statusCode, 401)
    assert.equal((await equiposHandler(httpEvent('DELETE', { query: { id: 'x' } }), deps)).statusCode, 401)
    assert.equal((await refrigeracionHandler(httpEvent('POST', { body: { id: 'r', numeroActivo: 'A' } }), deps)).statusCode, 401)
    assert.equal((await refrigeracionHandler(httpEvent('DELETE', { query: { id: 'r' } }), deps)).statusCode, 401)
    assert.equal(repo.appendsEquipo, 0)
    assert.equal(repo.appendsRefri, 0)

    const porLlave = await equiposHandler(httpEvent('GET', { headers: { 'X-Patio-Key': 'llave-patio' } }), deps)
    assert.equal(porLlave.statusCode, 200, porLlave.body)
    assert.deepEqual(JSON.parse(porLlave.body).equipos, [])
    const refriLlave = await refrigeracionHandler(httpEvent('GET', { headers: { 'X-Patio-Key': 'llave-patio' } }), deps)
    assert.equal(refriLlave.statusCode, 200, refriLlave.body)
    assert.deepEqual(JSON.parse(refriLlave.body).refrigeraciones, [])
    const postLlave = await equiposHandler(
      httpEvent('POST', { headers: { 'X-Patio-Key': 'llave-patio' }, body: { id: 'eq-key', placa: 'KEY111' } }),
      deps,
    )
    assert.equal(postLlave.statusCode, 401)
    assert.equal(repo.appendsEquipo, 0)

    const creado = await equiposHandler(
      httpEvent('POST', { cookie: adminCookie, body: { id: 'eq-1', placa: 'abc123', tipo: 'caja', numeroEconomico: 'e-1' } }),
      deps,
    )
    assert.equal(creado.statusCode, 200, creado.body)
    const body = JSON.parse(creado.body)
    assert.equal(body.created, true)
    assert.equal(body.equipo.placa, 'ABC123')
    const cambiado = await equiposHandler(
      httpEvent('POST', { cookie: adminCookie, body: { id: 'eq-1', placa: 'xyz789', tipo: 'dolly' } }),
      deps,
    )
    assert.equal(cambiado.statusCode, 200, cambiado.body)
    const changed = JSON.parse(cambiado.body)
    assert.equal(changed.created, false)
    assert.equal(changed.equipo.placa, 'XYZ789')
    assert.equal(changed.equipo.creadoEn, body.equipo.creadoEn)
    assert.equal(repo.appendsEquipo, 1)

    await equiposHandler(httpEvent('POST', { cookie: adminCookie, body: { id: 'eq-2', placa: 'BBB222' } }), deps)
    const del = await equiposHandler(httpEvent('DELETE', { cookie: adminCookie, query: { id: 'eq-1' } }), deps)
    assert.equal(del.statusCode, 200, del.body)
    assert.deepEqual(JSON.parse(del.body), { ok: true, id: 'eq-1' })
    assert.deepEqual(repo.equipos[0], Array(EQUIPOS_COLUMNS.length).fill(''))
    assert.equal(repo.equipos[1][0], 'eq-2')
    assert.equal(repo.equipos[1][2], 'BBB222')

    const lista = await equiposHandler(httpEvent('GET', { cookie: adminCookie }), deps)
    assert.equal(lista.statusCode, 200)
    assert.deepEqual(JSON.parse(lista.body).equipos.map((item) => item.id), ['eq-2'])
    assert.equal(lista.headers['Cache-Control'], 'no-store')

    const sinId = await equiposHandler(httpEvent('POST', { cookie: adminCookie, body: { placa: 'CCC333' } }), deps)
    assert.equal(sinId.statusCode, 400)
    assert.equal(JSON.parse(sinId.body).code, 'ID')
    const sinIdDel = await equiposHandler(httpEvent('DELETE', { cookie: adminCookie, query: { id: '   ' } }), deps)
    assert.equal(sinIdDel.statusCode, 400)
    assert.equal(JSON.parse(sinIdDel.body).code, 'ID')

    const guardiaPost = await equiposHandler(
      httpEvent('POST', { cookie: guardiaCookie, body: { id: 'eq-g', placa: 'gua111' } }),
      deps,
    )
    assert.equal(guardiaPost.statusCode, 200, guardiaPost.body)
    assert.equal(JSON.parse(guardiaPost.body).created, true)
    const guardiaDel = await equiposHandler(httpEvent('DELETE', { cookie: guardiaCookie, query: { id: 'eq-g' } }), deps)
    assert.equal(guardiaDel.statusCode, 403)
    assert.match(JSON.parse(guardiaDel.body).error, /permiso/i)
    assert.equal(repo.equipos.find((row) => row[0] === 'eq-g')[2], 'GUA111')

    const guardiaRefri = await refrigeracionHandler(
      httpEvent('POST', { cookie: guardiaCookie, body: { id: 'rf-g', numeroActivo: 'act-g', horometro: 2 } }),
      deps,
    )
    assert.equal(guardiaRefri.statusCode, 200, guardiaRefri.body)
    assert.equal(JSON.parse(guardiaRefri.body).created, true)
    const guardiaRefriDel = await refrigeracionHandler(httpEvent('DELETE', { cookie: guardiaCookie, query: { id: 'rf-g' } }), deps)
    assert.equal(guardiaRefriDel.statusCode, 403)
    assert.equal(repo.refrigeracion.find((row) => row[0] === 'rf-g')[3], 'ACT-G')

    const paradoCookie = cookieFor({ equipos: false, entrada: false, salida: false, parado: true, baja: false })
    const paradoPost = await equiposHandler(
      httpEvent('POST', { cookie: paradoCookie, body: { id: 'eq-p', placa: 'par111' } }),
      deps,
    )
    assert.equal(paradoPost.statusCode, 200, paradoPost.body)
    const paradoRefri = await refrigeracionHandler(
      httpEvent('POST', { cookie: paradoCookie, body: { id: 'rf-p', numeroActivo: 'P' } }),
      deps,
    )
    assert.equal(paradoRefri.statusCode, 403)

    const refriUp = await refrigeracionHandler(
      httpEvent('POST', { cookie: adminCookie, body: { id: 'rf-g', numeroActivo: 'act-g2', horometro: 9 } }),
      deps,
    )
    assert.equal(refriUp.statusCode, 200, refriUp.body)
    assert.equal(JSON.parse(refriUp.body).created, false)
    assert.equal(repo.refrigeracion.filter((row) => String(row[0]).trim() === 'rf-g').length, 1)
  })
})

test('un movimiento nuevo parchea el horómetro; el idempotente no, y un fallo no tumba el alta', async () => {
  await withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    const repo = memoryRepo()
    repo.refrigeracion.push(
      refrigeracionToRow({
        id: 'rf-1',
        marca: 'Thermo King',
        modelo: 'SB',
        numeroActivo: 'ACT-1',
        economicoMontado: 'R-1',
        horometro: 10,
        estatus: 'operando',
        creadoEn: CREADO,
      }),
    )
    const cookie = cookieFor({ entrada: true, salida: true, equipos: false })
    const body = {
      id: 'mov-h1',
      tipo: 'entrada',
      equipoId: 'eq-1',
      placa: 'ABC123A',
      fechaHora: '2026-09-30T15:00:00.000Z',
      operador: 'Juan',
      llevaRefrigerada: true,
      refrigerada: { inocuidad: [], numeroActivoThermo: 'act-1', horometroThermo: 44 },
    }
    const res = await createMovimiento(httpEvent('POST', { cookie, body }), { repo })
    assert.equal(res.statusCode, 200, res.body)
    assert.equal(repo.refrigeracion.length, 1)
    assert.equal(repo.refrigeracion[0][5], 44)
    assert.equal(repo.appendsRefri, 0)

    const again = await createMovimiento(
      httpEvent('POST', {
        cookie,
        body: { ...body, refrigerada: { ...body.refrigerada, horometroThermo: 99 } },
      }),
      { repo },
    )
    assert.equal(again.statusCode, 200, again.body)
    assert.equal(JSON.parse(again.body).idempotent, true)
    assert.equal(repo.refrigeracion[0][5], 44)

    const roto = memoryRepo()
    roto.listRefrigeracion = async () => {
      throw new Error('sin pestaña')
    }
    const sigue = await createMovimiento(
      httpEvent('POST', {
        cookie,
        body: { ...body, id: 'mov-h2', equipoId: 'eq-2' },
      }),
      { repo: roto },
    )
    assert.equal(sigue.statusCode, 200, sigue.body)
    assert.equal(roto.movimientos.length, 1)
  })
})

test('sheetsRepo escribe una fila por id y nunca :clear ni A2:I', async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  const saKey = await exportPKCS8(privateKey)
  const grids = {
    Equipos: [EQUIPOS_COLUMNS.slice()],
    Refrigeracion: [REFRIGERACION_COLUMNS.slice()],
  }
  const urls = []

  function parseValues(url) {
    const decoded = decodeURIComponent(String(url))
    const marker = '/values/'
    const at = decoded.indexOf(marker)
    if (at < 0) return null
    let spec = decoded.slice(at + marker.length)
    const q = spec.indexOf('?')
    if (q >= 0) spec = spec.slice(0, q)
    const append = spec.endsWith(':append')
    if (append) spec = spec.slice(0, -':append'.length)
    const bang = spec.indexOf('!')
    return { sheet: spec.slice(0, bang), range: spec.slice(bang + 1), append, decoded }
  }

  function pad(row, width) {
    const out = Array(width).fill('')
    for (let i = 0; i < width; i++) out[i] = row?.[i] ?? ''
    return out
  }

  const fetchImpl = async (url, init = {}) => {
    const u = String(url)
    const method = init.method || 'GET'
    urls.push({ url: u, method })
    const ok = (obj) => new Response(JSON.stringify(obj), { status: 200 })
    if (u === 'https://oauth2.googleapis.com/token') return ok({ access_token: 'sa-token', expires_in: 3600 })
    const decoded = decodeURIComponent(u)
    if (decoded.includes(':clear') || decoded.includes('batchClear') || method === 'DELETE') {
      throw new Error(`clear prohibido ${decoded}`)
    }
    const parsed = parseValues(u)
    if (!parsed) throw new Error(`fetch inesperado ${method} ${decoded}`)
    if (parsed.sheet === 'Auditoria') return ok(method === 'GET' ? { values: [['id']] } : {})
    const grid = grids[parsed.sheet]
    const width = parsed.sheet === 'Equipos' ? EQUIPOS_COLUMNS.length : REFRIGERACION_COLUMNS.length
    if (!grid) throw new Error(`pestaña inesperada ${decoded}`)
    const write = method === 'PUT' || method === 'POST'
    if (write && /(?:Equipos|Refrigeracion)!A2:I(?!\d)/.test(decoded)) {
      throw new Error(`escritura A2:I prohibida ${decoded}`)
    }
    if (parsed.append) {
      const values = JSON.parse(init.body).values
      assert.equal(values.length, 1)
      grid.push(pad(values[0], width))
      return ok({})
    }
    if (method === 'GET' && parsed.range === 'A:A') return ok({ values: grid.map((row) => [row[0] ?? '']) })
    if (method === 'GET' && parsed.range === 'A2:I') return ok({ values: grid.slice(1).map((row) => pad(row, width)) })
    const single = parsed.range.match(/^A(\d+):I(\d+)$/)
    if (method === 'PUT' && single) {
      assert.equal(single[1], single[2])
      const values = JSON.parse(init.body).values
      assert.equal(values.length, 1)
      grid[Number(single[1]) - 1] = pad(values[0], width)
      return ok({})
    }
    throw new Error(`rango no soportado ${method} ${parsed.sheet}!${parsed.range}`)
  }

  const repo = createSheetsRepo({
    email: 'sa@test.iam.gserviceaccount.com',
    privateKey: saKey,
    spreadsheetId: 'sheet-test',
    fetch: fetchImpl,
  })
  const svc = createEquiposService(repo, { now: () => NOW })
  const creado = await svc.guardarEquipo(admin, { id: 'eq-1', placa: 'abc123', tipo: 'caja' })
  assert.equal(creado.created, true)
  const cambiado = await svc.guardarEquipo(admin, { id: 'eq-1', placa: 'xyz789', tipo: 'dolly' })
  assert.equal(cambiado.created, false)
  assert.equal(cambiado.equipo.placa, 'XYZ789')
  await svc.guardarEquipo(admin, { id: 'eq-2', placa: 'BBB222', tipo: 'camion' })
  await svc.eliminarEquipo(admin, 'eq-1')
  const equipos = await svc.listarEquipos()
  assert.deepEqual(equipos.map((item) => item.id), ['eq-2'])
  assert.equal(grids.Equipos[1][0], '')
  assert.equal(grids.Equipos[2][0], 'eq-2')
  assert.equal(grids.Equipos[2][2], 'BBB222')
  assert.equal(urls.filter((call) => call.method === 'POST' && decodeURIComponent(call.url).includes('Equipos!A:I:append')).length, 2)

  await svc.guardarRefrigeracion(admin, { id: 'rf-1', numeroActivo: 'ACT-1', horometro: 10 })
  await svc.guardarRefrigeracion(admin, { id: 'rf-2', numeroActivo: 'ACT-1', horometro: 4 })
  const putsAntes = urls.filter((call) => call.method === 'PUT' && decodeURIComponent(call.url).includes('Refrigeracion!')).length
  const appendsAntes = urls.filter((call) => call.method === 'POST' && decodeURIComponent(call.url).includes('Refrigeracion!A:I:append')).length
  const dup = await svc.aplicarHorometro({ refrigerada: { numeroActivoThermo: 'ACT-1', horometroThermo: 80 } })
  assert.equal(dup.updated, false)
  assert.equal(urls.filter((call) => call.method === 'PUT' && decodeURIComponent(call.url).includes('Refrigeracion!')).length, putsAntes)
  assert.equal(urls.filter((call) => call.method === 'POST' && decodeURIComponent(call.url).includes('Refrigeracion!A:I:append')).length, appendsAntes)

  await svc.guardarRefrigeracion(admin, { id: 'rf-3', numeroActivo: 'ACT-9', horometro: 1 })
  const parche = await svc.aplicarHorometro({ refrigerada: { numeroActivoThermo: 'act-9', horometroThermo: 60 } })
  assert.equal(parche.updated, true)
  const fila = grids.Refrigeracion.find((row) => row[0] === 'rf-3')
  assert.equal(fila[5], 60)
  assert.equal(urls.filter((call) => call.method === 'POST' && decodeURIComponent(call.url).includes('Refrigeracion!A:I:append')).length, appendsAntes + 1)

  const writes = urls.filter((call) => call.method === 'PUT' || (call.method === 'POST' && call.url.includes('/values/')))
  assert.ok(writes.length > 0)
  for (const call of writes) {
    const decoded = decodeURIComponent(call.url)
    assert.equal(decoded.includes(':clear'), false, decoded)
    assert.equal(decoded.includes('batchClear'), false, decoded)
    assert.doesNotMatch(decoded, /(?:Equipos|Refrigeracion)!A2:I(?!\d)/)
  }
  assert.ok(urls.some((call) => (call.method || 'GET') === 'GET' && decodeURIComponent(call.url).includes('Equipos!A2:I')))
  assert.ok(urls.some((call) => call.method === 'POST' && decodeURIComponent(call.url).includes('valueInputOption=RAW')))
  assert.ok(urls.some((call) => call.method === 'PUT' && /Equipos!A2:I2/.test(decodeURIComponent(call.url))))
})

test('el código no limpia pestañas y los redirects van antes del SPA', () => {
  for (const rel of [
    'netlify/functions/lib/equiposService.js',
    'netlify/functions/equipos.js',
    'netlify/functions/refrigeracion.js',
    'netlify/functions/lib/sheetsRepo.js',
    'netlify/functions/movimientos-create.js',
  ]) {
    const src = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /:clear|batchClear/)
  }
  const toml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8')
  const catchAll = toml.indexOf('from = "/*"')
  const equipos = toml.indexOf('from = "/api/equipos"')
  const refri = toml.indexOf('from = "/api/refrigeracion"')
  assert.ok(equipos !== -1 && equipos < catchAll)
  assert.ok(refri !== -1 && refri < catchAll)
  const pkg = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  assert.match(pkg, /test-fase0-equipos\.mjs/)
})

let failed = 0
for (const item of tests) {
  try {
    await item.fn()
    console.log(`✓ ${item.name}`)
  } catch (err) {
    failed++
    console.error(`✗ ${item.name}\n  ${err?.stack || err}`)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} pruebas OK`)
process.exit(failed ? 1 : 0)
