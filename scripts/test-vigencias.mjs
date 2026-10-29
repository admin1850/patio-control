import assert from 'node:assert/strict'
import { resolverGate } from '../src/lib/salidaFuerte.js'
import { diasHastaVigencia, evaluarVigencias, nivelVigencia } from '../src/lib/vigenciaDocumentos.js'

const hoy = '2026-10-29'
assert.equal(diasHastaVigencia('2026-11-28', hoy), 30)
assert.equal(nivelVigencia('2026-11-28', hoy), 'aviso30')
assert.equal(nivelVigencia('2026-11-13', hoy), 'aviso15')
assert.equal(nivelVigencia('2026-11-14', hoy), 'aviso30')
assert.equal(nivelVigencia('2026-10-29', hoy), 'vencido')
assert.equal(nivelVigencia('2026-12-15', hoy), 'ok')
assert.equal(nivelVigencia('no-fecha', hoy), null)

const filas = [
  { sujetoTipo: 'unidad', sujetoId: 'ABC123A', documento: 'seguro', vence: '2026-10-01' },
  { sujetoTipo: 'unidad', sujetoId: 'OTRA', documento: 'seguro', vence: '2020-01-01' },
  { sujetoTipo: 'operador', sujetoId: 'Juan Pérez', documento: 'licencia', vence: '2026-11-10' },
  { sujetoTipo: 'unidad', sujetoId: 'ABC123A', documento: 'permiso_sict', vence: '2026-11-28' },
]
const evaludo = evaluarVigencias(filas, { hoy, placa: 'abc123a', operadorIds: ['juan pérez'] })
assert.equal(evaludo.motivos.length, 1)
assert.equal(evaludo.motivos[0].codigo, 'DOC_VENCIDO')
assert.equal(evaludo.avisos.length, 3)
assert.ok(evaludo.avisos.some((item) => item.dedupeKey.includes('aviso15')))
assert.ok(evaludo.avisos.some((item) => item.dedupeKey.includes('aviso30')))

const bloqueado = resolverGate({ motivos: evaludo.motivos, puedeAutorizar: false, overrideMotivo: 'sale igual' })
assert.equal(bloqueado.resultado, 'BLOQUEADO')

const autorizado = resolverGate({
  motivos: evaludo.motivos,
  puedeAutorizar: true,
  overrideMotivo: 'Encargado autoriza salida con seguro vencido',
})
assert.equal(autorizado.resultado, 'PERMITIDO')
assert.equal(autorizado.via, 'OVERRIDE')

console.log('vigencias OK')
