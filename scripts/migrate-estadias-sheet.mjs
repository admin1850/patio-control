#!/usr/bin/env node
/**
 * Crea la pestaña Estadías (solo encabezados). No borra filas.
 * PatioBridge.gs no cambia: ya escribe cualquier pestaña.
 *
 *   npm run migrate:estadias
 *   npm run migrate:estadias -- --dry-run
 */

import {
  ESTADIAS_COLUMNS,
  ESTADIAS_SHEET,
  columnLetter,
  createSheetsRepo,
  hasSheetsBackendEnv,
} from '../netlify/functions/lib/sheetsRepo.js'

const DRY = process.argv.includes('--dry-run') || !hasSheetsBackendEnv()
const headers = ESTADIAS_COLUMNS
const range = `${ESTADIAS_SHEET}!A1:${columnLetter(headers.length - 1)}1`

async function main() {
  console.log('PatioControl · pestaña Estadías (reloj de geocerca por cliente)')
  if (!hasSheetsBackendEnv()) console.log('Sin credenciales → dry-run. No se escribe nada.\n')
  console.log(`${DRY ? '[dry-run] ' : ''}addSheet "${ESTADIAS_SHEET}" si no existe`)
  console.log(`${DRY ? '[dry-run] ' : ''}${range} ← ${JSON.stringify(headers)}`)
  console.log('\nCómo revertir: si la pestaña solo tiene encabezados, elimínala. Si ya hay relojes, expórtala antes. Este script no borra filas.')
  if (DRY) return
  const repo = createSheetsRepo()
  const meta = await repo.getSpreadsheetMeta()
  const tabs = new Map((meta.sheets ?? []).map((sheet) => [sheet.properties.title, sheet.properties]))
  let props = tabs.get(ESTADIAS_SHEET)
  if (!props) {
    const res = await repo.batchUpdate([{
      addSheet: { properties: { title: ESTADIAS_SHEET, gridProperties: { rowCount: 1000, columnCount: 26, frozenRowCount: 1 } } },
    }])
    props = res.replies?.[0]?.addSheet?.properties
  }
  const current = props ? ((await repo.sheetsGet(range))[0] ?? []) : []
  if (!current.map((cell) => String(cell ?? '').trim()).filter(Boolean).length) {
    await repo.sheetsUpdate(range, [headers])
    console.log(`Encabezados escritos en ${range}.`)
  } else console.log('La pestaña ya tenía encabezados. No se tocó ninguna fila.')
}

main().catch((err) => {
  console.error(err?.message || err)
  process.exit(1)
})
