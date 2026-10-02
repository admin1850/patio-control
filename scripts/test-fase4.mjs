#!/usr/bin/env node
/**
 * Pruebas Fase 4 — preventivo, avisos y KPIs (sin red real).
 * node scripts/test-fase4.mjs
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { SESSION_COOKIE, signSession } from '../netlify/functions/lib/session.js'
import {
  AVISOS_LOG_COLUMNS,
  AVISOS_SUSCRIPCIONES_COLUMNS,
  PLAN_PREVENTIVO_COLUMNS,
  SERVICIO_PROGRAMADO_COLUMNS,
  avisoLogToRow,
  estadoUnidadToRow,
  otToRow,
  planPreventivoToRow,
  rowToAvisoLog,
  rowToAvisoSuscripcion,
  rowToEstadoUnidad,
  rowToMovimiento,
  rowToOt,
  rowToOtEvento,
  rowToPlanPreventivo,
  rowToServicioProgramado,
  servicioProgramadoToRow,
} from '../netlify/functions/lib/sheetsRepo.js'
import {
  avanzarNumero,
  combinarEstatus,
  createPreventivoService,
  estatusEje,
  semaforoPreventivo,
} from '../netlify/functions/lib/preventivoService.js'
import {
  TIPOS_AVISO,
  canalesConfigurados,
  createAvisosService,
  fechaMx,
  leerSmtpConfig,
} from '../netlify/functions/lib/avisosService.js'
import { createOtService } from '../netlify/functions/lib/otService.js'
import { createKpiService, kpisToCsv } from '../netlify/functions/lib/kpiService.js'
import { handler as preventivoHandler } from '../netlify/functions/preventivo.js'
import { handler as proximosHandler } from '../netlify/functions/preventivo-proximos.js'
import { handler as kpisHandler } from '../netlify/functions/kpis.js'
import { handler as avisosHandler } from '../netlify/functions/avisos.js'
import { esInvocacionProgramada, handler as diarioHandler } from '../netlify/functions/avisos-diario.js'
import { handler as tableroHandler } from '../netlify/functions/ot-tablero.js'
import { handler as otItemHandler } from '../netlify/functions/ot-item.js'
import { handler as createMovimientoHandler } from '../netlify/functions/movimientos-create.js'
import { ApiError, fetchKpisOpcional, fetchPreventivoOpcional, isGateUnavailable } from '../src/lib/serverApi.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const SECRET = 'test-secret-fase4-preventivo-0123456789'
const NOW = new Date('2026-09-30T18:00:00.000Z')

const encargado = {
  email: 'Encargado@CamirCapital.com',
  rol: 'encargado_yarda',
  permisos: { entrada: true, salida: true, parado: true, baja: true, kpis: true },
  dispositivoId: 'ipad-yarda',
}
const guardia = {
  email: 'guardia@camircapital.com',
  rol: 'guardia',
  permisos: { entrada: true, salida: true, parado: false, baja: false, kpis: false },
  dispositivoId: 'ipad-caseta',
}
const admin = {
  email: 'admin@camircapital.com',
  rol: 'admin',
  permisos: { entrada: true, salida: true, parado: true, baja: true, kpis: true },
}

function memoryRepo() {
  const ots = []
  const eventos = []
  const estados = []
  const auditoria = []
  const movimientos = []
  const planes = []
  const servicios = []
  const avisos = []
  const suscripciones = []
  return {
    ots,
    eventos,
    estados,
    auditoria,
    movimientos,
    planes,
    servicios,
    avisos,
    suscripciones,
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
    },
    async appendAuditoria(entry) {
      auditoria.push(entry)
      return 'audit'
    },
    async listMovimientos() {
      return movimientos.slice()
    },
    async findMovimientoById(id) {
      return movimientos.find((item) => item.id === id) || null
    },
    async findOpenEntrada() {
      return null
    },
    async appendMovimiento(row) {
      const mov = rowToMovimiento(row)
      if (mov) movimientos.push(mov)
    },
    async listPlanesPreventivo() {
      return planes.map(rowToPlanPreventivo).filter(Boolean)
    },
    async appendPlanPreventivo(row) {
      planes.push(row.slice())
    },
    async updatePlanPreventivoByTipo(tipo, row) {
      const idx = planes.findIndex((item) => String(item[0]).toLowerCase() === String(tipo).toLowerCase())
      if (idx < 0) {
        const err = new Error(`no plan ${tipo}`)
        err.status = 404
        throw err
      }
      planes[idx] = row.slice()
    },
    async listServiciosProgramados() {
      return servicios.map(rowToServicioProgramado).filter(Boolean)
    },
    async appendServicioProgramado(row) {
      servicios.push(row.slice())
    },
    async updateServicioProgramadoById(id, row) {
      const idx = servicios.findIndex((item) => String(item[0]) === String(id))
      if (idx < 0) {
        const err = new Error(`no servicio ${id}`)
        err.status = 404
        throw err
      }
      servicios[idx] = row.slice()
    },
    async listAvisosLog() {
      return avisos.map(rowToAvisoLog).filter(Boolean)
    },
    async appendAvisoLog(row) {
      avisos.push(row.slice())
    },
    async listAvisosSuscripciones() {
      return suscripciones.map(rowToAvisoSuscripcion).filter(Boolean)
    },
    async appendAvisoSuscripcion(row) {
      suscripciones.push(row.slice())
    },
    async updateAvisoSuscripcionById(id, row) {
      const idx = suscripciones.findIndex((item) => String(item[0]) === String(id))
      if (idx < 0) {
        const err = new Error(`no sub ${id}`)
        err.status = 404
        throw err
      }
      suscripciones[idx] = row.slice()
    },
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

test('columnas Fase 4 y round-trip de plan, servicio y aviso', () => {
  assert.deepEqual(PLAN_PREVENTIVO_COLUMNS, ['tipoUnidad', 'cadaKm', 'cadaDias', 'cadaHorasThermo', 'avisoPct'])
  assert.deepEqual(SERVICIO_PROGRAMADO_COLUMNS, ['id', 'unidadId', 'planId', 'proximoKm', 'proximaFecha', 'proximoHorometro', 'estatus', 'otId'])
  assert.equal(AVISOS_LOG_COLUMNS[4], 'canal')
  assert.equal(AVISOS_SUSCRIPCIONES_COLUMNS[3], 'canal')
  assert.ok(TIPOS_AVISO.includes('PREVENTIVO_VENCIDO'))
  assert.ok(TIPOS_AVISO.includes('RESUMEN_DIARIO'))

  const plan = rowToPlanPreventivo(planPreventivoToRow({
    tipoUnidad: 'Camion',
    cadaKm: 15000,
    cadaDias: 90,
    cadaHorasThermo: null,
    avisoPct: 80,
  }))
  assert.equal(plan.tipoUnidad, 'camion')
  assert.equal(plan.cadaKm, 15000)
  assert.equal(plan.cadaDias, 90)
  assert.equal(plan.cadaHorasThermo, null)
  assert.equal(plan.avisoPct, 80)

  const servicio = rowToServicioProgramado(servicioProgramadoToRow({
    id: 'srv-1',
    unidadId: 'eq-1',
    planId: 'Camion',
    proximoKm: 25000,
    proximaFecha: '2026-12-01T00:00:00.000Z',
    proximoHorometro: null,
    estatus: 'AVISO',
    otId: '',
  }))
  assert.equal(servicio.planId, 'camion')
  assert.equal(servicio.estatus, 'AVISO')
  assert.equal(servicio.proximoKm, 25000)
  assert.equal(rowToServicioProgramado(servicioProgramadoToRow({ id: 'x', estatus: 'RARO' })).estatus, 'PENDIENTE')

  const aviso = rowToAvisoLog(avisoLogToRow({
    id: 'av-1',
    tipo: 'etr_vencida',
    yarda: 'Chihuahua',
    unidadId: 'eq-1',
    canal: 'log',
    estatus: 'LOG',
    mensaje: 'ETR vencido',
    dedupeKey: 'ETR|eq-1',
    horaServidor: NOW.toISOString(),
  }))
  assert.equal(aviso.tipo, 'ETR_VENCIDA')
  assert.equal(aviso.yarda, 'chihuahua')
  assert.equal(aviso.canal, 'log')
})

test('semáforo y ejes: 80% aviso, vencido al llegar, horómetro', () => {
  assert.equal(estatusEje(10700, 11000, 1000, 80), 'PENDIENTE')
  assert.equal(estatusEje(10800, 11000, 1000, 80), 'AVISO')
  assert.equal(estatusEje(11000, 11000, 1000, 80), 'VENCIDO')
  assert.equal(semaforoPreventivo('PENDIENTE').nivel, 'verde')
  assert.equal(semaforoPreventivo('AVISO').nivel, 'amarillo')
  assert.equal(semaforoPreventivo('VENCIDO').nivel, 'rojo')

  const plan = { cadaKm: 1000, cadaHorasThermo: 100, avisoPct: 80 }
  const servicio = { proximoKm: 11000, proximoHorometro: 100, proximaFecha: '' }
  assert.equal(combinarEstatus(plan, servicio, { km: 10500, horometro: 80 }).estatus, 'AVISO')
  assert.equal(combinarEstatus(plan, servicio, { km: 10500, horometro: 100 }).estatus, 'VENCIDO')
  assert.equal(avanzarNumero(11050, 11000, 1000), 12050)
  assert.equal(avanzarNumero(null, 11000, 1000), 12000)
})

test('recalcular en movimiento: pendiente, aviso, vencido y sin lectura', async () => {
  const repo = memoryRepo()
  const svc = createPreventivoService(repo, { now: () => NOW })
  await svc.upsertPlan(encargado, { tipoUnidad: 'camion', cadaKm: 1000, cadaDias: 10, avisoPct: 80 })
  await svc.upsertPlan(encargado, { tipoUnidad: 'camion', cadaKm: 2000, avisoPct: 80 })
  assert.equal(repo.planes.length, 1)
  assert.equal((await svc.listProximos()).planes[0].cadaKm, 2000)

  const vacio = await svc.recalcularPorMovimiento({ equipoId: 'eq-1', equipoTipo: 'camion', fechaHora: NOW.toISOString() })
  assert.equal(vacio.skipped, true)
  assert.equal(repo.servicios.length, 0)

  const primero = await svc.recalcularPorMovimiento({
    equipoId: 'eq-1',
    equipoTipo: 'camion',
    kilometros: 10000,
    fechaHora: '2026-09-01T00:00:00.000Z',
    yardaId: 'chihuahua',
  })
  assert.equal(primero.servicio.estatus, 'PENDIENTE')
  assert.equal(primero.servicio.proximoKm, 12000)
  assert.equal(semaforoPreventivo(primero.servicio.estatus).nivel, 'verde')

  const aviso = await svc.recalcularPorMovimiento({
    equipoId: 'eq-1',
    equipoTipo: 'camion',
    kilometros: 11600,
    fechaHora: '2026-09-09T00:00:00.000Z',
  })
  assert.equal(aviso.servicio.estatus, 'AVISO')
  assert.equal(aviso.servicio.id, primero.servicio.id)

  const vencido = await svc.recalcularPorMovimiento({
    equipoId: 'eq-1',
    equipoTipo: 'camion',
    kilometros: 12000,
    fechaHora: '2026-09-12T00:00:00.000Z',
  })
  assert.equal(vencido.servicio.estatus, 'VENCIDO')
  assert.equal(repo.servicios.length, 1)

  const caja = createPreventivoService(repo, { now: () => NOW })
  await caja.upsertPlan(encargado, { tipoUnidad: 'caja', cadaHorasThermo: 100, avisoPct: 80 })
  const thermo = await caja.recalcularPorMovimiento({
    equipoId: 'caja-1',
    equipoTipo: 'caja',
    refrigerada: { horometroThermo: 80 },
    fechaHora: NOW.toISOString(),
  })
  assert.equal(thermo.servicio.proximoHorometro, 180)
  assert.equal(thermo.servicio.estatus, 'PENDIENTE')
  const thermoAviso = await caja.recalcularPorMovimiento({
    equipoId: 'caja-1',
    equipoTipo: 'caja',
    horometro: 160,
    fechaHora: NOW.toISOString(),
  })
  assert.equal(thermoAviso.servicio.estatus, 'AVISO')
})

test('abrir OT PREVENTIVO solo en aviso o vencido, y al cerrarla reprograma', async () => {
  const repo = memoryRepo()
  const otSvc = createOtService(repo, { now: () => NOW })
  const svc = createPreventivoService(repo, { now: () => NOW, otService: otSvc })
  await svc.upsertPlan(encargado, { tipoUnidad: 'camion', cadaKm: 1000, avisoPct: 80 })
  await svc.recalcularPorMovimiento({ equipoId: 'eq-pend', equipoTipo: 'camion', kilometros: 1000, fechaHora: NOW.toISOString() })
  const pendiente = (await repo.listServiciosProgramados()).find((item) => item.unidadId === 'eq-pend')
  const negado = await svc.abrirOt(encargado, { servicioId: pendiente.id, yarda: 'chihuahua' }).catch((err) => err)
  assert.equal(negado.status, 400)
  assert.match(negado.message, /aviso o vencido/)

  const guardiaOt = await svc.abrirOt(guardia, { servicioId: pendiente.id, yarda: 'chihuahua' }).catch((err) => err)
  assert.equal(guardiaOt.status, 403)

  await svc.recalcularPorMovimiento({ equipoId: 'eq-1', equipoTipo: 'camion', kilometros: 5000, fechaHora: '2026-09-01T00:00:00.000Z' })
  await svc.recalcularPorMovimiento({ equipoId: 'eq-1', equipoTipo: 'camion', kilometros: 6000, fechaHora: '2026-09-20T00:00:00.000Z' })
  const servicio = (await repo.listServiciosProgramados()).find((item) => item.unidadId === 'eq-1')
  assert.equal(servicio.estatus, 'VENCIDO')

  const abierto = await svc.abrirOt(encargado, { servicioId: servicio.id, yarda: 'chihuahua', etr: '2026-10-05T18:00:00.000Z', fotosAntesJson: ['https://a.jpg', 'https://b.jpg'] })
  assert.equal(abierto.ot.tipo, 'PREVENTIVO')
  assert.equal(abierto.linked, false)
  assert.equal(abierto.servicio.otId, abierto.ot.id)
  assert.equal((await repo.listEstadoUnidad()).find((item) => item.unidadId === 'eq-1').estatusOperativo, 'EN_MANTENIMIENTO')

  const otra = await svc.abrirOt(encargado, { servicioId: servicio.id, yarda: 'chihuahua', etr: '2026-10-05T18:00:00.000Z', fotosAntesJson: ['https://a.jpg', 'https://b.jpg'] })
  assert.equal(otra.linked, true)
  assert.equal(otra.ot.id, abierto.ot.id)

  const lista = await svc.listProximos({ yarda: 'chihuahua' })
  assert.equal(lista.servicios.find((item) => item.unidadId === 'eq-1').semaforo.nivel, 'rojo')
  assert.equal((await svc.listProximos({ yarda: 'calera' })).servicios.some((item) => item.unidadId === 'eq-1'), false)

  await otSvc.updateEstatus(encargado, abierto.ot.id, { estatus: 'LISTA' })
  await otSvc.updateEstatus(encargado, abierto.ot.id, {
    estatus: 'CERRADA',
    fotosDespuesJson: ['https://c.jpg', 'https://d.jpg'],
    notas: 'servicio hecho',
    kmSalida: 6000,
  })
  const hechos = await svc.sincronizarCierreOt((await repo.listOrdenesTrabajo()).find((item) => item.id === abierto.ot.id))
  assert.equal(hechos[0].estatus, 'HECHO')
  assert.equal(hechos[0].otId, abierto.ot.id)
  assert.equal(hechos[1].estatus, 'PENDIENTE')
  assert.equal(hechos[1].proximoKm, 7000)
  assert.equal(hechos[1].otId, '')
  const proximos = await svc.listProximos()
  assert.equal(proximos.servicios.some((item) => item.estatus === 'HECHO'), false)
  assert.ok(proximos.servicios.some((item) => item.unidadId === 'eq-1' && item.estatus === 'PENDIENTE'))
})

test('HTTP: movimiento con km recalcula; sin hoja el movimiento sigue', async () => {
  await withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    const repo = memoryRepo()
    const svc = createPreventivoService(repo, { now: () => NOW })
    await svc.upsertPlan(encargado, { tipoUnidad: 'camion', cadaKm: 1000, avisoPct: 80 })
    const deps = { repo }
    const cookie = cookieFor(encargado)

    const sinSesion = await proximosHandler(httpEvent('GET', { path: '/api/preventivo/proximos' }), deps)
    assert.equal(sinSesion.statusCode, 401)

    const creado = await createMovimientoHandler(httpEvent('POST', {
      cookie,
      body: {
        id: 'mov-km-1',
        tipo: 'entrada',
        equipoId: 'eq-http',
        placa: 'HTTP01',
        equipoTipo: 'camion',
        kilometros: 10000,
        fechaHora: '2026-09-01T12:00:00.000Z',
        yardaId: 'calera',
        operador: 'Nestor',
        condicionGeneral: 'buena',
        checklist: [],
        fotos: [],
        selloCoincideEntrada: false,
        cumplimiento: { thermoAlerta: true, gateVia: 'OVERRIDE' },
      },
    }), deps)
    assert.equal(creado.statusCode, 200, creado.body)
    const body = JSON.parse(creado.body)
    assert.equal(body.movimiento.id, 'mov-km-1')
    const servicio = (await repo.listServiciosProgramados()).find((item) => item.unidadId === 'eq-http')
    assert.equal(servicio.estatus, 'PENDIENTE')
    assert.equal(servicio.proximoKm, 11000)
    const tipos = (await repo.listAvisosLog()).map((item) => item.tipo)
    assert.ok(tipos.includes('SELLO_DISTINTO'))
    assert.ok(tipos.includes('THERMO_FUERA'))
    assert.ok(tipos.includes('OVERRIDE_GATE'))

    const otraVez = await createMovimientoHandler(httpEvent('POST', {
      cookie,
      body: { id: 'mov-km-1', tipo: 'entrada', equipoId: 'eq-http', kilometros: 20000, operador: 'Nestor', condicionGeneral: 'buena', checklist: [], fotos: [] },
    }), deps)
    assert.equal(JSON.parse(otraVez.body).idempotent, true)
    assert.equal(repo.servicios.length, 1)

    const lista = await proximosHandler(httpEvent('GET', { cookie, query: { yarda: 'calera' } }), deps)
    assert.equal(lista.statusCode, 200, lista.body)
    const proximos = JSON.parse(lista.body)
    assert.equal(proximos.servicios[0].semaforo.nivel, 'verde')
    assert.equal(proximos.servicios[0].unidadId, 'eq-http')

    await svc.recalcularPorMovimiento({
      equipoId: 'eq-http',
      equipoTipo: 'camion',
      kilometros: 11000,
      fechaHora: '2026-09-20T00:00:00.000Z',
      yardaId: 'calera',
    })
    const ot = await preventivoHandler(httpEvent('POST', {
      cookie,
      path: '/api/preventivo/ot',
      body: { servicioId: servicio.id, etr: '2026-10-05T18:00:00.000Z', fotosAntesJson: ['https://a.jpg', 'https://b.jpg'] },
    }), deps)
    assert.equal(ot.statusCode, 200, ot.body)
    assert.equal(JSON.parse(ot.body).orden.tipo, 'PREVENTIVO')

    const roto = memoryRepo()
    roto.listPlanesPreventivo = async () => {
      const err = new Error('Falta la pestaña PlanPreventivo')
      err.status = 503
      throw err
    }
    const sigue = await createMovimientoHandler(httpEvent('POST', {
      cookie,
      body: {
        id: 'mov-sin-hoja',
        tipo: 'entrada',
        equipoId: 'eq-sin',
        kilometros: 10,
        operador: 'Nestor',
        condicionGeneral: 'buena',
        checklist: [],
        fotos: [],
      },
    }), { repo: roto })
    assert.equal(sigue.statusCode, 200, sigue.body)
    assert.match(JSON.parse(sigue.body).avisos.join(' '), /migrate:fase4/)
  })
})

test('avisos: log sin canal, WhatsApp y correo si hay env, sin duplicar', async () => {
  const repo = memoryRepo()
  const calls = []
  const silencioso = createAvisosService(repo, {
    now: () => NOW,
    env: {},
    fetch: async (url) => {
      calls.push(url)
      return new Response('{}', { status: 200 })
    },
  })
  const log = await silencioso.enqueue('ETR_VENCIDA', { yarda: 'chihuahua', unidadId: 'eq-1', mensaje: 'ETR vencido · eq-1' })
  assert.equal(log.aviso.canal, 'log')
  assert.equal(log.aviso.estatus, 'LOG')
  assert.equal(calls.length, 0)
  const repetido = await silencioso.enqueue('ETR_VENCIDA', {
    yarda: 'chihuahua',
    unidadId: 'eq-1',
    dedupeKey: log.aviso.dedupeKey,
  })
  assert.equal(repetido.skipped, true)
  assert.equal(repo.avisos.length, 1)

  const repoWa = memoryRepo()
  const fetchCalls = []
  const wa = createAvisosService(repoWa, {
    now: () => NOW,
    env: { WHATSAPP_TOKEN: 'token-demo', WHATSAPP_PHONE_ID: '555' },
    fetch: async (url, init) => {
      fetchCalls.push({ url, body: JSON.parse(init.body) })
      return new Response('{}', { status: 200 })
    },
  })
  await wa.upsertSuscripcion({ tipo: 'UNIDAD_LISTA', yarda: 'calera', canal: 'whatsapp', destino: '+52 55 1234 5678' })
  const enviado = await wa.enqueue('UNIDAD_LISTA', { yarda: 'calera', unidadId: 'eq-9', mensaje: 'Unidad lista · eq-9' })
  assert.equal(enviado.aviso.canal, 'whatsapp')
  assert.equal(enviado.aviso.estatus, 'ENVIADO')
  assert.match(fetchCalls[0].url, /graph\.facebook\.com\/v20\.0\/555\/messages/)
  assert.equal(fetchCalls[0].body.to, '525512345678')

  const repoMail = memoryRepo()
  let smtp = null
  const mail = createAvisosService(repoMail, {
    now: () => NOW,
    env: { SMTP_HOST: 'smtp.example', SMTP_FROM: 'patio@camircapital.com' },
    smtpSend: async (msg) => {
      smtp = msg
    },
  })
  await mail.upsertSuscripcion({ tipo: '*', yarda: 'todas', canal: 'email', destino: 'patio@camircapital.com' })
  const correo = await mail.enqueue('THERMO_FUERA', { yarda: 'chihuahua', unidadId: 'caja-1', mensaje: 'Thermo fuera' })
  assert.equal(correo.aviso.canal, 'email')
  assert.equal(smtp.to, 'patio@camircapital.com')
  assert.match(smtp.subject, /Thermo fuera/)

  const repoErr = memoryRepo()
  const falla = createAvisosService(repoErr, {
    now: () => NOW,
    env: { SENDGRID_API_KEY: 'sg', SMTP_FROM: 'patio@camircapital.com' },
    fetch: async () => new Response('no', { status: 500 }),
  })
  await falla.upsertSuscripcion({ canal: 'email', destino: 'a@b.com', yarda: 'todas', tipo: '*' })
  const error = await falla.enqueue('OVERRIDE_GATE', { yarda: 'chihuahua', unidadId: 'eq-1', mensaje: 'Override' })
  assert.equal(error.aviso.canal, 'email')
  assert.equal(error.aviso.estatus, 'ERROR')
  assert.match(error.aviso.detalle, /SendGrid 500/)

  assert.equal(canalesConfigurados({}).whatsapp, false)
  assert.equal(canalesConfigurados({ WHATSAPP_TOKEN: 'a', WHATSAPP_PHONE_ID: 'b' }).whatsapp, true)
  const smtpCfg = leerSmtpConfig({ SMTP: 'smtp://user:p%40ss@mail.example:2525' })
  assert.equal(smtpCfg.host, 'mail.example')
  assert.equal(smtpCfg.port, 2525)
  assert.equal(smtpCfg.pass, 'p@ss')
  assert.equal(fechaMx(new Date('2026-09-30T18:00:00.000Z')), '2026-09-30')
})

test('tablero encola ETR vencida una vez; resumen diario por yarda; cron', async () => {
  await withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    const repo = memoryRepo()
    const otSvc = createOtService(repo, { now: () => NOW })
    await otSvc.createOT(encargado, {
      unidadId: 'eq-vencida',
      yarda: 'chihuahua',
      tipo: 'CORRECTIVO',
      motivo: 'frenos',
      etr: '2026-09-28T18:00:00.000Z',
      fotosAntesJson: ['https://a.jpg', 'https://b.jpg'],
    })
    await otSvc.createOT(encargado, {
      unidadId: 'eq-verde',
      yarda: 'calera',
      tipo: 'LLANTAS',
      motivo: 'llanta',
      etr: '2026-10-10T18:00:00.000Z',
      fotosAntesJson: ['https://a.jpg', 'https://b.jpg'],
    })
    const deps = { service: otSvc, repo }
    const cookie = cookieFor(guardia)
    const tablero = await tableroHandler(httpEvent('GET', { cookie, query: { yarda: 'todas' } }), deps)
    assert.equal(tablero.statusCode, 200, tablero.body)
    const etr = (await repo.listAvisosLog()).filter((item) => item.tipo === 'ETR_VENCIDA')
    assert.equal(etr.length, 1)
    assert.equal(etr[0].canal, 'log')
    assert.match(etr[0].mensaje, /ETR vencido/)
    await tableroHandler(httpEvent('GET', { cookie }), deps)
    assert.equal((await repo.listAvisosLog()).filter((item) => item.tipo === 'ETR_VENCIDA').length, 1)

    const otId = JSON.parse(tablero.body).tablero.porYarda.flatMap((g) => g.ordenes).find((ot) => ot.unidadId === 'eq-vencida').id
    const lista = await otItemHandler(httpEvent('PATCH', {
      cookie: cookieFor(encargado),
      path: `/api/ot/${otId}`,
      body: { estatus: 'LISTA' },
    }), deps)
    assert.equal(lista.statusCode, 200, lista.body)
    assert.ok((await repo.listAvisosLog()).some((item) => item.tipo === 'UNIDAD_LISTA'))

    repo.movimientos.push({
      id: 'par-1',
      tipo: 'parado',
      equipoId: 'eq-parado',
      placa: 'PAR01',
      yardaId: 'calpulalpan',
      paradoDesde: '2026-09-27T18:00:00.000Z',
      fechaHora: '2026-09-27T18:00:00.000Z',
      horaServidor: '2026-09-27T18:00:00.000Z',
    })
    const resumen = await avisosHandler(httpEvent('POST', {
      cookie: cookieFor(admin),
      path: '/api/avisos/resumen-diario',
      body: {},
    }), deps)
    assert.equal(resumen.statusCode, 200, resumen.body)
    const yardas = JSON.parse(resumen.body).yardas.map((item) => item.yarda)
    assert.ok(yardas.includes('chihuahua'))
    assert.ok(yardas.includes('calera'))
    assert.ok((await repo.listAvisosLog()).some((item) => item.tipo === 'RESUMEN_DIARIO'))
    assert.ok((await repo.listAvisosLog()).some((item) => item.tipo === 'PARADO_AGING' && item.yarda === 'calpulalpan'))

    const guardiaResumen = await avisosHandler(httpEvent('POST', {
      cookie: cookieFor(guardia),
      path: '/api/avisos/resumen-diario',
      body: {},
    }), deps)
    assert.equal(guardiaResumen.statusCode, 403)

    const cronNegado = await diarioHandler(httpEvent('POST', { body: {} }), { repo })
    assert.equal(cronNegado.statusCode, 401)
    assert.equal(esInvocacionProgramada({ body: JSON.stringify({ next_run: '2026-10-01T13:00:00.000Z' }) }), true)
    const cron = await diarioHandler({ httpMethod: 'POST', body: JSON.stringify({ next_run: '2026-10-01T13:00:00.000Z' }), headers: {} }, { repo })
    assert.equal(cron.statusCode, 200, cron.body)
  })
})

test('KPIs: disponibilidad, MTTR, ETR original, dwell con horaServidor y CSV', async () => {
  const repo = memoryRepo()
  repo.ots.push(otToRow({
    id: 'ot-a',
    folio: 'OT-2026-0001',
    unidadId: 'eq-1',
    yarda: 'chihuahua',
    tipo: 'CORRECTIVO',
    estatus: 'CERRADA',
    fechaEntradaTaller: '2026-09-01T00:00:00.000Z',
    fechaLiberada: '2026-09-02T00:00:00.000Z',
    etr: '2026-09-03T00:00:00.000Z',
    etrOriginal: '2026-09-03T00:00:00.000Z',
    activo: 'SI',
  }))
  repo.ots.push(otToRow({
    id: 'ot-b',
    folio: 'OT-2026-0002',
    unidadId: 'eq-2',
    yarda: 'chihuahua',
    tipo: 'PREVENTIVO',
    estatus: 'CERRADA',
    fechaEntradaTaller: '2026-09-05T00:00:00.000Z',
    fechaLiberada: '2026-09-07T00:00:00.000Z',
    etr: '2026-09-06T00:00:00.000Z',
    etrOriginal: '2026-09-06T00:00:00.000Z',
    activo: 'SI',
  }))
  repo.estados.push(estadoUnidadToRow({ unidadId: 'eq-1', yarda: 'chihuahua', estatusOperativo: 'DISPONIBLE' }))
  repo.estados.push(estadoUnidadToRow({ unidadId: 'eq-2', yarda: 'chihuahua', estatusOperativo: 'DISPONIBLE' }))
  repo.estados.push(estadoUnidadToRow({ unidadId: 'eq-baja', yarda: 'chihuahua', estatusOperativo: 'BAJA' }))
  repo.movimientos.push(
    {
      id: 'en-1',
      tipo: 'entrada',
      equipoId: 'eq-1',
      yardaId: 'chihuahua',
      fechaHora: '2026-09-10T08:00:00.000Z',
      horaServidor: '2026-09-10T12:00:00.000Z',
    },
    {
      id: 'sa-1',
      tipo: 'salida',
      equipoId: 'eq-1',
      yardaId: 'chihuahua',
      fechaHora: '2026-09-10T20:00:00.000Z',
      horaServidor: '2026-09-10T16:00:00.000Z',
    },
  )
  const kpi = createKpiService(repo, { now: () => NOW })
  const resumen = await kpi.resumen({
    yarda: 'chihuahua',
    desde: '2026-09-01T00:00:00.000Z',
    hasta: '2026-09-11T00:00:00.000Z',
  })
  assert.equal(resumen.otsCerradas, 2)
  assert.equal(resumen.otsDentroEtr, 1)
  assert.equal(resumen.otDentroEtrPct, 50)
  assert.equal(resumen.mttrHoras, 36)
  assert.equal(resumen.downtimeHoras, 72)
  assert.equal(resumen.unidades, 2)
  assert.ok(Math.abs(resumen.disponibilidadPct - 85) < 0.001)
  assert.equal(resumen.dwellPromedioHoras, 4)
  assert.equal(resumen.fuenteDwell, 'horaServidor')
  assert.equal(resumen.ciclosConHoraServidor, 1)

  const csv = kpisToCsv(resumen)
  assert.match(csv, /Disponibilidad %/)
  assert.match(csv, /MTTR/)
  assert.match(csv, /ETR original/)
  assert.match(csv, /Dwell promedio/)

  await withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    const ok = await kpisHandler(httpEvent('GET', {
      cookie: cookieFor(admin),
      query: { yarda: 'chihuahua', desde: '2026-09-01T00:00:00.000Z', hasta: '2026-09-11T00:00:00.000Z', format: 'csv' },
    }), { repo })
    assert.equal(ok.statusCode, 200, ok.body)
    assert.match(ok.headers['Content-Type'], /text\/csv/)
    assert.match(ok.body, /Disponibilidad %/)
    const json = await kpisHandler(httpEvent('GET', { cookie: cookieFor(encargado), query: { yarda: 'chihuahua' } }), { repo })
    assert.equal(json.statusCode, 200)
    assert.equal(typeof JSON.parse(json.body).kpis.disponibilidadPct, 'number')
    const no = await kpisHandler(httpEvent('GET', { cookie: cookieFor(guardia) }), { repo })
    assert.equal(no.statusCode, 403)
  })
})

test('cliente: sin API se queda el KPI local; con API llegan las tarjetas', async () => {
  const realFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'sin configurar' }), { status: 503 })
    assert.equal(await fetchKpisOpcional({ yarda: 'chihuahua' }), null)
    assert.equal(await fetchPreventivoOpcional('chihuahua'), null)
    assert.equal(isGateUnavailable(new ApiError('no', 503, {})), true)

    globalThis.fetch = async () => new Response(JSON.stringify({
      kpis: { disponibilidadPct: 91, mttrHoras: 5, otDentroEtrPct: 80, dwellPromedioHoras: 3, fuenteDwell: 'horaServidor' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const kpis = await fetchKpisOpcional({ yarda: 'calera' })
    assert.equal(kpis.disponibilidadPct, 91)
    assert.equal(kpis.fuenteDwell, 'horaServidor')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('migración Fase 4 en seco no borra filas', () => {
  const result = spawnSync(process.execPath, ['scripts/migrate-fase4-sheet.mjs'], {
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
  assert.match(result.stdout, /PlanPreventivo/)
  assert.match(result.stdout, /ServicioProgramado/)
  assert.match(result.stdout, /AvisosLog/)
  assert.match(result.stdout, /AvisosSuscripciones/)
  assert.match(result.stdout, /PENDIENTE/)
  assert.match(result.stdout, /no borra|No se usa/i)
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
