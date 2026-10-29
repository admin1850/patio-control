import assert from 'node:assert/strict'
import { crearCita, validarEnCaseta } from '../src/lib/citas.js'

const cita = crearCita({
  tipo: 'transportista',
  nombre: 'Luis',
  empresa: 'Fletes Norte',
  placa: 'xyz12',
  eta: '2026-10-29T18:00:00.000Z',
  id: 'CITA-1',
  ahora: new Date('2026-10-29T12:00:00.000Z'),
})
assert.equal(cita.placa, 'XYZ12')
assert.equal(cita.estatus, 'PENDIENTE')
const pase = validarEnCaseta(cita, new Date('2026-10-29T18:30:00.000Z'))
assert.equal(pase.ok, true)
assert.equal(pase.cita.estatus, 'USADA')
assert.equal(validarEnCaseta(pase.cita, new Date('2026-10-29T19:00:00.000Z')).ok, false)
const tarde = validarEnCaseta(cita, new Date('2026-10-30T12:00:00.000Z'))
assert.equal(tarde.ok, false)
console.log('citas OK')
