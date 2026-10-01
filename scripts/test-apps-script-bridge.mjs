#!/usr/bin/env node
/**
 * Puente Apps Script: Sheets/Drive sin JSON de cuenta de servicio.
 * node scripts/test-apps-script-bridge.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { exportPKCS8, generateKeyPair } from 'jose'

import { hasAppsScriptEnv, readAppsScriptEnv } from '../netlify/functions/lib/appsScriptTransport.js'
import { createDriveRepo, hasDriveEnv } from '../netlify/functions/lib/driveRepo.js'
import { createSheetsRepo, hasServiceAccountEnv, hasSheetsBackendEnv } from '../netlify/functions/lib/sheetsRepo.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const APPS_URL = 'https://script.google.com/macros/s/TEST/exec'
const SECRET = 'test-apps-script-secret'
const SHEET = 'sheet-apps'

function jsonResponse(obj, status = 200, headers) {
  return new Response(JSON.stringify(obj), { status, headers })
}

function appsEnv(extra = {}) {
  return {
    PATIO_APPS_SCRIPT_URL: APPS_URL,
    PATIO_APPS_SCRIPT_SECRET: SECRET,
    PATIO_SPREADSHEET_ID: SHEET,
    ...extra,
  }
}

function parseBody(init) {
  return JSON.parse(String(init?.body || '{}'))
}

test('hasAppsScriptEnv pide URL, secreto y spreadsheet; hasSheetsBackendEnv es la unión', () => {
  assert.equal(hasAppsScriptEnv({}), false)
  assert.equal(hasAppsScriptEnv({ PATIO_APPS_SCRIPT_URL: APPS_URL, PATIO_APPS_SCRIPT_SECRET: SECRET }), false)
  assert.equal(hasAppsScriptEnv(appsEnv()), true)
  assert.equal(readAppsScriptEnv(appsEnv()).url, APPS_URL)
  assert.equal(
    hasServiceAccountEnv({
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@test.iam.gserviceaccount.com',
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'clave',
      PATIO_SPREADSHEET_ID: SHEET,
    }),
    true,
  )
  assert.equal(hasServiceAccountEnv(appsEnv()), false)
  assert.equal(hasSheetsBackendEnv(appsEnv()), true)
  assert.equal(hasSheetsBackendEnv({}), false)
  assert.equal(hasDriveEnv(appsEnv()), true)
  assert.equal(hasDriveEnv({}), false)
})

test('sheetsGet y sheetsAppend pasan por el puente y mandan el secreto', async () => {
  const calls = []
  const repo = createSheetsRepo({
    env: appsEnv(),
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method, body: parseBody(init), authorization: init.headers?.Authorization })
      const body = parseBody(init)
      assert.equal(body.secret, SECRET)
      assert.equal(body.spreadsheetId, SHEET)
      assert.equal(init.headers.Authorization, `Bearer ${SECRET}`)
      assert.equal(init.method, 'POST')
      if (body.action === 'get') return jsonResponse({ ok: true, values: [['e1', 'entrada']] })
      if (body.action === 'append') {
        assert.equal(body.range, 'Movimientos!A:AJ')
        assert.equal(body.values[0][0], 's1')
        assert.equal(body.values[0][1], '{"nota":true}')
        return jsonResponse({ ok: true, updates: { updatedRows: 1 } })
      }
      if (body.action === 'update') return jsonResponse({ ok: true, updatedRange: body.range })
      if (body.action === 'meta') return jsonResponse({ ok: true, sheets: [{ title: 'Movimientos' }] })
      if (body.action === 'batchUpdate') {
        assert.equal(body.requests[0].addSheet.properties.title, 'Auditoria')
        return jsonResponse({ ok: true, replies: [{ addSheet: { properties: { title: 'Auditoria', sheetId: 9 } } }] })
      }
      throw new Error(`action inesperada ${body.action}`)
    },
  })
  const tokenErr = await repo.getAccessToken().catch((err) => err)
  assert.match(tokenErr.message, /Apps Script mode/)
  assert.equal(calls.length, 0)

  assert.deepEqual(await repo.sheetsGet('Movimientos!A2:AJ'), [['e1', 'entrada']])
  const appended = await repo.sheetsAppend('Movimientos!A:AJ', [['s1', { nota: true }]])
  assert.equal(appended.updates.updatedRows, 1)
  await repo.sheetsUpdate('Auditoria!A1:J1', [['id']])
  const meta = await repo.getSpreadsheetMeta()
  assert.equal(meta.sheets[0].properties.title, 'Movimientos')
  const batch = await repo.batchUpdate([{ addSheet: { properties: { title: 'Auditoria' } } }])
  assert.equal(batch.replies[0].addSheet.properties.sheetId, 9)
  assert.equal(calls.length, 5)
  assert.equal(calls.every((call) => call.url === APPS_URL), true)
  assert.equal(calls.some((call) => call.url.includes('sheets.googleapis.com')), false)
})

test('el 302 del Web App se vuelve a postear con el mismo secreto', async () => {
  let hops = 0
  const repo = createSheetsRepo({
    env: appsEnv(),
    fetch: async (url, init = {}) => {
      hops += 1
      const body = parseBody(init)
      assert.equal(body.secret, SECRET)
      assert.equal(init.method, 'POST')
      if (hops === 1) {
        return new Response('', {
          status: 302,
          headers: { Location: 'https://script.googleusercontent.com/macros/echo?user=me' },
        })
      }
      assert.match(String(url), /script\.googleusercontent\.com/)
      return jsonResponse({ ok: true, values: [[1]] })
    },
  })
  assert.deepEqual(await repo.sheetsGet('Autorizados!A2:S'), [[1]])
  assert.equal(hops, 2)
})

test('ok:false lanza, el secreto no sale en el mensaje, y sin backend es 503', async () => {
  const leaked = createSheetsRepo({
    env: appsEnv(),
    fetch: async () => jsonResponse({ ok: false, error: `falló ${SECRET}` }),
  })
  const err = await leaked.sheetsGet('A1').catch((e) => e)
  assert.equal(err.status, 502)
  assert.equal(err.message.includes(SECRET), false)
  assert.match(err.message, /redactado/)

  const down = createSheetsRepo({
    env: appsEnv(),
    fetch: async () => {
      throw new TypeError('fetch failed')
    },
  })
  const net = await down.sheetsGet('A1').catch((e) => e)
  assert.equal(net.status, 503)

  const slow = createSheetsRepo({
    env: appsEnv(),
    timeoutMs: 30,
    fetch: (_url, init) =>
      new Promise((_resolve, reject) => {
        const fail = () => {
          const abort = new Error('aborted')
          abort.name = 'AbortError'
          reject(abort)
        }
        if (init.signal?.aborted) fail()
        else init.signal?.addEventListener('abort', fail)
      }),
  })
  const timed = await slow.sheetsGet('A1').catch((e) => e)
  assert.equal(timed.status, 503)
  assert.match(timed.message, /tiempo/)

  const missing = createSheetsRepo({ env: {}, fetch: async () => { throw new Error('no debía llamar a la red') } })
  const cfg = await missing.sheetsGet('Autorizados!A1').catch((e) => e)
  assert.equal(cfg.status, 503)
  assert.match(cfg.message, /GOOGLE_SERVICE_ACCOUNT_EMAIL/)
  assert.match(cfg.message, /PATIO_APPS_SCRIPT_URL/)
})

test('con cuenta de servicio el camino REST no cambia aunque exista el puente', async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  const saKey = await exportPKCS8(privateKey)
  const urls = []
  const repo = createSheetsRepo({
    env: appsEnv({
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@test.iam.gserviceaccount.com',
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: saKey,
      PATIO_SPREADSHEET_ID: 'sheet-sa',
    }),
    fetch: async (url, init = {}) => {
      const u = String(url)
      urls.push(u)
      if (u.includes('script.google')) throw new Error(`no debe llamar al puente: ${u}`)
      if (u === 'https://oauth2.googleapis.com/token') return jsonResponse({ access_token: 'sa-token', expires_in: 3600 })
      if (u.includes(':append')) {
        assert.match(u, /valueInputOption=RAW/)
        assert.equal(init.method, 'POST')
        assert.deepEqual(JSON.parse(init.body).values, [['s1']])
        return jsonResponse({})
      }
      if (u.includes('/values/')) return jsonResponse({ values: [['abc']] })
      throw new Error(`fetch inesperado ${u}`)
    },
  })
  assert.deepEqual(await repo.sheetsGet('Autorizados!A2:S'), [['abc']])
  await repo.sheetsAppend('Movimientos!A:AJ', [['s1']])
  assert.equal(urls.some((u) => u.includes('sheets.googleapis.com')), true)
  assert.equal(urls.some((u) => u.includes('script.google')), false)
})

test('Drive en modo Apps Script sube y baja JPEG sin permiso anyone', async () => {
  const folder = '1Usz_zTK3kqO-Pah3seSdPpMQPMfLHDJh'
  const calls = []
  const repo = createDriveRepo({
    env: appsEnv({ PATIO_DRIVE_FOLDER_ID: folder }),
    folderId: folder,
    fetch: async (_url, init = {}) => {
      const body = parseBody(init)
      calls.push(body)
      assert.equal(body.secret, SECRET)
      assert.equal(JSON.stringify(body).includes('anyone'), false)
      if (body.action === 'uploadJpeg') {
        assert.equal(body.folderId, folder)
        assert.equal(body.mimeType, 'image/jpeg')
        assert.equal(body.bytesBase64, 'YQ==')
        return jsonResponse({ ok: true, fileId: 'filePrivate1', name: body.name, mimeType: 'image/jpeg' })
      }
      if (body.action === 'downloadJpeg') {
        assert.equal(body.fileId, 'filePrivate1')
        return jsonResponse({
          ok: true,
          id: 'filePrivate1',
          name: 'a.jpg',
          mimeType: 'image/jpeg',
          bytesBase64: Buffer.from('JPEGDATA').toString('base64'),
        })
      }
      if (body.action === 'fileMeta') {
        return jsonResponse({ ok: true, id: body.fileId, name: 'a.jpg', mimeType: 'image/jpeg', parents: [folder] })
      }
      throw new Error(`action inesperada ${body.action}`)
    },
  })
  const up = await repo.uploadPrivateJpeg({ name: 'placa.jpg', bytesBase64: 'data:image/jpeg;base64,YQ==', parents: [folder] })
  assert.equal(up.id, 'filePrivate1')
  const file = await repo.downloadPrivateFile('filePrivate1')
  assert.equal(file.bytes.toString(), 'JPEGDATA')
  const meta = await repo.getFileMeta('filePrivate1')
  assert.deepEqual(meta.parents, [folder])
  const tokenErr = await repo.getAccessToken().catch((err) => err)
  assert.match(tokenErr.message, /Apps Script mode/)
  assert.equal(calls.some((body) => body.action === 'uploadJpeg' || body.action === 'downloadJpeg'), true)

  const missing = createDriveRepo({
    env: appsEnv(),
    fetch: async () => jsonResponse({ ok: false, error: 'No se encontró la evidencia.', code: 'NOT_IN_FOLDER', status: 404 }),
  })
  const notFound = await missing.downloadPrivateFile('fileAjena1').catch((err) => err)
  assert.equal(notFound.status, 404)
})

test('Drive con cuenta de servicio no usa el puente', async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  const saKey = await exportPKCS8(privateKey)
  const folder = '1Usz_zTK3kqO-Pah3seSdPpMQPMfLHDJh'
  const urls = []
  const repo = createDriveRepo({
    env: appsEnv({
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@test.iam.gserviceaccount.com',
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: saKey,
    }),
    folderId: folder,
    fetch: async (url) => {
      const u = String(url)
      urls.push(u)
      if (u.includes('script.google')) throw new Error('no debe llamar al puente')
      if (u === 'https://oauth2.googleapis.com/token') return jsonResponse({ access_token: 'sa-token', expires_in: 3600 })
      if (u.includes('/upload/drive/')) return jsonResponse({ id: 'filePrivate1' })
      throw new Error(`fetch inesperado ${u}`)
    },
  })
  const up = await repo.uploadPrivateJpeg({ name: 'a.jpg', buffer: Buffer.from('a'), mimeType: 'image/jpeg' })
  assert.equal(up.id, 'filePrivate1')
  assert.equal(urls.some((u) => u.includes('googleapis.com')), true)
  assert.equal(urls.some((u) => u.includes('script.google')), false)
})

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`)
  assert.ok(start >= 0, name)
  let depth = 0
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') {
      depth -= 1
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  throw new Error(`función incompleta: ${name}`)
}

test('PatioBridge.gs cubre las acciones y no comparte archivos con cualquiera', () => {
  const src = readFileSync(new URL('../apps-script/PatioBridge.gs', import.meta.url), 'utf8')
  const readme = readFileSync(new URL('../apps-script/README.md', import.meta.url), 'utf8')
  const sandbox = {}
  vm.runInNewContext(
    ['colToIndex', 'indexToCol', 'splitSheetA1', 'parseA1Range', 'rawCell', 'asGrid'].map((name) => extractFunction(src, name)).join('\n'),
    sandbox,
  )
  const open = sandbox.parseA1Range('Movimientos!A2:AJ')
  assert.equal(open.sheetName, 'Movimientos')
  assert.equal(open.startCol, 1)
  assert.equal(open.startRow, 2)
  assert.equal(open.endCol, 36)
  assert.equal(open.endRow, null)
  const cell = sandbox.parseA1Range('Movimientos!AE1')
  assert.equal(cell.startCol, 31)
  assert.equal(cell.startRow, 1)
  assert.equal(cell.endCol, 31)
  assert.equal(cell.endRow, 1)
  assert.equal(sandbox.parseA1Range('Auditoria!A:A').endCol, 1)
  assert.equal(sandbox.indexToCol(36), 'AJ')
  const grid = sandbox.asGrid([['=1+1', null, { a: 1 }]])
  assert.equal(grid[0][0], "'=1+1")
  assert.equal(grid[0][1], '')
  assert.equal(grid[0][2], '{"a":1}')
  assert.match(src, /function doPost/)
  assert.match(src, /PATIO_SECRET/)
  assert.match(src, /action === 'get'/)
  assert.match(src, /action === 'append'/)
  assert.match(src, /action === 'update'/)
  assert.match(src, /action === 'meta'/)
  assert.match(src, /action === 'batchUpdate'/)
  assert.match(src, /function uploadJpeg/)
  assert.match(src, /function downloadJpeg/)
  assert.match(src, /setValues/)
  assert.match(src, /openById/)
  assert.doesNotMatch(src, /ANYONE_WITH_LINK|Access\.ANYONE|type:\s*'anyone'/)
  assert.match(readme, /Extensiones/)
  assert.match(readme, /PATIO_SECRET/)
  assert.match(readme, /Cualquiera/)
  assert.match(readme, /\/exec/)
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
  console.error(`\n${failed} prueba(s) del puente Apps Script fallaron`)
  process.exit(1)
}
console.log(`\n${tests.length} pruebas del puente Apps Script pasaron`)
