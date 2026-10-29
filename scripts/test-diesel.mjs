import assert from 'node:assert/strict'
import { resumenDiesel } from '../src/lib/dieselRendimiento.js'

const movimientos = [
  { equipoId: 'u1', placa: 'ABC123A', operador: 'Juan', fechaHora: '2026-10-01T10:00:00.000Z', kilometros: 1000, dieselLitros: 400 },
  { equipoId: 'u1', placa: 'ABC123A', operador: 'Juan', fechaHora: '2026-10-02T10:00:00.000Z', kilometros: 1300, dieselLitros: 250 },
  { equipoId: 'u1', placa: 'ABC123A', operador: 'Ana', fechaHora: '2026-10-03T10:00:00.000Z', kilometros: 1310, dieselLitros: 100 },
]
const res = resumenDiesel(movimientos)
assert.equal(res.tramos.length, 2)
assert.equal(res.tramos[0].kmPorLitro, 2)
assert.equal(res.tramos[0].anomalia, false)
assert.equal(res.tramos[1].anomalia, true)
assert.equal(res.porUnidad[0].id, 'u1')
assert.equal(res.porOperador.find((item) => item.id === 'Ana').anomalias, 1)
console.log('diesel OK')
