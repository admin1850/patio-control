import assert from 'node:assert/strict'
import { cerrarOrden, crearOrden, mapaSpots, tomarOrden } from '../src/lib/movimientosPatio.js'

const orden = crearOrden({ placa: 'abc123a', desde: 'A1', hacia: 'B3', id: 'mp-1', ahora: new Date('2026-10-29T12:00:00.000Z') })
assert.equal(orden.estatus, 'ABIERTA')
assert.throws(() => cerrarOrden(orden))
const tomada = tomarOrden(orden, 'Luis', new Date('2026-10-29T12:05:00.000Z'))
assert.equal(tomada.estatus, 'TOMADA')
const cerrada = cerrarOrden(tomada, new Date('2026-10-29T12:20:00.000Z'))
assert.equal(mapaSpots([cerrada, { ...cerrada, placa: 'ABC123A', hacia: 'C1', cerradaEn: '2026-10-29T13:00:00.000Z' }])[0].spot, 'C1')
console.log('movimientos patio OK')
