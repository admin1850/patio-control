import assert from 'node:assert/strict'
import { lineasEntrega, pdfEntregaBytes } from '../src/lib/entregaPdf.js'

const pdf = pdfEntregaBytes({
  tipo: 'salida',
  placa: 'ABC123A',
  selloNumero: 'SELLO1',
  firmaNombre: 'Ana López',
  firmaUrl: 'https://example.test/firma.png',
  checklist: [{ id: 'puerta', label: 'Puerta', ok: false }],
  fotos: ['https://example.test/foto.jpg'],
})
assert.ok(pdf.startsWith('%PDF-1.4'))
assert.ok(pdf.includes('%%EOF'))
assert.ok(pdf.includes('SELLO1'))
assert.ok(pdf.includes('Puerta'))
assert.equal(lineasEntrega({ placa: 'ÁÉÍ' }).some((line) => line.includes('AEI')), true)
console.log('entrega pdf OK')
