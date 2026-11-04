#!/usr/bin/env node
/**
 * Mapeo Sheet → patio_* y copia dual (DATA_BACKEND=dual).
 * node scripts/test-supabase-dual.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

import {
  PATIO_TABLES,
  dataBackend,
  dualWriteEnabled,
  looksLikeHeader,
  parseContentRange,
  prepararFilas,
  renderPatioMigrationSql,
  rowToRecord,
  tableBySheet,
  toSnake,
} from '../netlify/functions/lib/patioSupabase.js'
import { createSheetsRepo, movimientoToRow } from '../netlify/functions/lib/sheetsRepo.js'
import {
  AUDITORIA_HEADERS,
  AVISOS_LOG_COLUMNS,
  AVISOS_SUSCRIPCIONES_COLUMNS,
  CONTEOS_COLUMNS,
  DEFECTOS_COLUMNS,
  EQUIPOS_COLUMNS,
  ESTADO_UNIDAD_COLUMNS,
  LLEGADAS_ESPERADAS_COLUMNS,
  MOVIMIENTO_COLUMNS,
  OT_COLUMNS,
  OT_EVENTO_COLUMNS,
  PLAN_PREVENTIVO_COLUMNS,
  REFRIGERACION_COLUMNS,
  SERVICIO_PROGRAMADO_COLUMNS,
  ZONAS_SLOTS_COLUMNS,
} from '../netlify/functions/lib/sheetsRepo.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const APPS_URL = 'https://script.google.com/macros/s/TEST/exec'
const SECRET = 'test-apps-script-secret'
const SUPABASE_URL = 'https://gnqsctwskvwpbhxcfwhq.supabase.co'
const SERVICE_KEY = 'service-role-test-key'

function appsEnv(extra = {}) {
  return {
    PATIO_APPS_SCRIPT_URL: APPS_URL,
    PATIO_APPS_SCRIPT_SECRET: SECRET,
    PATIO_SPREADSHEET_ID: 'sheet-test',
    ...extra,
  }
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}

function sheetColumns() {
  return {
    Autorizados: [
      'email',
      'nombre',
      'apellido',
      'celular',
      'whatsapp',
      'rol',
      'ubicacion',
      'clave',
      'activo',
      'entrada',
      'salida',
      'parado',
      'baja',
      'historial',
      'kpis',
      'equipos',
      'workspace',
      'notas',
      'claveHash',
    ],
    Movimientos: MOVIMIENTO_COLUMNS,
    Equipos: EQUIPOS_COLUMNS,
    Refrigeracion: REFRIGERACION_COLUMNS,
    Auditoria: AUDITORIA_HEADERS,
    OrdenesTrabajo: OT_COLUMNS,
    OT_Eventos: OT_EVENTO_COLUMNS,
    EstadoUnidad: ESTADO_UNIDAD_COLUMNS,
    ZonasSlots: ZONAS_SLOTS_COLUMNS,
    ConteosFisicos: CONTEOS_COLUMNS,
    Defectos: DEFECTOS_COLUMNS,
    PlanPreventivo: PLAN_PREVENTIVO_COLUMNS,
    ServicioProgramado: SERVICIO_PROGRAMADO_COLUMNS,
    AvisosLog: AVISOS_LOG_COLUMNS,
    AvisosSuscripciones: AVISOS_SUSCRIPCIONES_COLUMNS,
    LlegadasEsperadas: LLEGADAS_ESPERADAS_COLUMNS,
  }
}

test('cada pestaña del Sheet tiene tabla patio_* y las mismas columnas', () => {
  const expected = sheetColumns()
  assert.equal(PATIO_TABLES.length, 16)
  assert.deepEqual(
    PATIO_TABLES.map((table) => table.sheet).sort(),
    Object.keys(expected).sort(),
  )
  for (const table of PATIO_TABLES) {
    assert.equal(table.table.startsWith('patio_'), true, table.table)
    assert.deepEqual(table.columns, expected[table.sheet], table.sheet)
    assert.equal(toSnake(table.columns.find((column) => toSnake(column) === table.pk) || table.pk), table.pk)
  }
  assert.equal(tableBySheet('Movimientos').pk, 'id')
  assert.equal(tableBySheet('EstadoUnidad').pk, 'unidad_id')
  assert.equal(tableBySheet('PlanPreventivo').pk, 'tipo_unidad')
  assert.equal(tableBySheet('Autorizados').pk, 'email')
  assert.equal(dataBackend({}), 'sheet')
  assert.equal(dataBackend({ DATA_BACKEND: '  Dual ' }), 'dual')
  assert.equal(dualWriteEnabled({ DATA_BACKEND: 'sheet' }), false)
  assert.equal(dualWriteEnabled({ DATA_BACKEND: 'supabase' }), false)
  assert.equal(dualWriteEnabled({ DATA_BACKEND: 'dual' }), true)
})

test('el SQL commiteado es el de las tablas, con RLS y sin anon', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261104030000_patio_tables.sql', import.meta.url), 'utf8')
  assert.equal(sql, renderPatioMigrationSql())
  assert.doesNotMatch(sql, /create policy/i)
  assert.doesNotMatch(sql, /drop table/i)
  for (const table of PATIO_TABLES) {
    assert.match(sql, new RegExp(`create table public\\.${table.table} \\(`))
    assert.match(sql, new RegExp(`alter table public\\.${table.table} enable row level security;`))
    assert.match(sql, new RegExp(`revoke all on table public\\.${table.table} from public, anon, authenticated;`))
    assert.match(sql, new RegExp(`grant select, insert, update, delete on table public\\.${table.table} to service_role;`))
    for (const column of table.columns) {
      assert.match(sql, new RegExp(`\\n  ${toSnake(column)} text `))
    }
  }
})

test('mapear filas: encabezado, vacías, llave en minúsculas y el último duplicado', () => {
  const movimientos = tableBySheet('Movimientos')
  const header = movimientos.columns.slice()
  assert.equal(looksLikeHeader(movimientos, header), true)
  const row = movimientoToRow({
    id: 'm1',
    tipo: 'entrada',
    equipoId: 'eq-1',
    placa: 'ABC123A',
    kilometros: 10,
    checklist: [{ ok: true }],
    yardaId: 'chihuahua',
    viajeId: 'VJ-1',
  })
  const record = rowToRecord(movimientos, row)
  assert.equal(record.id, 'm1')
  assert.equal(record.equipo_id, 'eq-1')
  assert.equal(record.placa, 'ABC123A')
  assert.equal(record.kilometros, '10')
  assert.equal(record.checklist_json, '[{"ok":true}]')
  assert.equal(record.viaje_id, 'VJ-1')
  assert.equal(record.yarda_id, 'chihuahua')

  const preparado = prepararFilas(movimientos, [header, ['', ''], ['m1', 'entrada', 'eq-1'], ['m1', 'salida', 'eq-9'], ['', 'tipo']])
  assert.equal(preparado.records.length, 1)
  assert.equal(preparado.records[0].tipo, 'salida')
  assert.equal(preparado.records[0].equipo_id, 'eq-9')
  assert.equal(preparado.duplicados, 1)
  assert.equal(preparado.omitidas, 3)

  const autorizados = tableBySheet('Autorizados')
  const kardex = prepararFilas(autorizados, [
    ['Correo electrónico', 'Nombre'],
    ['Ana@X.com', 'Ana', 'Ruiz'],
    ['', 'sin correo'],
  ])
  assert.equal(kardex.records.length, 1)
  assert.equal(kardex.records[0].email, 'ana@x.com')
  assert.equal(kardex.records[0].nombre, 'Ana')
  assert.equal(kardex.records[0].clave_hash, '')

  const plan = prepararFilas(tableBySheet('PlanPreventivo'), [['Tractocamion', '15000', '90', '', '80']])
  assert.equal(plan.records[0].tipo_unidad, 'tractocamion')
  assert.equal(plan.records[0].cada_km, '15000')

  assert.equal(parseContentRange('0-0/42'), 42)
  assert.equal(parseContentRange('*/0'), 0)
  assert.throws(() => parseContentRange(''), /Content-Range/)
})

test('SupabaseSync.gs usa el mismo mapa y no pide HEAD', () => {
  const src = readFileSync(new URL('../apps-script/SupabaseSync.gs', import.meta.url), 'utf8')
  assert.match(src, /SUPABASE_URL/)
  assert.match(src, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(src, /function respaldoSupabaseASheets/)
  assert.match(src, /function importarSheetsASupabase/)
  assert.match(src, /function compararConteosSupabase/)
  assert.match(src, /Prefer: 'count=exact'/)
  assert.match(src, /Range: '0-0'/)
  assert.match(src, /America\/Chihuahua/)
  assert.match(src, /atHour\(6\)/)
  assert.match(src, /BAK_/)
  assert.doesNotMatch(src, /method:\s*['"]head['"]/i)
  assert.doesNotMatch(src, /UrlFetchApp\.fetch\([\s\S]{0,80}HEAD/)

  const sandbox = {}
  vm.runInNewContext(src, sandbox)
  assert.equal(sandbox.patioTablas().length, PATIO_TABLES.length)
  for (const table of PATIO_TABLES) {
    const gas = sandbox.patioTablas().find((item) => item.sheet === table.sheet)
    assert.equal(gas.table, table.table)
    assert.equal(gas.pk, table.pk)
    assert.equal(JSON.stringify(gas.columns), JSON.stringify(table.columns))
    assert.equal(gas.normalizePk || '', table.normalizePk || '')
  }

  const rows = [
    ['id', 'tipo', 'equipoId'],
    ['', ''],
    ['m1', 'entrada', 'eq', { a: 1 }],
    ['m1', 'salida', 'eq2'],
  ]
  assert.equal(
    JSON.stringify(sandbox.prepararFilas(sandbox.patioTablas().find((item) => item.sheet === 'Movimientos'), rows)),
    JSON.stringify(prepararFilas(tableBySheet('Movimientos'), rows)),
  )
  assert.equal(sandbox.nombreBak('Movimientos'), 'BAK_Movimientos')
  assert.throws(() => sandbox.nombreBak('BAK_Movimientos'), /original/)

  const created = {}
  const ss = {
    getSheetByName(name) {
      return created[name] || null
    },
    insertSheet(name) {
      created[name] = makeSheet(name)
      return created[name]
    },
  }
  created.Movimientos = makeSheet('Movimientos')
  const bakName = sandbox.escribirBak(ss, sandbox.patioTablas().find((item) => item.sheet === 'Movimientos'), [
    { id: 'm1', tipo: 'entrada', equipo_id: 'eq' },
  ])
  assert.equal(bakName, 'BAK_Movimientos')
  assert.equal(created.Movimientos.cleared, false)
  assert.equal(created.BAK_Movimientos.cleared, true)
  assert.equal(created.BAK_Movimientos.values[0][0], 'id')
  assert.equal(created.BAK_Movimientos.values[1][0], 'm1')
  assert.equal(created.BAK_Movimientos.values[1][2], 'eq')
})

function makeSheet(name) {
  const sheet = {
    name,
    cleared: false,
    values: null,
    getSheetId() {
      return name
    },
    getName() {
      return name
    },
    clearContents() {
      this.cleared = true
    },
    getRange(_row, _col, _numRows, _numCols) {
      return {
        setValues: (grid) => {
          sheet.values = grid
        },
      }
    },
  }
  return sheet
}

function dualRepo({ env, supabaseStatus = 200, supabaseThrow = null, sheetFail = false, logs = [] }) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    const target = String(url)
    calls.push({ url: target, method: init.method || 'GET', headers: init.headers, body: init.body })
    if (target.startsWith(SUPABASE_URL)) {
      if (supabaseThrow) throw supabaseThrow
      return jsonResponse({ message: 'boom' }, supabaseStatus)
    }
    const body = JSON.parse(String(init.body || '{}'))
    if (sheetFail && body.action === 'append') return jsonResponse({ ok: false, error: 'sheet caído', status: 502 })
    if (body.action === 'get') return jsonResponse({ ok: true, values: body.range.endsWith('!A1:J1') ? [['id']] : [['id'], ['eq-1']] })
    if (body.action === 'append') return jsonResponse({ ok: true, updates: { updatedRows: 1 } })
    if (body.action === 'update') return jsonResponse({ ok: true, updatedRange: body.range })
    throw new Error(`fetch inesperado ${target}`)
  }
  const repo = createSheetsRepo({ env, fetch: fetchImpl, log: (message) => logs.push(message) })
  return { repo, calls, logs }
}

test('DATA_BACKEND=dual copia el movimiento y un 500 de Supabase no rompe el Sheet', async () => {
  const row = movimientoToRow({ id: 'm9', tipo: 'entrada', equipoId: 'eq-9', placa: 'XYZ' })
  const ok = dualRepo({
    env: appsEnv({
      DATA_BACKEND: 'dual',
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    }),
  })
  const appended = await ok.repo.appendMovimiento(row)
  assert.equal(appended.updates.updatedRows, 1)
  const mirror = ok.calls.filter((call) => call.url.startsWith(SUPABASE_URL))
  assert.equal(mirror.length, 1)
  assert.equal(mirror[0].method, 'POST')
  assert.match(mirror[0].url, /\/rest\/v1\/patio_movimientos\?on_conflict=id$/)
  assert.equal(mirror[0].headers.Prefer, 'resolution=merge-duplicates,return=minimal')
  assert.equal(mirror[0].headers.apikey, SERVICE_KEY)
  assert.equal(mirror[0].headers.Authorization, `Bearer ${SERVICE_KEY}`)
  assert.equal(JSON.parse(mirror[0].body).id, 'm9')
  assert.equal(JSON.parse(mirror[0].body).equipo_id, 'eq-9')
  assert.equal(ok.logs.length, 0)

  const logs = []
  const failed = dualRepo({
    env: appsEnv({ DATA_BACKEND: 'dual', SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY }),
    supabaseStatus: 500,
    logs,
  })
  const still = await failed.repo.appendMovimiento(row)
  assert.equal(still.updates.updatedRows, 1)
  assert.equal(logs.length, 1)
  assert.match(logs[0], /\[patio-supabase\] Movimientos: Supabase 500/)
  assert.equal(logs[0].includes(SERVICE_KEY), false)

  const thrown = []
  const boom = dualRepo({
    env: appsEnv({ DATA_BACKEND: 'dual', SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY }),
    supabaseThrow: new Error('red caída'),
    logs: thrown,
  })
  assert.equal((await boom.repo.appendMovimiento(row)).updates.updatedRows, 1)
  assert.match(thrown[0], /red caída/)
  assert.equal(thrown[0].includes(SERVICE_KEY), false)
})

test('sin dual no llama a Supabase, y si el Sheet falla tampoco', async () => {
  const row = movimientoToRow({ id: 'm2', tipo: 'salida', equipoId: 'eq-2' })
  for (const backend of [undefined, 'sheet', 'supabase']) {
    const env = appsEnv()
    if (backend) env.DATA_BACKEND = backend
    env.SUPABASE_URL = SUPABASE_URL
    env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY
    const run = dualRepo({ env })
    await run.repo.appendMovimiento(row)
    assert.equal(run.calls.some((call) => call.url.startsWith(SUPABASE_URL)), false, backend || 'default')
  }

  const logs = []
  const broken = dualRepo({
    env: appsEnv({ DATA_BACKEND: 'dual', SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY }),
    sheetFail: true,
    logs,
  })
  const err = await broken.repo.appendMovimiento(row).catch((error) => error)
  assert.match(err.message, /sheet caído/)
  assert.equal(broken.calls.some((call) => call.url.startsWith(SUPABASE_URL)), false)
  assert.equal(logs.length, 0)
})

test('la baja borra en Supabase y un fallo de borrado no rompe la respuesta', async () => {
  const logs = []
  const run = dualRepo({
    env: appsEnv({ DATA_BACKEND: 'dual', SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY }),
    supabaseStatus: 500,
    logs,
  })
  const result = await run.repo.clearEquipoById('eq-1')
  assert.match(result.range, /^Equipos!A2:I2$/)
  const deleted = run.calls.find((call) => call.method === 'DELETE')
  assert.ok(deleted)
  assert.match(deleted.url, /\/rest\/v1\/patio_equipos\?id=eq\.eq-1$/)
  assert.match(logs[0], /\[patio-supabase\] Equipos: Supabase 500/)
  assert.equal(run.calls.filter((call) => call.url.startsWith(SUPABASE_URL) && call.method === 'POST').length, 0)
})

test('el encabezado de Auditoria no se copia; la fila de auditoría sí', async () => {
  const calls = []
  const repo = createSheetsRepo({
    env: appsEnv({ DATA_BACKEND: 'dual', SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY }),
    fetch: async (url, init = {}) => {
      const target = String(url)
      const body = init.body ? JSON.parse(String(init.body)) : null
      calls.push({ url: target, method: init.method, body })
      if (target.startsWith(SUPABASE_URL)) return jsonResponse({}, 201)
      if (body.action === 'get') return jsonResponse({ ok: true, values: [] })
      return jsonResponse({ ok: true, updates: { updatedRows: 1 } })
    },
  })
  const id = await repo.appendAuditoria({ accion: 'login', usuarioEmail: 'ana@x.com' })
  assert.ok(id)
  const sheetUpdates = calls.filter((call) => call.body?.action === 'update')
  assert.equal(sheetUpdates.length, 1)
  assert.match(sheetUpdates[0].body.range, /Auditoria!A1:J1/)
  const mirrors = calls.filter((call) => call.url.startsWith(SUPABASE_URL))
  assert.equal(mirrors.length, 1)
  assert.match(mirrors[0].url, /patio_auditoria/)
  assert.equal(mirrors[0].body.id, id)
  assert.equal(mirrors[0].body.accion, 'login')
  assert.notEqual(mirrors[0].body.id, 'id')
})

test('dual sin llaves de Supabase deja el Sheet escrito y solo registra', async () => {
  const logs = []
  const run = dualRepo({ env: appsEnv({ DATA_BACKEND: 'dual' }), logs })
  const row = movimientoToRow({ id: 'm3', tipo: 'entrada', equipoId: 'eq-3' })
  const appended = await run.repo.appendMovimiento(row)
  assert.equal(appended.updates.updatedRows, 1)
  assert.equal(run.calls.some((call) => call.url.includes('supabase')), false)
  assert.match(logs[0], /Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY/)
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
  console.error(`\n${failed} prueba(s) de Supabase fallaron`)
  process.exit(1)
}
console.log(`\n${tests.length} pruebas de Supabase pasaron`)
