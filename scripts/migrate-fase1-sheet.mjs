#!/usr/bin/env node
/**
 * Migración Fase 1 del Sheet PatioControl (solo agrega o reescribe encabezados vacíos).
 * Nunca borra filas ni limpia pestañas.
 *
 *  - OrdenesTrabajo  → esquema OT (id … activo). Si la pestaña tiene los encabezados
 *    provisionales de Fase 0 y no hay filas de datos, se reemplaza SOLO la fila 1.
 *  - OT_Eventos      → id, otId, tipoEvento, valorAnterior, valorNuevo, motivo, usuarioEmail, horaServidor
 *  - EstadoUnidad    → unidadId, tipo, yarda, zona, slot, ubicacion, estatusOperativo, estatusCarga, desde, otAbiertaId, actualizadoEn
 *
 * Uso:
 *   npm run migrate:fase1                 # aplica si hay credenciales; si no, dry-run
 *   npm run migrate:fase1 -- --dry-run    # solo muestra lo que haría
 *
 * Env: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, PATIO_SPREADSHEET_ID
 * La hoja debe estar compartida como Editor con la cuenta de servicio.
 *
 * Crear las pestañas con el conector de Google Sheets es opcional. Este script basta.
 */

import {
  ESTADO_UNIDAD_COLUMNS,
  ESTADO_UNIDAD_SHEET,
  OT_COLUMNS,
  OT_EVENTO_COLUMNS,
  OT_EVENTOS_SHEET,
  OT_SHEET,
  columnLetter,
  createSheetsRepo,
  hasServiceAccountEnv,
} from '../netlify/functions/lib/sheetsRepo.js'

const args = new Set(process.argv.slice(2))
const hasCreds = hasServiceAccountEnv()
const DRY = args.has('--dry-run') || !hasCreds

/** Encabezados provisionales que dejó migrate:fase0. Solo se sustituyen si no hay datos. */
const FASE0_OT_HEADERS = [
  'id',
  'folio',
  'estado',
  'prioridad',
  'yardaId',
  'empresaId',
  'equipoId',
  'placa',
  'numeroEconomico',
  'equipoTipo',
  'motivoParo',
  'descripcion',
  'movimientoId',
  'abiertaPor',
  'abiertaEn',
  'asignadoA',
  'cerradaPor',
  'cerradaEn',
  'actualizadoEn',
]

const FASE0_EVENTO_HEADERS = [
  'id',
  'otId',
  'tipo',
  'estadoAnterior',
  'estadoNuevo',
  'nota',
  'usuarioEmail',
  'rol',
  'horaServidor',
  'dispositivoId',
  'adjuntosJson',
]

const TABS = [
  { title: OT_SHEET, headers: OT_COLUMNS, fase0: FASE0_OT_HEADERS },
  { title: OT_EVENTOS_SHEET, headers: OT_EVENTO_COLUMNS, fase0: FASE0_EVENTO_HEADERS },
  { title: ESTADO_UNIDAD_SHEET, headers: ESTADO_UNIDAD_COLUMNS, fase0: null },
]

const log = (...m) => console.log(...m)
const plan = []

function planned(desc) {
  plan.push(desc)
  log(`${DRY ? '[dry-run] ' : ''}${desc}`)
}

function sameHeaders(current, expected) {
  if (!expected) return false
  if (current.length < expected.length) return false
  return expected.every((header, i) => String(current[i] ?? '').trim() === header)
}

function headerRange(title, headers) {
  return `${title}!A1:${columnLetter(headers.length - 1)}1`
}

async function main() {
  log('PatioControl · migración Fase 1 (OT, eventos, estado de unidad)')
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

  log(plan.length ? `\n${plan.length} cambio(s) ${DRY ? 'planeados' : 'aplicados'}.` : '\nSin cambios: la hoja ya está en Fase 1.')
  printReversal()
}

function dryRunWithoutSheet() {
  for (const tab of TABS) {
    const range = headerRange(tab.title, tab.headers)
    planned(`addSheet "${tab.title}" si no existe (encabezados, sin filas de datos)`)
    planned(`${range} ← ${JSON.stringify(tab.headers)}`)
    if (tab.fase0) {
      planned(
        `Si "${tab.title}" ya tiene los encabezados provisionales de Fase 0 y la columna A desde la fila 2 está vacía, se reescribe solo la fila 1. Si hay datos, no se toca.`,
      )
    }
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

async function ensureTab(repo, tabs, { title, headers, fase0 }) {
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

  const dataIds = props ? await repo.sheetsGet(`${title}!A2:A`) : []
  const hasData = dataIds.some((row) => String(row?.[0] ?? '').trim())
  if (fase0 && sameHeaders(current, fase0) && !hasData) {
    planned(`${range} ← esquema Fase 1 (reemplaza encabezados provisionales de Fase 0; no había filas de datos)`)
    if (!DRY) await repo.sheetsUpdate(range, [headers])
    return
  }
  if (hasData) {
    log(`⚠ ${range} ya tiene datos y encabezados distintos. No se sobrescribe ni se limpia. Revísalo a mano.`)
    return
  }
  log(`⚠ ${range} ya tiene encabezados distintos y no coinciden con Fase 0. No se sobrescriben.`)
}

function printReversal() {
  log(`
Cómo revertir (manual, en Google Sheets — este script no borra filas):
  1. Si OrdenesTrabajo / OT_Eventos se crearon en Fase 1 y siguen vacías (solo encabezados),
     clic derecho en la pestaña → Eliminar. La app de Fase 0 no las necesita para el gate.
  2. Si Fase 1 reescribió la fila 1 de una pestaña que tenía encabezados provisionales de Fase 0
     y no había datos, restaura la fila 1 con:
     OrdenesTrabajo: ${JSON.stringify(FASE0_OT_HEADERS)}
     OT_Eventos: ${JSON.stringify(FASE0_EVENTO_HEADERS)}
  3. EstadoUnidad es nueva. Si no tiene filas útiles, elimínala. Si ya tiene estatus de unidades,
     exporta una copia antes de borrarla: el gate volverá a tratarlas como disponibles
     en cuanto la pestaña no exista (el servidor responde 503 y la caseta avisa, no bloquea).
  4. Las columnas agregadas con appendDimension quedan vacías; se pueden eliminar sin afectar otras pestañas.
  5. No se usa "Borrar todo" ni clear de rangos. Una fila de OT se edita por su id; el borrado lógico es activo=NO.`)
}

main().catch((err) => {
  console.error(`✖ Migración Fase 1 falló: ${err?.message || err}`)
  process.exit(1)
})
