#!/usr/bin/env node
/**
 * Migración Fase 3 del Sheet PatioControl (solo agrega la pestaña Defectos).
 * Nunca borra filas ni limpia pestañas. Solo agrega la hoja o sus encabezados.
 *
 *  - Defectos → id, movimientoId, equipoId, angulo, tipo, fotosJson, otId, usuarioEmail, horaServidor
 *               tipo: DANO_NUEVO
 *
 * Uso:
 *   npm run migrate:fase3                 # aplica si hay credenciales; si no, dry-run
 *   npm run migrate:fase3 -- --dry-run    # solo muestra lo que haría
 *
 * Env: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, PATIO_SPREADSHEET_ID
 */

import {
  DEFECTOS_COLUMNS,
  DEFECTOS_SHEET,
  columnLetter,
  createSheetsRepo,
  hasSheetsBackendEnv,
} from '../netlify/functions/lib/sheetsRepo.js'

const args = new Set(process.argv.slice(2))
const hasCreds = hasSheetsBackendEnv()
const DRY = args.has('--dry-run') || !hasCreds

const TAB = { title: DEFECTOS_SHEET, headers: DEFECTOS_COLUMNS }

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
  log('PatioControl · migración Fase 3 (daños de salida · pestaña Defectos)')
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
  await ensureTab(repo, tabs, TAB)

  log(plan.length ? `\n${plan.length} cambio(s) ${DRY ? 'planeados' : 'aplicados'}.` : '\nSin cambios: la hoja ya está en Fase 3.')
  printReversal()
}

function dryRunWithoutSheet() {
  const range = headerRange(TAB.title, TAB.headers)
  planned(`addSheet "${TAB.title}" si no existe (solo encabezados, sin filas de datos)`)
  planned(`${range} ← ${JSON.stringify(TAB.headers)}`)
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
  1. Si Defectos se creó vacía (solo encabezados), clic derecho → Eliminar.
     Si ya hay daños, exporta la pestaña antes de borrarla.
  2. No se toca Movimientos, OrdenesTrabajo ni EstadoUnidad.
  3. tipo en Defectos es DANO_NUEVO. fotosJson guarda las URLs de la foto nueva.
  4. No se usa "Borrar todo". Cada daño es una fila nueva (append).`)
}

main().catch((err) => {
  console.error(`✖ Migración Fase 3 falló: ${err?.message || err}`)
  process.exit(1)
})
