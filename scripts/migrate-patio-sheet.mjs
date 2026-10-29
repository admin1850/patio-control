#!/usr/bin/env node
/** Crea MovimientosPatio (solo encabezados). No redespliega Apps Script. */
import { MOVIMIENTOS_PATIO_COLUMNS, MOVIMIENTOS_PATIO_SHEET, columnLetter, createSheetsRepo, hasSheetsBackendEnv } from '../netlify/functions/lib/sheetsRepo.js'

const DRY = process.argv.includes('--dry-run') || !hasSheetsBackendEnv()
const headers = MOVIMIENTOS_PATIO_COLUMNS
const range = `${MOVIMIENTOS_PATIO_SHEET}!A1:${columnLetter(headers.length - 1)}1`

async function main() {
  console.log('PatioControl · pestaña MovimientosPatio')
  if (!hasSheetsBackendEnv()) console.log('Sin credenciales → dry-run.\n')
  console.log(`${DRY ? '[dry-run] ' : ''}addSheet "${MOVIMIENTOS_PATIO_SHEET}" si no existe`)
  console.log(`${DRY ? '[dry-run] ' : ''}${range} ← ${JSON.stringify(headers)}`)
  console.log('\nCómo revertir: elimina la pestaña si solo tiene encabezados. Este script no borra filas.')
  if (DRY) return
  const repo = createSheetsRepo()
  const meta = await repo.getSpreadsheetMeta()
  const tabs = new Map((meta.sheets ?? []).map((sheet) => [sheet.properties.title, sheet.properties]))
  if (!tabs.get(MOVIMIENTOS_PATIO_SHEET)) {
    await repo.batchUpdate([{ addSheet: { properties: { title: MOVIMIENTOS_PATIO_SHEET, gridProperties: { rowCount: 1000, columnCount: 26, frozenRowCount: 1 } } } }])
  }
  const current = ((await repo.sheetsGet(range))[0] ?? []).map((cell) => String(cell ?? '').trim()).filter(Boolean)
  if (!current.length) await repo.sheetsUpdate(range, [headers])
  else console.log('Ya tenía encabezados.')
}

main().catch((err) => { console.error(err?.message || err); process.exit(1) })
