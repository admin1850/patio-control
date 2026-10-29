import assert from 'node:assert/strict'
import { horasLibresDe, llegadasNuevas, reporteEstadias } from '../src/lib/estadias.js'

const dentro = (pos, geo) => geo.yardaId === 'chihuahua' && pos.lat === 1
const ahora = new Date('2026-10-29T18:00:00.000Z')
const nuevas = llegadasNuevas({
  posiciones: [{ placa: 'ABC123A', unidadId: 'u1', lat: 1, lng: 1 }],
  geocercas: [{ yardaId: 'chihuahua' }],
  dentro,
  movimientos: [{ tipo: 'entrada', placa: 'ABC123A', cliente: 'Acme' }],
  abiertas: [{ id: 'libre:Acme', cliente: 'Acme', horasLibres: 6, placa: '' }],
  ahora,
})
assert.equal(nuevas.length, 1)
assert.equal(nuevas[0].cliente, 'Acme')
assert.equal(nuevas[0].horasLibres, 6)
assert.equal(horasLibresDe([], 'Acme'), 24)

const otra = llegadasNuevas({
  posiciones: [{ placa: 'ABC123A', lat: 1 }],
  geocercas: [{ yardaId: 'chihuahua' }],
  dentro,
  movimientos: [],
  abiertas: [{ placa: 'ABC123A', salida: '', llegada: ahora.toISOString() }],
  ahora,
})
assert.equal(otra.length, 0)

const rep = reporteEstadias([
  { id: 'est-1', placa: 'ABC123A', cliente: 'Acme', llegada: '2026-10-29T10:00:00.000Z', salida: '', horasLibres: 6 },
], ahora)
assert.equal(rep[0].horas, 8)
assert.equal(rep[0].excedente, 2)
console.log('estadias OK')
