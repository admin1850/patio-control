import assert from 'node:assert/strict'
import { cambioDeLlanta, hayOtAbierta } from '../src/lib/llantas.js'

const antes = { numero: 'A1', dot: 'DOT1' }
assert.equal(cambioDeLlanta(antes, { numero: 'A1', dot: 'DOT1' }), false)
assert.equal(cambioDeLlanta(antes, { numero: 'B2', dot: 'DOT1' }), true)
assert.equal(cambioDeLlanta(null, { numero: 'B2', dot: 'DOT9' }), false)
assert.equal(hayOtAbierta([{ estatus: 'ABIERTA', unidadId: 'abc123a' }], 'ABC123A'), true)
assert.equal(hayOtAbierta([{ estatus: 'CERRADA', unidadId: 'ABC123A' }], 'ABC123A'), false)
console.log('llantas OK')
