#!/usr/bin/env node
/**
 * Migración Fase 4 del Sheet PatioControl (solo agrega pestañas y encabezados).
 * Nunca borra filas ni limpia pestañas.
 *
 *  - PlanPreventivo        → tipoUnidad, cadaKm, cadaDias, cadaHorasThermo, avisoPct
 *  - ServicioProgramado    → id, unidadId, planId, proximoKm, proximaFecha, proximoHorometro, estatus, otId
 *                            estatus: PENDIENTE | AVISO | VENCIDO | HECHO
 *  - AvisosLog             → id, tipo, yarda, unidadId, canal, estatus, destino, mensaje, dedupeKey, horaServidor, detalle
 *  - AvisosSuscripciones   → id, tipo, yarda, canal, destino, activo
 *
 * Uso:
 *   npm run migrate:fase4                 # aplica si hay credenciales; si no, dry-run
 *   npm run migrate:fase4 -- --dry-run    # solo muestra lo que haría
 *
 * Env: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, PATIO_SPREADSHEET_ID
 */

import {
  AVISOS_LOG_COLUMNS,
  AVISOS_LOG_SHEET,
  AVISOS_SUSCRIPCIONES_COLUMNS,
  AVISOS_SUSCRIPCIONES_SHEET,
  PLAN_PREVENTIVO_COLUMNS,
  PLAN_PREVENTIVO_SHEET,
  SERVICIO_PROGRAMADO_COLUMNS,
  SERVICIO_PROGRAMADO_SHEET,
  columnLetter,
  createSheetsRepo,
  hasServiceAccountEnv,
} from '../netlify/functions/lib/sheetsRepo.js'

const args = new Set(process.argv.slice(2))
const hasCreds = hasServiceAccountEnv()
const DRY = args.has('--dry-run') || !hasCreds

const TABS = [
  { title: PLAN_PREVENTIVO_SHEET, headers: PLAN_PREVENTIVO_COLUMNS },
  { title: SERVICIO_PROGRAMADO_SHEET, headers: SERVICIO_PROGRAMADO_COLUMNS },
  { title: AVISOS_LOG_SHEET, headers: AVISOS_LOG_COLUMNS },
  { title: AVISOS_SUSCRIPCIONES_SHEET, headers: AVISOS_SUSCRIPCIONES_COLUMNS },
]

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
  log('PatioControl · migración Fase 4 (preventivo, avisos)')
  if (!hasCreds) {
    log('Sin credenciales de cuenta de servicio → modo dry-run (no se escribe nada).')
    log('Define GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY y PATIO_SPREADSHEET_ID para aplicar.\n')
    dryRunWithoutSheet()
    printReversal()
    return
  }

  const repo = createSheetsRepo()
  log(`Spreadsheet: ${repo.spreadsheetId}${DRY ? ' (dry-run)' : ''}\n`)
  const meta = await repo.getSpreadsheetMeta()
  const tabs = new Map((meta.sheets ?? []).map((sheet) => [sheet.properties.title, sheet.properties]))
  for (const tab of TABS) await ensureTab(repo, tabs, tab)

  log(plan.length ? `\n${plan.length} cambio(s) ${DRY ? 'planeados' : 'aplicados'}.` : '\nSin cambios: la hoja ya está en Fase 4.')
  printReversal()
}

function dryRunWithoutSheet() {
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
  1. Si PlanPreventivo, ServicioProgramado, AvisosLog o AvisosSuscripciones se crearon vacías
     (solo encabezados), clic derecho → Eliminar. Si ya hay filas, exporta la pestaña antes.
  2. No se toca Movimientos, OrdenesTrabajo, EstadoUnidad ni Defectos.
  3. estatus de ServicioProgramado: PENDIENTE, AVISO, VENCIDO o HECHO.
  4. No se usa "Borrar todo". Cada servicio y cada aviso es una fila nueva (append) o una sola fila actualizada.`)
}

main().catch((err) => {
  console.error(`✖ Migración Fase 4 falló: ${err?.message || err}`)
  process.exit(1)
})
