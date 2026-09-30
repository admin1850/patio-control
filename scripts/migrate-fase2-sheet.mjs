#!/usr/bin/env node
/**
 * Migración Fase 2 del Sheet PatioControl (solo agrega pestañas o encabezados).
 * Nunca borra filas ni limpia pestañas. Solo agrega hojas o encabezados.
 *
 *  - ZonasSlots     → id, yardaId, zona, slot, tipo, capacidad, activo
 *                     tipo: LINEA | ANDEN | TALLER | LAVADO | CUARENTENA | OTRO
 *  - ConteosFisicos → id, yardaId, zona, iniciadoEn, cerradoEn, usuarioEmail, resumenJson, activo
 *  - EstadoUnidad   → si ya tiene el esquema de Fase 1 (A:K), agrega L:N
 *                     clienteCarga, folioCarga, enganchadaA
 *                     ubicacion: EN_PATIO | EN_RUTA | EN_TALLER_EXTERNO | EN_CLIENTE
 *                     estatusCarga: VACIA | CARGADA | EN_CARGA | NA
 *
 * Uso:
 *   npm run migrate:fase2                 # aplica si hay credenciales; si no, dry-run
 *   npm run migrate:fase2 -- --dry-run    # solo muestra lo que haría
 *
 * Env: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, PATIO_SPREADSHEET_ID
 */

import {
  CONTEOS_COLUMNS,
  CONTEOS_SHEET,
  ESTADO_UNIDAD_COLUMNS,
  ESTADO_UNIDAD_FASE1_COLUMNS,
  ESTADO_UNIDAD_SHEET,
  ZONAS_SLOTS_COLUMNS,
  ZONAS_SLOTS_SHEET,
  columnLetter,
  createSheetsRepo,
  hasServiceAccountEnv,
} from '../netlify/functions/lib/sheetsRepo.js'

const args = new Set(process.argv.slice(2))
const hasCreds = hasServiceAccountEnv()
const DRY = args.has('--dry-run') || !hasCreds

const TABS = [
  { title: ZONAS_SLOTS_SHEET, headers: ZONAS_SLOTS_COLUMNS },
  { title: CONTEOS_SHEET, headers: CONTEOS_COLUMNS },
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

function startsWithHeaders(current, expected) {
  if (!expected?.length) return false
  return expected.every((header, i) => String(current[i] ?? '').trim() === header)
}

function headerRange(title, headers) {
  return `${title}!A1:${columnLetter(headers.length - 1)}1`
}

async function main() {
  log('PatioControl · migración Fase 2 (slots, conteo físico, estado de unidad)')
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
  await extendEstadoUnidad(repo, tabs)

  log(plan.length ? `\n${plan.length} cambio(s) ${DRY ? 'planeados' : 'aplicados'}.` : '\nSin cambios: la hoja ya está en Fase 2.')
  printReversal()
}

function dryRunWithoutSheet() {
  for (const tab of TABS) {
    const range = headerRange(tab.title, tab.headers)
    planned(`addSheet "${tab.title}" si no existe (solo encabezados, sin filas de datos)`)
    planned(`${range} ← ${JSON.stringify(tab.headers)}`)
  }
  const extra = ESTADO_UNIDAD_COLUMNS.slice(ESTADO_UNIDAD_FASE1_COLUMNS.length)
  const start = columnLetter(ESTADO_UNIDAD_FASE1_COLUMNS.length)
  const end = columnLetter(ESTADO_UNIDAD_COLUMNS.length - 1)
  planned(`addSheet "${ESTADO_UNIDAD_SHEET}" si no existe, con encabezados Fase 2`)
  planned(
    `Si "${ESTADO_UNIDAD_SHEET}" ya tiene A:K de Fase 1, escribe solo ${ESTADO_UNIDAD_SHEET}!${start}1:${end}1 ← ${JSON.stringify(extra)} (no reescribe filas de datos)`,
  )
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

async function extendEstadoUnidad(repo, tabs) {
  const headers = ESTADO_UNIDAD_COLUMNS
  const title = ESTADO_UNIDAD_SHEET
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

  const extra = headers.slice(ESTADO_UNIDAD_FASE1_COLUMNS.length)
  const extraStart = ESTADO_UNIDAD_FASE1_COLUMNS.length
  const tail = current.slice(extraStart).map((cell) => String(cell ?? '').trim()).filter(Boolean)
  if (startsWithHeaders(current, ESTADO_UNIDAD_FASE1_COLUMNS) && tail.length === 0) {
    const extraRange = `${title}!${columnLetter(extraStart)}1:${columnLetter(headers.length - 1)}1`
    planned(`${extraRange} ← ${JSON.stringify(extra)} (extiende Fase 1; no reescribe A:K ni las filas)`)
    if (!DRY && props) await repo.sheetsUpdate(extraRange, [extra])
    return
  }
  log(`⚠ ${range} ya tiene datos o encabezados distintos. No se sobrescribe ni se limpia.`)
}

function printReversal() {
  log(`
Cómo revertir (manual, en Google Sheets — este script no borra filas ni limpia pestañas):
  1. Si ZonasSlots o ConteosFisicos se crearon vacías (solo encabezados), clic derecho → Eliminar.
     Si ya hay slots o conteos, exporta la pestaña antes de borrarla.
  2. EstadoUnidad no se recrea. Las columnas nuevas son L:N (${ESTADO_UNIDAD_COLUMNS.slice(ESTADO_UNIDAD_FASE1_COLUMNS.length).join(', ')}).
     Puedes borrar esas tres columnas si aún no las usa nadie. No borres A:K: ahí vive el estatus de Fase 1.
  3. ubicacion acepta EN_PATIO, EN_RUTA, EN_TALLER_EXTERNO y EN_CLIENTE. Un texto viejo (por ejemplo "andén 2") se conserva.
  4. estatusCarga acepta VACIA, CARGADA, EN_CARGA y NA.
  5. Las columnas agregadas con appendDimension quedan vacías hasta que un conteo o un movimiento las llene.
  6. No se usa "Borrar todo". Un slot o un conteo se actualiza por su id.`)
}

main().catch((err) => {
  console.error(`✖ Migración Fase 2 falló: ${err?.message || err}`)
  process.exit(1)
})
