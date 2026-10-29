#!/usr/bin/env node
/** Crea la pestaña Llantas. No redespliega Apps Script. */
import { LLANTAS_COLUMNS, LLANTAS_SHEET, columnLetter, createSheetsRepo, hasSheetsBackendEnv } from '../netlify/functions/lib/sheetsRepo.js'

const DRY = process.argv.includes('--dry-run') || !hasSheetsBackendEnv()
const headers = LLANTAS_COLUMNS
const range = `${LLANTAS_SHEET}!A1:${columnLetter(headers.length - 1)}1`

async function main() {
  console.log('PatioControl · pestaña Llantas')
  if (!hasSheetsBackendEnv()) console.log('Sin credenciales → dry-run.\n')
  console.log(`${DRY ? '[dry-run] ' : ''}addSheet "${LLANTAS_SHEET}" si no existe`)
  console.log(`${DRY ? '[dry-run] ' : ''}${range} ← ${JSON.stringify(headers)}`)
  console.log('\nCómo revertir: elimina la pestaña si solo tiene encabezados. Este script no borra filas.')
  if (DRY) return
  const repo = createSheetsRepo()
  const meta = await repo.getSpreadsheetMeta()
  const existe = (meta.sheets ?? []).some((sheet) => sheet.properties.title === LLANTAS_SHEET)
  if (!existe) {
    await repo.batchUpdate([{ addSheet: { properties: { title: LLANTAS_SHEET, gridProperties: { rowCount: 1000, columnCount: 26, frozenRowCount: 1 } } } }])
  }
  const current = ((await repo.sheetsGet(range))[0] ?? []).map((cell) => String(cell ?? '').trim()).filter(Boolean)
  if (!current.length) await repo.sheetsUpdate(range, [headers])
}

main().catch((err) => { console.error(err?.message || err); process.exit(1) })
