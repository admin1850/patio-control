/**
 * Avisos de patio (Fase 4).
 * Siempre queda una fila en AvisosLog. Si hay WhatsApp o correo configurado
 * y un destino, se intenta el envío. Si no, canal=log.
 */

import net from 'node:net'
import tls from 'node:tls'
import { v4 as uuidv4 } from 'uuid'
import { computeSemaforo } from './otService.js'
import { avisoLogToRow, avisoSuscripcionToRow, rowToAvisoLog, rowToAvisoSuscripcion } from './sheetsRepo.js'

export const TIPOS_AVISO = Object.freeze([
  'ETR_VENCIDA',
  'UNIDAD_LISTA',
  'SELLO_DISTINTO',
  'OVERRIDE_GATE',
  'PARADO_AGING',
  'THERMO_FUERA',
  'PREVENTIVO_VENCIDO',
  'RESUMEN_DIARIO',
  'MOV_NO_REGISTRADO',
  'SIN_CONFIRMACION_GPS',
])

const PARADO_AGING_HORAS_DEFAULT = 48

export class AvisoError extends Error {
  constructor(message, status = 400, code = 'AVISO') {
    super(message)
    this.name = 'AvisoError'
    this.status = status
    this.code = code
  }
}

export function fechaMx(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

export function canalesConfigurados(env = process.env) {
  return {
    whatsapp: Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID),
    email: Boolean(env.SENDGRID_API_KEY || env.SMTP_HOST || env.SMTP),
  }
}

/** `smtp://user:pass@host:587` o SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS. */
export function leerSmtpConfig(env = process.env) {
  const raw = String(env.SMTP || '').trim()
  if (/^smtps?:\/\//i.test(raw)) {
    const url = new URL(raw)
    const secure = url.protocol === 'smtps:'
    return {
      host: url.hostname,
      port: Number(url.port || (secure ? 465 : 587)),
      user: decodeURIComponent(url.username || ''),
      pass: decodeURIComponent(url.password || ''),
      secure,
    }
  }
  if (!env.SMTP_HOST && !raw) return null
  const port = Number(env.SMTP_PORT || 587)
  return {
    host: env.SMTP_HOST || raw,
    port,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    secure: String(env.SMTP_SECURE || '') === '1' || port === 465,
  }
}

function clockOf(options) {
  const fn = options?.now ?? (() => new Date())
  const value = fn()
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function destinoWhatsapp(value) {
  return String(value || '').replace(/\D/g, '')
}

/**
 * Intento SMTP mínimo (465 TLS o 587 STARTTLS). Lo usa el servicio si hay SMTP_* y no hay mock.
 * @param {{ from: string, to: string, subject: string, body: string, env?: NodeJS.ProcessEnv, timeoutMs?: number }} args
 */
export async function enviarSmtp({ from, to, subject, body, env = process.env, timeoutMs = 8000 }) {
  const cfg = leerSmtpConfig(env)
  if (!cfg?.host) throw new Error('SMTP no configurado')
  const socket = await abrirSmtp(cfg, timeoutMs)
  try {
    await leerLinea(socket)
    await mandato(socket, `EHLO patiocontrol`)
    if (!cfg.secure && cfg.port !== 465) {
      await mandato(socket, 'STARTTLS')
      const secured = await startTls(socket, cfg.host)
      socket.removeAllListeners()
      await usarSocket(secured, cfg, from, to, subject, body, true)
      return { canal: 'email' }
    }
    await autenticarYEnviar(socket, cfg, from, to, subject, body)
    return { canal: 'email' }
  } finally {
    socket.destroy()
  }
}

function abrirSmtp(cfg, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = cfg.secure
      ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host })
      : net.connect({ host: cfg.host, port: cfg.port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('SMTP tardó demasiado'))
    }, timeoutMs)
    socket.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    socket.once(cfg.secure ? 'secureConnect' : 'connect', () => {
      clearTimeout(timer)
      resolve(socket)
    })
  })
}

function startTls(socket, host) {
  return new Promise((resolve, reject) => {
    const secured = tls.connect({ socket, servername: host })
    secured.once('secureConnect', () => resolve(secured))
    secured.once('error', reject)
  })
}

async function usarSocket(socket, cfg, from, to, subject, body, yaSaludo) {
  try {
    if (!yaSaludo) await leerLinea(socket)
    await mandato(socket, 'EHLO patiocontrol')
    await autenticarYEnviar(socket, cfg, from, to, subject, body)
  } finally {
    socket.destroy()
  }
}

async function autenticarYEnviar(socket, cfg, from, to, subject, body) {
  if (cfg.user) {
    await mandato(socket, 'AUTH LOGIN')
    await mandato(socket, Buffer.from(cfg.user).toString('base64'))
    await mandato(socket, Buffer.from(cfg.pass || '').toString('base64'))
  }
  await mandato(socket, `MAIL FROM:<${from}>`)
  await mandato(socket, `RCPT TO:<${to}>`)
  await mandato(socket, 'DATA')
  const data = `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n.`
  await mandato(socket, data)
  await mandato(socket, 'QUIT')
}

function mandato(socket, line) {
  return new Promise((resolve, reject) => {
    socket.write(`${line}\r\n`, (err) => {
      if (err) reject(err)
    })
    leerLinea(socket).then(resolve, reject)
  })
}

function leerLinea(socket) {
  return new Promise((resolve, reject) => {
    let buf = ''
    const onData = (chunk) => {
      buf += chunk.toString('utf8')
      if (!buf.includes('\n')) return
      cleanup()
      const line = buf.trim()
      const code = Number(line.slice(0, 3))
      if (code >= 400) reject(new Error(line.slice(0, 180)))
      else resolve(line)
    }
    const onError = (err) => {
      cleanup()
      reject(err)
    }
    const cleanup = () => {
      socket.off('data', onData)
      socket.off('error', onError)
    }
    socket.on('data', onData)
    socket.once('error', onError)
  })
}

async function enviarWhatsapp({ to, body, env, fetchImpl }) {
  const phoneId = env.WHATSAPP_PHONE_ID
  const res = await fetchImpl(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: destinoWhatsapp(to),
      type: 'text',
      text: { preview_url: false, body },
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`WhatsApp ${res.status}: ${text.slice(0, 180)}`)
  }
  return { canal: 'whatsapp' }
}

async function enviarSendgrid({ to, subject, body, env, fetchImpl }) {
  const from = env.SMTP_FROM || env.SENDGRID_FROM || 'patio@camircapital.com'
  const res = await fetchImpl('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [{ type: 'text/plain', value: body }],
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`SendGrid ${res.status}: ${text.slice(0, 180)}`)
  }
  return { canal: 'email' }
}

/**
 * @param {Record<string, Function>} repo
 * @param {{ now?: () => Date, newId?: () => string, env?: NodeJS.ProcessEnv, fetch?: typeof fetch, smtpSend?: Function }} [options]
 */
export function createAvisosService(repo, options = {}) {
  const env = options.env ?? process.env
  const fetchImpl = options.fetch ?? globalThis.fetch

  function newId() {
    return options.newId ? options.newId() : uuidv4()
  }

  function exigirTipo(tipo) {
    const normal = String(tipo || '').trim().toUpperCase()
    if (!TIPOS_AVISO.includes(normal)) {
      throw new AvisoError('Tipo de aviso no válido.', 400, 'TIPO')
    }
    return normal
  }

  async function guardar(aviso) {
    const row = avisoLogToRow(aviso)
    await repo.appendAvisoLog(row)
    return rowToAvisoLog(row)
  }

  function suscripcionAplica(sub, tipo, yarda) {
    if (sub.activo === 'NO') return false
    const tipoOk = !sub.tipo || sub.tipo === '*' || sub.tipo === tipo
    const yardaSub = sub.yarda || 'todas'
    const yardaOk = yardaSub === 'todas' || yardaSub === '*' || !yarda || yardaSub === yarda
    return tipoOk && yardaOk && Boolean(sub.destino)
  }

  async function destinosDe(tipo, yarda) {
    const subs = typeof repo.listAvisosSuscripciones === 'function' ? await repo.listAvisosSuscripciones() : []
    const matched = subs
      .filter((sub) => suscripcionAplica(sub, tipo, yarda))
      .map((sub) => ({ canal: sub.canal === 'correo' ? 'email' : sub.canal, destino: sub.destino }))
    if (matched.length) return matched
    const cfg = canalesConfigurados(env)
    const fallback = []
    if (cfg.whatsapp && env.AVISOS_WHATSAPP_TO) fallback.push({ canal: 'whatsapp', destino: env.AVISOS_WHATSAPP_TO })
    const emailTo = env.AVISOS_EMAIL_TO || env.SMTP_TO
    if (cfg.email && emailTo) fallback.push({ canal: 'email', destino: emailTo })
    return fallback
  }

  async function intentarEnvio({ canal, destino, mensaje }) {
    const cfg = canalesConfigurados(env)
    const subject = `PatioControl · ${mensaje.slice(0, 80)}`
    try {
      if (canal === 'whatsapp' && cfg.whatsapp && destino) {
        await enviarWhatsapp({ to: destino, body: mensaje, env, fetchImpl })
        return { canal: 'whatsapp', estatus: 'ENVIADO', detalle: '' }
      }
      if ((canal === 'email' || canal === 'correo') && destino && env.SENDGRID_API_KEY) {
        await enviarSendgrid({ to: destino, subject, body: mensaje, env, fetchImpl })
        return { canal: 'email', estatus: 'ENVIADO', detalle: '' }
      }
      if ((canal === 'email' || canal === 'correo') && destino && (env.SMTP_HOST || env.SMTP)) {
        const from = env.SMTP_FROM || env.SENDGRID_FROM || 'patio@camircapital.com'
        if (options.smtpSend) await options.smtpSend({ from, to: destino, subject, body: mensaje, env })
        else await enviarSmtp({ from, to: destino, subject, body: mensaje, env })
        return { canal: 'email', estatus: 'ENVIADO', detalle: '' }
      }
    } catch (err) {
      const canalIntentado = canal === 'correo' ? 'email' : canal
      return { canal: canalIntentado || 'log', estatus: 'ERROR', detalle: err?.message || 'No se pudo enviar' }
    }
    return { canal: 'log', estatus: 'LOG', detalle: '' }
  }

  async function enqueue(tipoRaw, input = {}) {
    const tipo = exigirTipo(tipoRaw)
    const ahora = clockOf(options)
    const yarda = String(input.yarda || input.yardaId || '').trim().toLowerCase()
    const unidadId = String(input.unidadId || input.equipoId || '').trim()
    const mensaje = String(input.mensaje || '').trim() || `${tipo}${unidadId ? ` · ${unidadId}` : ''}${yarda ? ` · ${yarda}` : ''}`
    const dedupeKey = String(input.dedupeKey || `${tipo}|${yarda}|${unidadId}|${fechaMx(ahora)}`).trim()
    const previos = typeof repo.listAvisosLog === 'function' ? await repo.listAvisosLog() : []
    const ya = previos.find((item) => item.dedupeKey && item.dedupeKey === dedupeKey)
    if (ya) return { skipped: true, aviso: ya }

    const destinos = await destinosDe(tipo, yarda)
    const objetivos = destinos.length ? destinos : [{ canal: 'log', destino: '' }]
    const guardados = []
    for (const objetivo of objetivos) {
      const envio = await intentarEnvio({ canal: objetivo.canal, destino: objetivo.destino, mensaje })
      guardados.push(await guardar({
        id: newId(),
        tipo,
        yarda,
        unidadId,
        canal: envio.canal,
        estatus: envio.estatus,
        destino: objetivo.destino || '',
        mensaje,
        dedupeKey,
        horaServidor: ahora.toISOString(),
        detalle: envio.detalle || input.detalle || '',
      }))
    }
    return { skipped: false, aviso: guardados[0], avisos: guardados }
  }

  async function upsertSuscripcion(input = {}) {
    const id = String(input.id || '').trim() || newId()
    const destino = String(input.destino || '').trim()
    if (!destino) throw new AvisoError('Indica el destino del aviso (celular o correo).', 400, 'DESTINO')
    const canalRaw = String(input.canal || 'whatsapp').trim().toLowerCase()
    const canal = canalRaw === 'correo' ? 'email' : canalRaw
    if (!['whatsapp', 'email', 'log'].includes(canal)) {
      throw new AvisoError('El canal es whatsapp o email.', 400, 'CANAL')
    }
    const sub = {
      id,
      tipo: String(input.tipo || '*').trim().toUpperCase() || '*',
      yarda: String(input.yarda || 'todas').trim().toLowerCase() || 'todas',
      canal,
      destino,
      activo: String(input.activo || 'SI').trim().toUpperCase() === 'NO' ? 'NO' : 'SI',
    }
    if (input.tipo && input.tipo !== '*' && !TIPOS_AVISO.includes(sub.tipo)) {
      throw new AvisoError('Tipo de aviso no válido.', 400, 'TIPO')
    }
    const row = avisoSuscripcionToRow(sub)
    const actuales = await repo.listAvisosSuscripciones()
    const previo = actuales.find((item) => item.id === id)
    if (previo) await repo.updateAvisoSuscripcionById(id, row)
    else await repo.appendAvisoSuscripcion(row)
    return rowToAvisoSuscripcion(row)
  }

  async function revisarEtrVencidas(tablero) {
    const ahora = clockOf(options)
    const ordenes = []
    const grupos = tablero?.porYarda || []
    for (const grupo of grupos) {
      for (const ot of grupo.ordenes || []) {
        const bucket = ot.semaforo?.bucket || computeSemaforo(ot.etr, ahora).bucket
        if (bucket === 'vencido') ordenes.push(ot)
      }
    }
    const avisos = []
    for (const ot of ordenes) {
      avisos.push(await enqueue('ETR_VENCIDA', {
        yarda: ot.yarda,
        unidadId: ot.unidadId,
        mensaje: `ETR vencido · ${ot.folio || ot.id} · unidad ${ot.unidadId} · ${ot.yarda || 'sin yarda'}`,
        dedupeKey: `ETR_VENCIDA|${ot.id}|${fechaMx(ahora)}`,
      }))
    }
    return { revisadas: ordenes.length, avisos, generadoEn: ahora.toISOString() }
  }

  function bucketDe(mapa, yarda) {
    const key = yarda || 'sin-yarda'
    if (!mapa.has(key)) {
      mapa.set(key, {
        yarda: key,
        enTaller: 0,
        etrVencidas: 0,
        preventivoVencido: 0,
        preventivoAviso: 0,
        parados: 0,
      })
    }
    return mapa.get(key)
  }

  async function resumenDiario() {
    const ahora = clockOf(options)
    const mapa = new Map()
    if (typeof repo.listOrdenesTrabajo === 'function') {
      const ots = await repo.listOrdenesTrabajo()
      for (const ot of ots) {
        if (ot.activo === 'NO') continue
        if (['CERRADA', 'CANCELADA'].includes(ot.estatus)) continue
        const bucket = bucketDe(mapa, ot.yarda)
        bucket.enTaller += 1
        if (computeSemaforo(ot.etr, ahora).bucket === 'vencido') bucket.etrVencidas += 1
      }
    }
    if (typeof repo.listServiciosProgramados === 'function') {
      for (const servicio of await repo.listServiciosProgramados()) {
        const yarda = await yardaServicio(servicio)
        if (servicio.estatus === 'VENCIDO') bucketDe(mapa, yarda).preventivoVencido += 1
        if (servicio.estatus === 'AVISO') bucketDe(mapa, yarda).preventivoAviso += 1
      }
    }
    const horasParado = Number(env.PARADO_AGING_HORAS || PARADO_AGING_HORAS_DEFAULT)
    if (typeof repo.listMovimientos === 'function') {
      const latest = new Map()
      for (const mov of await repo.listMovimientos()) {
        const id = String(mov.equipoId || '').trim()
        if (!id) continue
        const t = Date.parse(mov.horaServidor || mov.fechaHora || '')
        const prev = latest.get(id)
        if (!prev || (Number.isFinite(t) && t >= prev.t)) latest.set(id, { mov, t: Number.isFinite(t) ? t : 0 })
      }
      for (const { mov } of latest.values()) {
        if (String(mov.tipo || '').toLowerCase() !== 'parado') continue
        const desde = Date.parse(mov.paradoDesde || mov.horaServidor || mov.fechaHora || '')
        if (!Number.isFinite(desde)) continue
        const horas = (ahora.getTime() - desde) / 36e5
        if (horas < horasParado) continue
        const yarda = String(mov.yardaId || mov.yarda || '').trim().toLowerCase()
        bucketDe(mapa, yarda).parados += 1
        await enqueue('PARADO_AGING', {
          yarda,
          unidadId: mov.equipoId,
          mensaje: `Unidad parada ${Math.round(horas)} h · ${mov.placa || mov.equipoId} · ${yarda || 'sin yarda'}`,
          dedupeKey: `PARADO_AGING|${mov.equipoId}|${fechaMx(ahora)}`,
        })
      }
    }
    if (mapa.size === 0) bucketDe(mapa, 'todas')
    const yardas = []
    for (const bucket of mapa.values()) {
      const mensaje = `Resumen ${bucket.yarda}: ${bucket.enTaller} en taller, ${bucket.etrVencidas} con ETR vencido, ${bucket.preventivoVencido} preventivos vencidos, ${bucket.preventivoAviso} en aviso, ${bucket.parados} parados de ${horasParado} h o más.`
      const aviso = await enqueue('RESUMEN_DIARIO', {
        yarda: bucket.yarda,
        mensaje,
        dedupeKey: `RESUMEN_DIARIO|${bucket.yarda}|${fechaMx(ahora)}`,
      })
      yardas.push({ ...bucket, aviso })
    }
    return { generadoEn: ahora.toISOString(), yardas }
  }

  async function yardaServicio(servicio) {
    if (typeof repo.listEstadoUnidad === 'function') {
      const estado = (await repo.listEstadoUnidad()).find((item) => String(item.unidadId) === String(servicio.unidadId) && item.yarda)
      if (estado?.yarda) return String(estado.yarda).trim().toLowerCase()
    }
    if (typeof repo.listMovimientos === 'function') {
      let yarda = ''
      for (const mov of await repo.listMovimientos()) {
        if (String(mov.equipoId || '') === String(servicio.unidadId) && (mov.yardaId || mov.yarda)) {
          yarda = String(mov.yardaId || mov.yarda).trim().toLowerCase()
        }
      }
      if (yarda) return yarda
    }
    return ''
  }

  return { enqueue, upsertSuscripcion, revisarEtrVencidas, resumenDiario, canalesConfigurados: () => canalesConfigurados(env) }
}

/** No tumba al caller si la hoja de avisos no existe. */
export async function intentarAviso(repo, fn, options) {
  if (!repo || typeof repo.appendAvisoLog !== 'function') return null
  try {
    return await fn(createAvisosService(repo, options))
  } catch (err) {
    if (Number(err?.status) !== 503) console.warn('[avisos]', err?.message || err)
    return null
  }
}
