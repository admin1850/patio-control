#!/usr/bin/env node
/**
 * Pruebas Fase 3 — gate fuerte de salida (sello ciego, documentos, Thermo, daños).
 * node scripts/test-fase3-gate.mjs
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { SESSION_COOKIE, signSession } from '../netlify/functions/lib/session.js'
import {
  DEFECTOS_COLUMNS,
  columnLetter,
  defectoToRow,
  findOpenEntradaIn,
  rowToDefecto,
  rowToEstadoUnidad,
  rowToMovimiento,
  rowToOt,
  rowToOtEvento,
} from '../netlify/functions/lib/sheetsRepo.js'
import { createOtService } from '../netlify/functions/lib/otService.js'
import { createGateService } from '../netlify/functions/lib/gateService.js'
import { handler as gateHandler } from '../netlify/functions/gate-validar-salida.js'
import { handler as createMovimientoHandler } from '../netlify/functions/movimientos-create.js'
import {
  angulosDeEquipo,
  debeMostrarSelloEntrada,
  evaluarThermo,
  normalizarEstadoDano,
  precargaKmDiesel,
  vistaSelloCiego,
} from '../src/lib/salidaFuerte.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const SECRET = 'test-secret-fase3-gate-0123456789'
const NOW = new Date('2026-09-30T18:00:00.000Z')
const UUID = '12345678-1234-4234-8234-123456789ABC'
const LIC = 'FED1234567'
const SELLO = 'SELLO-SECRETO-99'
const ETR = '2026-10-05T18:00:00.000Z'

const encargado = {
  email: 'Encargado@CamirCapital.com',
  rol: 'encargado_yarda',
  permisos: { entrada: true, salida: true, parado: true, baja: true },
  dispositivoId: 'ipad-yarda',
}
const guardia = {
  email: 'guardia@camircapital.com',
  rol: 'guardia',
  permisos: { entrada: true, salida: true, parado: false, baja: false },
  dispositivoId: 'ipad-caseta',
}

function memoryRepo() {
  const ots = []
  const eventos = []
  const estados = []
  const auditoria = []
  const movimientos = []
  const defectos = []
  return {
    ots,
    eventos,
    estados,
    auditoria,
    movimientos,
    defectos,
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
      return { rowNumber: idx + 2 }
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
    async listMovimientos() {
      return movimientos.slice()
    },
    async findMovimientoById(id) {
      return movimientos.find((item) => item.id === id) || null
    },
    async findOpenEntrada(equipoId) {
      return findOpenEntradaIn(movimientos, equipoId)
    },
    async appendMovimiento(row) {
      const mov = rowToMovimiento(row)
      if (mov) movimientos.push(mov)
    },
    async listDefectos() {
      return defectos.map(rowToDefecto).filter(Boolean)
    },
    async appendDefecto(row) {
      defectos.push(row.slice())
    },
  }
}

function entrada(over = {}) {
  return {
    id: 'ent-1',
    tipo: 'entrada',
    equipoId: 'eq-libre',
    placa: 'LIBRE1',
    selloNumero: SELLO,
    kilometros: 1000,
    llevaRefrigerada: false,
    ...over,
  }
}

function docsOk(over = {}) {
  return {
    equipoId: 'eq-libre',
    placa: 'LIBRE1',
    selloCapturado: SELLO,
    kilometros: 1100,
    cartaPorteUuid: UUID,
    licenciaFederal: LIC,
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

function httpEvent(method, { cookie = '', body } = {}) {
  return {
    httpMethod: method,
    headers: cookie ? { cookie } : {},
    body: body === undefined ? '' : JSON.stringify(body),
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

test('sello ciego: no se muestra el esperado y el desajuste bloquea', async () => {
  assert.equal(debeMostrarSelloEntrada(), false)
  const vista = vistaSelloCiego({ capturado: 'abc 12', selloEntrada: 'NO-MOSTRAR-7788' })
  assert.equal(vista.mostrarSelloEntrada, false)
  assert.equal(vista.selloCapturado, 'ABC12')
  assert.equal(JSON.stringify(vista).includes('NO-MOSTRAR-7788'), false)
  assert.match(vista.ayuda, /no se muestra/i)
  assert.deepEqual(precargaKmDiesel(), { km: '', dieselPct: '', dieselL: '' })

  const repo = memoryRepo()
  repo.movimientos.push(entrada())
  const gate = createGateService(repo, { now: () => NOW })
  const mal = await gate.validarSalida(guardia, docsOk({ selloCapturado: 'OTRO-SELLO' }))
  assert.equal(mal.resultado, 'BLOQUEADO')
  assert.ok(mal.motivos.some((item) => item.codigo === 'SELLO_NO_COINCIDE'))
  assert.match(mal.mensaje, /no coincide/i)
  assert.equal(JSON.stringify(mal).includes(SELLO), false)

  const encargadoPide = await gate.validarSalida(encargado, docsOk({ selloCapturado: 'OTRO-SELLO' }))
  assert.equal(encargadoPide.resultado, 'REQUIERE_AUTORIZACION')
  assert.equal(JSON.stringify(encargadoPide).includes(SELLO), false)

  const ok = await gate.validarSalida(guardia, docsOk())
  assert.equal(ok.resultado, 'PERMITIDO')
  assert.equal(ok.cumplimiento.validadoGate, true)
  assert.equal(ok.cumplimiento.selloCoincide, true)
  assert.equal(JSON.stringify(ok).includes(SELLO), false)
})

test('Carta Porte opcional; sin licencia no sale, salvo override', async () => {
  const repo = memoryRepo()
  repo.movimientos.push(entrada())
  const gate = createGateService(repo, { now: () => NOW })

  // Sin Carta Porte pero con licencia válida → no bloquea por CARTA_PORTE
  const sinCp = await gate.validarSalida(guardia, docsOk({ cartaPorteUuid: '', licenciaFederal: LIC }))
  assert.equal(sinCp.resultado, 'PERMITIDO')
  assert.ok(!sinCp.motivos.some((item) => item.codigo === 'CARTA_PORTE'))

  const guardiaBloq = await gate.validarSalida(guardia, docsOk({ cartaPorteUuid: '', licenciaFederal: '' }))
  assert.equal(guardiaBloq.resultado, 'BLOQUEADO')
  assert.ok(!guardiaBloq.motivos.some((item) => item.codigo === 'CARTA_PORTE'))
  assert.ok(guardiaBloq.motivos.some((item) => item.codigo === 'LICENCIA_FEDERAL'))

  // Si escriben un UUID mal formado, sí pide corrección / autorización
  const pide = await gate.validarSalida(encargado, docsOk({ cartaPorteUuid: 'no-es-uuid', licenciaFederal: LIC }))
  assert.equal(pide.resultado, 'REQUIERE_AUTORIZACION')
  assert.ok(pide.motivos.some((item) => item.codigo === 'CARTA_PORTE'))

  const auth = await gate.validarSalida(encargado, docsOk({
    cartaPorteUuid: '',
    licenciaFederal: '',
    overrideMotivo: 'Sale sin licencia por excepción operativa',
  }))
  assert.equal(auth.resultado, 'PERMITIDO')
  assert.equal(auth.via, 'OVERRIDE')
})

test('Thermo fuera de rango pide autorización; en rango sale', async () => {
  const repo = memoryRepo()
  const gate = createGateService(repo, { now: () => NOW })
  const base = docsOk({
    equipoId: 'eq-thermo',
    placa: 'THER1',
    selloCapturado: '',
    llevaRefrigerada: true,
    setPoint: 2,
    tempReal: 6,
    dieselThermo: 40,
    horometro: 120,
  })
  const guardiaDelta = await gate.validarSalida(guardia, base)
  assert.equal(guardiaDelta.resultado, 'BLOQUEADO')
  assert.ok(guardiaDelta.motivos.some((item) => item.codigo === 'THERMO_DELTA'))

  const pide = await gate.validarSalida(encargado, base)
  assert.equal(pide.resultado, 'REQUIERE_AUTORIZACION')

  const diesel = await gate.validarSalida(guardia, { ...base, tempReal: 2, dieselThermo: 10 })
  assert.equal(diesel.resultado, 'BLOQUEADO')
  assert.ok(diesel.motivos.some((item) => item.codigo === 'THERMO_DIESEL'))
  assert.equal(diesel.motivos.some((item) => item.codigo === 'THERMO_DELTA'), false)

  const justo = await gate.validarSalida(guardia, { ...base, tempReal: 4, dieselThermo: 25 })
  assert.equal(justo.resultado, 'PERMITIDO')
  assert.equal(justo.cumplimiento.thermoAlerta, false)

  const falta = await gate.validarSalida(guardia, { ...base, setPoint: '', tempReal: 2, dieselThermo: 40 })
  assert.equal(falta.resultado, 'BLOQUEADO')
  assert.ok(falta.motivos.some((item) => item.codigo === 'THERMO_SETPOINT'))

  const cat = evaluarThermo({ llevaRefrigerada: true, setPoint: 'fresco-0-2', tempReal: 8, dieselThermo: 'reserva', horometro: 3 })
  assert.ok(cat.motivos.some((item) => item.codigo === 'THERMO_DELTA' || item.codigo === 'THERMO_DIESEL'))
})

test('km menor sigue bloqueado aunque haya override; mantenimiento también', async () => {
  const repo = memoryRepo()
  repo.movimientos.push(entrada())
  const ot = createOtService(repo, { now: () => NOW })
  await ot.createOT(encargado, {
    unidadId: 'eq-mant',
    placa: 'MANT1',
    yarda: 'chihuahua',
    tipo: 'CORRECTIVO',
    motivo: 'Falla de frenos',
    etr: ETR,
  })
  const gate = createGateService(repo, { otService: ot, now: () => NOW })
  const km = await gate.validarSalida(encargado, docsOk({
    kilometros: 900,
    overrideMotivo: 'Autorizo aunque el odómetro marque menos',
  }))
  assert.equal(km.resultado, 'BLOQUEADO')
  assert.ok(km.motivos.some((item) => item.codigo === 'KM_MENOR'))

  const mant = await gate.validarSalida(guardia, docsOk({ equipoId: 'eq-mant', placa: 'MANT1', selloCapturado: '' }))
  assert.equal(mant.resultado, 'BLOQUEADO')
  assert.match(mant.mensaje, /mantenimiento/i)
  assert.ok(mant.motivos.some((item) => item.codigo === 'MANTENIMIENTO'))
})

test('daños: ángulos, estado y fila Defectos', () => {
  const angulos = angulosDeEquipo('camion', [{ slotId: 'tractor-frontal', url: 'https://fotos.example/frente.jpg', label: 'Frontal' }])
  assert.equal(angulos[0].id, 'frontal')
  assert.equal(angulos[0].entradaUrl, 'https://fotos.example/frente.jpg')
  assert.equal(angulosDeEquipo('caja', []).some((item) => item.id === 'frontal'), false)
  assert.equal(normalizarEstadoDano('dano_nuevo'), 'DANO_NUEVO')
  assert.equal(normalizarEstadoDano('SIN_CAMBIO'), 'SIN_CAMBIO')
  assert.equal(normalizarEstadoDano('otro'), '')

  assert.equal(DEFECTOS_COLUMNS.length, 9)
  assert.equal(columnLetter(DEFECTOS_COLUMNS.length - 1), 'I')
  assert.equal(DEFECTOS_COLUMNS[4], 'tipo')
  const row = defectoToRow({
    id: 'def-1',
    movimientoId: 'sal-1',
    equipoId: 'eq-libre',
    angulo: 'frontal',
    tipo: 'DANO_NUEVO',
    fotos: ['https://fotos.example/dano.jpg'],
    otId: 'ot-9',
    usuarioEmail: 'guardia@camircapital.com',
    horaServidor: NOW.toISOString(),
  })
  const back = rowToDefecto(row)
  assert.equal(back.tipo, 'DANO_NUEVO')
  assert.equal(back.angulo, 'frontal')
  assert.equal(back.otId, 'ot-9')
  assert.deepEqual(back.fotosJson, ['https://fotos.example/dano.jpg'])
})

test('HTTP: el gate no revela el sello y el servidor no cree validadoGate', async () => {
  await withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    const repo = memoryRepo()
    repo.movimientos.push(entrada())
    const mal = await gateHandler(httpEvent('POST', {
      cookie: cookieFor(guardia),
      body: docsOk({ selloCapturado: 'OTRO-SELLO' }),
    }), { repo })
    assert.equal(mal.statusCode, 200, mal.body)
    const body = JSON.parse(mal.body)
    assert.equal(body.resultado, 'BLOQUEADO')
    assert.equal(mal.body.includes(SELLO), false)
    assert.equal(body.cumplimiento.validadoGate, false)

    const antes = repo.movimientos.length
    const denied = await createMovimientoHandler(httpEvent('POST', {
      cookie: cookieFor(guardia),
      body: {
        id: 'sal-falso',
        tipo: 'salida',
        equipoId: 'eq-libre',
        placa: 'LIBRE1',
        selloNumero: 'OTRO-SELLO',
        kilometros: 1100,
        cartaPorteUuid: UUID,
        licenciaFederal: LIC,
        cumplimiento: { validadoGate: true, cartaPorteUuid: UUID, licenciaFederal: LIC },
      },
    }), { repo })
    assert.equal(denied.statusCode, 409, denied.body)
    assert.equal(JSON.parse(denied.body).resultado, 'BLOQUEADO')
    assert.equal(repo.movimientos.length, antes)

    const saved = await createMovimientoHandler(httpEvent('POST', {
      cookie: cookieFor(guardia),
      body: {
        id: 'sal-ok',
        tipo: 'salida',
        equipoId: 'eq-libre',
        placa: 'LIBRE1',
        selloNumero: SELLO,
        kilometros: 1200,
        cartaPorteUuid: UUID,
        licenciaFederal: LIC,
        cumplimiento: { validadoGate: false, cartaPorteUuid: UUID, licenciaFederal: LIC },
        defectos: [{
          id: 'def-salida',
          angulo: 'frontal',
          tipo: 'DANO_NUEVO',
          otId: 'ot-x',
          fotos: ['https://fotos.example/dano.jpg'],
        }],
      },
    }), { repo })
    assert.equal(saved.statusCode, 200, saved.body)
    const mov = JSON.parse(saved.body).movimiento
    assert.equal(mov.cumplimiento.validadoGate, true)
    assert.equal(mov.selloCoincideEntrada, true)
    assert.equal(mov.cumplimiento.cartaPorteUuid, UUID)
    const defecto = repo.defectos.map(rowToDefecto)[0]
    assert.equal(defecto.tipo, 'DANO_NUEVO')
    assert.equal(defecto.movimientoId, 'sal-ok')
    assert.equal(defecto.otId, 'ot-x')
    assert.equal(defecto.fotosJson[0], 'https://fotos.example/dano.jpg')

    const caido = memoryRepo()
    caido.movimientos.push(entrada({ id: 'ent-caida' }))
    caido.listEstadoUnidad = async () => {
      const err = new Error('Falta EstadoUnidad')
      err.status = 503
      throw err
    }
    const legado = await createMovimientoHandler(httpEvent('POST', {
      cookie: cookieFor(guardia),
      body: {
        id: 'sal-503',
        tipo: 'salida',
        equipoId: 'eq-libre',
        placa: 'LIBRE1',
        kilometros: 1300,
        cumplimiento: { validadoGate: true },
      },
    }), { repo: caido })
    assert.equal(legado.statusCode, 200, legado.body)
    const libre = JSON.parse(legado.body).movimiento
    assert.equal(libre.cumplimiento.validadoGate, false)
    assert.equal(libre.cumplimiento.validacionServidor, false)
  })
})

test('la salida corta no enseña el sello ni precarga km', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/App.jsx', import.meta.url)), 'utf8')
  const start = src.indexOf('var SALIDA_CORTA_SLOTS')
  const end = src.indexOf('\nfunction Un(')
  assert.ok(start > 0 && end > start)
  const form = src.slice(start, end)
  assert.equal(form.includes('Sello en entrada'), false)
  assert.equal(form.includes('selloEntrada'), false)
  assert.equal(form.includes('setKm(row.entrada.kilometros'), false)
  assert.equal(form.includes('setDieselPct(row.entrada'), false)
  assert.match(form, /selloCapturado/)
  assert.match(form, /salida-sello/)
  assert.match(form, /required: true/)
  assert.match(form, /cartaPorteUuid/)
  assert.match(form, /licenciaFederal/)
  assert.match(form, /DANO_NUEVO/)
  assert.match(form, /SIN_CAMBIO/)
  assert.match(form, /CORRECTIVO/)
  assert.match(form, /precargaKmDiesel/)
  assert.doesNotMatch(form, /validadoGate:\s*true/)
  assert.match(form, /validadoGate: false/)
})

test('migración Fase 3 en dry-run no escribe y explica cómo revertir', () => {
  const result = spawnSync(process.execPath, ['scripts/migrate-fase3-sheet.mjs'], {
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
  assert.match(result.stdout, /Defectos/)
  assert.match(result.stdout, /movimientoId/)
  assert.match(result.stdout, /fotosJson/)
  assert.match(result.stdout, /DANO_NUEVO/)
  assert.match(result.stdout, /revertir/i)
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
