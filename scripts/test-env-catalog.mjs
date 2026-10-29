import assert from 'node:assert/strict'
import { diagnosticoConfig, ENV_CATALOG } from '../netlify/functions/lib/envCatalog.js'

const vacio = diagnosticoConfig({})
assert.equal(vacio.loginServidor, false)
assert.equal(vacio.whatsapp, false)
assert.equal(vacio.frotcom, false)
assert.ok(vacio.loginServidorFaltan.includes('PATIO_SESSION_SECRET'))
assert.deepEqual(vacio.whatsappFaltan, ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID'])
assert.deepEqual(vacio.frotcomFaltan, ['FROTCOM_API_URL', 'FROTCOM_TOKEN'])

const secreto = 'no-imprimir-este-valor-de-prueba'
const listo = diagnosticoConfig({
  PATIO_SESSION_SECRET: secreto,
  PATIO_SPREADSHEET_ID: 'sheet',
  PATIO_APPS_SCRIPT_URL: 'https://script.example/exec',
  PATIO_APPS_SCRIPT_SECRET: secreto,
  WHATSAPP_TOKEN: secreto,
  WHATSAPP_PHONE_ID: 'phone',
  FROTCOM_API_URL: 'https://gps.example',
  FROTCOM_TOKEN: secreto,
})
assert.equal(listo.loginServidor, true)
assert.equal(listo.whatsapp, true)
assert.equal(listo.frotcom, true)
assert.equal(JSON.stringify(listo).includes(secreto), false)

const nombres = new Set(ENV_CATALOG.map((item) => item.name))
for (const name of ['PATIO_SESSION_SECRET', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'FROTCOM_API_URL', 'FROTCOM_TOKEN']) {
  assert.equal(nombres.has(name), true, name)
}

console.log('env catalog OK')
