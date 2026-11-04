/**
 * Espejo PatioControl → Supabase (tablas patio_*).
 *
 * DATA_BACKEND por defecto es `sheet` (solo Google Sheet).
 * Con DATA_BACKEND=dual el Sheet sigue siendo la fuente de cada lectura y escritura;
 * después de una escritura exitosa se copia la fila a Supabase. Si Supabase falla,
 * se registra el error y la respuesta del Sheet no cambia.
 *
 * Las celdas se guardan como texto: el Sheet mezcla SI/NO, JSON y fechas libres.
 * La llave se recorta; en Autorizados (email) y PlanPreventivo (tipoUnidad) también
 * se pasa a minúsculas, igual que el servidor cuando busca la fila.
 */

const SUPABASE_URL_ENV = 'SUPABASE_URL'
const SUPABASE_KEY_ENV = 'SUPABASE_SERVICE_ROLE_KEY'

/** @typedef {{ sheet: string, table: string, pk: string, columns: string[], normalizePk?: 'lower', headerAliases?: string[], indexes?: string[][] }} PatioTable */

/** @type {PatioTable[]} Una entrada por pestaña, columnas en orden A, B, C… */
export const PATIO_TABLES = [
  {
    sheet: 'Autorizados',
    table: 'patio_autorizados',
    pk: 'email',
    normalizePk: 'lower',
    headerAliases: ['email', 'correo', 'correoelectronico', 'e-mail'],
    columns: [
      'email',
      'nombre',
      'apellido',
      'celular',
      'whatsapp',
      'rol',
      'ubicacion',
      'clave',
      'activo',
      'entrada',
      'salida',
      'parado',
      'baja',
      'historial',
      'kpis',
      'equipos',
      'workspace',
      'notas',
      'claveHash',
    ],
  },
  {
    sheet: 'Movimientos',
    table: 'patio_movimientos',
    pk: 'id',
    indexes: [['equipo_id'], ['placa'], ['yarda_id'], ['viaje_id'], ['hora_servidor']],
    columns: [
      'id',
      'tipo',
      'equipoId',
      'placa',
      'numeroEconomico',
      'equipoTipo',
      'fechaHora',
      'operador',
      'chofer',
      'origenDestino',
      'kilometros',
      'dieselPorcentaje',
      'dieselLitros',
      'checklistJson',
      'fotosUrls',
      'condicionGeneral',
      'observaciones',
      'creadoEn',
      'yardaId',
      'selloNumero',
      'firmaNombre',
      'firmaUrl',
      'geoLat',
      'fotosEvidenciaJson',
      'geoLng',
      'cumplimientoJson',
      'placasExtraJson',
      'empresaId',
      'refrigeradaJson',
      'whatsapp',
      'motivoParo',
      'paradoDesde',
      'zonaSlot',
      'usuarioEmail',
      'horaServidor',
      'viajeId',
    ],
  },
  {
    sheet: 'Equipos',
    table: 'patio_equipos',
    pk: 'id',
    indexes: [['placa']],
    columns: ['id', 'tipo', 'placa', 'numeroEconomico', 'marca', 'modelo', 'notas', 'creadoEn', 'operadorAsignado'],
  },
  {
    sheet: 'Refrigeracion',
    table: 'patio_refrigeracion',
    pk: 'id',
    indexes: [['numero_activo'], ['economico_montado']],
    columns: ['id', 'marca', 'modelo', 'numeroActivo', 'economicoMontado', 'horometro', 'estatus', 'notas', 'creadoEn'],
  },
  {
    sheet: 'Auditoria',
    table: 'patio_auditoria',
    pk: 'id',
    indexes: [['usuario_email'], ['entidad_id'], ['hora_servidor']],
    columns: ['id', 'horaServidor', 'usuarioEmail', 'rol', 'accion', 'entidad', 'entidadId', 'antes', 'despues', 'dispositivoId'],
  },
  {
    sheet: 'OrdenesTrabajo',
    table: 'patio_ordenes_trabajo',
    pk: 'id',
    indexes: [['unidad_id'], ['estatus'], ['folio'], ['yarda']],
    columns: [
      'id',
      'folio',
      'unidadId',
      'unidadesRelacionadasJson',
      'yarda',
      'tipo',
      'motivo',
      'prioridad',
      'tallerTipo',
      'proveedorId',
      'ubicacionTaller',
      'responsableEmail',
      'reportadoPor',
      'fechaEntradaTaller',
      'etr',
      'fechaLista',
      'fechaLiberada',
      'estatus',
      'kmEntrada',
      'kmSalida',
      'horometroEntrada',
      'horometroSalida',
      'costoEstimado',
      'costoRefacciones',
      'costoManoObra',
      'costoExterno',
      'factura',
      'refaccionesJson',
      'fotosAntesJson',
      'fotosDespuesJson',
      'notas',
      'movimientoOrigenId',
      'etrOriginal',
      'etrMovimientosCount',
      'activo',
    ],
  },
  {
    sheet: 'OT_Eventos',
    table: 'patio_ot_eventos',
    pk: 'id',
    indexes: [['ot_id'], ['hora_servidor']],
    columns: ['id', 'otId', 'tipoEvento', 'valorAnterior', 'valorNuevo', 'motivo', 'usuarioEmail', 'horaServidor', 'rol', 'dispositivoId'],
  },
  {
    sheet: 'EstadoUnidad',
    table: 'patio_estado_unidad',
    pk: 'unidad_id',
    indexes: [['yarda'], ['estatus_operativo'], ['ot_abierta_id']],
    columns: [
      'unidadId',
      'tipo',
      'yarda',
      'zona',
      'slot',
      'ubicacion',
      'estatusOperativo',
      'estatusCarga',
      'desde',
      'otAbiertaId',
      'actualizadoEn',
      'clienteCarga',
      'folioCarga',
      'enganchadaA',
    ],
  },
  {
    sheet: 'ZonasSlots',
    table: 'patio_zonas_slots',
    pk: 'id',
    indexes: [['yarda_id', 'zona', 'slot']],
    columns: ['id', 'yardaId', 'zona', 'slot', 'tipo', 'capacidad', 'activo'],
  },
  {
    sheet: 'ConteosFisicos',
    table: 'patio_conteos_fisicos',
    pk: 'id',
    indexes: [['yarda_id']],
    columns: ['id', 'yardaId', 'zona', 'iniciadoEn', 'cerradoEn', 'usuarioEmail', 'resumenJson', 'activo'],
  },
  {
    sheet: 'Defectos',
    table: 'patio_defectos',
    pk: 'id',
    indexes: [['movimiento_id'], ['equipo_id'], ['ot_id']],
    columns: ['id', 'movimientoId', 'equipoId', 'angulo', 'tipo', 'fotosJson', 'otId', 'usuarioEmail', 'horaServidor'],
  },
  {
    sheet: 'PlanPreventivo',
    table: 'patio_plan_preventivo',
    pk: 'tipo_unidad',
    normalizePk: 'lower',
    columns: ['tipoUnidad', 'cadaKm', 'cadaDias', 'cadaHorasThermo', 'avisoPct'],
  },
  {
    sheet: 'ServicioProgramado',
    table: 'patio_servicio_programado',
    pk: 'id',
    indexes: [['unidad_id'], ['estatus'], ['ot_id']],
    columns: ['id', 'unidadId', 'planId', 'proximoKm', 'proximaFecha', 'proximoHorometro', 'estatus', 'otId'],
  },
  {
    sheet: 'AvisosLog',
    table: 'patio_avisos_log',
    pk: 'id',
    indexes: [['dedupe_key'], ['tipo', 'yarda'], ['unidad_id']],
    columns: ['id', 'tipo', 'yarda', 'unidadId', 'canal', 'estatus', 'destino', 'mensaje', 'dedupeKey', 'horaServidor', 'detalle'],
  },
  {
    sheet: 'AvisosSuscripciones',
    table: 'patio_avisos_suscripciones',
    pk: 'id',
    indexes: [['tipo', 'yarda']],
    columns: ['id', 'tipo', 'yarda', 'canal', 'destino', 'activo'],
  },
  {
    sheet: 'LlegadasEsperadas',
    table: 'patio_llegadas_esperadas',
    pk: 'id',
    indexes: [['viaje_id'], ['estatus'], ['yarda_id']],
    columns: ['id', 'viajeId', 'placas', 'cajasJson', 'dolly', 'sello', 'cartaPorte', 'eta', 'yardaId', 'horaServidor', 'estatus'],
  },
]

export function toSnake(header) {
  return String(header ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
}

export function normHeader(value) {
  return toSnake(String(value ?? '').trim()).replace(/_/g, '')
}

export function cellText(value) {
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function tableBySheet(sheetTitle) {
  return PATIO_TABLES.find((table) => table.sheet === sheetTitle) ?? null
}

export function dataBackend(env = {}) {
  const raw = String(env?.DATA_BACKEND ?? '').trim().toLowerCase()
  return raw || 'sheet'
}

export function dualWriteEnabled(env = {}) {
  return dataBackend(env) === 'dual'
}

export function normalizePk(table, value) {
  const raw = String(value ?? '').trim()
  if (table?.normalizePk === 'lower') return raw.toLowerCase()
  return raw
}

export function rowToRecord(table, row) {
  const record = {}
  for (let i = 0; i < table.columns.length; i++) {
    record[toSnake(table.columns[i])] = cellText(row?.[i])
  }
  record[table.pk] = normalizePk(table, record[table.pk])
  return record
}

export function isBlankRow(row) {
  if (!row || !row.length) return true
  return !row.some((cell) => String(cell ?? '').trim() !== '')
}

/** Fila 1 del Sheet (nombres de columna). Una fila de datos cuyo id sea "id" no coincide en la segunda columna. */
export function looksLikeHeader(table, row) {
  if (!row?.length) return false
  let matches = 0
  const limit = Math.min(table.columns.length, row.length, 4)
  for (let i = 0; i < limit; i++) {
    const cell = normHeader(row[i])
    if (!cell) continue
    if (cell === normHeader(table.columns[i])) matches += 1
  }
  if (matches >= 2) return true
  const first = normHeader(row[0])
  const second = normHeader(row[1])
  if (table.headerAliases?.includes(first) && second === normHeader(table.columns[1])) return true
  return false
}

/**
 * Filas listas para upsert. Omite encabezados, vacías y sin llave.
 * Si la llave se repite, se queda la última fila (el upsert también es el último valor).
 */
export function prepararFilas(table, rows) {
  const byPk = new Map()
  let duplicados = 0
  let omitidas = 0
  for (const row of rows ?? []) {
    if (isBlankRow(row) || looksLikeHeader(table, row)) {
      omitidas += 1
      continue
    }
    const record = rowToRecord(table, row)
    if (!record[table.pk]) {
      omitidas += 1
      continue
    }
    if (byPk.has(record[table.pk])) duplicados += 1
    byPk.set(record[table.pk], record)
  }
  return { records: [...byPk.values()], duplicados, omitidas }
}

/** Content-Range de PostgREST: "0-0/42" o asterisco/0. */
export function parseContentRange(header) {
  const raw = String(header ?? '').trim()
  const match = /\/(\d+)\s*$/.exec(raw)
  if (!match) throw new Error(`Content-Range inválido: ${raw || '(vacío)'}`)
  return Number(match[1])
}

function supabaseConfig(env) {
  const url = String(env?.[SUPABASE_URL_ENV] ?? '').trim().replace(/\/+$/, '')
  const key = String(env?.[SUPABASE_KEY_ENV] ?? '').trim()
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  }
  return { url, key }
}

function supabaseHeaders(key, prefer) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Prefer: prefer,
  }
}

async function assertOk(res) {
  if (res.ok) return
  const text = await res.text().catch(() => '')
  throw new Error(`Supabase ${res.status}: ${String(text).slice(0, 200)}`)
}

/**
 * Copia una fila ya escrita en el Sheet. `remove` borra por llave (baja de equipo o refrigeración).
 * @param {{ fetchImpl: typeof fetch, env: NodeJS.ProcessEnv, sheetTitle: string, rowValues?: unknown[], remove?: boolean, key?: string }} args
 */
export async function mirrorSheetWrite({ fetchImpl, env, sheetTitle, rowValues, remove = false, key = '' }) {
  const table = tableBySheet(sheetTitle)
  if (!table) throw new Error(`Pestaña sin tabla Supabase: ${sheetTitle}`)
  const { url, key: apiKey } = supabaseConfig(env)
  if (remove) {
    const id = normalizePk(table, key)
    if (!id) throw new Error(`Falta la llave para borrar en ${table.table}`)
    const endpoint = `${url}/rest/v1/${table.table}?${table.pk}=eq.${encodeURIComponent(id)}`
    const res = await fetchImpl(endpoint, {
      method: 'DELETE',
      headers: supabaseHeaders(apiKey, 'return=minimal'),
    })
    await assertOk(res)
    return { ok: true, op: 'delete', table: table.table }
  }
  if (isBlankRow(rowValues) || looksLikeHeader(table, rowValues)) return { skipped: true }
  const record = rowToRecord(table, rowValues)
  if (!record[table.pk]) return { skipped: true }
  const endpoint = `${url}/rest/v1/${table.table}?on_conflict=${encodeURIComponent(table.pk)}`
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: supabaseHeaders(apiKey, 'resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify(record),
  })
  await assertOk(res)
  return { ok: true, op: 'upsert', table: table.table }
}

const MIGRATION_HEADER = `-- PatioControl: una tabla patio_* por pestaña del Sheet.
-- RLS activo y sin políticas. anon y authenticated no tienen privilegios.
-- La API usa solo service_role (ese rol atraviesa RLS). No se aplicó sola: hay que correrla a mano.
-- Las celdas quedan en text para conservar SI/NO, JSON y fechas tal como están en el Sheet.

`

/** SQL de la migración. El archivo en supabase/migrations es esta misma cadena. */
export function renderPatioMigrationSql() {
  const parts = [MIGRATION_HEADER]
  for (const table of PATIO_TABLES) {
    const cols = table.columns.map((column) => {
      const name = toSnake(column)
      if (name === table.pk) return `  ${name} text primary key`
      return `  ${name} text not null default ''`
    })
    parts.push(`create table public.${table.table} (\n${cols.join(',\n')}\n);\n`)
    for (const index of table.indexes ?? []) {
      const suffix = index.join('_')
      parts.push(
        `create index ${table.table}_${suffix}_idx on public.${table.table} (${index.join(', ')});\n`,
      )
    }
  }
  parts.push('-- service role únicamente\n')
  for (const table of PATIO_TABLES) {
    parts.push(`alter table public.${table.table} enable row level security;`)
    parts.push(`revoke all on table public.${table.table} from public, anon, authenticated;`)
    parts.push(`grant select, insert, update, delete on table public.${table.table} to service_role;\n`)
  }
  return `${parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}
