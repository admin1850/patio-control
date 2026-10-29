#!/usr/bin/env node
/**
 * Crea la pestaña Vigencias (solo encabezados). No borra filas.
 *
 *   npm run migrate:vigencias
 *   npm run migrate:vigencias -- --dry-run
 *
 * No hace falta cambiar PatioBridge.gs: el puente ya lee y escribe cualquier pestaña.
 * Si usas Apps Script, el deploy vigente alcanza. Si la pestaña no existe, el script
 * la crea cuando hay credenciales (cuenta de servicio o puente).
 */

import {
  VIGENCIAS_COLUMNS,
  VIGENCIAS_SHEET,
  columnLetter,
  createSheetsRepo,
  hasSheetsBackendEnv,
} from '../netlify/functions/lib/sheetsRepo.js'

const args = new Set(process.argv.slice(2))
const hasCreds = hasSheetsBackendEnv()
const DRY = args.has('--dry-run') || !hasCreds
const headers = VIGENCIAS_COLUMNS
const range = `${VIGENCIAS_SHEET}!A1:${columnLetter(headers.length - 1)}1`

function log(...m) {
  console.log(...m)
}

async function main() {
  log('PatioControl · pestaña Vigencias (documentos de unidad y operador)')
  if (!hasCreds) {
    log('Sin credenciales → dry-run. No se escribe nada.')
    log('Define la cuenta de servicio o PATIO_APPS_SCRIPT_URL + PATIO_APPS_SCRIPT_SECRET, y PATIO_SPREADSHEET_ID.\n')
  }
  log(`${DRY ? '[dry-run] ' : ''}addSheet "${VIGENCIAS_SHEET}" si no existe`)
  log(`${DRY ? '[dry-run] ' : ''}${range} ← ${JSON.stringify(headers)}`)
  log('\nCómo revertir: si la pestaña está vacía (solo encabezados), elimínala en el Sheet. Si ya hay fechas, expórtala antes. Este script no borra filas.')
  if (DRY) return

  const repo = createSheetsRepo()
  const meta = await repo.getSpreadsheetMeta()
  const tabs = new Map((meta.sheets ?? []).map((sheet) => [sheet.properties.title, sheet.properties]))
  let props = tabs.get(VIGENCIAS_SHEET)
  if (!props) {
    const res = await repo.batchUpdate([
      {
        addSheet: {
          properties: {
            title: VIGENCIAS_SHEET,
            gridProperties: { rowCount: 1000, columnCount: Math.max(26, headers.length), frozenRowCount: 1 },
          },
        },
      },
    ])
    props = res.replies?.[0]?.addSheet?.properties
    log(`Creada ${VIGENCIAS_SHEET}.`)
  }
  const current = props ? ((await repo.sheetsGet(range))[0] ?? []) : []
  const filled = current.map((cell) => String(cell ?? '').trim()).filter(Boolean)
  if (!filled.length) {
    await repo.sheetsUpdate(range, [headers])
    log(`Encabezados escritos en ${range}.`)
    return
  }
  const same = headers.every((header, i) => String(current[i] ?? '').trim() === header)
  if (same) log('La pestaña ya tenía los encabezados. No se tocó ninguna fila.')
  else log(`⚠ ${range} ya tiene otros encabezados. No se sobrescribe. Revísalo a mano.`)
}

main().catch((err) => {
  console.error(`✖ ${err?.message || err}`)
  process.exit(1)
})
