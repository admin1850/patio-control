/** Cita de tercero. El id es el contenido del QR que se lee en caseta. */

export const TIPOS_CITA = Object.freeze(['transportista', 'proveedor', 'visita'])

export function crearCita({ tipo, nombre, empresa, placa, eta, id, ahora = new Date() } = {}) {
  const tipoTxt = String(tipo || '').trim().toLowerCase()
  if (!TIPOS_CITA.includes(tipoTxt)) throw new Error('El tipo es transportista, proveedor o visita.')
  const nombreTxt = String(nombre || '').trim()
  if (!nombreTxt) throw new Error('Falta el nombre.')
  const cuando = ahora instanceof Date ? ahora : new Date(ahora)
  const codigo = String(id || `CITA-${cuando.getTime().toString(36).toUpperCase()}`).trim().toUpperCase()
  return {
    id: codigo,
    tipo: tipoTxt,
    nombre: nombreTxt,
    empresa: String(empresa || '').trim(),
    placa: String(placa || '').trim().toUpperCase(),
    eta: String(eta || '').trim(),
    estatus: 'PENDIENTE',
    usadaEn: '',
  }
}

/** 12 h de gracia después de la ETA. */
export function validarEnCaseta(cita, ahora = new Date(), graciaHoras = 12) {
  if (!cita) return { ok: false, mensaje: 'No hay cita con ese código.' }
  if (String(cita.estatus).toUpperCase() === 'USADA') return { ok: false, mensaje: 'Esa cita ya se usó en caseta.' }
  const reloj = ahora instanceof Date ? ahora : new Date(ahora)
  if (cita.eta) {
    const eta = Date.parse(cita.eta)
    if (Number.isFinite(eta) && reloj.getTime() > eta + graciaHoras * 3600000) {
      return { ok: false, mensaje: 'La cita ya venció.' }
    }
  }
  return {
    ok: true,
    mensaje: `Pase para ${cita.nombre}${cita.empresa ? ` · ${cita.empresa}` : ''}.`,
    cita: { ...cita, estatus: 'USADA', usadaEn: reloj.toISOString() },
  }
}
