#!/usr/bin/env node
/**
 * Respaldo Supabase → Sheet (Apps Script, sin red).
 * node scripts/test-supabase-sync.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

import {
  AUDITORIA_SHEET,
  AVISOS_LOG_SHEET,
  AVISOS_SUSCRIPCIONES_SHEET,
  CONTEOS_SHEET,
  DEFECTOS_SHEET,
  EQUIPOS_SHEET,
  ESTADO_UNIDAD_SHEET,
  LLEGADAS_ESPERADAS_SHEET,
  OT_EVENTOS_SHEET,
  OT_SHEET,
  PLAN_PREVENTIVO_SHEET,
  REFRIGERACION_SHEET,
  SERVICIO_PROGRAMADO_SHEET,
  ZONAS_SLOTS_SHEET,
} from '../netlify/functions/lib/sheetsRepo.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const SUPABASE = 'https://example.supabase.co'
const KEY = 'service-role-test-key'
const SHEET_ID = 'backup-sheet-id'
const OPERATIONAL = '1yH8vAbXoMFvHdKEt8XMvXWDOc0R1VjVdp1Y3MtCGLp0'

const src = readFileSync(new URL('../apps-script/SupabaseSync.gs', import.meta.url), 'utf8')
const readme = readFileSync(new URL('../apps-script/README.md', import.meta.url), 'utf8')

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function load() {
  const sandbox = {
    UrlFetchApp: { fetch() { throw new Error('UrlFetchApp no se usa en la prueba') } },
    SpreadsheetApp: { openById() { throw new Error('SpreadsheetApp no se usa en la prueba') } },
    PropertiesService: { getScriptProperties() { throw new Error('sin propiedades reales') } },
    ScriptApp: {},
    LockService: {
      getScriptLock() {
        return { waitLock() {}, releaseLock() {} }
      },
    },
    console,
  }
  vm.runInNewContext(src, sandbox, { filename: 'SupabaseSync.gs' })
  return sandbox
}

function props(extra = {}) {
  return {
    SUPABASE_URL: SUPABASE,
    SUPABASE_SERVICE_ROLE_KEY: KEY,
    BACKUP_SPREADSHEET_ID: SHEET_ID,
    ...extra,
  }
}

function response(code, body, headers) {
  return {
    getResponseCode: () => code,
    getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)),
    getHeaders: () => headers || {},
  }
}

function fakeSheet() {
  const tabs = {}
  function make(name) {
    const sheet = {
      name,
      cleared: 0,
      values: [],
      clearContents() {
        this.cleared += 1
        this.values = []
      },
      getRange(row, _col, numRows, numCols) {
        return {
          setValues(grid) {
            assert.equal(grid.length, numRows)
            assert.equal(grid[0].length, numCols)
            for (let r = 0; r < grid.length; r++) {
              sheet.values[row - 1 + r] = grid[r]
            }
          },
        }
      },
    }
    tabs[name] = sheet
    return sheet
  }
  return {
    tabs,
    getSheetByName: (name) => tabs[name] || null,
    insertSheet: (name) => make(name),
  }
}

function run(api, opts) {
  return api.runRespaldo({
    skipLock: true,
    properties: props(),
    spreadsheet: fakeSheet(),
    ...opts,
  })
}

test('el catálogo son las pestañas de Patio y el conteo no usa HEAD', () => {
  const api = load()
  const names = api.PATIO_TABLES.map((table) => table.name)
  const expected = [
    'Autorizados',
    'Movimientos',
    AUDITORIA_SHEET,
    OT_SHEET,
    OT_EVENTOS_SHEET,
    ESTADO_UNIDAD_SHEET,
    ZONAS_SLOTS_SHEET,
    CONTEOS_SHEET,
    DEFECTOS_SHEET,
    PLAN_PREVENTIVO_SHEET,
    SERVICIO_PROGRAMADO_SHEET,
    AVISOS_LOG_SHEET,
    AVISOS_SUSCRIPCIONES_SHEET,
    LLEGADAS_ESPERADAS_SHEET,
    EQUIPOS_SHEET,
    REFRIGERACION_SHEET,
  ]
  assert.deepEqual([...names].sort(), [...expected].sort())
  for (const table of api.PATIO_TABLES) {
    assert.equal(api.backupTabName(table.name), `BAK_${table.name}`)
    assert.ok(table.order)
    assert.ok(table.purpose)
  }
  assert.equal(api.parseContentRange('0-0/42'), 42)
  assert.equal(api.parseContentRange('*/0'), 0)
  assert.equal(api.parseContentRange('items 0-999/1001'), 1001)
  assert.equal(api.parseContentRange(''), null)
  const count = api.solicitudConteo(SUPABASE, 'Movimientos')
  assert.equal(count.url, `${SUPABASE}/rest/v1/Movimientos?select=*`)
  assert.deepEqual(plain(count.headers), { Prefer: 'count=exact', Range: '0-0' })
  const page = api.solicitudPagina(SUPABASE, { name: 'EstadoUnidad', order: 'unidadId' }, 1000, 1000)
  assert.equal(page.headers.Range, '1000-1999')
  assert.match(page.url, /order=unidadId\.asc/)
  const params = api.parametrosGet(KEY, count.headers)
  assert.equal(params.method, 'get')
  assert.equal(params.headers.Prefer, 'count=exact')
  assert.equal(params.headers.Range, '0-0')
  assert.equal(params.headers.Authorization, `Bearer ${KEY}`)
  assert.doesNotMatch(src, /method:\s*['"]head['"]/i)
  assert.doesNotMatch(src, /['"]post['"]|['"]patch['"]|['"]delete['"]/i)
  assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{10,}/)
  assert.match(readme, /respaldoSupabaseDryRun/)
  assert.match(readme, /instalarRespaldoDiario/)
  assert.match(readme, /BACKUP_SPREADSHEET_ID/)
  assert.match(readme, /count=exact/)
  assert.match(readme, /nestor\.riggs@gmail\.com/)
  assert.match(readme, /06:00/)
})

test('el dry-run cuenta con GET y no escribe celdas', () => {
  const api = load()
  const calls = []
  const spreadsheet = fakeSheet()
  const report = run(api, {
    dryRun: true,
    spreadsheet,
    fetch(url, params) {
      calls.push({ url, params })
      const table = decodeURIComponent(url.split('/rest/v1/')[1].split('?')[0])
      assert.equal(params.method, 'get')
      assert.equal(params.headers.Range, '0-0')
      assert.equal(params.headers.Prefer, 'count=exact')
      return response(200, [{ id: 1 }], { 'Content-Range': '0-0/3', 'content-range': '0-0/3' })
    },
  })
  assert.equal(report.ok, true)
  assert.equal(report.dryRun, true)
  assert.equal(calls.length, api.PATIO_TABLES.length)
  assert.equal(report.tablas.find((item) => item.tabla === 'Movimientos').filas, 3)
  assert.equal(Object.keys(spreadsheet.tabs).length, 0)
})

test('una tabla vacía (416 */0) se reescribe sin filas y sin otra página', () => {
  const api = load()
  const calls = []
  const spreadsheet = fakeSheet()
  const report = run(api, {
    dryRun: false,
    spreadsheet,
    fetch(url, params) {
      calls.push(params.headers.Range)
      const table = decodeURIComponent(url.split('/rest/v1/')[1].split('?')[0])
      if (table !== 'Movimientos') return response(416, [], { 'Content-Range': '*/0' })
      if (params.headers.Range === '0-0') return response(200, [{ id: 'm1', nota: '=1+1', extra: { a: 1 }, vacio: null, flag: true }], { 'content-range': '0-0/1' })
      return response(200, [{ id: 'm1', nota: '=1+1', extra: { a: 1 }, vacio: null, flag: true }], { 'content-range': '0-0/1' })
    },
  })
  assert.equal(report.ok, true)
  assert.ok(calls.includes('0-0'))
  assert.equal(calls.filter((range) => range !== '0-0').length, 1)
  const movimientos = spreadsheet.tabs.BAK_Movimientos
  assert.equal(movimientos.cleared, 1)
  assert.deepEqual(plain(movimientos.values[0]), ['id', 'nota', 'extra', 'vacio', 'flag'])
  assert.deepEqual(plain(movimientos.values[1]), ['m1', "'=1+1", '{"a":1}', '', true])
  assert.equal(spreadsheet.tabs.BAK_Equipos.cleared, 1)
  assert.deepEqual(spreadsheet.tabs.BAK_Equipos.values, [])
  assert.equal(spreadsheet.tabs.BAK__resumen.values[0][0], 'tabla')
  assert.equal(spreadsheet.tabs.BAK__resumen.values.length, api.PATIO_TABLES.length + 1)
})

test('más de 1000 filas se piden en páginas y se reescriben', () => {
  const api = load()
  const ranges = []
  const total = 1001
  const spreadsheet = fakeSheet()
  const report = run(api, {
    dryRun: false,
    spreadsheet,
    fetch(url, params) {
      const table = decodeURIComponent(url.split('/rest/v1/')[1].split('?')[0])
      if (table !== 'Movimientos') return response(416, [], { 'Content-Range': '*/0' })
      ranges.push(params.headers.Range)
      assert.equal(params.method, 'get')
      assert.equal(params.headers.Authorization, `Bearer ${KEY}`)
      if (params.headers.Range === '0-0') {
        assert.equal(params.headers.Prefer, 'count=exact')
        return response(206, [{ id: 0 }], { 'Content-Range': `0-0/${total}` })
      }
      const [start, end] = params.headers.Range.split('-').map(Number)
      const rows = []
      for (let i = start; i <= end && i < total; i++) rows.push({ id: i, placa: 'ABC123' })
      return response(206, rows, { 'Content-Range': `${start}-${start + rows.length - 1}/${total}` })
    },
  })
  assert.equal(report.ok, true)
  assert.deepEqual(plain(ranges.filter((range) => range !== '0-0')), ['0-999', '1000-1999'])
  const values = spreadsheet.tabs.BAK_Movimientos.values
  assert.equal(values.length, total + 1)
  assert.deepEqual(plain(values[0]), ['id', 'placa'])
  assert.equal(values[1][0], 0)
  assert.equal(values[total][0], 1000)
  assert.equal(values[1][1], 'ABC123')
})

test('un error de una tabla no corta a las demás y no deja la llave en el texto', () => {
  const api = load()
  const spreadsheet = fakeSheet()
  assert.throws(() => run(api, {
    dryRun: false,
    spreadsheet,
    fetch(url, params) {
      const table = decodeURIComponent(url.split('/rest/v1/')[1].split('?')[0])
      if (table === 'Equipos') throw new Error(`falló con ${KEY}`)
      if (params.headers.Range === '0-0') return response(200, [{ id: 'a' }], { 'Content-Range': '0-0/1' })
      return response(200, [{ id: 'a' }], { 'Content-Range': '0-0/1' })
    },
  }), /Respaldo incompleto: Equipos/)
  const equipos = spreadsheet.tabs.BAK__resumen.values.find((row) => row[0] === 'Equipos')
  assert.equal(equipos[3], 'error')
  assert.match(equipos[4], /\[redacted\]/)
  assert.doesNotMatch(equipos[4], new RegExp(KEY))
  assert.equal(spreadsheet.tabs.BAK_Movimientos.values[1][0], 'a')
})

test('rechaza el Sheet operativo y una URL con ruta o llave', () => {
  const api = load()
  assert.throws(() => api.leerConfig(props({ BACKUP_SPREADSHEET_ID: OPERATIONAL })), /Sheet operativo/)
  assert.throws(() => api.leerConfig(props({ SUPABASE_URL: `${SUPABASE}/rest/v1` })), /SUPABASE_URL/)
  assert.throws(() => api.leerConfig(props({ SUPABASE_URL: 'http://example.supabase.co' })), /SUPABASE_URL/)
  assert.throws(() => api.leerConfig(props({ SUPABASE_SERVICE_ROLE_KEY: '' })), /SUPABASE_SERVICE_ROLE_KEY/)
  assert.equal(api.normalizarSupabaseUrl(`${SUPABASE}/`), SUPABASE)
})

test('instalarRespaldoDiario deja un trigger a las 06:00 de la Ciudad de México', () => {
  const api = load()
  const deleted = []
  const created = []
  const triggers = [
    { getHandlerFunction: () => 'respaldoSupabaseASheets' },
    { getHandlerFunction: () => 'otraCosa' },
  ]
  const scriptApp = {
    getProjectTriggers: () => triggers,
    deleteTrigger(trigger) { deleted.push(trigger.getHandlerFunction()) },
    newTrigger(name) {
      const built = { name }
      const builder = {
        timeBased() { return builder },
        atHour(hour) { built.hour = hour; return builder },
        everyDays(days) { built.days = days; return builder },
        inTimezone(timezone) { built.timezone = timezone; return builder },
        create() { created.push(built); return built },
      }
      return builder
    },
  }
  const result = api.instalarRespaldoDiario({ scriptApp })
  assert.equal(result.ok, true)
  assert.equal(result.hora, 6)
  assert.equal(result.timezone, 'America/Mexico_City')
  assert.deepEqual(deleted, ['respaldoSupabaseASheets'])
  assert.deepEqual(created, [{ name: 'respaldoSupabaseASheets', hour: 6, days: 1, timezone: 'America/Mexico_City' }])
  assert.equal(typeof api.respaldoSupabaseASheets, 'function')
  assert.equal(typeof api.respaldoSupabaseDryRun, 'function')
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
  console.error(`\n${failed} prueba(s) del respaldo Supabase fallaron`)
  process.exit(1)
}
console.log(`\n${tests.length} pruebas del respaldo Supabase pasaron`)
