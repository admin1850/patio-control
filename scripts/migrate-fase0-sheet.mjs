#!/usr/bin/env node
/**
 * Migración Fase 0 del Sheet PatioControl (solo agrega; nunca borra ni limpia datos).
 *
 *  - Movimientos AE1:AI1 → motivoParo, paradoDesde, zonaSlot, usuarioEmail, horaServidor
 *  - Autorizados S1      → ClaveHash
 *  - Pestaña Auditoria   → encabezados id…dispositivoId
 *  - Pestañas OrdenesTrabajo / OT_Eventos → solo encabezados (preparación Fase 1)
 *
 * Uso:
 *   npm run migrate:fase0                   # aplica si hay credenciales; si no, dry-run
 *   npm run migrate:fase0 -- --dry-run      # solo muestra lo que haría
 *   npm run migrate:fase0 -- --hash-claves  # además llena S (ClaveHash) con bcrypt de H (Clave) donde S esté vacía
 *
 * Env: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, PATIO_SPREADSHEET_ID
 * (la hoja debe estar compartida como Editor con la cuenta de servicio).
 */

import { AUDITORIA_HEADERS, AUDITORIA_SHEET, createSheetsRepo, hasServiceAccountEnv } from '../netlify/functions/lib/sheetsRepo.js'
import { hashClave, isBcryptHash } from '../netlify/functions/lib/password.js'

const args = new Set(process.argv.slice(2))
const hasCreds = hasServiceAccountEnv()
const DRY = args.has('--dry-run') || !hasCreds
const HASH_CLAVES = args.has('--hash-claves')

export const MOVIMIENTOS_FASE0_HEADERS = ['motivoParo', 'paradoDesde', 'zonaSlot', 'usuarioEmail', 'horaServidor']

export const ORDENES_TRABAJO_HEADERS = [
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

export const OT_EVENTOS_HEADERS = [
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

/** 0 → A, 25 → Z, 26 → AA */
function colLetter(index) {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

const log = (...m) => console.log(...m)
const plan = []

function planned(desc) {
  plan.push(desc)
  log(`${DRY ? '[dry-run] ' : ''}${desc}`)
}

async function main() {
  log('PatioControl · migración Fase 0')
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
  const tabs = new Map((meta.sheets ?? []).map((s) => [s.properties.title, s.properties]))

  await ensureHeaderCells(repo, tabs, 'Movimientos', 30, MOVIMIENTOS_FASE0_HEADERS)
  await ensureHeaderCells(repo, tabs, 'Autorizados', 18, ['ClaveHash'])
  await ensureTab(repo, tabs, AUDITORIA_SHEET, AUDITORIA_HEADERS)
  await ensureTab(repo, tabs, 'OrdenesTrabajo', ORDENES_TRABAJO_HEADERS)
  await ensureTab(repo, tabs, 'OT_Eventos', OT_EVENTOS_HEADERS)
  if (HASH_CLAVES) await hashClavesAutorizados(repo)

  log(plan.length ? `\n${plan.length} cambio(s) ${DRY ? 'planeados' : 'aplicados'}.` : '\nSin cambios: la hoja ya está migrada.')
  printReversal()
}

function dryRunWithoutSheet() {
  planned(`Movimientos!AE1:AI1 ← ${JSON.stringify(MOVIMIENTOS_FASE0_HEADERS)} (solo celdas vacías; se agregan columnas si la cuadrícula no llega a AI)`)
  planned(`Autorizados!S1 ← ["ClaveHash"] (solo si está vacía)`)
  planned(`addSheet "${AUDITORIA_SHEET}" (si no existe) + ${AUDITORIA_SHEET}!A1:${colLetter(AUDITORIA_HEADERS.length - 1)}1 ← ${JSON.stringify(AUDITORIA_HEADERS)}`)
  planned(`addSheet "OrdenesTrabajo" (si no existe) + OrdenesTrabajo!A1:${colLetter(ORDENES_TRABAJO_HEADERS.length - 1)}1 ← ${JSON.stringify(ORDENES_TRABAJO_HEADERS)}`)
  planned(`addSheet "OT_Eventos" (si no existe) + OT_Eventos!A1:${colLetter(OT_EVENTOS_HEADERS.length - 1)}1 ← ${JSON.stringify(OT_EVENTOS_HEADERS)}`)
  if (HASH_CLAVES) planned('Autorizados!S{n} ← bcrypt(Clave H{n}) para filas con Clave y sin ClaveHash')
}

async function ensureColumns(repo, props, neededCols) {
  const have = props.gridProperties?.columnCount ?? 26
  if (have >= neededCols) return
  planned(`${props.title}: appendDimension COLUMNS +${neededCols - have} (de ${have} a ${neededCols})`)
  if (!DRY) {
    await repo.batchUpdate([
      { appendDimension: { sheetId: props.sheetId, dimension: 'COLUMNS', length: neededCols - have } },
    ])
  }
}

/** Escribe encabezados en la fila 1 desde `startIndex`, sin pisar celdas con contenido. */
async function ensureHeaderCells(repo, tabs, title, startIndex, headers) {
  const props = tabs.get(title)
  if (!props) {
    log(`⚠ Pestaña "${title}" no existe; se omite (no se crea automáticamente).`)
    return
  }
  await ensureColumns(repo, props, startIndex + headers.length)
  const from = colLetter(startIndex)
  const to = colLetter(startIndex + headers.length - 1)
  const range = `${title}!${from}1:${to}1`
  // En dry-run las columnas aún no existen: leer fuera de la cuadrícula puede fallar.
  const current =
    DRY && (props.gridProperties?.columnCount ?? 26) < startIndex + headers.length
      ? []
      : ((await repo.sheetsGet(range))[0] ?? [])
  for (let i = 0; i < headers.length; i++) {
    const cell = `${title}!${colLetter(startIndex + i)}1`
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

async function ensureTab(repo, tabs, title, headers) {
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
  }
  const range = `${title}!A1:${colLetter(headers.length - 1)}1`
  const current = props ? ((await repo.sheetsGet(range))[0] ?? []) : []
  if (current.some((c) => String(c ?? '').trim())) {
    const diff = headers.some((h, i) => String(current[i] ?? '').trim() !== h)
    if (diff) log(`⚠ ${range} ya tiene encabezados distintos; no se sobrescriben.`)
    return
  }
  planned(`${range} ← ${JSON.stringify(headers)}`)
  if (!DRY) await repo.sheetsUpdate(range, [headers])
}

async function hashClavesAutorizados(repo) {
  const rows = await repo.sheetsGet('Autorizados!A2:S')
  const updates = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const email = String(row[0] ?? '').trim()
    const clave = String(row[7] ?? '').trim()
    const hash = String(row[18] ?? '').trim()
    if (!email || !clave || isBcryptHash(hash)) continue
    updates.push({ rowNumber: i + 2, email, clave })
  }
  if (!updates.length) {
    log('ClaveHash: no hay filas pendientes de hashear.')
    return
  }
  for (const u of updates) {
    planned(`Autorizados!S${u.rowNumber} ← bcrypt(Clave de ${u.email})`)
    if (!DRY) await repo.sheetsUpdate(`Autorizados!S${u.rowNumber}`, [[await hashClave(u.clave)]])
  }
  log('Nota: la columna H (Clave) no se toca. Cuando todos entren con ClaveHash, el admin puede vaciar H.')
}

function printReversal() {
  log(`
Cómo revertir (manual, en Google Sheets):
  1. Movimientos: borrar encabezados AE1:AI1 (o eliminar columnas AE:AI si no tienen datos útiles).
     La app lee A:AI y tolera que AE:AI no existan (escribe solo A:AD si la cuadrícula no alcanza).
  2. Autorizados: borrar la columna S (ClaveHash). El login vuelve a comparar contra H (Clave).
  3. Eliminar las pestañas "${AUDITORIA_SHEET}", "OrdenesTrabajo" y "OT_Eventos" (clic derecho → Borrar).
     Auditoria es append-only: exporta una copia antes si quieres conservar la bitácora.
  4. Las columnas agregadas con appendDimension quedan vacías; se pueden eliminar sin afectar datos.`)
}

main().catch((err) => {
  console.error(`✖ Migración falló: ${err?.message || err}`)
  process.exit(1)
})
