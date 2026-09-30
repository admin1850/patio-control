/**
 * Outbox offline en IndexedDB (esqueleto Fase 0 — aún no conectado a App.jsx).
 *
 * DB `patio-outbox`, store `pending` (keyPath `id`, índice `status`).
 * Registro: { id, status: 'pending'|'failed'|'synced', createdAt, updatedAt, attempts, lastError, event }
 *
 * Blobs (fotos ya comprimidas con re(file, 1280, 0.72), firma PNG) se guardan como
 * ArrayBuffer `{ __blob: true, type, data }`: Safari/iOS ha tenido fallas guardando Blob
 * directo en IndexedDB. `rehydrateEvent` los devuelve a Blob antes de subir.
 *
 * Uso previsto en App.jsx (Fase 1), reemplazando la cola localStorage `patio-control-offline-queue`:
 *   await enqueue({ tipo: 'movimiento', payload: mov, blobs: { 'placa-camion-frontal': blob } })
 *   for (const rec of await listPending()) {
 *     const ev = await rehydrateEvent(rec.event)
 *     try { await apiFetch('/api/movimientos', { method: 'POST', body: … }); await markSynced(rec.id) }
 *     catch (e) { await markFailed(rec.id, e) }
 *   }
 * disparado en `online`, al abrir la app y tras cada registro.
 */

export const OUTBOX_DB = 'patio-outbox'
export const OUTBOX_STORE = 'pending'
const DB_VERSION = 1
const MAX_DEPTH = 6

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function openOutbox() {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB no disponible en este navegador'))
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

async function withStore(mode, fn) {
  const db = await openOutbox()
  const tx = db.transaction(OUTBOX_STORE, mode)
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('Transacción abortada'))
  })
  const result = await fn(tx.objectStore(OUTBOX_STORE))
  await done
  return result
}

function isBlob(v) {
  return typeof Blob !== 'undefined' && v instanceof Blob
}

/** Convierte recursivamente Blob → { __blob, type, data: ArrayBuffer }. */
export async function serializeEvent(value, depth = 0) {
  if (isBlob(value)) {
    return { __blob: true, type: value.type || 'application/octet-stream', data: await value.arrayBuffer() }
  }
  if (depth >= MAX_DEPTH || value == null || typeof value !== 'object') return value
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value) || value instanceof Date) return value
  if (Array.isArray(value)) return Promise.all(value.map((v) => serializeEvent(v, depth + 1)))
  const out = {}
  for (const [k, v] of Object.entries(value)) out[k] = await serializeEvent(v, depth + 1)
  return out
}

/** Inverso de `serializeEvent`: { __blob } → Blob. */
export function rehydrateEvent(value, depth = 0) {
  if (value && typeof value === 'object' && value.__blob === true && value.data instanceof ArrayBuffer) {
    return new Blob([value.data], { type: value.type })
  }
  if (depth >= MAX_DEPTH || value == null || typeof value !== 'object') return value
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value) || value instanceof Date) return value
  if (Array.isArray(value)) return value.map((v) => rehydrateEvent(v, depth + 1))
  const out = {}
  for (const [k, v] of Object.entries(value)) out[k] = rehydrateEvent(v, depth + 1)
  return out
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `ob-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * @param {{ id?: string, tipo: string, payload?: unknown, blobs?: Record<string, Blob> }} event
 * @returns {Promise<string>} id del registro
 */
export async function enqueue(event) {
  const id = String(event?.id || newId())
  const stored = await serializeEvent({ ...event, id })
  const now = new Date().toISOString()
  await withStore('readwrite', (store) =>
    reqToPromise(
      store.put({ id, status: 'pending', createdAt: now, updatedAt: now, attempts: 0, lastError: null, event: stored }),
    ),
  )
  return id
}

/** Pendientes y fallidos (reintentables), del más antiguo al más reciente. */
export async function listPending() {
  const all = await withStore('readonly', (store) => reqToPromise(store.getAll()))
  return all
    .filter((r) => r.status === 'pending' || r.status === 'failed')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
}

async function update(id, patch) {
  return withStore('readwrite', async (store) => {
    const rec = await reqToPromise(store.get(id))
    if (!rec) return null
    const next = { ...rec, ...patch(rec), updatedAt: new Date().toISOString() }
    await reqToPromise(store.put(next))
    return next
  })
}

/** Marca como sincronizado y libera los binarios (el registro queda como bitácora ligera). */
export function markSynced(id) {
  return update(id, (rec) => ({
    status: 'synced',
    lastError: null,
    syncedAt: new Date().toISOString(),
    event: { id: rec.event?.id, tipo: rec.event?.tipo },
  }))
}

/** @param {string} id @param {unknown} error */
export function markFailed(id, error) {
  const msg = error instanceof Error ? error.message : String(error ?? 'Error de sincronización')
  return update(id, (rec) => ({ status: 'failed', attempts: (rec.attempts || 0) + 1, lastError: msg.slice(0, 500) }))
}
