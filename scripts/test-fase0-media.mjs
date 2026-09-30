#!/usr/bin/env node
/**
 * Pruebas Fase 0.3 — Drive privado y /api/media (sin red real).
 * node scripts/test-fase0-media.mjs
 */

import assert from 'node:assert/strict'
import { exportPKCS8, generateKeyPair } from 'jose'

import { SESSION_COOKIE, signSession } from '../netlify/functions/lib/session.js'
import {
  createDriveRepo,
  createSignedViewUrl,
  decodeImageBytes,
} from '../netlify/functions/lib/driveRepo.js'
import { handler as mediaHandler, extractMediaFileId } from '../netlify/functions/media.js'
import { handler as uploadHandler } from '../netlify/functions/media-upload.js'
import { isNetworkFailure } from '../src/lib/serverApi.js'
import { ApiError } from '../src/lib/serverApi.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const SECRET = 'test-secret-media-0123456789abcd'
const FOLDER = '1Usz_zTK3kqO-Pah3seSdPpMQPMfLHDJh'
const TINY = 'data:image/jpeg;base64,YQ=='

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

function cookieFor(email = 'guardia@camircapital.com') {
  const token = signSession(
    { email, rol: 'guardia', permisos: { entrada: true }, dispositivoId: 'ipad-1' },
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

function bodyText(body) {
  if (Buffer.isBuffer(body)) return body.toString('utf8')
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf8')
  return String(body ?? '')
}

test('decodeImageBytes rechaza vacío y acepta data URL jpeg', () => {
  assert.throws(() => decodeImageBytes(''), /Falta la imagen/)
  const dec = decodeImageBytes(TINY)
  assert.equal(dec.mimeType, 'image/jpeg')
  assert.equal(dec.buffer.toString(), 'a')
  assert.throws(() => decodeImageBytes('data:text/plain;base64,YQ=='), /JPEG o PNG/)
})

test('createSignedViewUrl es same-origin y no es enlace público', () => {
  const url = createSignedViewUrl('abc_def-12', 90)
  assert.equal(url, '/api/media?id=abc_def-12')
  assert.equal(url.includes('drive.google.com'), false)
  assert.equal(url.includes('anyone'), false)
  assert.throws(() => createSignedViewUrl('corta'), /inválido/)
})

test('extractMediaFileId lee query y path', () => {
  assert.equal(extractMediaFileId({ queryStringParameters: { id: 'abc_def-12' } }), 'abc_def-12')
  assert.equal(extractMediaFileId({ path: '/api/media/abc_def-12' }), 'abc_def-12')
  assert.equal(extractMediaFileId({ path: '/.netlify/functions/media/abc_def-12' }), 'abc_def-12')
  assert.equal(extractMediaFileId({ path: '/api/media/upload' }), '')
  assert.equal(extractMediaFileId({ path: '/api/media' }), '')
})

test('uploadPrivateJpeg no llama permissions ni anyone', async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  const saKey = await exportPKCS8(privateKey)
  const urls = []
  const fetchImpl = async (url, init = {}) => {
    const u = String(url)
    urls.push(u)
    if (u === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'sa-token', expires_in: 3600 }), { status: 200 })
    }
    if (u.includes('/permissions')) {
      throw new Error('no se debe crear permiso anyone')
    }
    if (u.includes('/upload/drive/')) {
      const raw = bodyText(init.body)
      assert.equal(raw.includes('anyone'), false)
      assert.equal(raw.includes('"type":"anyone"'), false)
      assert.match(raw, new RegExp(`"parents":\\["${FOLDER}"\\]`))
      assert.match(raw, /image\/jpeg/)
      assert.equal(init.method, 'POST')
      return new Response(JSON.stringify({ id: 'filePrivate1' }), { status: 200 })
    }
    throw new Error(`fetch inesperado ${u}`)
  }
  const repo = createDriveRepo({
    email: 'sa@test.iam.gserviceaccount.com',
    privateKey: saKey,
    folderId: FOLDER,
    fetch: fetchImpl,
  })
  const up = await repo.uploadPrivateJpeg({
    name: 'yarda-placa.jpg',
    bytesBase64: TINY,
    parents: [FOLDER],
  })
  assert.equal(up.id, 'filePrivate1')
  assert.equal(urls.some((u) => u.includes('/permissions')), false)
  assert.equal(createSignedViewUrl(up.id), '/api/media?id=filePrivate1')
})

test('Drive 403 de carpeta no compartida se reporta como 503 (la caseta puede usar el legado)', async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  const saKey = await exportPKCS8(privateKey)
  const repo = createDriveRepo({
    email: 'sa@test.iam.gserviceaccount.com',
    privateKey: saKey,
    folderId: FOLDER,
    fetch: async (url) => {
      if (String(url) === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'sa-token', expires_in: 3600 }), { status: 200 })
      }
      return new Response('forbidden', { status: 403 })
    },
  })
  const err = await repo.uploadPrivateJpeg({ name: 'a.jpg', buffer: Buffer.from('a'), mimeType: 'image/jpeg' }).catch((e) => e)
  assert.equal(err.status, 503)
  assert.match(err.message, /Content manager/)
})

test('download solo si el archivo está en la carpeta y usa alt=media', async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  const saKey = await exportPKCS8(privateKey)
  const urls = []
  const fetchImpl = async (url) => {
    const u = String(url)
    urls.push(u)
    if (u === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'sa-token', expires_in: 3600 }), { status: 200 })
    }
    if (u.includes('/permissions')) throw new Error('permissions no')
    if (u.includes('alt=media')) {
      return new Response(Buffer.from('JPEGDATA'), { status: 200 })
    }
    if (u.includes('/files/fileEnCarpeta')) {
      return new Response(
        JSON.stringify({ id: 'fileEnCarpeta', name: 'a.jpg', mimeType: 'image/jpeg', parents: [FOLDER] }),
        { status: 200 },
      )
    }
    if (u.includes('/files/fileAjena')) {
      return new Response(
        JSON.stringify({ id: 'fileAjena', name: 'x.jpg', mimeType: 'image/jpeg', parents: ['otra-carpeta'] }),
        { status: 200 },
      )
    }
    throw new Error(`fetch inesperado ${u}`)
  }
  const repo = createDriveRepo({
    email: 'sa@test.iam.gserviceaccount.com',
    privateKey: saKey,
    folderId: FOLDER,
    fetch: fetchImpl,
  })
  const file = await repo.downloadPrivateFile('fileEnCarpeta')
  assert.equal(file.bytes.toString(), 'JPEGDATA')
  assert.ok(urls.some((u) => u.includes('alt=media')))
  assert.equal(urls.some((u) => u.includes('/permissions')), false)
  const missing = await repo.downloadPrivateFile('fileAjena').catch((e) => e)
  assert.equal(missing.status, 404)
})

test('GET /api/media sin sesión es 401; con sesión entrega la imagen', async () => {
  await withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    const noSession = await mediaHandler(httpEvent('GET', { query: { id: 'fileEnCarpeta' } }))
    assert.equal(noSession.statusCode, 401)
    assert.match(JSON.parse(noSession.body).error, /Sesión/)

    const repo = {
      async downloadPrivateFile(id) {
        assert.equal(id, 'fileEnCarpeta')
        return { id, mimeType: 'image/jpeg', bytes: Buffer.from('JPEGDATA'), name: 'a.jpg' }
      },
    }
    const ok = await mediaHandler(httpEvent('GET', { cookie: cookieFor(), query: { id: 'fileEnCarpeta' } }), { drive: repo })
    assert.equal(ok.statusCode, 200)
    assert.equal(ok.isBase64Encoded, true)
    assert.equal(ok.headers['Content-Type'], 'image/jpeg')
    assert.equal(Buffer.from(ok.body, 'base64').toString(), 'JPEGDATA')
    assert.equal(String(ok.headers['Cache-Control']).includes('private'), true)
  })
})

test('GET /api/media sin secreto de sesión es 503', async () => {
  await withEnv({ PATIO_SESSION_SECRET: null }, async () => {
    const res = await mediaHandler(httpEvent('GET', { query: { id: 'fileEnCarpeta' } }))
    assert.equal(res.statusCode, 503)
  })
})

test('POST /api/media/upload exige sesión y devuelve viewPath privado', async () => {
  await withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    const noSession = await uploadHandler(httpEvent('POST', { body: { dataUrl: TINY, fileName: 'a.jpg' } }))
    assert.equal(noSession.statusCode, 401)

    const seen = []
    const repo = {
      folderId: FOLDER,
      async uploadPrivateJpeg(input) {
        seen.push(input)
        assert.equal(input.mimeType, 'image/jpeg')
        assert.deepEqual(input.parents, [FOLDER])
        assert.equal(JSON.stringify(input).includes('anyone'), false)
        assert.equal(input.appProperties.slotId, 'placa-camion-frontal')
        assert.equal(input.appProperties.uploadedBy, 'guardia@camircapital.com')
        return { id: 'filePrivate1', name: input.name, mimeType: input.mimeType }
      },
    }
    const res = await uploadHandler(
      httpEvent('POST', {
        cookie: cookieFor(),
        body: {
          fileName: 'chihuahua-placa.jpg',
          dataUrl: TINY,
          yardaId: 'chihuahua',
          movimientoId: 'mov-1',
          slotId: 'placa-camion-frontal',
        },
      }),
      { drive: repo },
    )
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.fileId, 'filePrivate1')
    assert.equal(body.viewPath, '/api/media?id=filePrivate1')
    assert.equal(seen.length, 1)
  })
})

test('POST /api/media/upload sin secreto es 503 (la caseta cae al legado)', async () => {
  await withEnv({ PATIO_SESSION_SECRET: null }, async () => {
    const res = await uploadHandler(httpEvent('POST', { body: { dataUrl: TINY } }))
    assert.equal(res.statusCode, 503)
  })
})

test('POST /api/media/upload limita 120 por minuto por email', async () => {
  await withEnv({ PATIO_SESSION_SECRET: SECRET }, async () => {
    const repo = {
      folderId: FOLDER,
      async uploadPrivateJpeg() {
        return { id: 'fileRateLimit1', name: 'a.jpg', mimeType: 'image/jpeg' }
      },
    }
    const cookie = cookieFor('rate@camircapital.com')
    let last = null
    for (let i = 0; i < 121; i++) {
      last = await uploadHandler(
        httpEvent('POST', { cookie, body: { dataUrl: TINY, fileName: `f${i}.jpg`, slotId: 'foto' } }),
        { drive: repo },
      )
    }
    assert.equal(last.statusCode, 429)
    assert.match(JSON.parse(last.body).error, /Demasiadas/)
  })
})

test('isNetworkFailure distingue red de respuesta HTTP', () => {
  assert.equal(isNetworkFailure(new TypeError('Failed to fetch')), true)
  assert.equal(isNetworkFailure(new ApiError('no', 503, {})), false)
  assert.equal(isNetworkFailure(new ApiError('no', 401, {})), false)
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
