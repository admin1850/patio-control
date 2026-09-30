#!/usr/bin/env node
/**
 * Pruebas Fase 0.3 — outbox IndexedDB (fake en memoria, sin navegador).
 * node scripts/test-fase0-outbox.mjs
 */

import assert from 'node:assert/strict'

import {
  countPending,
  enqueueMovimiento,
  flushOutbox,
  listPending,
  migrateLegacyQueueToOutbox,
  resetOutboxForTests,
} from '../src/lib/outbox.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

function installFakeIndexedDB() {
  const databases = new Map()

  class FakeStore {
    constructor() {
      this.map = new Map()
      this.tx = null
    }
    createIndex() {}
    put(value) {
      return this.tx.add(() => {
        const clone = structuredClone(value)
        this.map.set(clone.id, clone)
        return clone.id
      })
    }
    get(id) {
      return this.tx.add(() => {
        const found = this.map.get(id)
        return found === undefined ? undefined : structuredClone(found)
      })
    }
    getAll() {
      return this.tx.add(() => [...this.map.values()].map((v) => structuredClone(v)))
    }
  }

  class FakeTx {
    constructor(store) {
      this.store = store
      this.pending = 0
      this.opened = false
      this.finished = false
      this.oncomplete = null
      this.onerror = null
      this.onabort = null
      queueMicrotask(() => {
        this.opened = true
        this.maybe()
      })
    }
    objectStore() {
      this.store.tx = this
      return this.store
    }
    add(fn) {
      this.pending++
      const req = { result: undefined, error: null, onsuccess: null, onerror: null }
      queueMicrotask(() => {
        try {
          req.result = fn()
          req.onsuccess?.()
        } catch (err) {
          req.error = err
          req.onerror?.()
          this.onerror?.(err)
        } finally {
          this.pending--
          this.maybe()
        }
      })
      return req
    }
    maybe() {
      if (!this.opened || this.pending > 0 || this.finished) return
      queueMicrotask(() => {
        if (!this.opened || this.pending > 0 || this.finished) return
        this.finished = true
        this.oncomplete?.()
      })
    }
  }

  class FakeDB {
    constructor(name, version) {
      this.name = name
      this.version = version
      this.stores = new Map()
      const names = new Set()
      this.objectStoreNames = {
        contains: (n) => names.has(n),
        _add: (n) => names.add(n),
      }
    }
    createObjectStore(name) {
      const store = new FakeStore()
      this.stores.set(name, store)
      this.objectStoreNames._add(name)
      return store
    }
    transaction(name) {
      const store = this.stores.get(name)
      if (!store) throw new Error(`store ausente ${name}`)
      return new FakeTx(store)
    }
    close() {}
  }

  globalThis.indexedDB = {
    open(name, version) {
      const req = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null }
      queueMicrotask(() => {
        let db = databases.get(name)
        const fresh = !db
        if (!db) {
          db = new FakeDB(name, version)
          databases.set(name, db)
        }
        req.result = db
        if (fresh || version > db.version) {
          db.version = version
          req.onupgradeneeded?.()
        }
        req.onsuccess?.()
      })
      return req
    },
    deleteDatabase(name) {
      const req = { onsuccess: null, onerror: null, onblocked: null }
      queueMicrotask(() => {
        databases.delete(name)
        req.onsuccess?.()
      })
      return req
    },
  }
}

installFakeIndexedDB()

test('enqueue y flush: éxito marca synced y el fallo reintenta', async () => {
  await resetOutboxForTests()
  const id1 = await enqueueMovimiento(
    { id: 'mov-1', tipo: 'entrada', placa: 'ABC123A', fotos: ['data:image/jpeg;base64,YQ=='] },
    'Failed to fetch',
  )
  assert.equal(id1, 'mov-1')
  const id2 = await enqueueMovimiento({ id: 'mov-2', tipo: 'salida', placa: 'XYZ987A', fotos: [] })
  assert.equal(id2, 'mov-2')
  assert.equal(await countPending(), 2)

  const pending = await listPending()
  assert.equal(pending[0].id, 'mov-1')
  assert.equal(pending[0].type, 'movimiento')
  assert.equal(pending[0].movimiento.placa, 'ABC123A')
  assert.equal(pending[0].movimiento.fotos[0].startsWith('data:image/jpeg'), true)
  assert.equal(pending[0].lastError, 'Failed to fetch')
  assert.equal(pending[0].attempts, 0)

  const seen = []
  const first = await flushOutbox(async (mov) => {
    seen.push(mov.id)
    if (mov.id === 'mov-1') throw new Error('red caída')
  })
  assert.deepEqual(seen, ['mov-1', 'mov-2'])
  assert.equal(first.synced, 1)
  assert.equal(first.failed, 1)
  assert.equal(first.remaining, 1)

  const left = await listPending()
  assert.equal(left.length, 1)
  assert.equal(left[0].id, 'mov-1')
  assert.equal(left[0].status, 'failed')
  assert.equal(left[0].attempts, 1)
  assert.match(left[0].lastError, /red caída/)

  const second = await flushOutbox(async (mov) => {
    assert.equal(mov.id, 'mov-1')
    assert.equal(mov.fotos[0].startsWith('data:image/jpeg'), true)
  })
  assert.equal(second.synced, 1)
  assert.equal(second.remaining, 0)
  assert.equal(await countPending(), 0)
})

test('flush rehidrata Blob y conserva data URL como texto', async () => {
  await resetOutboxForTests()
  const blob = new Blob(['firma'], { type: 'image/png' })
  await enqueueMovimiento({
    id: 'mov-blob',
    tipo: 'entrada',
    firma: blob,
    fotos: ['data:image/jpeg;base64,YQ=='],
  })
  let got = null
  const result = await flushOutbox(async (mov) => {
    got = mov
  })
  assert.equal(result.synced, 1)
  assert.ok(got.firma instanceof Blob)
  assert.equal(got.firma.type, 'image/png')
  assert.equal(await got.firma.text(), 'firma')
  assert.equal(typeof got.fotos[0], 'string')
})

test('migrateLegacyQueueToOutbox copia la cola legada y no la borra', async () => {
  const legacy = [
    {
      id: 'leg-1',
      movimiento: { id: 'leg-1', tipo: 'entrada', placa: 'AAA111A' },
      queuedAt: '2026-09-30T12:00:00.000Z',
      attempts: 1,
      lastError: 'Sin conexión',
    },
    {
      id: 'leg-2',
      movimiento: { id: 'leg-2', tipo: 'salida', placa: 'BBB222B' },
      queuedAt: '2026-09-30T12:05:00.000Z',
    },
    { id: 'skip', lastError: 'sin movimiento' },
  ]
  const stored = []
  const result = await migrateLegacyQueueToOutbox(() => legacy, async (event) => {
    stored.push(event)
    return event.id
  })
  assert.equal(result.migrated, 2)
  assert.deepEqual(result.ids, ['leg-1', 'leg-2'])
  assert.equal(stored[0].movimiento.placa, 'AAA111A')
  assert.equal(stored[0].type, 'movimiento')
  assert.equal(stored[0].lastError, 'Sin conexión')
  assert.equal(stored[1].movimiento.placa, 'BBB222B')
  assert.equal(legacy.length, 3)
  const empty = await migrateLegacyQueueToOutbox(() => [], async () => {
    throw new Error('no debía encolar')
  })
  assert.equal(empty.migrated, 0)
  assert.deepEqual(empty.ids, [])
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
