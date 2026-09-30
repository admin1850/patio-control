/**
 * Google Drive con la cuenta de servicio (servidor).
 * Env: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
 *      PATIO_DRIVE_FOLDER_ID (default: carpeta Evidencias).
 *
 * La carpeta debe compartirse con la cuenta de servicio como Content manager o Editor.
 * Los archivos se crean privados: no se llama a permissions.create con type "anyone".
 * La vista es same-origin (`/api/media?id=`) con la sesión de PatioControl.
 */

import { SignJWT, importPKCS8 } from 'jose'
import { normalizePrivateKey, readServiceAccountEnv } from './sheetsRepo.js'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id'
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files'

/** Carpeta Evidencias de PatioControl. */
export const DEFAULT_DRIVE_FOLDER_ID = '1Usz_zTK3kqO-Pah3seSdPpMQPMfLHDJh'

const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024
const FILE_ID_RE = /^[A-Za-z0-9_-]{8,128}$/

export function readDriveEnv(env = process.env) {
  const sa = readServiceAccountEnv(env)
  const configured = String(env.PATIO_DRIVE_FOLDER_ID ?? '').trim()
  return {
    email: sa.email,
    privateKey: sa.privateKey,
    folderId: configured || DEFAULT_DRIVE_FOLDER_ID,
  }
}

export function hasDriveEnv(env = process.env) {
  const c = readDriveEnv(env)
  return Boolean(c.email && c.privateKey && c.folderId)
}

function driveError(message, status, code = 'DRIVE') {
  const err = new Error(message)
  err.status = status
  err.code = code
  return err
}

export function assertDriveId(id, label = 'archivo') {
  const value = String(id ?? '').trim()
  if (!FILE_ID_RE.test(value)) {
    throw driveError(`Identificador de ${label} inválido.`, 400, 'BAD_ID')
  }
  return value
}

function normalizeTtl(ttlSec) {
  const n = Number(ttlSec)
  if (!Number.isFinite(n) || n <= 0) return 300
  return Math.min(24 * 3600, Math.floor(n))
}

/**
 * Ruta same-origin para ver el archivo. No es un enlace público de Drive.
 * `ttlSec` queda reservado: el acceso lo corta la cookie de sesión, no un permiso "anyone".
 * @param {string} fileId
 * @param {number} [ttlSec]
 * @returns {string}
 */
export function createSignedViewUrl(fileId, ttlSec = 300) {
  const id = assertDriveId(fileId)
  const ttl = normalizeTtl(ttlSec)
  if (ttl < 1) throw driveError('TTL inválido.', 400, 'TTL')
  return `/api/media?id=${id}`
}

export function mediaViewPath(fileId) {
  return createSignedViewUrl(fileId)
}

/**
 * @param {string} input data URL o base64 crudo
 * @returns {{ buffer: Buffer, mimeType: string, base64: string }}
 */
export function decodeImageBytes(input) {
  const raw = String(input ?? '').trim()
  if (!raw) throw driveError('Falta la imagen.', 400, 'NO_IMAGE')
  if (raw.length > 8_000_000) throw driveError('La imagen es demasiado grande.', 413, 'TOO_BIG')

  let mimeType = 'image/jpeg'
  let b64 = raw
  const m = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(raw)
  if (m) {
    mimeType = m[1].toLowerCase()
    b64 = m[2]
  }
  if (mimeType === 'image/jpg') mimeType = 'image/jpeg'
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
    throw driveError('Solo se aceptan fotos JPEG o PNG.', 400, 'MIME')
  }
  b64 = b64.replace(/\s/g, '')
  if (!b64) throw driveError('Falta la imagen.', 400, 'NO_IMAGE')
  const buffer = Buffer.from(b64, 'base64')
  if (!buffer.length) throw driveError('La imagen está vacía.', 400, 'NO_IMAGE')
  if (buffer.length > MAX_IMAGE_BYTES) throw driveError('La imagen es demasiado grande.', 413, 'TOO_BIG')
  return { buffer, mimeType, base64: b64 }
}

export function safeFileName(name, fallback = 'evidencia.jpg') {
  const base = String(name || fallback)
    .replace(/[/\\?%*:|"<>#]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
  return base || fallback
}

function multipartRelated(metadata, buffer, mimeType) {
  const boundary = `patio_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf8',
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  return {
    body: Buffer.concat([head, buffer, tail]),
    contentType: `multipart/related; boundary=${boundary}`,
  }
}

/**
 * @param {{ email?: string, privateKey?: string, folderId?: string, fetch?: typeof fetch }} [opts]
 */
export function createDriveRepo(opts = {}) {
  const env = readDriveEnv()
  const email = opts.email ?? env.email
  const privateKey = opts.privateKey != null ? normalizePrivateKey(opts.privateKey) : env.privateKey
  const folderId = String(opts.folderId ?? env.folderId).trim() || DEFAULT_DRIVE_FOLDER_ID
  const fetchImpl = opts.fetch ?? globalThis.fetch
  let cached = { token: '', exp: 0 }

  function assertConfig() {
    if (!email || !privateKey || !folderId) {
      throw driveError(
        'Drive no configurado (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY / PATIO_DRIVE_FOLDER_ID).',
        503,
        'NO_CONFIG',
      )
    }
  }

  async function getAccessToken() {
    assertConfig()
    const now = Math.floor(Date.now() / 1000)
    if (cached.token && cached.exp - 60 > now) return cached.token
    const key = await importPKCS8(privateKey, 'RS256')
    const assertion = await new SignJWT({ scope: DRIVE_SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(email)
      .setAudience(TOKEN_URL)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key)
    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.access_token) {
      throw driveError(
        `Token de cuenta de servicio falló: ${data.error_description || data.error || res.status}`,
        502,
        'SA_TOKEN',
      )
    }
    cached = { token: data.access_token, exp: now + Number(data.expires_in || 3600) }
    return cached.token
  }

  async function driveFetch(url, init = {}) {
    const token = await getAccessToken()
    const res = await fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    })
    return res
  }

  function mapGoogleStatus(status, text) {
    if (status === 401 || status === 403 || status === 404) {
      return driveError(
        'Drive de la cuenta de servicio no está listo. Comparte la carpeta de evidencias como Content manager.',
        503,
        'DRIVE_FORBIDDEN',
      )
    }
    return driveError(`Drive error ${status}: ${String(text || '').slice(0, 180)}`, status >= 500 ? 502 : status)
  }

  /**
   * Crea un JPEG/PNG privado en la carpeta. No otorga permiso "anyone".
   * @param {{ name: string, bytesBase64?: string, buffer?: Buffer, parents?: string[], mimeType?: string, appProperties?: Record<string, string> }} input
   * @returns {Promise<{ id: string, name: string, mimeType: string }>}
   */
  async function uploadPrivateJpeg(input = {}) {
    assertConfig()
    const parents = (Array.isArray(input.parents) && input.parents.length ? input.parents : [folderId]).map((id) =>
      assertDriveId(id, 'carpeta'),
    )
    let buffer = input.buffer
    let mimeType = input.mimeType || 'image/jpeg'
    if (buffer == null && input.bytesBase64) {
      const decoded = decodeImageBytes(input.bytesBase64)
      buffer = decoded.buffer
      mimeType = input.mimeType || decoded.mimeType
    }
    if (!buffer || !buffer.length) throw driveError('Falta la imagen.', 400, 'NO_IMAGE')
    if (buffer.length > MAX_IMAGE_BYTES) throw driveError('La imagen es demasiado grande.', 413, 'TOO_BIG')
    if (mimeType === 'image/jpg') mimeType = 'image/jpeg'
    if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
      throw driveError('Solo se aceptan fotos JPEG o PNG.', 400, 'MIME')
    }

    const metadata = {
      name: safeFileName(input.name, mimeType === 'image/png' ? 'evidencia.png' : 'evidencia.jpg'),
      parents,
      mimeType,
    }
    if (input.appProperties && typeof input.appProperties === 'object') {
      const props = {}
      for (const [k, v] of Object.entries(input.appProperties)) {
        if (v == null || v === '') continue
        props[String(k).slice(0, 40)] = String(v).slice(0, 100)
      }
      if (Object.keys(props).length) metadata.appProperties = props
    }

    const part = multipartRelated(metadata, Buffer.from(buffer), mimeType)
    const res = await driveFetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': part.contentType },
      body: part.body,
    })
    const text = await res.text().catch(() => '')
    if (!res.ok) throw mapGoogleStatus(res.status, text)
    let data = {}
    try {
      data = JSON.parse(text)
    } catch {
      data = {}
    }
    if (!data.id) throw driveError('Drive no devolvió el id del archivo.', 502, 'NO_ID')
    return { id: String(data.id), name: metadata.name, mimeType }
  }

  async function getFileMeta(fileId) {
    const id = assertDriveId(fileId)
    const url = `${DRIVE_FILES}/${encodeURIComponent(id)}?fields=id,name,mimeType,parents&supportsAllDrives=true`
    const res = await driveFetch(url, { method: 'GET' })
    const text = await res.text().catch(() => '')
    if (!res.ok) throw mapGoogleStatus(res.status, text)
    let data = {}
    try {
      data = JSON.parse(text)
    } catch {
      throw driveError('Respuesta de Drive inválida.', 502, 'META')
    }
    return data
  }

  /**
   * Descarga bytes solo si el archivo vive en la carpeta de evidencias.
   * @returns {Promise<{ id: string, mimeType: string, bytes: Buffer, name: string }>}
   */
  async function downloadPrivateFile(fileId) {
    assertConfig()
    const id = assertDriveId(fileId)
    const meta = await getFileMeta(id)
    const parents = Array.isArray(meta.parents) ? meta.parents : []
    if (!parents.includes(folderId)) {
      throw driveError('No se encontró la evidencia.', 404, 'NOT_IN_FOLDER')
    }
    const mimeType = String(meta.mimeType || '')
    if (!mimeType.startsWith('image/')) {
      throw driveError('El archivo no es una imagen.', 415, 'MIME')
    }
    const url = `${DRIVE_FILES}/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`
    const res = await driveFetch(url, { method: 'GET' })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw mapGoogleStatus(res.status, text)
    }
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > MAX_DOWNLOAD_BYTES) throw driveError('La imagen es demasiado grande.', 413, 'TOO_BIG')
    return { id, mimeType, bytes, name: String(meta.name || id) }
  }

  return {
    folderId,
    getAccessToken,
    uploadPrivateJpeg,
    getFileMeta,
    downloadPrivateFile,
    createSignedViewUrl,
  }
}

let defaultRepo = null

export function getDriveRepo() {
  if (!defaultRepo) defaultRepo = createDriveRepo()
  return defaultRepo
}

export function resetDriveRepoForTests() {
  defaultRepo = null
}
