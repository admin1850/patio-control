#!/usr/bin/env node
/**
 * Migración Fase 5 del Sheet PatioControl (solo agrega pestañas y encabezados).
 * Nunca borra filas ni limpia pestañas.
 *
 *  - Movimientos!AJ1       → viajeId (opcional; el preaviso de App Chofer)
 *  - LlegadasEsperadas     → id, viajeId, placas, cajasJson, dolly, sello, cartaPorte,
 *                            eta, yardaId, horaServidor, estatus
 *                            estatus: PENDIENTE | RECIBIDA
 *
 * Uso:
 *   npm run migrate:fase5                 # aplica si hay credenciales; si no, dry-run
 *   npm run migrate:fase5 -- --dry-run    # solo muestra lo que haría
 *
 * Env: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, PATIO_SPREADSHEET_ID
 */

import {
  LLEGADAS_ESPERADAS_COLUMNS,
  LLEGADAS_ESPERADAS_SHEET,
  columnLetter,
  createSheetsRepo,
  hasSheetsBackendEnv,
} from '../netlify/functions/lib/sheetsRepo.js'

const args = new Set(process.argv.slice(2))
const hasCreds = hasSheetsBackendEnv()
const DRY = args.has('--dry-run') || !hasCreds

const VIAJE_INDEX = 35
const VIAJE_HEADER = 'viajeId'

const TABS = [{ title: LLEGADAS_ESPERADAS_SHEET, headers: LLEGADAS_ESPERADAS_COLUMNS }]

const log = (...m) => console.log(...m)
const plan = []

function planned(desc) {
  plan.push(desc)
  log(`${DRY ? '[dry-run] ' : ''}${desc}`)
}

function sameHeaders(current, expected) {
  if (!expected?.length) return false
  if (current.length < expected.length) return false
  return expected.every((header, i) => String(current[i] ?? '').trim() === header)
}

function headerRange(title, headers) {
  return `${title}!A1:${columnLetter(headers.length - 1)}1`
}

async function main() {
  log('PatioControl · migración Fase 5 (App Chofer, viajeId)')
  if (!hasCreds) {
    log('Sin credenciales de cuenta de servicio ni puente Apps Script → modo dry-run (no se escribe nada).')
    log('Define la cuenta de servicio (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, PATIO_SPREADSHEET_ID) o el puente Apps Script (PATIO_APPS_SCRIPT_URL, PATIO_APPS_SCRIPT_SECRET, PATIO_SPREADSHEET_ID) para aplicar.\n')
    dryRunWithoutSheet()
    printReversal()
    return
  }

  const repo = createSheetsRepo()
  log(`Spreadsheet: ${repo.spreadsheetId}${DRY ? ' (dry-run)' : ''}\n`)
  const meta = await repo.getSpreadsheetMeta()
  const tabs = new Map((meta.sheets ?? []).map((sheet) => [sheet.properties.title, sheet.properties]))
  await ensureHeaderCells(repo, tabs, 'Movimientos', VIAJE_INDEX, [VIAJE_HEADER])
  for (const tab of TABS) await ensureTab(repo, tabs, tab)

  log(plan.length ? `\n${plan.length} cambio(s) ${DRY ? 'planeados' : 'aplicados'}.` : '\nSin cambios: la hoja ya está en Fase 5.')
  printReversal()
}

function dryRunWithoutSheet() {
  const cell = `Movimientos!${columnLetter(VIAJE_INDEX)}1`
  planned(`${cell} ← "${VIAJE_HEADER}" (solo si está vacía; se agrega la columna AJ si la cuadrícula no llega)`)
  for (const tab of TABS) {
    const range = headerRange(tab.title, tab.headers)
    planned(`addSheet "${tab.title}" si no existe (solo encabezados, sin filas de datos)`)
    planned(`${range} ← ${JSON.stringify(tab.headers)}`)
  }
}

async function ensureColumns(repo, props, neededCols) {
  const have = props.gridProperties?.columnCount ?? 26
  if (have >= neededCols) return
  planned(`${props.title}: appendDimension COLUMNS +${neededCols - have} (de ${have} a ${neededCols})`)
  if (!DRY) {
    await repo.batchUpdate([
      { appendDimension: { sheetId: props.sheetId, dimension: 'COLUMNS', length: neededCols - have } },
    ])
    props.gridProperties = { ...props.gridProperties, columnCount: neededCols }
  }
}

async function ensureHeaderCells(repo, tabs, title, startIndex, headers) {
  const props = tabs.get(title)
  if (!props) {
    log(`⚠ Pestaña "${title}" no existe; se omite (no se crea automáticamente).`)
    return
  }
  await ensureColumns(repo, props, startIndex + headers.length)
  const from = columnLetter(startIndex)
  const to = columnLetter(startIndex + headers.length - 1)
  const range = `${title}!${from}1:${to}1`
  const shortGrid = (props.gridProperties?.columnCount ?? 26) < startIndex + headers.length
  let current = []
  if (!(DRY && shortGrid)) {
    try {
      current = (await repo.sheetsGet(range))[0] ?? []
    } catch (err) {
      if (DRY && /exceeds grid limits|unable to parse range/i.test(String(err?.message ?? ''))) current = []
      else throw err
    }
  }
  for (let i = 0; i < headers.length; i++) {
    const cell = `${title}!${columnLetter(startIndex + i)}1`
    const existing = String(current[i] ?? '').trim()
    if (existing === headers[i]) continue
    if (existing) {
      log(`⚠ ${cell} ya tiene "${existing}" (se esperaba "${headers[i]}"); no se sobrescribe. Revísalo a mano.`)
      continue
    }
    planned(`${cell} ← "${headers[i]}"`)
    if (!DRY) await repo.sheetsUpdate(cell, [[headers[i]]])
  }
}

async function ensureTab(repo, tabs, { title, headers }) {
  let props = tabs.get(title)
  if (!props) {
    planned(`addSheet "${title}"`)
    if (!DRY) {
      const res = await repo.batchUpdate([
        {
          addSheet: {
            properties: {
              title,
              gridProperties: { rowCount: 1000, columnCount: Math.max(26, headers.length), frozenRowCount: 1 },
            },
          },
        },
      ])
      props = res.replies?.[0]?.addSheet?.properties
      if (props) tabs.set(title, props)
    }
  } else {
    await ensureColumns(repo, props, headers.length)
  }

  const range = headerRange(title, headers)
  const shortGrid = props && (props.gridProperties?.columnCount ?? 26) < headers.length
  let current = []
  if (props && !(DRY && shortGrid)) {
    try {
      current = (await repo.sheetsGet(range))[0] ?? []
    } catch (err) {
      if (DRY && /exceeds grid limits|unable to parse range/i.test(String(err?.message ?? ''))) current = []
      else throw err
    }
  }
  const filled = current.map((cell) => String(cell ?? '').trim()).filter(Boolean)
  if (!filled.length) {
    planned(`${range} ← ${JSON.stringify(headers)}`)
    if (!DRY && props) await repo.sheetsUpdate(range, [headers])
    return
  }
  if (sameHeaders(current, headers)) return
  log(`⚠ ${range} ya tiene encabezados distintos. No se sobrescribe ni se limpia. Revísalo a mano.`)
}

function printReversal() {
  log(`
Cómo revertir (manual, en Google Sheets — este script no borra filas ni limpia pestañas):
  1. Si LlegadasEsperadas se creó vacía (solo encabezados), clic derecho → Eliminar.
     Si ya hay preavisos, exporta la pestaña antes.
  2. Movimientos!AJ (viajeId) se puede dejar vacía. No borres A:AI.
  3. estatus de LlegadasEsperadas: PENDIENTE o RECIBIDA.
  4. No se usa "Borrar todo". Cada preaviso es una fila nueva (append) o una sola fila actualizada.`)
}

main().catch((err) => {
  console.error(`✖ Migración Fase 5 falló: ${err?.message || err}`)
  process.exit(1)
})
