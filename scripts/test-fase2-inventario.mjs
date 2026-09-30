#!/usr/bin/env node
/**
 * Pruebas Fase 2 — inventario por estatus, slots y conteo físico (sin red real).
 * node scripts/test-fase2-inventario.mjs
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { SESSION_COOKIE, signSession } from '../netlify/functions/lib/session.js'
import {
  CONTEOS_COLUMNS,
  ESTADO_UNIDAD_COLUMNS,
  ESTADO_UNIDAD_FASE1_COLUMNS,
  TIPOS_SLOT,
  UBICACIONES_UNIDAD,
  ZONAS_SLOTS_COLUMNS,
  columnLetter,
  conteoToRow,
  estadoUnidadToRow,
  rowToConteo,
  rowToEstadoUnidad,
  rowToOt,
  rowToOtEvento,
  rowToZonaSlot,
  zonaSlotToRow,
} from '../netlify/functions/lib/sheetsRepo.js'
import {
  agregarInventario,
  createInventarioService,
  enPatioFisico,
  normPlaca,
  normalizarCarga,
  normalizarTipoSlot,
  normalizarUbicacion,
  ocuparSlots,
  planCierre,
} from '../netlify/functions/lib/inventarioService.js'
import { createOtService } from '../netlify/functions/lib/otService.js'
import { handler as inventarioHandler } from '../netlify/functions/inventario.js'
import { handler as ubicarHandler } from '../netlify/functions/inventario-ubicar.js'
import { handler as zonasHandler } from '../netlify/functions/zonas-slots.js'
import { handler as conteoHandler, parseConteoRequest } from '../netlify/functions/conteo.js'
import { puedeVerPagina } from '../src/lib/patioSync.js'
import { inventarioCsv } from '../src/lib/inventarioCsv.js'
import { ubicarTrasMovimiento } from '../src/lib/serverApi.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const SECRET = 'test-secret-fase2-inventario-0123456789'
const NOW = new Date('2026-09-30T18:00:00.000Z')
const encargado = {
  email: 'Encargado@CamirCapital.com',
  rol: 'encargado_yarda',
  permisos: { entrada: true, salida: true, parado: true },
  dispositivoId: 'ipad-yarda',
}

function memoryRepo(seed = {}) {
  const estados = (seed.estados || []).map((row) => (Array.isArray(row) ? row.slice() : estadoUnidadToRow(row)))
  const slots = (seed.slots || []).map((row) => (Array.isArray(row) ? row.slice() : zonaSlotToRow(row)))
  const conteos = (seed.conteos || []).map((row) => (Array.isArray(row) ? row.slice() : conteoToRow(row)))
  const auditoria = []
  const movimientos = seed.movimientos ? seed.movimientos.slice() : []
  const ots = []
  const eventos = []
  const cleared = []
  return {
    estados,
    slots,
    conteos,
    auditoria,
    cleared,
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
      return { rowNumber: idx + 2, range: `EstadoUnidad!A${idx + 2}:N${idx + 2}` }
    },
    async listZonasSlots() {
      return slots.map(rowToZonaSlot).filter(Boolean)
    },
    async appendZonaSlot(row) {
      slots.push(row.slice())
    },
    async updateZonaSlotById(id, row) {
      const idx = slots.findIndex((item) => String(item[0]) === String(id))
      if (idx < 0) {
        const err = new Error(`no slot ${id}`)
        err.status = 404
        throw err
      }
      slots[idx] = row.slice()
      return { rowNumber: idx + 2 }
    },
    async listConteos() {
      return conteos.map(rowToConteo).filter(Boolean)
    },
    async appendConteo(row) {
      conteos.push(row.slice())
    },
    async updateConteoById(id, row) {
      const idx = conteos.findIndex((item) => String(item[0]) === String(id))
      if (idx < 0) {
        const err = new Error(`no conteo ${id}`)
        err.status = 404
        throw err
      }
      conteos[idx] = row.slice()
      return { rowNumber: idx + 2, range: `ConteosFisicos!A${idx + 2}:H${idx + 2}` }
    },
    async appendAuditoria(entry) {
      auditoria.push(entry)
      return 'audit'
    },
    async listMovimientos() {
      return movimientos.slice()
    },
    async listOrdenesTrabajo() {
      return ots.map(rowToOt).filter(Boolean)
    },
    async appendOrdenTrabajo(row) {
      ots.push(row.slice())
    },
    async updateOrdenTrabajoById(id, row) {
      const idx = ots.findIndex((item) => String(item[0]) === String(id))
      if (idx < 0) {
        const err = new Error(`no ot ${id}`)
        err.status = 404
        throw err
      }
      ots[idx] = row.slice()
    },
    async listOtEventos() {
      return eventos.map(rowToOtEvento).filter(Boolean)
    },
    async appendOtEvento(row) {
      eventos.push(row.slice())
    },
  }
}

function service(repo = memoryRepo()) {
  let n = 0
  const svc = createInventarioService(repo, {
    now: () => NOW,
    newId: () => `id-${++n}`,
  })
  return { svc, repo }
}

function cookieFor(user = encargado) {
  const token = signSession(
    { email: user.email, rol: user.rol, permisos: user.permisos, dispositivoId: user.dispositivoId },
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

const baseMovs = [
  { equipoId: 'eq-1', placa: 'ABC-123-A', tipo: 'entrada' },
  { equipoId: 'eq-2', placa: 'DEF456B', tipo: 'entrada' },
  { equipoId: 'eq-3', placa: 'GHI789C', tipo: 'parado' },
  { equipoId: 'eq-4', placa: 'JKL321D', tipo: 'entrada' },
]

function patioSeed() {
  return memoryRepo({
    movimientos: baseMovs,
    estados: [
      {
        unidadId: 'eq-1',
        tipo: 'camion',
        yarda: 'chihuahua',
        zona: 'Norte',
        slot: 'A-1',
        ubicacion: 'EN_PATIO',
        estatusOperativo: 'DISPONIBLE',
        estatusCarga: 'VACIA',
        clienteCarga: 'Carbal',
        folioCarga: 'F-1',
        enganchadaA: 'CAJA1',
        actualizadoEn: NOW.toISOString(),
      },
      {
        unidadId: 'eq-2',
        tipo: 'caja',
        yarda: 'chihuahua',
        zona: 'Norte',
        slot: 'A-2',
        ubicacion: 'EN_PATIO',
        estatusOperativo: 'EN_MANTENIMIENTO',
        estatusCarga: 'NA',
        otAbiertaId: 'ot-9',
      },
      {
        unidadId: 'eq-3',
        tipo: 'camion',
        yarda: 'calera',
        zona: 'Fondo',
        slot: 'B-1',
        ubicacion: 'EN_RUTA',
        estatusOperativo: 'DISPONIBLE',
        estatusCarga: 'CARGADA',
      },
      {
        unidadId: 'eq-4',
        tipo: 'dolly',
        yarda: 'chihuahua',
        zona: 'Norte',
        slot: 'A-3',
        ubicacion: 'andén viejo',
        estatusOperativo: 'DISPONIBLE',
        estatusCarga: 'vacio',
      },
    ],
    slots: [
      { id: 'CHIHUAHUA|NORTE|A-1', yardaId: 'chihuahua', zona: 'Norte', slot: 'A-1', tipo: 'LINEA', capacidad: 1, activo: 'SI' },
      { id: 'CHIHUAHUA|NORTE|A-2', yardaId: 'chihuahua', zona: 'Norte', slot: 'A-2', tipo: 'TALLER', capacidad: 1, activo: 'SI' },
      { id: 'CHIHUAHUA|NORTE|A-4', yardaId: 'chihuahua', zona: 'Norte', slot: 'A-4', tipo: 'ANDEN', capacidad: 1, activo: 'SI' },
      { id: 'CALERA|FONDO|B-1', yardaId: 'calera', zona: 'Fondo', slot: 'B-1', tipo: 'LINEA', capacidad: 1, activo: 'SI' },
    ],
  })
}

test('columnas Fase 2 y round-trip sin perder Fase 1', () => {
  assert.equal(columnLetter(ESTADO_UNIDAD_COLUMNS.length - 1), 'N')
  assert.equal(columnLetter(ZONAS_SLOTS_COLUMNS.length - 1), 'G')
  assert.equal(columnLetter(CONTEOS_COLUMNS.length - 1), 'H')
  assert.deepEqual(ESTADO_UNIDAD_FASE1_COLUMNS, ESTADO_UNIDAD_COLUMNS.slice(0, 11))
  assert.deepEqual(UBICACIONES_UNIDAD, ['EN_PATIO', 'EN_RUTA', 'EN_TALLER_EXTERNO', 'EN_CLIENTE'])
  assert.deepEqual(TIPOS_SLOT, ['LINEA', 'ANDEN', 'TALLER', 'LAVADO', 'CUARENTENA', 'OTRO'])
  assert.equal(normalizarUbicacion('en patio'), 'EN_PATIO')
  assert.equal(normalizarUbicacion('andén 2'), '')
  assert.equal(normalizarCarga('vacio'), 'VACIA')
  assert.equal(normalizarCarga(''), 'NA')
  assert.equal(normalizarCarga('en carga'), 'EN_CARGA')
  assert.equal(normalizarTipoSlot('andén'), 'ANDEN')
  assert.equal(normPlaca('abc-123-a'), 'ABC123A')
  assert.equal(enPatioFisico({ ubicacion: 'EN_RUTA' }), false)
  assert.equal(enPatioFisico({ ubicacion: 'andén viejo' }), true)

  const corto = ['eq-1', 'camion', 'chihuahua', 'N', '1', 'EN_PATIO', 'DISPONIBLE', 'VACIA', '', '', '']
  const leido = rowToEstadoUnidad(corto)
  assert.equal(leido.clienteCarga, '')
  assert.equal(leido.enganchadaA, '')
  const largo = rowToEstadoUnidad(estadoUnidadToRow({
    ...leido,
    clienteCarga: 'Pia',
    folioCarga: 'FOL-9',
    enganchadaA: 'CAJA9',
  }))
  assert.equal(largo.clienteCarga, 'Pia')
  assert.equal(largo.folioCarga, 'FOL-9')
  assert.equal(largo.enganchadaA, 'CAJA9')
  assert.equal(largo.estatusOperativo, 'DISPONIBLE')
  assert.equal(estadoUnidadToRow(largo).length, 14)

  const slot = rowToZonaSlot(zonaSlotToRow({ id: 's1', yardaId: 'calera', zona: 'Lavado', slot: 'L-1', tipo: 'LAVADO', capacidad: 2, activo: 'SI' }))
  assert.equal(slot.tipo, 'LAVADO')
  assert.equal(slot.capacidad, 2)
  const conteo = rowToConteo(conteoToRow({
    id: 'c1',
    yardaId: 'chihuahua',
    zona: 'Norte',
    iniciadoEn: NOW.toISOString(),
    resumenJson: { capturas: [{ placa: 'ABC123A', slot: 'A-1' }] },
    activo: 'SI',
  }))
  assert.equal(conteo.resumenJson.capturas[0].placa, 'ABC123A')
  assert.equal(puedeVerPagina({ permisos: { entrada: true } }, 'inventario'), true)
  assert.equal(puedeVerPagina({ rol: 'guardia', permisos: { entrada: false } }, 'inventario'), true)
})

test('agrega por yarda × tipo × estatus y la ruta no ocupa slot', () => {
  const { repo } = service(patioSeed())
  const unidades = [
    { unidadId: 'eq-1', placa: 'ABC123A', tipo: 'camion', yarda: 'chihuahua', zona: 'Norte', slot: 'A-1', ubicacion: 'EN_PATIO', estatusOperativo: 'DISPONIBLE', estatusCarga: 'VACIA', estatusCargaNorm: 'VACIA', ubicacionNorm: 'EN_PATIO' },
    { unidadId: 'eq-2', placa: 'DEF456B', tipo: 'caja', yarda: 'chihuahua', zona: 'Norte', slot: 'A-2', ubicacion: 'EN_PATIO', estatusOperativo: 'EN_MANTENIMIENTO', estatusCarga: 'NA', estatusCargaNorm: 'NA', ubicacionNorm: 'EN_PATIO' },
    { unidadId: 'eq-3', placa: 'GHI789C', tipo: 'camion', yarda: 'calera', zona: 'Fondo', slot: 'B-1', ubicacion: 'EN_RUTA', estatusOperativo: 'DISPONIBLE', estatusCarga: 'CARGADA', estatusCargaNorm: 'CARGADA', ubicacionNorm: 'EN_RUTA' },
    { unidadId: 'eq-4', placa: 'JKL321D', tipo: 'dolly', yarda: 'chihuahua', zona: 'Norte', slot: 'A-3', ubicacion: 'andén viejo', estatusOperativo: 'DISPONIBLE', estatusCarga: 'vacio', estatusCargaNorm: 'VACIA', ubicacionNorm: '' },
  ]
  const chi = agregarInventario(unidades, 'chihuahua')
  assert.equal(chi.resumen.unidades, 3)
  assert.equal(chi.resumen.enPatio, 3)
  assert.equal(chi.resumen.enRuta, 0)
  const camionDisp = chi.porTipoOperativo.find((row) => row.tipo === 'camion' && row.estatusOperativo === 'DISPONIBLE')
  assert.equal(camionDisp.cantidad, 1)
  const cajaTaller = chi.porTipoOperativo.find((row) => row.tipo === 'caja' && row.estatusOperativo === 'EN_MANTENIMIENTO')
  assert.equal(cajaTaller.cantidad, 1)
  const vacia = chi.porTipoCarga.find((row) => row.tipo === 'camion' && row.estatusCarga === 'VACIA')
  assert.equal(vacia.cantidad, 1)
  const cubo = chi.porTipoEstatus.find((row) => row.tipo === 'dolly')
  assert.equal(cubo.estatusCarga, 'VACIA')
  const todas = agregarInventario(unidades, 'todas')
  assert.equal(todas.resumen.unidades, 4)
  assert.equal(todas.resumen.enRuta, 1)

  const slots = ocuparSlots(
    [
      { id: '1', yardaId: 'chihuahua', zona: 'Norte', slot: 'A-1', tipo: 'LINEA', capacidad: 1, activo: 'SI' },
      { id: '2', yardaId: 'calera', zona: 'Fondo', slot: 'B-1', tipo: 'LINEA', capacidad: 1, activo: 'SI' },
    ],
    unidades,
  )
  const a1 = slots.find((slot) => slot.slot === 'A-1')
  assert.equal(a1.ocupantes[0].placa, 'ABC123A')
  const b1 = slots.find((slot) => slot.slot === 'B-1')
  assert.equal(b1.ocupantes.length, 0)
  const adHoc = slots.find((slot) => slot.slot === 'A-3')
  assert.equal(adHoc.adHoc, true)
  assert.equal(adHoc.ocupantes[0].unidadId, 'eq-4')
  assert.equal(repo.estados.length, 4)
})

test('plan de cierre: faltante, sobrante y ajuste de slot', () => {
  const estados = [
    { unidadId: 'eq-1', placa: 'ABC123A', tipo: 'camion', yarda: 'chihuahua', zona: 'Norte', slot: 'A-1', ubicacion: 'EN_PATIO', estatusOperativo: 'DISPONIBLE' },
    { unidadId: 'eq-2', placa: 'DEF456B', tipo: 'caja', yarda: 'chihuahua', zona: 'Norte', slot: 'A-2', ubicacion: 'EN_PATIO', estatusOperativo: 'DISPONIBLE' },
    { unidadId: 'eq-9', placa: 'ZZZ999Z', tipo: 'camion', yarda: 'calera', zona: 'Fondo', slot: 'B-1', ubicacion: 'EN_RUTA', estatusOperativo: 'DISPONIBLE' },
  ]
  const plan = planCierre({
    estados,
    yardaId: 'chihuahua',
    zona: 'Norte',
    capturas: [
      { placa: 'ABC-123-A', slot: 'A-4', zona: 'Norte' },
      { placa: 'ZZZ999Z', slot: 'A-4', zona: 'Norte' },
      { placa: 'NOEXISTE', slot: 'A-9', zona: 'Norte' },
    ],
  })
  assert.equal(plan.faltantes.length, 1)
  assert.equal(plan.faltantes[0].unidadId, 'eq-2')
  assert.equal(plan.sobrantes.length, 1)
  assert.equal(plan.sobrantes[0].placa, 'NOEXISTE')
  assert.equal(plan.ajustes.length, 2)
  assert.equal(plan.ajustes.find((item) => item.unidadId === 'eq-1').despues.slot, 'A-4')
  assert.equal(plan.ajustes.find((item) => item.unidadId === 'eq-9').despues.ubicacion, 'EN_PATIO')
  assert.equal(plan.ajustes.find((item) => item.unidadId === 'eq-9').despues.yarda, 'chihuahua')
})

test('conteo físico ajusta solo la fila del slot y audita', async () => {
  const repo = patioSeed()
  const { svc } = service(repo)
  const antes = repo.estados.map((row) => row.slice())
  const abierto = await svc.iniciarConteo(encargado, { yardaId: 'chihuahua', zona: 'Norte' })
  assert.equal(abierto.idempotent, false)
  const otra = await svc.iniciarConteo(encargado, { yardaId: 'chihuahua', zona: 'Norte' })
  assert.equal(otra.idempotent, true)
  assert.equal(otra.conteo.id, abierto.conteo.id)
  assert.equal(repo.conteos.length, 1)

  await svc.capturar(encargado, abierto.conteo.id, { placa: 'abc 123 a', slot: 'A-4', zona: 'Norte' })
  await svc.capturar(encargado, abierto.conteo.id, { placa: 'NO-HAY', slot: 'A-9' })
  const cerrado = await svc.cerrarConteo(encargado, abierto.conteo.id, { aplicarAjustes: true })
  assert.equal(cerrado.faltantes.some((item) => item.unidadId === 'eq-2'), true)
  assert.equal(cerrado.faltantes.some((item) => item.unidadId === 'eq-4'), true)
  assert.equal(cerrado.sobrantes.length, 1)
  assert.equal(cerrado.sobrantes[0].placa, 'NOHAY')
  const movido = rowToEstadoUnidad(repo.estados.find((row) => row[0] === 'eq-1'))
  assert.equal(movido.slot, 'A-4')
  assert.equal(movido.ubicacion, 'EN_PATIO')
  assert.equal(movido.clienteCarga, 'Carbal')
  assert.equal(movido.enganchadaA, 'CAJA1')
  assert.equal(movido.estatusOperativo, 'DISPONIBLE')
  const intacta = rowToEstadoUnidad(repo.estados.find((row) => row[0] === 'eq-2'))
  assert.equal(intacta.slot, 'A-2')
  assert.equal(intacta.otAbiertaId, 'ot-9')
  assert.equal(intacta.estatusOperativo, 'EN_MANTENIMIENTO')
  assert.deepEqual(repo.estados.find((row) => row[0] === 'eq-3'), antes.find((row) => row[0] === 'eq-3'))
  assert.equal(repo.conteos.length, 1)
  const guardado = rowToConteo(repo.conteos[0])
  assert.equal(guardado.activo, 'NO')
  assert.ok(guardado.cerradoEn)
  assert.equal(repo.auditoria.some((item) => item.accion === 'ajuste_conteo_slot' && item.entidadId === 'eq-1'), true)
  assert.equal(repo.auditoria.some((item) => item.accion === 'cerrar_conteo'), true)
  await assert.rejects(() => svc.capturar(encargado, abierto.conteo.id, { placa: 'ABC123A', slot: 'A-1' }), /cerrado/)
})

test('ubicar conserva mantenimiento y la salida pasa a EN_RUTA', async () => {
  const repo = patioSeed()
  const { svc } = service(repo)
  const patio = await svc.ubicarUnidad(encargado, {
    unidadId: 'eq-2',
    placa: 'DEF456B',
    yarda: 'chihuahua',
    zona: 'Taller',
    slot: 'T-1',
    tipoMovimiento: 'parado',
    ubicacion: 'EN_PATIO',
  })
  assert.equal(patio.estatusOperativo, 'EN_MANTENIMIENTO')
  assert.equal(patio.otAbiertaId, 'ot-9')
  assert.equal(patio.slot, 'T-1')
  assert.equal(patio.zona, 'Taller')
  const ruta = await svc.ubicarUnidad(encargado, {
    unidadId: 'eq-1',
    tipoMovimiento: 'salida',
    yarda: 'chihuahua',
  })
  assert.equal(ruta.ubicacion, 'EN_RUTA')
  assert.equal(ruta.slot, 'A-1')
  assert.equal(ruta.clienteCarga, 'Carbal')
  const otraVez = await svc.ubicarUnidad(encargado, {
    unidadId: 'eq-1',
    tipoMovimiento: 'salida',
    yarda: 'chihuahua',
  })
  assert.equal(otraVez.ubicacion, 'EN_RUTA')
  assert.equal(repo.auditoria.filter((item) => item.accion === 'ubicar_unidad' && item.entidadId === 'eq-1').length, 1)
  const nuevo = await svc.ubicarUnidad(encargado, {
    unidadId: 'eq-nueva',
    placa: 'NEW111A',
    tipo: 'camion',
    yardaId: 'calpulalpan',
    zona: 'Sur',
    slot: 'S-2',
    tipoMovimiento: 'entrada',
    enganchadaA: 'CAJA8',
    clienteCarga: 'Cliente MX',
  })
  assert.equal(nuevo.estatusOperativo, 'DISPONIBLE')
  assert.equal(nuevo.ubicacion, 'EN_PATIO')
  assert.equal(nuevo.estatusCarga, 'NA')
  assert.equal(nuevo.enganchadaA, 'CAJA8')
  assert.equal(nuevo.yarda, 'calpulalpan')
})

test('alta de slot actualiza la misma fila y no borra las demás', async () => {
  const repo = patioSeed()
  const { svc } = service(repo)
  const antes = repo.slots.length
  const creado = await svc.guardarSlot(encargado, { yardaId: 'Chihuahua', zona: 'Lavado', slot: 'L-1', tipo: 'lavado', capacidad: 3 })
  assert.equal(creado.tipo, 'LAVADO')
  assert.equal(creado.capacidad, 3)
  assert.equal(repo.slots.length, antes + 1)
  const otra = repo.slots.find((row) => row[0] === 'CHIHUAHUA|NORTE|A-1')
  await svc.guardarSlot(encargado, { yardaId: 'chihuahua', zona: 'Lavado', slot: 'L-1', tipo: 'LAVADO', capacidad: 4, activo: 'NO' })
  assert.equal(repo.slots.length, antes + 1)
  const actualizado = rowToZonaSlot(repo.slots.find((row) => String(row[3]) === 'L-1'))
  assert.equal(actualizado.capacidad, 4)
  assert.equal(actualizado.activo, 'NO')
  assert.deepEqual(repo.slots.find((row) => row[0] === 'CHIHUAHUA|NORTE|A-1'), otra)
  const lista = await svc.listarSlots(encargado, { yarda: 'chihuahua' })
  assert.equal(lista.some((slot) => slot.slot === 'L-1'), false)
  await assert.rejects(() => svc.guardarSlot(encargado, { yardaId: 'chihuahua', zona: 'X', slot: '1', tipo: 'PATIO' }), /Tipo de slot/)
})

test('consultar filtra yarda y una OT no borra clienteCarga', async () => {
  const repo = patioSeed()
  const { svc } = service(repo)
  const data = await svc.consultar(encargado, { yarda: 'chihuahua' })
  assert.equal(data.resumen.unidades, 3)
  assert.equal(data.unidades.find((item) => item.unidadId === 'eq-1').placa, 'ABC123A')
  assert.equal(data.slots.some((slot) => slot.yardaId === 'calera'), false)
  assert.ok(data.slots.find((slot) => slot.slot === 'A-1').ocupantes.length >= 1)

  const ot = createOtService(repo, { now: () => NOW, newId: () => 'ot-nueva' })
  await ot.createOT(encargado, {
    unidadId: 'eq-1',
    yarda: 'chihuahua',
    tipo: 'CORRECTIVO',
    motivo: 'frenos',
    etr: '2026-10-05T18:00:00.000Z',
    zonaSlot: 'andén 2',
  })
  const despues = rowToEstadoUnidad(repo.estados.find((row) => row[0] === 'eq-1'))
  assert.equal(despues.estatusOperativo, 'EN_MANTENIMIENTO')
  assert.equal(despues.clienteCarga, 'Carbal')
  assert.equal(despues.folioCarga, 'F-1')
  assert.equal(despues.enganchadaA, 'CAJA1')
  assert.equal(despues.ubicacion, 'EN_PATIO')
})

test('HTTP exige sesión y responde inventario, slots y conteo', async () => {
  await withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    const repo = patioSeed()
    const { svc } = service(repo)
    const deps = { service: svc, repo }
    assert.equal((await inventarioHandler(httpEvent('GET'))).statusCode, 401)
    assert.equal((await inventarioHandler(httpEvent('OPTIONS'))).statusCode, 204)
    const sinSecreto = await withEnv({ PATIO_SESSION_SECRET: null }, () => inventarioHandler(httpEvent('GET', { cookie: cookieFor() })))
    assert.equal(sinSecreto.statusCode, 503)

    const ok = await inventarioHandler(httpEvent('GET', { cookie: cookieFor(), query: { yarda: 'chihuahua' } }), deps)
    assert.equal(ok.statusCode, 200, ok.body)
    const body = JSON.parse(ok.body)
    assert.equal(body.inventario.yarda, 'chihuahua')
    assert.ok(body.inventario.porTipoOperativo.length >= 1)

    const slot = await zonasHandler(httpEvent('POST', {
      cookie: cookieFor(),
      body: { yardaId: 'chihuahua', zona: 'Cuarentena', slot: 'C-1', tipo: 'CUARENTENA', capacidad: 2 },
    }), deps)
    assert.equal(slot.statusCode, 200, slot.body)
    const lista = await zonasHandler(httpEvent('GET', { cookie: cookieFor(), query: { yarda: 'chihuahua' } }), deps)
    assert.equal(JSON.parse(lista.body).slots.some((item) => item.slot === 'C-1'), true)

    const inicio = await conteoHandler(httpEvent('POST', {
      cookie: cookieFor(),
      path: '/api/conteo/iniciar',
      body: { yardaId: 'chihuahua', zona: 'Norte' },
    }), deps)
    assert.equal(inicio.statusCode, 200, inicio.body)
    const conteoId = JSON.parse(inicio.body).conteo.id
    assert.equal(parseConteoRequest({ path: `/.netlify/functions/conteo/${conteoId}/captura` }).op, 'captura')
    assert.equal(parseConteoRequest({ path: '/.netlify/functions/conteo' }).op, 'iniciar')
    const cap = await conteoHandler(httpEvent('POST', {
      cookie: cookieFor(),
      path: `/api/conteo/${conteoId}/captura`,
      body: { placa: 'DEF456B', slot: 'A-2' },
    }), deps)
    assert.equal(cap.statusCode, 200, cap.body)
    const cierre = await conteoHandler(httpEvent('POST', {
      cookie: cookieFor(),
      path: `/.netlify/functions/conteo/${conteoId}/cerrar`,
      body: { aplicarAjustes: false },
    }), deps)
    assert.equal(cierre.statusCode, 200, cierre.body)
    const cerrado = JSON.parse(cierre.body)
    assert.ok(cerrado.faltantes.length >= 1)
    assert.equal(rowToEstadoUnidad(repo.estados.find((row) => row[0] === 'eq-1')).slot, 'A-1')

    const ubicado = await ubicarHandler(httpEvent('POST', {
      cookie: cookieFor(),
      path: '/api/inventario/ubicar',
      body: { unidadId: 'eq-4', yarda: 'chihuahua', zona: 'Norte', slot: 'A-8', tipoMovimiento: 'entrada', ubicacion: 'EN_PATIO' },
    }), deps)
    assert.equal(ubicado.statusCode, 200, ubicado.body)
    assert.equal(JSON.parse(ubicado.body).estado.slot, 'A-8')
    assert.equal(repo.auditoria.some((item) => item.accion === 'ubicar_unidad' && item.entidadId === 'eq-4'), true)
  })
})

test('el cliente no truena si ubicar responde 503 y el CSV escapa comillas', async () => {
  const prev = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Sheets no configurado' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  try {
    const aviso = await ubicarTrasMovimiento({
      tipo: 'entrada',
      equipoId: 'eq-1',
      placa: 'ABC123A',
      yardaId: 'chihuahua',
      zona: 'Norte',
      slot: 'A-1',
    })
    assert.match(aviso, /inventario del servidor no está disponible/i)
  } finally {
    globalThis.fetch = prev
  }
  const csv = inventarioCsv([{ placa: 'ABC "1"', unidadId: 'eq-1', tipo: 'camion', yarda: 'chihuahua', zona: 'Norte', slot: 'A-1', ubicacion: 'EN_PATIO', estatusOperativo: 'DISPONIBLE', estatusCarga: 'VACIA', clienteCarga: 'Pia, SA', folioCarga: '', enganchadaA: '' }])
  assert.match(csv, /placa,unidad,tipo/)
  assert.match(csv, /"ABC ""1"""/)
  assert.match(csv, /"Pia, SA"/)
})

test('migración Fase 2 en dry-run no limpia ni escribe', () => {
  const src = readFileSync(new URL('./migrate-fase2-sheet.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /values\.clear|batchClear\(|:clear\?/)
  const result = spawnSync(process.execPath, ['scripts/migrate-fase2-sheet.mjs', '--dry-run'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, GOOGLE_SERVICE_ACCOUNT_EMAIL: '', GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: '', PATIO_SPREADSHEET_ID: '' },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /\[dry-run\]/)
  assert.match(result.stdout, /ZonasSlots/)
  assert.match(result.stdout, /ConteosFisicos/)
  assert.match(result.stdout, /clienteCarga/)
  assert.match(result.stdout, /folioCarga/)
  assert.match(result.stdout, /enganchadaA/)
  assert.match(result.stdout, /EN_PATIO/)
  assert.match(result.stdout, /no borra filas|no reescribe/)
  assert.doesNotMatch(result.stdout, /:clear|batchClear/)
})

let failed = 0
for (const item of tests) {
  try {
    await item.fn()
    console.log(`✓ ${item.name}`)
  } catch (err) {
    failed += 1
    console.error(`✗ ${item.name}`)
    console.error(err)
  }
}
if (failed) {
  console.error(`\n${failed} prueba(s) de Fase 2 fallaron`)
  process.exit(1)
}
console.log(`\n${tests.length} pruebas de Fase 2 pasaron`)
