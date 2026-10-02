#!/usr/bin/env node
/**
 * Pruebas Fase 1 — OT, ETR, semáforo y bloqueo de salida (sin red real).
 * node scripts/test-fase1-ot.mjs
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { exportPKCS8, generateKeyPair } from 'jose'

import { SESSION_COOKIE, signSession } from '../netlify/functions/lib/session.js'
import { corsHeaders } from '../netlify/functions/lib/http.js'
import {
  ESTADO_UNIDAD_COLUMNS,
  OT_COLUMNS,
  OT_EVENTO_COLUMNS,
  columnLetter,
  createSheetsRepo,
  estadoUnidadToRow,
  findDataRowIndex,
  otEventoToRow,
  otToRow,
  rowToEstadoUnidad,
  rowToOt,
  rowToOtEvento,
  singleRowRange,
} from '../netlify/functions/lib/sheetsRepo.js'
import {
  MOTIVO_TRASLADO_TALLER,
  computeSemaforo,
  createOtService,
  puedeTransicion,
} from '../netlify/functions/lib/otService.js'
import { handler as otHandler } from '../netlify/functions/ot.js'
import { extractOtId, handler as otItemHandler } from '../netlify/functions/ot-item.js'
import { handler as tableroHandler } from '../netlify/functions/ot-tablero.js'
import { handler as gateHandler } from '../netlify/functions/gate-validar-salida.js'
import { handler as createMovimientoHandler } from '../netlify/functions/movimientos-create.js'
import { ApiError, isGateUnavailable, validarSalidaAntesDeGuardar } from '../src/lib/serverApi.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const SECRET = 'test-secret-fase1-ot-0123456789'
const NOW = new Date('2026-09-30T18:00:00.000Z')
const ETR_VERDE = '2026-10-05T18:00:00.000Z'
const ETR_AMARILLO = '2026-10-01T12:00:00.000Z'
const ETR_24H = '2026-10-01T18:00:00.000Z'
const ETR_ROJO = '2026-09-29T18:00:00.000Z'

const encargado = {
  email: 'Encargado@CamirCapital.com',
  rol: 'encargado_yarda',
  permisos: { entrada: true, salida: true, parado: true, baja: true },
  dispositivoId: 'ipad-yarda',
}
const patio = {
  email: 'patio@camircapital.com',
  rol: 'patio',
  permisos: { entrada: true, salida: true, parado: true, baja: false },
  dispositivoId: 'ipad-patio',
}
const guardia = {
  email: 'guardia@camircapital.com',
  rol: 'guardia',
  permisos: { entrada: true, salida: true, parado: false, baja: false },
  dispositivoId: 'ipad-caseta',
}
const guardiaParado = {
  email: 'guardia.patio@camircapital.com',
  rol: 'guardia',
  permisos: { entrada: true, salida: true, parado: true, baja: false },
}
const admin = {
  email: 'admin@camircapital.com',
  rol: 'admin',
  permisos: { entrada: true, salida: true, parado: true, baja: true },
}

function memoryRepo() {
  const ots = []
  const eventos = []
  const estados = []
  const auditoria = []
  return {
    ots,
    eventos,
    estados,
    auditoria,
    async listOrdenesTrabajo() {
      return ots.map(rowToOt).filter(Boolean)
    },
    async appendOrdenTrabajo(row) {
      ots.push(row.slice())
    },
    async updateOrdenTrabajoById(id, row) {
      const idx = ots.findIndex((item) => String(item[0]) === String(id))
      if (idx < 0) {
        const err = new Error(`no ${id}`)
        err.status = 404
        throw err
      }
      ots[idx] = row.slice()
      return { rowNumber: idx + 2, range: `OrdenesTrabajo!A${idx + 2}:AI${idx + 2}` }
    },
    async listOtEventos() {
      return eventos.map(rowToOtEvento).filter(Boolean)
    },
    async appendOtEvento(row) {
      eventos.push(row.slice())
    },
    async listEstadoUnidad() {
      return estados.map(rowToEstadoUnidad).filter(Boolean)
    },
    async appendEstadoUnidad(row) {
      estados.push(row.slice())
    },
    async updateEstadoUnidadById(id, row) {
      const idx = estados.findIndex((item) => String(item[0]) === String(id))
      if (idx < 0) {
        const err = new Error(`no estado ${id}`)
        err.status = 404
        throw err
      }
      estados[idx] = row.slice()
      return { rowNumber: idx + 2 }
    },
    async appendAuditoria(entry) {
      auditoria.push(entry)
      return 'audit'
    },
  }
}

function service(repo = memoryRepo()) {
  const svc = createOtService(repo, { now: () => NOW })
  return { svc, repo }
}

function baseOt(over = {}) {
  return {
    unidadId: 'eq-1',
    placa: 'ABC123A',
    yarda: 'chihuahua',
    tipo: 'CORRECTIVO',
    motivo: 'Falla de frenos',
    etr: ETR_VERDE,
    fotosAntesJson: ['https://fotos.example/1.jpg', 'https://fotos.example/2.jpg'],
    ...over,
  }
}

function cookieFor(user) {
  const token = signSession(
    { email: user.email, rol: user.rol, permisos: user.permisos, dispositivoId: user.dispositivoId || 'ipad' },
    SECRET,
  )
  return `${SESSION_COOKIE}=${token}`
}

function httpEvent(method, { cookie = '', body, query, path } = {}) {
  return {
    httpMethod: method,
    path,
    headers: cookie ? { cookie } : {},
    body: body === undefined ? '' : JSON.stringify(body),
    queryStringParameters: query || null,
  }
}

function withEnv(vars, fn) {
  const prev = {}
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key]
    if (vars[key] == null) delete process.env[key]
    else process.env[key] = vars[key]
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of Object.keys(prev)) {
        if (prev[key] == null) delete process.env[key]
        else process.env[key] = prev[key]
      }
    })
}

test('columnas Fase 1 y round-trip de OT, evento y estado', () => {
  assert.equal(OT_COLUMNS.length, 35)
  assert.equal(columnLetter(OT_COLUMNS.length - 1), 'AI')
  assert.equal(columnLetter(OT_EVENTO_COLUMNS.length - 1), 'H')
  assert.equal(columnLetter(ESTADO_UNIDAD_COLUMNS.length - 1), 'N')
  assert.deepEqual(OT_EVENTO_COLUMNS, ['id', 'otId', 'tipoEvento', 'valorAnterior', 'valorNuevo', 'motivo', 'usuarioEmail', 'horaServidor'])
  assert.deepEqual(ESTADO_UNIDAD_COLUMNS, [
    'unidadId', 'tipo', 'yarda', 'zona', 'slot', 'ubicacion', 'estatusOperativo', 'estatusCarga', 'desde', 'otAbiertaId', 'actualizadoEn',
    'clienteCarga', 'folioCarga', 'enganchadaA',
  ])
  assert.equal(OT_COLUMNS[0], 'id')
  assert.equal(OT_COLUMNS[14], 'etr')
  assert.equal(OT_COLUMNS[32], 'etrOriginal')
  assert.equal(OT_COLUMNS[33], 'etrMovimientosCount')
  assert.equal(OT_COLUMNS[34], 'activo')

  const row = otToRow({
    id: 'ot-1',
    folio: 'OT-2026-0001',
    unidadId: 'eq-1',
    unidadesRelacionadasJson: [{ unidadId: 'CAJA1', placa: 'CAJA1', tipo: 'caja' }],
    yarda: 'chihuahua',
    tipo: 'THERMO',
    motivo: 'no enfría',
    prioridad: 'ALTA',
    tallerTipo: 'EXTERNO',
    etr: ETR_VERDE,
    etrOriginal: ETR_VERDE,
    etrMovimientosCount: 2,
    estatus: 'ABIERTA',
    fotosAntesJson: ['https://a', 'https://b'],
    refaccionesJson: [{ sku: 'FIL-1', cantidad: 1 }],
    activo: 'SI',
    kmEntrada: 1000,
  })
  assert.equal(row.length, 35)
  const back = rowToOt(row)
  assert.equal(back.id, 'ot-1')
  assert.equal(back.tipo, 'THERMO')
  assert.equal(back.etrOriginal, ETR_VERDE)
  assert.equal(back.etrMovimientosCount, 2)
  assert.equal(back.kmEntrada, 1000)
  assert.equal(back.unidadesRelacionadasJson[0].placa, 'CAJA1')
  assert.equal(back.fotosAntesJson[1], 'https://b')
  assert.equal(back.refaccionesJson[0].sku, 'FIL-1')
  assert.equal(back.activo, 'SI')
  assert.equal(rowToOt(otToRow({ id: 'x', activo: 'NO' })).activo, 'NO')

  const ev = rowToOtEvento(otEventoToRow({
    id: 'ev-1', otId: 'ot-1', tipoEvento: 'ETR', valorAnterior: 'a', valorNuevo: 'b', motivo: 'porque', usuarioEmail: 'a@b.com', horaServidor: NOW.toISOString(),
  }))
  assert.equal(ev.tipoEvento, 'ETR')
  assert.equal(ev.motivo, 'porque')

  const est = rowToEstadoUnidad(estadoUnidadToRow({
    unidadId: 'eq-1', tipo: 'camion', yarda: 'calera', zona: 'N', slot: '3', ubicacion: 'andén 2',
    estatusOperativo: 'EN_MANTENIMIENTO', estatusCarga: 'vacio', desde: NOW.toISOString(), otAbiertaId: 'ot-1', actualizadoEn: NOW.toISOString(),
  }))
  assert.equal(est.estatusOperativo, 'EN_MANTENIMIENTO')
  assert.equal(est.slot, '3')
  assert.equal(est.otAbiertaId, 'ot-1')

  assert.equal(findDataRowIndex([['id'], ['ot-1'], ['ot-2']], 'ot-2'), 2)
  assert.equal(findDataRowIndex([['id'], ['ot-1']], 'id'), -1)
  assert.equal(singleRowRange('OrdenesTrabajo', 3, 35), 'OrdenesTrabajo!A3:AI3')
})

test('semáforo: en tiempo, ≤24 h, vencido y sin ETR', () => {
  assert.equal(computeSemaforo(ETR_VERDE, NOW).nivel, 'verde')
  assert.equal(computeSemaforo(ETR_VERDE, NOW).bucket, 'en_tiempo')
  assert.equal(computeSemaforo(ETR_AMARILLO, NOW).nivel, 'amarillo')
  assert.equal(computeSemaforo(ETR_AMARILLO, NOW).bucket, 'por_vencer')
  assert.equal(computeSemaforo(ETR_24H, NOW).nivel, 'amarillo')
  assert.equal(computeSemaforo(ETR_24H, NOW).horas, 24)
  const rojo = computeSemaforo(ETR_ROJO, NOW)
  assert.equal(rojo.nivel, 'rojo')
  assert.equal(rojo.bucket, 'vencido')
  assert.ok(rojo.horas < 0)
  assert.equal(computeSemaforo('', NOW).bucket, 'sin_etr')
  assert.equal(computeSemaforo('no-es-fecha', NOW).nivel, 'rojo')
})

test('abrir OT exige ETR, pasa la unidad a mantenimiento y enlaza si ya hay una', async () => {
  const { svc, repo } = service()
  const falta = await svc.createOT(encargado, baseOt({ etr: '' })).catch((err) => err)
  assert.equal(falta.status, 400)
  assert.match(falta.message, /ETR/)

  const unaFoto = await svc.createOT(encargado, baseOt({ fotosAntesJson: ['https://solo'] })).catch((err) => err)
  assert.equal(unaFoto.status, 400)

  const denegado = await svc.createOT(guardia, baseOt()).catch((err) => err)
  assert.equal(denegado.status, 403)

  const creada = await svc.createOT(guardiaParado, baseOt({ unidadId: 'eq-desde-parado' }))
  assert.equal(creada.ot.estatus, 'ABIERTA')
  assert.equal(creada.linked, false)
  assert.equal(creada.ot.reportadoPor, guardiaParado.email)

  const { ot, estado } = await svc.createOT(encargado, baseOt())
  assert.equal(ot.folio, 'OT-2026-0002')
  assert.equal(ot.etr, ETR_VERDE)
  assert.equal(ot.etrOriginal, ETR_VERDE)
  assert.equal(ot.etrMovimientosCount, 0)
  assert.equal(ot.activo, 'SI')
  assert.equal(estado.estatusOperativo, 'EN_MANTENIMIENTO')
  assert.equal(estado.otAbiertaId, ot.id)
  assert.ok(repo.eventos.map(rowToOtEvento).some((ev) => ev.valorNuevo === 'ABIERTA'))
  assert.ok(repo.eventos.map(rowToOtEvento).some((ev) => ev.valorNuevo === 'EN_MANTENIMIENTO'))

  const link = await svc.createOT(patio, baseOt({ motivo: 'otro intento', etr: ETR_AMARILLO }))
  assert.equal(link.linked, true)
  assert.equal(link.ot.id, ot.id)
  assert.equal(repo.ots.length, 2)
})

test('transiciones de estatus, LISTA y cierre a disponible', async () => {
  const { svc, repo } = service()
  const { ot } = await svc.createOT(encargado, baseOt())
  assert.equal(puedeTransicion('ABIERTA', 'EN_REPARACION'), true)
  assert.equal(puedeTransicion('CERRADA', 'ABIERTA'), false)

  const ilegal = await svc.updateEstatus(encargado, ot.id, { estatus: 'NO_EXISTE' }).catch((err) => err)
  assert.equal(ilegal.status, 400)

  await svc.updateEstatus(patio, ot.id, { estatus: 'DIAGNOSTICO' })
  await svc.updateEstatus(patio, ot.id, { estatus: 'ESPERA_REFACCION' })
  await svc.updateEstatus(patio, ot.id, { estatus: 'EN_REPARACION' })
  const lista = await svc.updateEstatus(encargado, ot.id, { estatus: 'LISTA' })
  assert.equal(lista.ot.estatus, 'LISTA')
  assert.equal(lista.ot.fechaLista, NOW.toISOString())
  assert.equal((await svc.listOTs({ unidadId: 'eq-1' })).find((item) => item.id === ot.id).estatus, 'LISTA')
  const listaEstado = repo.estados.map(rowToEstadoUnidad).find((item) => item.unidadId === 'eq-1')
  assert.equal(listaEstado.estatusOperativo, 'DISPONIBLE')

  const sinFotos = await svc.updateEstatus(admin, ot.id, { estatus: 'CERRADA' }).catch((err) => err)
  assert.equal(sinFotos.status, 400)
  assert.match(sinFotos.message, /fotos/)

  const cerrada = await svc.updateEstatus(admin, ot.id, {
    estatus: 'CERRADA',
    fotosDespuesJson: ['https://despues/1.jpg', 'https://despues/2.jpg'],
    notas: 'Cambio de balatas',
  })
  assert.equal(cerrada.ot.fechaLiberada, NOW.toISOString())
  assert.equal(cerrada.ot.fotosDespuesJson.length, 2)
  assert.equal(cerrada.estado.estatusOperativo, 'DISPONIBLE')
  assert.equal(cerrada.estado.otAbiertaId, '')

  const otra = await svc.updateEstatus(admin, ot.id, { estatus: 'ABIERTA' }).catch((err) => err)
  assert.equal(otra.status, 400)
  assert.match(otra.message, /cerrada/)
})

test('mover ETR exige motivo, congela el original y el guardia no puede', async () => {
  const { svc, repo } = service()
  const { ot } = await svc.createOT(encargado, baseOt())
  const guardiaConParado = await svc.updateEtr(guardiaParado, ot.id, { etr: ETR_AMARILLO, motivo: 'se retrasa la refacción' }).catch((err) => err)
  assert.equal(guardiaConParado.status, 403)
  assert.match(guardiaConParado.message, /ETR/)

  const sinMotivo = await svc.updateEtr(encargado, ot.id, { etr: ETR_AMARILLO, motivo: '  ' }).catch((err) => err)
  assert.equal(sinMotivo.status, 400)
  assert.match(sinMotivo.message, /motivo/)

  const moved = await svc.updateEtr(patio, ot.id, { etr: ETR_AMARILLO, motivo: 'se retrasa la refacción' })
  assert.equal(moved.ot.etr, ETR_AMARILLO)
  assert.equal(moved.ot.etrOriginal, ETR_VERDE)
  assert.equal(moved.ot.etrMovimientosCount, 1)
  const evento = repo.eventos.map(rowToOtEvento).find((ev) => ev.tipoEvento === 'ETR')
  assert.equal(evento.valorAnterior, ETR_VERDE)
  assert.equal(evento.valorNuevo, ETR_AMARILLO)
  assert.equal(evento.motivo, 'se retrasa la refacción')
  assert.equal(evento.usuarioEmail, patio.email)

  await svc.updateEtr(admin, ot.id, { etr: ETR_ROJO, motivo: 'el proveedor no llegó' })
  const otra = await svc.getOT(ot.id)
  assert.equal(otra.ot.etrMovimientosCount, 2)
  assert.equal(otra.ot.etrOriginal, ETR_VERDE)
})

test('daño y baja bloquean; abrir OT no borra el daño', async () => {
  const { svc } = service()
  await svc.registrarEstatusOperativo(encargado, { unidadId: 'eq-dano', estatusOperativo: 'DANADO_NO_OPERABLE', motivo: 'golpe en bastidor', yarda: 'calera' })
  const ot = await svc.createOT(encargado, baseOt({ unidadId: 'eq-dano', yarda: 'calera' }))
  assert.equal(ot.estado.estatusOperativo, 'DANADO_NO_OPERABLE')
  const bloqueo = await svc.validarSalida(guardia, { equipoId: 'eq-dano' })
  assert.equal(bloqueo.resultado, 'BLOQUEADO')

  await svc.registrarEstatusOperativo(admin, { unidadId: 'eq-baja', estatusOperativo: 'BAJA', motivo: 'siniestro total', yarda: 'chihuahua' })
  const baja = await svc.createOT(encargado, baseOt({ unidadId: 'eq-baja' })).catch((err) => err)
  assert.equal(baja.status, 409)
  const salidaBaja = await svc.validarSalida(guardia, { equipoId: 'eq-baja', placa: 'BAJA1' })
  assert.equal(salidaBaja.resultado, 'BLOQUEADO')
})

test('bloqueo de salida, traslado, autorización y auditoría sin duplicar', async () => {
  const { svc, repo } = service()
  const { ot } = await svc.createOT(encargado, baseOt({
    unidadesRelacionadasJson: [{ unidadId: 'CAJA9', placa: 'CAJA9', tipo: 'caja' }],
  }))
  const libre = await svc.validarSalida(guardia, { equipoId: 'eq-libre', placa: 'LIBRE1' })
  assert.equal(libre.resultado, 'PERMITIDO')

  const bloqueo = await svc.validarSalida(guardia, { equipoId: 'eq-1', placa: 'ABC123A' })
  assert.equal(bloqueo.resultado, 'BLOQUEADO')
  assert.equal(bloqueo.puedeAutorizar, false)
  assert.match(bloqueo.mensaje, /mantenimiento/i)

  const caja = await svc.validarSalida(guardia, { equipoId: 'tracto-2', placa: 'TRAC2', relacionados: [{ placa: 'CAJA9', tipo: 'caja' }] })
  assert.equal(caja.resultado, 'BLOQUEADO')

  const pide = await svc.validarSalida(encargado, { equipoId: 'eq-1' })
  assert.equal(pide.resultado, 'REQUIERE_AUTORIZACION')
  assert.equal(pide.puedeAutorizar, true)

  const corto = await svc.validarSalida(admin, { equipoId: 'eq-1', overrideMotivo: 'ok' })
  assert.equal(corto.resultado, 'REQUIERE_AUTORIZACION')

  const ok = await svc.validarSalida(encargado, { equipoId: 'eq-1', overrideMotivo: 'Sale a prueba de frenos con operador' })
  assert.equal(ok.resultado, 'PERMITIDO')
  assert.equal(ok.via, 'OVERRIDE')
  const overrides = () => repo.eventos.map(rowToOtEvento).filter((ev) => ev.tipoEvento === 'OVERRIDE_SALIDA')
  assert.equal(overrides().length, 1)
  assert.equal(overrides()[0].motivo, 'Sale a prueba de frenos con operador')
  assert.match(overrides()[0].valorNuevo, /PERMITIDO/)
  assert.equal(overrides()[0].usuarioEmail, 'encargado@camircapital.com')
  assert.equal(repo.auditoria.some((entry) => entry.accion === 'override_salida'), true)

  await svc.validarSalida(encargado, { equipoId: 'eq-1', overrideMotivo: 'Sale a prueba de frenos con operador' })
  assert.equal(overrides().length, 1)

  const traslado = await svc.validarSalida(guardia, { equipoId: 'eq-1', trasladoTallerExterno: true })
  assert.equal(traslado.resultado, 'PERMITIDO')
  assert.equal(traslado.via, MOTIVO_TRASLADO_TALLER)
  assert.ok(overrides().some((ev) => ev.motivo === MOTIVO_TRASLADO_TALLER))
  assert.equal(ot.folio.startsWith('OT-2026-'), true)
})

test('tablero agrupa por yarda y cuenta el semáforo', async () => {
  const { svc } = service()
  await svc.createOT(encargado, baseOt({ unidadId: 'a', etr: ETR_VERDE, yarda: 'chihuahua' }))
  await svc.createOT(encargado, baseOt({ unidadId: 'b', etr: ETR_AMARILLO, yarda: 'chihuahua' }))
  await svc.createOT(encargado, baseOt({ unidadId: 'c', etr: ETR_ROJO, yarda: 'calera' }))
  await svc.createOT(encargado, baseOt({ unidadId: 'd', etr: ETR_VERDE, yarda: 'calera' }))
  const cerrada = await svc.createOT(encargado, baseOt({ unidadId: 'e', etr: ETR_ROJO, yarda: 'calera' }))
  await svc.updateEstatus(admin, cerrada.ot.id, { estatus: 'CANCELADA', motivo: 'Prueba de tablero' })

  const tablero = await svc.tablero({})
  assert.equal(tablero.resumen.total, 4)
  assert.equal(tablero.resumen.verde, 2)
  assert.equal(tablero.resumen.amarillo, 1)
  assert.equal(tablero.resumen.rojo, 1)
  const calera = tablero.porYarda.find((grupo) => grupo.yarda === 'calera')
  assert.equal(calera.ordenes[0].semaforo.nivel, 'rojo')
  const solo = await svc.tablero({ yarda: 'chihuahua' })
  assert.equal(solo.resumen.total, 2)
  assert.ok(solo.estados.some((estado) => estado.unidadId === 'a' && estado.estatusOperativo === 'EN_MANTENIMIENTO'))
})

test('HTTP: OT, tablero, gate y salida bloqueada en movimientos', async () => {
  await withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    const { svc, repo } = service()
    const deps = { service: svc, repo }
    const cookie = cookieFor(encargado)
    assert.equal((await otHandler(httpEvent('OPTIONS'))).statusCode, 204)
    assert.match(corsHeaders({ headers: {} })['Access-Control-Allow-Methods'], /PATCH/)
    assert.equal((await otHandler(httpEvent('POST', { body: baseOt() }))).statusCode, 401)

    const created = await otHandler(httpEvent('POST', { cookie, body: baseOt() }), deps)
    assert.equal(created.statusCode, 200, created.body)
    const orden = JSON.parse(created.body).orden
    assert.equal(orden.folio, 'OT-2026-0001')

    const listed = await otHandler(httpEvent('GET', { cookie, query: { yarda: 'chihuahua' } }), deps)
    assert.equal(JSON.parse(listed.body).ordenes.length, 1)

    const sinMotivo = await otItemHandler(httpEvent('PATCH', {
      cookie,
      path: `/api/ot/${orden.id}`,
      body: { etr: ETR_AMARILLO },
    }), deps)
    assert.equal(sinMotivo.statusCode, 400, sinMotivo.body)
    assert.equal(extractOtId({ path: `/api/ot/${orden.id}` }), orden.id)

    const moved = await otItemHandler(httpEvent('PATCH', {
      cookie: cookieFor(patio),
      path: `/.netlify/functions/ot-item/${orden.id}`,
      body: { etr: ETR_AMARILLO, motivo: 'falta la pieza' },
    }), deps)
    assert.equal(moved.statusCode, 200, moved.body)
    assert.equal(JSON.parse(moved.body).orden.etrOriginal, ETR_VERDE)

    const tablero = await tableroHandler(httpEvent('GET', { cookie: cookieFor(guardia), query: { yarda: 'chihuahua' } }), deps)
    assert.equal(tablero.statusCode, 200, tablero.body)
    assert.equal(JSON.parse(tablero.body).tablero.resumen.amarillo, 1)

    const bloqueo = await gateHandler(httpEvent('POST', {
      cookie: cookieFor(guardia),
      body: { equipoId: 'eq-1', placa: 'ABC123A', relacionados: [] },
    }), deps)
    assert.equal(bloqueo.statusCode, 200)
    assert.equal(JSON.parse(bloqueo.body).resultado, 'BLOQUEADO')

    const antes = repo.eventos.length
    const pide = await gateHandler(httpEvent('POST', {
      cookie,
      body: { equipoId: 'eq-1', consultar: true },
    }), deps)
    assert.equal(JSON.parse(pide.body).resultado, 'REQUIERE_AUTORIZACION')
    assert.equal(repo.eventos.length, antes)

    const auth = await gateHandler(httpEvent('POST', {
      cookie,
      body: { equipoId: 'eq-1', overrideMotivo: 'Autorizo la salida a ruta con escolta' },
    }), deps)
    assert.equal(JSON.parse(auth.body).resultado, 'PERMITIDO')

    const movRepo = {
      async listEstadoUnidad() {
        return [{ unidadId: 'eq-1', estatusOperativo: 'EN_MANTENIMIENTO', otAbiertaId: 'ot-x', yarda: 'chihuahua' }]
      },
      async listOrdenesTrabajo() {
        return [{ id: 'ot-x', folio: 'OT-2026-0009', unidadId: 'eq-1', estatus: 'ABIERTA', activo: 'SI', yarda: 'chihuahua', unidadesRelacionadasJson: [] }]
      },
      async listOtEventos() {
        return []
      },
      async appendOtEvento() {},
      async appendAuditoria() {},
      async appendMovimiento() {
        throw new Error('no debe escribir la salida')
      },
    }
    const denied = await createMovimientoHandler(httpEvent('POST', {
      cookie: cookieFor(guardia),
      body: { id: 'sal-1', tipo: 'salida', equipoId: 'eq-1', placa: 'ABC123A' },
    }), { repo: movRepo })
    assert.equal(denied.statusCode, 409, denied.body)
    assert.equal(JSON.parse(denied.body).resultado, 'BLOQUEADO')
  })
})

test('sheetsRepo actualiza solo la fila del id y nunca limpia la hoja', async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  const saKey = await exportPKCS8(privateKey)
  const filas = [
    OT_COLUMNS,
    otToRow({ id: 'ot-1', folio: 'OT-2026-0001', unidadId: 'a', etr: ETR_VERDE, etrOriginal: ETR_VERDE, estatus: 'ABIERTA', tipo: 'CORRECTIVO', motivo: 'x', yarda: 'chihuahua' }),
    otToRow({ id: 'ot-2', folio: 'OT-2026-0002', unidadId: 'b', etr: ETR_ROJO, etrOriginal: ETR_ROJO, estatus: 'ABIERTA', tipo: 'LLANTAS', motivo: 'y', yarda: 'calera' }),
  ]
  const urls = []
  const fetchImpl = async (url, init = {}) => {
    const u = String(url)
    urls.push({ url: u, method: init.method || 'GET', body: init.body })
    const ok = (obj) => new Response(JSON.stringify(obj), { status: 200 })
    if (u === 'https://oauth2.googleapis.com/token') return ok({ access_token: 'sa-token', expires_in: 3600 })
    if (u.includes(':clear') || u.includes('batchClear') || init.method === 'DELETE') {
      throw new Error('no se debe limpiar la hoja')
    }
    if (u.includes('/values/') && u.includes('OrdenesTrabajo') && (init.method || 'GET') === 'GET' && u.includes('A%3AA') || (decodeURIComponent(u).includes('OrdenesTrabajo!A:A') && (init.method || 'GET') === 'GET')) {
      return ok({ values: filas.map((row) => [row[0]]) })
    }
    if (u.includes('/values/') && (init.method || 'GET') === 'GET' && decodeURIComponent(u).includes('OrdenesTrabajo!A2')) {
      return ok({ values: filas.slice(1) })
    }
    if ((init.method || '') === 'PUT' && u.includes('/values/')) {
      const range = decodeURIComponent(u)
      assert.match(range, /OrdenesTrabajo!A3:AI3/)
      const values = JSON.parse(init.body).values
      assert.equal(values.length, 1)
      assert.equal(values[0][0], 'ot-2')
      filas[2] = values[0]
      return ok({ updatedRange: 'OrdenesTrabajo!A3:AI3' })
    }
    if (u.includes(':append') && decodeURIComponent(u).includes('OT_Eventos')) return ok({})
    throw new Error(`fetch inesperado ${init.method || 'GET'} ${decodeURIComponent(u)}`)
  }
  const repo = createSheetsRepo({
    email: 'sa@test.iam.gserviceaccount.com',
    privateKey: saKey,
    spreadsheetId: 'sheet-test',
    fetch: fetchImpl,
  })
  const list = await repo.listOrdenesTrabajo()
  assert.equal(list.length, 2)
  assert.equal(list[1].id, 'ot-2')
  const updated = otToRow({ ...list[1], estatus: 'LISTA', etrOriginal: ETR_ROJO })
  const result = await repo.updateOrdenTrabajoById('ot-2', updated)
  assert.equal(result.rowNumber, 3)
  assert.equal(result.range, 'OrdenesTrabajo!A3:AI3')
  assert.equal(filas[1][0], 'ot-1')
  assert.equal(urls.some((call) => call.url.includes(':clear') || call.url.includes('batchClear') || call.method === 'DELETE'), false)
})

test('migración Fase 1 en dry-run no escribe y explica cómo revertir', () => {
  const result = spawnSync(process.execPath, ['scripts/migrate-fase1-sheet.mjs'], {
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
  assert.match(result.stdout, /EstadoUnidad/)
  assert.match(result.stdout, /tipoEvento/)
  assert.match(result.stdout, /etrOriginal/)
  assert.match(result.stdout, /revertir/i)
  assert.match(result.stdout, /no borra|No se usa/i)
})

test('cliente: 503 permite la salida con aviso; bloqueo no', async () => {
  const realFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'sin configurar' }), { status: 503 })
    const libre = await validarSalidaAntesDeGuardar({ equipoId: 'eq-1' })
    assert.equal(libre.ok, true)
    assert.equal(libre.offline, true)
    assert.match(libre.warning, /Sin validación de servidor/)

    globalThis.fetch = async () => new Response(JSON.stringify({
      resultado: 'BLOQUEADO',
      puedeAutorizar: false,
      mensaje: 'Salida bloqueada. eq-1: En mantenimiento.',
    }), { status: 200 })
    const bloqueo = await validarSalidaAntesDeGuardar({ equipoId: 'eq-1' })
    assert.equal(bloqueo.ok, false)
    assert.equal(bloqueo.resultado, 'BLOQUEADO')
    assert.match(bloqueo.message, /bloqueada/)

    globalThis.fetch = async () => new Response('<!doctype html><html>spa</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
    const spa = await validarSalidaAntesDeGuardar({ equipoId: 'eq-1' })
    assert.equal(spa.ok, true)
    assert.equal(spa.offline, true)

    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    const red = await validarSalidaAntesDeGuardar({ equipoId: 'eq-1' })
    assert.equal(red.ok, true)
    assert.equal(red.offline, true)
    assert.equal(isGateUnavailable(new ApiError('no', 409, {})), false)
    assert.equal(isGateUnavailable(new ApiError('no', 503, {})), true)
  } finally {
    globalThis.fetch = realFetch
  }
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
