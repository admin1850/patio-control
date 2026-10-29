/** Perfil, rol y permisos del kardex de Autorizados. */
import { puedeVerPagina } from "../../lib/patioSync.js";
import { Vt } from "../api/workspaceClient.js";
import { CAPTURA_TARDIA_MS, ye } from "./constants.js";

export function puedeCapturaTardia(user) {
  let rol = normalizeRol(user?.rol);
  return rol === `encargado_yarda` || rol === `admin`;
}
/** Guardia: siempre la hora del dispositivo al guardar. Encargado/admin pueden marcar captura tardía. */

export function resolverFechaCaptura({
  user,
  capturaTardia = false,
  fechaLocal,
  motivo,
  ahora = new Date()
} = {}) {
  let dispositivo = ahora.toISOString();
  if (!puedeCapturaTardia(user) || !capturaTardia) {
    return { fechaHora: dispositivo };
  }
  let claimed = fechaLocal ? new Date(fechaLocal) : ahora;
  if (Number.isNaN(claimed.getTime())) claimed = ahora;
  let motivoTxt = String(motivo ?? ``).trim();
  let lejos = Math.abs(claimed.getTime() - ahora.getTime()) > CAPTURA_TARDIA_MS;
  if (capturaTardia || lejos) {
    if (motivoTxt.length < 3) {
      return { error: `Indica el motivo de la captura tardía (mínimo 3 caracteres).` };
    }
  }
  return {
    fechaHora: claimed.toISOString(),
    fechaCapturaDispositivo: dispositivo,
    capturaTardiaMotivo: motivoTxt,
    nota: `Captura tardía: ${motivoTxt}`
  };
}

var AUTH_PROFILE_KEY = `patio-control-auth-profile`;

export function normalizeRol(raw) {
  let t = String(raw ?? ``).trim().toLowerCase().replace(/\s+/g, `_`).replace(/-/g, `_`);
  if ([`guardia`, `caseta`].includes(t)) {
    return `guardia`;
  }
  if ([`encargado_yarda`, `encargado`, `yarda`].includes(t)) {
    return `encargado_yarda`;
  }
  if ([`patio`, `operador_patio`, `operaciones`].includes(t)) {
    return `patio`;
  }
  if ([`admin`, `administrador`, `supervisor`].includes(t)) {
    return `admin`;
  }
  return t || `guardia`;
}

function normalizeUbicacion(raw) {
  let t = String(raw ?? ``).trim().toLowerCase().normalize(`NFD`).replace(/[\u0300-\u036f]/g, ``);
  if (t.includes(`chihuahua`)) {
    return `chihuahua`;
  }
  if (t.includes(`calera`)) {
    return `calera`;
  }
  if (t.includes(`calpulalpan`)) {
    return `calpulalpan`;
  }
  if (t.includes(`todas`) || t.includes(`todos`) || t === `*`) {
    return `todas`;
  }
  return t || `todas`;
}

function normalizeTelefonoMX(raw) {
  let digits = String(raw ?? ``).replace(/\D/g, ``);
  if (!digits) {
    return ``;
  }
  if (digits.startsWith(`52`) && digits.length >= 12) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+52${digits}`;
  }
  if (String(raw ?? ``).trim().startsWith(`+`)) {
    return `+${digits}`;
  }
  return digits.length >= 10 ? `+52${digits.slice(-10)}` : `+52${digits}`;
}

function parseSiNo(raw, defaultVal) {
  let t = String(raw ?? ``).trim().toUpperCase();
  if (t === ``) {
    return defaultVal;
  }
  if ([`SI`, `SÍ`, `YES`, `1`, `TRUE`, `S`].includes(t)) {
    return true;
  }
  if ([`NO`, `N`, `0`, `FALSE`].includes(t)) {
    return false;
  }
  return defaultVal;
}

function defaultPermisosPorRol(rol) {
  switch (rol) {
    case `guardia`:
      return {
        entrada: true,
        salida: true,
        parado: false,
        baja: false,
        historial: true,
        kpis: false,
        equipos: false,
        workspace: true
      };
    case `encargado_yarda`:
      return {
        entrada: true,
        salida: true,
        parado: true,
        baja: true,
        historial: true,
        kpis: true,
        equipos: true,
        workspace: true
      };
    case `patio`:
      return {
        entrada: true,
        salida: true,
        parado: true,
        baja: false,
        historial: true,
        kpis: false,
        equipos: false,
        workspace: true
      };
    case `admin`:
    default:
      return {
        entrada: true,
        salida: true,
        parado: true,
        baja: true,
        historial: true,
        kpis: true,
        equipos: true,
        workspace: true
      };
  }
}

function parsePermisosFromRow(e, rol) {
  let base = defaultPermisosPorRol(rol);
  return {
    entrada: parseSiNo(e[9], base.entrada),
    salida: parseSiNo(e[10], base.salida),
    parado: parseSiNo(e[11], base.parado),
    baja: parseSiNo(e[12], base.baja),
    historial: parseSiNo(e[13], base.historial),
    kpis: parseSiNo(e[14], base.kpis),
    equipos: parseSiNo(e[15], base.equipos),
    workspace: parseSiNo(e[16], base.workspace)
  };
}

export function puedeMovimiento(user, key) {
  if (key === `salida-rapida`) return puedeVerPagina(user, `salida`);
  if (key === `retorno-rapido`) return puedeVerPagina(user, `entrada`);
  return puedeVerPagina(user, key);
}

function parseAutorizadoRow(e) {
  if (!e?.[0]) {
    return null;
  }
  let email = String(e[0]).trim().toLowerCase();
  if (!email || !email.includes(`@`)) {
    return null;
  }
  let celularRaw = String(e[3] ?? ``).trim();
  let whatsappRaw = String(e[4] ?? ``).trim();
  let rol = normalizeRol(e[5]);
  let activoRaw = String(e[8] ?? `SI`).trim().toUpperCase();
  return {
    email,
    nombre: String(e[1] ?? ``).trim(),
    apellido: String(e[2] ?? ``).trim(),
    celular: celularRaw ? normalizeTelefonoMX(celularRaw) : ``,
    whatsapp: whatsappRaw ? normalizeTelefonoMX(whatsappRaw) : celularRaw ? normalizeTelefonoMX(celularRaw) : ``,
    rol,
    ubicacion: normalizeUbicacion(e[6]),
    clave: String(e[7] ?? ``).trim(),
    activo: activoRaw === `` || activoRaw === `SI` || activoRaw === `SÍ` || activoRaw === `YES` || activoRaw === `1` || activoRaw === `TRUE`,
    permisos: parsePermisosFromRow(e, rol),
    notas: String(e[17] ?? ``).trim() || undefined
  };
}

async function loadAutorizados(e) {
  try {
    let t = (await (await Vt(e, `/values/Autorizados!A2:R`)).json()).values ?? [];
    return t.map(parseAutorizadoRow).filter(Boolean);
  } catch (err) {
    throw Error(`No se pudo leer la hoja Autorizados. Créala/compártela o revisa permisos. ${err instanceof Error ? err.message : ``}`);
  }
}

export async function assertUsuarioAutorizado(config, profile, claveIngresada) {
  let email = String(profile.email ?? ``).trim().toLowerCase();
  if (!email) {
    throw Error(`Tu cuenta de Google no trae email. No se puede autorizar.`);
  }
  let clave = String(claveIngresada ?? ``).trim();
  if (!clave) {
    throw Error(`Escribe la clave que te asignó el admin (columna Clave del kardex).`);
  }
  let list = await loadAutorizados(config);
  if (list.length === 0) {
    throw Error(`El kardex Autorizados está vacío. Agrega correos en la hoja antes de usar la app.`);
  }
  let match = list.find(e => e.email === email);
  if (!match) {
    throw Error(`Acceso denegado: ${email} no está en el kardex de Autorizados.`);
  }
  if (!match.activo) {
    throw Error(`Acceso denegado: ${email} está inactivo en el kardex (Activo ≠ SI).`);
  }
  if (!match.clave) {
    throw Error(`Acceso denegado: ${email} no tiene Clave en el kardex. Pide al admin que te asigne una.`);
  }
  if (match.clave !== clave) {
    throw Error(`Clave incorrecta. Revisa con el admin la columna Clave de tu fila en Autorizados.`);
  }
  return {
    ...profile,
    email,
    rol: match.rol,
    ubicacion: match.ubicacion,
    celular: match.celular || undefined,
    whatsapp: match.whatsapp || undefined,
    permisos: match.permisos,
    nombreKardex: `${match.nombre} ${match.apellido}`.trim() || profile.name,
    autorizadoEn: new Date().toISOString()
  };
}

export function loadCachedAuthProfile() {
  try {
    let e = localStorage.getItem(AUTH_PROFILE_KEY);
    if (!e) {
      return null;
    }
    let t = JSON.parse(e);
    if (!t?.email || !t?.rol) {
      return null;
    }
    return t;
  } catch {
    return null;
  }
}

export function saveCachedAuthProfile(e) {
  if (e) {
    localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(e));
  } else {
    localStorage.removeItem(AUTH_PROFILE_KEY);
  }
}

export function rolLabel(e) {
  switch (e) {
    case `guardia`:
      return `Guardia`;
    case `encargado_yarda`:
      return `Encargado yarda`;
    case `patio`:
      return `Patio`;
    case `admin`:
      return `Admin`;
    default:
      return e || `—`;
  }
}

export function ubicacionLabel(e) {
  if (!e || e === `todas`) {
    return `Todas las yardas`;
  }
  return ye(e);
}
