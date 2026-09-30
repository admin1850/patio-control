/**
 * Kardex Autorizados — misma lógica que src/App.jsx (normalizeRol, parsePermisosFromRow…).
 * Columnas A:R (+ S = ClaveHash opcional):
 *  A email · B nombre · C apellido · D celular · E whatsapp · F rol · G ubicación · H clave · I activo
 *  J entrada · K salida · L parado · M baja · N historial · O kpis · P equipos · Q workspace(cloud)
 *  R notas · S ClaveHash
 */

export const PERMISO_KEYS = /** @type {const} */ ([
  'entrada',
  'salida',
  'parado',
  'baja',
  'historial',
  'kpis',
  'equipos',
  'workspace',
])

export function normalizeRol(raw) {
  const t = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_')
  if (['guardia', 'caseta'].includes(t)) return 'guardia'
  if (['encargado_yarda', 'encargado', 'yarda'].includes(t)) return 'encargado_yarda'
  if (['patio', 'operador_patio', 'operaciones'].includes(t)) return 'patio'
  if (['admin', 'administrador', 'supervisor'].includes(t)) return 'admin'
  return t || 'guardia'
}

export function normalizeUbicacion(raw) {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (t.includes('chihuahua')) return 'chihuahua'
  if (t.includes('calera')) return 'calera'
  if (t.includes('calpulalpan')) return 'calpulalpan'
  if (t.includes('todas') || t.includes('todos') || t === '*') return 'todas'
  return t || 'todas'
}

export function normalizeTelefonoMX(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('52') && digits.length >= 12) return `+${digits}`
  if (digits.length === 10) return `+52${digits}`
  if (String(raw ?? '').trim().startsWith('+')) return `+${digits}`
  return digits.length >= 10 ? `+52${digits.slice(-10)}` : `+52${digits}`
}

export function parseSiNo(raw, defaultVal) {
  const t = String(raw ?? '').trim().toUpperCase()
  if (t === '') return defaultVal
  if (['SI', 'SÍ', 'YES', '1', 'TRUE', 'S'].includes(t)) return true
  if (['NO', 'N', '0', 'FALSE'].includes(t)) return false
  return defaultVal
}

export function defaultPermisosPorRol(rol) {
  switch (rol) {
    case 'guardia':
      return {
        entrada: true,
        salida: true,
        parado: false,
        baja: false,
        historial: true,
        kpis: false,
        equipos: false,
        workspace: true,
      }
    case 'encargado_yarda':
      return {
        entrada: true,
        salida: true,
        parado: true,
        baja: true,
        historial: true,
        kpis: true,
        equipos: true,
        workspace: true,
      }
    case 'patio':
      return {
        entrada: true,
        salida: true,
        parado: true,
        baja: false,
        historial: true,
        kpis: false,
        equipos: false,
        workspace: true,
      }
    case 'admin':
    default:
      return {
        entrada: true,
        salida: true,
        parado: true,
        baja: true,
        historial: true,
        kpis: true,
        equipos: true,
        workspace: true,
      }
  }
}

export function parsePermisosFromRow(e, rol) {
  const base = defaultPermisosPorRol(rol)
  return {
    entrada: parseSiNo(e[9], base.entrada),
    salida: parseSiNo(e[10], base.salida),
    parado: parseSiNo(e[11], base.parado),
    baja: parseSiNo(e[12], base.baja),
    historial: parseSiNo(e[13], base.historial),
    kpis: parseSiNo(e[14], base.kpis),
    equipos: parseSiNo(e[15], base.equipos),
    workspace: parseSiNo(e[16], base.workspace),
  }
}

/**
 * Fila cruda de Autorizados (A:S) → objeto de servidor. Incluye clave/claveHash:
 * usar `toPublicUser` antes de responder al cliente.
 * @param {unknown[]} e
 */
export function parseAutorizadoRow(e) {
  if (!e?.[0]) return null
  const email = String(e[0]).trim().toLowerCase()
  if (!email || !email.includes('@')) return null
  const celularRaw = String(e[3] ?? '').trim()
  const whatsappRaw = String(e[4] ?? '').trim()
  const rol = normalizeRol(e[5])
  const activoRaw = String(e[8] ?? 'SI').trim().toUpperCase()
  return {
    email,
    nombre: String(e[1] ?? '').trim(),
    apellido: String(e[2] ?? '').trim(),
    celular: celularRaw ? normalizeTelefonoMX(celularRaw) : '',
    whatsapp: whatsappRaw
      ? normalizeTelefonoMX(whatsappRaw)
      : celularRaw
        ? normalizeTelefonoMX(celularRaw)
        : '',
    rol,
    ubicacion: normalizeUbicacion(e[6]),
    clave: String(e[7] ?? '').trim(),
    activo: ['', 'SI', 'SÍ', 'YES', '1', 'TRUE'].includes(activoRaw),
    permisos: parsePermisosFromRow(e, rol),
    notas: String(e[17] ?? '').trim() || undefined,
    claveHash: String(e[18] ?? '').trim() || undefined,
  }
}

/** Valor contra el que se valida la clave: ClaveHash (S) si existe, si no la Clave legada (H). */
export function storedClaveOf(autorizado) {
  return autorizado?.claveHash || autorizado?.clave || ''
}

/**
 * Usuario seguro para el cliente (sin clave ni hash).
 * @param {ReturnType<typeof parseAutorizadoRow>} autorizado
 * @param {{ name?: string, picture?: string }} [googleProfile]
 */
export function toPublicUser(autorizado, googleProfile = {}) {
  const nombreKardex = [autorizado.nombre, autorizado.apellido].filter(Boolean).join(' ')
  return {
    email: autorizado.email,
    name: googleProfile.name || nombreKardex || autorizado.email,
    ...(nombreKardex ? { nombreKardex } : {}),
    ...(googleProfile.picture ? { picture: googleProfile.picture } : {}),
    rol: autorizado.rol,
    ubicacion: autorizado.ubicacion,
    permisos: autorizado.permisos,
    ...(autorizado.celular ? { celular: autorizado.celular } : {}),
    ...(autorizado.whatsapp ? { whatsapp: autorizado.whatsapp } : {}),
  }
}
