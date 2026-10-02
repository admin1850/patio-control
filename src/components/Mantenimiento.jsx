import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  actualizarOrdenServidor,
  abrirOtPreventivo,
  crearOrdenServidor,
  fetchOrdenDetalle,
  fetchPreventivoOpcional,
  fetchTableroOpcional,
  isGateUnavailable,
  isNetworkFailure,
  listOrdenesServidor,
  uploadMediaServer,
} from '../lib/serverApi.js'
import { compressImageFile, normalizePlacaMX } from '../lib/placaOcr.js'
import { enqueueMediaOt, enqueueOtCreate } from '../lib/outbox.js'
import PreventivoSection from './Preventivo.jsx'

const YARDAS = [
  { id: 'chihuahua', nombre: 'Chihuahua' },
  { id: 'calera', nombre: 'Calera' },
  { id: 'calpulalpan', nombre: 'Calpulalpan' },
]

const TIPOS = [
  ['CORRECTIVO', 'Correctivo'],
  ['PREVENTIVO', 'Preventivo'],
  ['LLANTAS', 'Llantas'],
  ['THERMO', 'Thermo'],
  ['CARROCERIA', 'Carrocería'],
  ['ELECTRICO', 'Eléctrico'],
  ['OTRO', 'Otro'],
]

const PRIORIDADES = [
  ['BAJA', 'Baja'],
  ['MEDIA', 'Media'],
  ['ALTA', 'Alta'],
  ['UNIDAD_PARADA', 'Unidad parada'],
]

const ESTATUS = [
  ['ABIERTA', 'Abierta'],
  ['DIAGNOSTICO', 'Diagnóstico'],
  ['ESPERA_REFACCION', 'Espera de refacción'],
  ['EN_REPARACION', 'En reparación'],
  ['LISTA', 'Lista'],
  ['CERRADA', 'Cerrada'],
  ['CANCELADA', 'Cancelada'],
]

const TRANSICIONES = {
  ABIERTA: ['DIAGNOSTICO', 'ESPERA_REFACCION', 'EN_REPARACION', 'LISTA', 'CANCELADA'],
  DIAGNOSTICO: ['ESPERA_REFACCION', 'EN_REPARACION', 'LISTA', 'CANCELADA'],
  ESPERA_REFACCION: ['EN_REPARACION', 'LISTA', 'CANCELADA'],
  EN_REPARACION: ['ESPERA_REFACCION', 'LISTA', 'CANCELADA'],
  LISTA: ['EN_REPARACION', 'CERRADA', 'CANCELADA'],
  CERRADA: [],
  CANCELADA: [],
}

const ETIQUETA_OPERATIVO = {
  DISPONIBLE: 'Disponible',
  EN_MANTENIMIENTO: 'En mantenimiento',
  DANADO_NO_OPERABLE: 'Dañado',
  BAJA: 'Baja',
}

function rolDe(user) {
  return String(user?.rol || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
}

export function puedeAbrirOtCliente(user) {
  const rol = rolDe(user)
  if (['admin', 'administrador', 'supervisor', 'encargado_yarda', 'encargado', 'yarda', 'patio', 'operador_patio', 'operaciones'].includes(rol)) {
    return true
  }
  if (user?.permisos?.parado) return true
  if (!user?.rol && !user?.permisos) return true
  return false
}

export function puedeMoverEtrCliente(user) {
  const rol = rolDe(user)
  if (rol === 'guardia' || rol === 'caseta') return false
  if (!user?.rol) return true
  return puedeAbrirOtCliente(user)
}

export function puedeAutorizarSalidaCliente(user) {
  const rol = rolDe(user)
  return rol === 'admin' || rol === 'administrador' || rol === 'supervisor' || rol === 'encargado_yarda' || rol === 'encargado' || rol === 'yarda'
}

export function EstatusOperativoChip({ estado }) {
  if (!estado?.estatusOperativo) return null
  const label = ETIQUETA_OPERATIVO[estado.estatusOperativo] || estado.estatusOperativo
  return <span className={`badge op-${String(estado.estatusOperativo).toLowerCase()}`}>{label}</span>
}

function nombreYarda(id) {
  return YARDAS.find((y) => y.id === id)?.nombre || id || 'Sin yarda'
}

function etiquetaTipo(id) {
  return TIPOS.find((t) => t[0] === id)?.[1] || id
}

function etiquetaEstatus(id) {
  return ESTATUS.find((t) => t[0] === id)?.[1] || id
}

function etiquetaPrioridad(id) {
  return PRIORIDADES.find((t) => t[0] === id)?.[1] || id || 'Media'
}

function fmt(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function textoHoras(horas) {
  if (horas == null || !Number.isFinite(horas)) return 'sin ETR'
  if (horas < 0) {
    const abs = Math.abs(horas)
    if (abs < 1) return `vencida hace ${Math.max(1, Math.round(abs * 60))} min`
    return `vencida hace ${Math.round(abs)} h`
  }
  if (horas < 1) return `vence en ${Math.max(1, Math.round(horas * 60))} min`
  return horas <= 24 ? `vence en ${Math.round(horas)} h` : `en tiempo · ${Math.round(horas)} h`
}

function diasEnTallerDe(ot) {
  if (ot?.metricas?.diasEnTaller != null) return ot.metricas.diasEnTaller
  const entrada = Date.parse(ot?.fechaEntradaTaller || '')
  if (!Number.isFinite(entrada)) return null
  return Math.round(((Date.now() - entrada) / 864e5) * 10) / 10
}

function ultimoKm(movimientos, equipoId) {
  let best = null
  let bestT = -1
  for (const mov of movimientos || []) {
    if (!mov || mov.equipoId !== equipoId) continue
    const km = Number(mov.kilometros)
    if (!Number.isFinite(km)) continue
    const t = Date.parse(mov.fechaHora || mov.creadoEn || '') || 0
    if (t >= bestT) {
      bestT = t
      best = km
    }
  }
  return best
}

function ultimoHorometro(movimientos, equipoId) {
  let best = null
  let bestT = -1
  for (const mov of movimientos || []) {
    if (!mov || mov.equipoId !== equipoId) continue
    const h = Number(mov.horometro ?? mov.horasThermo ?? mov.horometroThermo)
    if (!Number.isFinite(h)) continue
    const t = Date.parse(mov.fechaHora || mov.creadoEn || '') || 0
    if (t >= bestT) {
      bestT = t
      best = h
    }
  }
  return best
}

function etrDiasExtraDe(ot) {
  if (ot?.metricas?.etrDiasExtra != null) return ot.metricas.etrDiasExtra
  const orig = Date.parse(ot?.etrOriginal || '')
  const actual = Date.parse(ot?.etr || '')
  if (!Number.isFinite(orig) || !Number.isFinite(actual)) return 0
  return Math.round(((actual - orig) / 864e5) * 10) / 10
}

function esUrlFoto(url) {
  const s = String(url || '')
  return /^https?:\/\//i.test(s) || s.startsWith('/api/')
}

function esDataUrl(url) {
  return String(url || '').startsWith('data:')
}

/** Sube dataUrls; si no hay red, las deja en bandeja IndexedDB y conserva el dataUrl. */
async function asegurarFotosServidor(fotos, { slotPrefix, otId, field, yardaId } = {}) {
  const out = []
  let pendientes = 0
  for (const item of fotos || []) {
    if (!item) continue
    if (esUrlFoto(item)) {
      out.push(item)
      continue
    }
    if (!esDataUrl(item)) {
      out.push(item)
      continue
    }
    try {
      const up = await uploadMediaServer({
        fileName: `${slotPrefix || 'ot'}-${Date.now()}.jpg`,
        dataUrl: item,
        slotId: slotPrefix || 'ot',
        yardaId,
        movimientoId: otId || '',
      })
      const url = up?.viewPath || up?.url
      if (!url) throw new Error('Sin URL de foto')
      out.push(url)
    } catch (error) {
      if (isNetworkFailure(error) || isGateUnavailable(error)) {
        await enqueueMediaOt({
          dataUrl: item,
          fileName: `${slotPrefix || 'ot'}-${Date.now()}.jpg`,
          slotId: slotPrefix || 'ot',
          otId: otId || '',
          field: field || 'fotosAntesJson',
          yardaId: yardaId || '',
        })
        out.push(item)
        pendientes += 1
      } else {
        throw error
      }
    }
  }
  return { urls: out, pendientes }
}

function Semaforo({ semaforo }) {
  const nivel = semaforo?.nivel || 'rojo'
  const label = nivel === 'verde' ? 'En tiempo' : nivel === 'amarillo' ? 'Por vencer' : 'Vencida'
  return (
    <span className={`semaforo ${nivel}`}>
      <i aria-hidden="true" />
      {label}
      {semaforo ? ` · ${textoHoras(semaforo.horas)}` : ''}
    </span>
  )
}

function Resumen({ resumen }) {
  if (!resumen) return null
  return (
    <div className="ot-resumen">
      <span className="semaforo verde"><i aria-hidden="true" />{resumen.verde} en tiempo</span>
      <span className="semaforo amarillo"><i aria-hidden="true" />{resumen.amarillo} ≤24 h</span>
      <span className="semaforo rojo"><i aria-hidden="true" />{resumen.rojo} vencidas</span>
    </div>
  )
}

export function MantenimientoBoard({ onOpen, compact = false }) {
  const [data, setData] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancel = false
    fetchTableroOpcional()
      .then((payload) => {
        if (!cancel) setData(payload)
      })
      .catch((err) => {
        if (!cancel) setError(err instanceof Error ? err.message : 'No se pudo cargar el tablero')
      })
    return () => {
      cancel = true
    }
  }, [])

  if (error) return <p className="banner warn">No se pudo cargar el tablero de mantenimiento. El patio sigue operando.</p>
  if (!data?.tablero) return null
  const tablero = data.tablero || data
  const grupos = tablero.porYarda || []
  return (
    <section className="panel ot-board-panel">
      <div className="panel-head">
        <h2>En mantenimiento</h2>
        {onOpen && (
          <button type="button" className="text-btn" onClick={onOpen}>
            Abrir OT
          </button>
        )}
      </div>
      <Resumen resumen={tablero.resumen} />
      {grupos.length === 0 || tablero.resumen?.total === 0 ? (
        <p className="empty">No hay unidades en mantenimiento.</p>
      ) : (
        grupos.map((grupo) => (
          <div className="ot-yarda" key={grupo.yarda}>
            <h3>{nombreYarda(grupo.yarda)}</h3>
            {grupo.ordenes.length === 0 ? (
              <p className="empty">Sin órdenes abiertas en esta yarda.</p>
            ) : (
              <ul className="ot-list">
                {(compact ? grupo.ordenes.slice(0, 4) : grupo.ordenes).map((ot) => (
                  <li className={`ot-card ${ot.semaforo?.nivel || 'rojo'}`} key={ot.id}>
                    <p className="unit-placa">
                      {ot.folio} · {ot.unidadId}
                    </p>
                    <Semaforo semaforo={ot.semaforo} />
                    <p className="unit-meta">
                      {etiquetaTipo(ot.tipo)} · {etiquetaEstatus(ot.estatus)} · ETR {fmt(ot.etr)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}
    </section>
  )
}

function FotosCamara({ label, fotos, onChange, min = 2, slotPrefix = 'ot', otId = '', field = 'fotosAntesJson', yardaId = '' }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [pendientes, setPendientes] = useState(0)

  async function onFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      setErr('Solo fotos de la cámara')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const dataUrl = await compressImageFile(file, 1600, 0.72)
      try {
        const up = await uploadMediaServer({
          fileName: `${slotPrefix}-${Date.now()}.jpg`,
          dataUrl,
          slotId: slotPrefix,
          yardaId,
          movimientoId: otId || '',
        })
        const url = up?.viewPath || up?.url
        if (!url) throw new Error('Sin URL de foto')
        onChange([...(fotos || []), url])
      } catch (error) {
        if (isNetworkFailure(error) || isGateUnavailable(error)) {
          await enqueueMediaOt({
            dataUrl,
            fileName: `${slotPrefix}-${Date.now()}.jpg`,
            slotId: slotPrefix,
            otId,
            field,
            yardaId,
          })
          setPendientes((n) => n + 1)
          onChange([...(fotos || []), dataUrl])
          setErr('Sin red: la foto quedó en bandeja. Al volver la señal se sube sola (ACK del servidor).')
        } else {
          throw error
        }
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'No se pudo guardar la foto')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ot-fotos">
      <p className="label">{label} (mín. {min})</p>
      <button type="button" className="btn soft wide" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'Subiendo…' : 'Tomar foto'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(ev) => {
          void onFile(ev.target.files?.[0])
          ev.target.value = ''
        }}
      />
      <div className="chip-row" style={{ marginTop: 8 }}>
        {(fotos || []).map((url, idx) => (
          <button
            type="button"
            className="chip"
            key={`${String(url).slice(0, 24)}-${idx}`}
            onClick={() => onChange((fotos || []).filter((_, i) => i !== idx))}
            title="Quitar"
          >
            Foto {idx + 1}{esDataUrl(url) ? ' (bandeja)' : ''} ✕
          </button>
        ))}
      </div>
      {(fotos || []).length > 0 && (
        <div className="photo-grid labeled" style={{ marginTop: 8 }}>
          {(fotos || []).slice(0, 6).map((url, idx) => (
            <img src={url} alt={`Foto ${idx + 1}`} key={`${idx}-${String(url).slice(0, 24)}`} />
          ))}
        </div>
      )}
      {pendientes > 0 && <p className="hint">{pendientes} foto(s) en bandeja IndexedDB pendientes de ACK.</p>}
      {err && <p className="banner warn">{err}</p>}
    </div>
  )
}

function totalRefacciones(rows) {
  return (rows || []).reduce((sum, row) => sum + (Number(row.cantidad) || 0) * (Number(row.costo) || 0), 0)
}

/** Historial de mantenimiento de una unidad (solo lectura). */
export function HistorialMantenimientoUnidad({ unidadId, placa }) {
  const [ordenes, setOrdenes] = useState(null)
  const [proximo, setProximo] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancel = false
    const key = unidadId || placa
    if (!key) return undefined
    Promise.all([
      listOrdenesServidor({ unidadId: key, inactivas: '1' }),
      fetchPreventivoOpcional('todas').catch(() => null),
    ])
      .then(([data, prev]) => {
        if (cancel) return
        setOrdenes(data?.ordenes || data?.ots || [])
        const servicios = prev?.servicios || []
        const match = servicios.find(
          (item) =>
            item.unidadId === key ||
            String(item.unidadId || '').toUpperCase() === normalizePlacaMX(placa || ''),
        )
        setProximo(match || null)
      })
      .catch((err) => {
        if (!cancel) setError(err instanceof Error ? err.message : 'No se pudo cargar')
      })
    return () => {
      cancel = true
    }
  }, [unidadId, placa])

  if (error) return <p className="banner warn">{error}</p>
  if (!ordenes) return <p className="hint">Cargando mantenimiento…</p>
  if (ordenes.length === 0 && !proximo) return <p className="empty">Sin OT para esta unidad.</p>
  const cerradas = ordenes.filter((ot) => ot.estatus === 'CERRADA')
  const ultima = cerradas[0] || ordenes[0]
  const hace90 = Date.now() - 90 * 24 * 60 * 60 * 1000
  const diasParada90 = ordenes.reduce((sum, ot) => {
    const desde = Date.parse(ot.fechaEntradaTaller || ot.creadoEn || '')
    if (!Number.isFinite(desde) || desde < hace90) return sum
    const hasta = Date.parse(ot.fechaLista || ot.fechaLiberada || '') || Date.now()
    const horas = Math.max(0, (hasta - Math.max(desde, hace90)) / 36e5)
    return sum + horas / 24
  }, 0)
  return (
    <div className="ot-historial">
      <p className="hint">
        Último servicio: {ultima ? `${ultima.folio || ultima.id} · ${etiquetaEstatus(ultima.estatus)} · ${fmt(ultima.fechaLiberada || ultima.fechaLista || ultima.etr)}` : '—'}
      </p>
      <p className="hint">
        Próximo preventivo:{' '}
        {proximo
          ? `${proximo.semaforo?.etiqueta || proximo.estatus || 'pendiente'} · km ${proximo.proximoKm ?? '—'} · ${fmt(proximo.proximaFecha)}`
          : 'Sin plan calculado'}
      </p>
      <p className="hint">Días parada (90 d): {diasParada90.toFixed(1)}</p>
      <ul className="ot-list">
        {ordenes.slice(0, 20).map((ot) => (
          <li className="ot-card" key={ot.id}>
            <p className="unit-placa">{ot.folio || ot.id}</p>
            <p className="unit-meta">
              {etiquetaTipo(ot.tipo)} · {etiquetaEstatus(ot.estatus)} · {etiquetaPrioridad(ot.prioridad)} · ETR {fmt(ot.etr)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function OtDetalle({ otId, user, onBack, onChanged }) {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [etr, setEtr] = useState('')
  const [motivoEtr, setMotivoEtr] = useState('')
  const [motivoCancel, setMotivoCancel] = useState('')
  const [fotosDespues, setFotosDespues] = useState([])
  const [kmSalida, setKmSalida] = useState('')
  const [horometroSalida, setHorometroSalida] = useState('')
  const [notaCierre, setNotaCierre] = useState('')
  const [refs, setRefs] = useState([{ descripcion: '', cantidad: 1, costo: 0 }])
  const puedeEditar = puedeAbrirOtCliente(user)
  const puedeEtr = puedeMoverEtrCliente(user)

  async function reload() {
    const data = await fetchOrdenDetalle(otId)
    setPayload(data)
    setFotosDespues(Array.isArray(data?.ot?.fotosDespuesJson) ? data.ot.fotosDespuesJson : [])
    setKmSalida(data?.ot?.kmSalida != null ? String(data.ot.kmSalida) : '')
    setHorometroSalida(data?.ot?.horometroSalida != null ? String(data.ot.horometroSalida) : '')
    setRefs(
      Array.isArray(data?.ot?.refaccionesJson) && data.ot.refaccionesJson.length
        ? data.ot.refaccionesJson
        : [{ descripcion: '', cantidad: 1, costo: 0 }],
    )
  }

  useEffect(() => {
    let cancel = false
    reload()
      .catch((err) => {
        if (!cancel) setError(err instanceof Error ? err.message : 'No se pudo cargar la OT')
      })
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otId])

  const ot = payload?.ot
  const eventos = payload?.eventos || []
  const siguientes = ot ? TRANSICIONES[ot.estatus] || [] : []

  async function run(fn) {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      await fn()
      await reload()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  if (error && !ot) {
    return (
      <div className="panel">
        <p className="banner error">{error}</p>
        <button type="button" className="btn soft" onClick={onBack}>Volver</button>
      </div>
    )
  }
  if (!ot) return <p className="hint">Cargando OT…</p>

  const dias = diasEnTallerDe(ot)

  return (
    <section className="panel ot-detalle">
      <div className="panel-head">
        <h2>{ot.folio || ot.id}</h2>
        <button type="button" className="text-btn" onClick={onBack}>Volver a la lista</button>
      </div>
      <p className="unit-placa">{ot.unidadId}</p>
      <p className="unit-meta">
        {etiquetaTipo(ot.tipo)} · {etiquetaPrioridad(ot.prioridad)} · {ot.tallerTipo === 'EXTERNO' ? 'Taller externo' : 'Taller interno'}
        {' · '}{etiquetaEstatus(ot.estatus)} · ETR {fmt(ot.etr)}
        {dias != null ? ` · ${dias} días en taller` : ''}
      </p>
      <p className="unit-meta">{ot.motivo}</p>
      {ot.estatus === 'LISTA' && <p className="banner success">Unidad lista</p>}
      {ot.metricas?.downtimeHoras != null && (
        <p className="hint">
          Downtime {ot.metricas.downtimeHoras} h
          {ot.metricas.etrCumplida == null ? '' : ot.metricas.etrCumplida ? ' · ETR cumplida' : ' · ETR no cumplida'}
        </p>
      )}
      {ot.etrMovimientosCount ? (
        <p className="hint">
          ETR movida {ot.etrMovimientosCount} vez(ces)
          {etrDiasExtraDe(ot) ? ` (+${etrDiasExtraDe(ot)} días)` : ''}
        </p>
      ) : null}
      {error && <p className="banner error">{error}</p>}
      {msg && <p className="banner success">{msg}</p>}

      <h3 className="subhead">Línea de tiempo</h3>
      <ul className="ot-timeline">
        {eventos.length === 0 ? (
          <li className="empty">Sin eventos aún.</li>
        ) : (
          [...eventos].reverse().map((ev) => (
            <li key={ev.id}>
              <strong>{ev.tipoEvento}</strong>
              {` · ${fmt(ev.horaServidor)} · ${ev.usuarioEmail || '—'}`}
              <br />
              <span className="hint">
                {ev.valorAnterior || '—'} → {ev.valorNuevo || '—'}
                {ev.motivo ? ` · ${ev.motivo}` : ''}
              </span>
            </li>
          ))
        )}
      </ul>

      {puedeEditar && siguientes.length > 0 && (
        <fieldset className="fieldset">
          <legend>Estatus</legend>
          <div className="seg wrap">
            {siguientes.filter((id) => id !== 'CANCELADA' && id !== 'CERRADA').map((id) => (
              <button
                type="button"
                className="btn soft"
                key={id}
                disabled={busy}
                onClick={() => void run(async () => {
                  await actualizarOrdenServidor(ot.id, { estatus: id })
                  setMsg(id === 'LISTA' ? 'Unidad lista' : `Estatus: ${etiquetaEstatus(id)}`)
                })}
              >
                {etiquetaEstatus(id)}
              </button>
            ))}
          </div>
          {siguientes.includes('CANCELADA') && (
            <div className="grid-2" style={{ marginTop: 12 }}>
              <label className="field">
                <span>Motivo de cancelación *</span>
                <input className="input" value={motivoCancel} onChange={(ev) => setMotivoCancel(ev.target.value)} placeholder="Por qué se cancela" />
              </label>
              <button
                type="button"
                className="btn soft"
                disabled={busy}
                onClick={() => void run(async () => {
                  if (motivoCancel.trim().length < 3) throw new Error('Cancelar exige un motivo')
                  await actualizarOrdenServidor(ot.id, { estatus: 'CANCELADA', motivo: motivoCancel.trim() })
                  setMsg('OT cancelada')
                })}
              >
                Cancelar OT
              </button>
            </div>
          )}
        </fieldset>
      )}

      {puedeEtr && ot.estatus !== 'CERRADA' && ot.estatus !== 'CANCELADA' && (
        <form
          className="form-panel compact"
          onSubmit={(ev) => {
            ev.preventDefault()
            void run(async () => {
              if (!motivoEtr.trim()) throw new Error('Mover el ETR exige un motivo')
              await actualizarOrdenServidor(ot.id, { etr: new Date(etr).toISOString(), motivo: motivoEtr.trim() })
              setMotivoEtr('')
              setMsg('ETR actualizado')
            })
          }}
        >
          <h3 className="subhead">Mover ETR</h3>
          <label className="field">
            <span>Nueva fecha *</span>
            <input className="input" type="datetime-local" value={etr} onChange={(ev) => setEtr(ev.target.value)} required />
          </label>
          <label className="field">
            <span>Motivo *</span>
            <input className="input" value={motivoEtr} onChange={(ev) => setMotivoEtr(ev.target.value)} required placeholder="Por qué se mueve" />
          </label>
          <button type="submit" className="btn soft wide" disabled={busy}>Guardar ETR</button>
        </form>
      )}

      {puedeEditar && ot.estatus !== 'CERRADA' && ot.estatus !== 'CANCELADA' && (
        <form
          className="form-panel compact"
          onSubmit={(ev) => {
            ev.preventDefault()
            void run(async () => {
              await actualizarOrdenServidor(ot.id, {
                accion: 'actualizar',
                refaccionesJson: refs.filter((row) => row.descripcion.trim()),
              })
              setMsg('Refacciones guardadas')
            })
          }}
        >
          <h3 className="subhead">Refacciones</h3>
          {refs.map((row, idx) => (
            <div className="grid-2" key={idx}>
              <label className="field">
                <span>Descripción</span>
                <input
                  className="input"
                  value={row.descripcion}
                  onChange={(ev) => {
                    const next = [...refs]
                    next[idx] = { ...next[idx], descripcion: ev.target.value }
                    setRefs(next)
                  }}
                />
              </label>
              <div className="grid-2">
                <label className="field">
                  <span>Cant.</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={row.cantidad}
                    onChange={(ev) => {
                      const next = [...refs]
                      next[idx] = { ...next[idx], cantidad: Number(ev.target.value) || 0 }
                      setRefs(next)
                    }}
                  />
                </label>
                <label className="field">
                  <span>Costo</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={row.costo}
                    onChange={(ev) => {
                      const next = [...refs]
                      next[idx] = { ...next[idx], costo: Number(ev.target.value) || 0 }
                      setRefs(next)
                    }}
                  />
                </label>
              </div>
            </div>
          ))}
          <p className="hint">Total: ${totalRefacciones(refs).toLocaleString('es-MX')}</p>
          <button type="button" className="text-btn" onClick={() => setRefs([...refs, { descripcion: '', cantidad: 1, costo: 0 }])}>
            + Renglón
          </button>
          <button type="submit" className="btn soft wide" disabled={busy}>Guardar refacciones</button>
          <button
            type="button"
            className="btn soft wide"
            disabled={busy}
            onClick={() => void run(async () => {
              await actualizarOrdenServidor(ot.id, { estatus: 'ESPERA_REFACCION' })
              setMsg('En espera de refacción')
            })}
          >
            Marcar espera de refacción
          </button>
        </form>
      )}

      {puedeEditar && siguientes.includes('CERRADA') && (
        <div className="form-panel compact">
          <h3 className="subhead">Cerrar OT</h3>
          <FotosCamara
            label="Fotos después"
            fotos={fotosDespues}
            onChange={setFotosDespues}
            min={2}
            slotPrefix="ot-despues"
            otId={ot.id}
            field="fotosDespuesJson"
            yardaId={ot.yarda}
          />
          <div className="grid-2">
            <label className="field">
              <span>Km salida *</span>
              <input className="input" type="number" value={kmSalida} onChange={(ev) => setKmSalida(ev.target.value)} />
            </label>
            <label className="field">
              <span>Horómetro salida *</span>
              <input className="input" type="number" value={horometroSalida} onChange={(ev) => setHorometroSalida(ev.target.value)} />
            </label>
          </div>
          <p className="hint">Captura km u horómetro (al menos uno).</p>
          <label className="field">
            <span>Qué se hizo *</span>
            <textarea className="input textarea" rows={2} value={notaCierre} onChange={(ev) => setNotaCierre(ev.target.value)} required />
          </label>
          <button
            type="button"
            className="btn primary wide"
            disabled={busy}
            onClick={() => void run(async () => {
              if (fotosDespues.length < 2) throw new Error('Para cerrar toma al menos 2 fotos después')
              if (notaCierre.trim().length < 3) throw new Error('Indica qué se hizo')
              if (kmSalida === '' && horometroSalida === '') throw new Error('Captura km u horómetro de salida')
              const listos = await asegurarFotosServidor(fotosDespues, {
                slotPrefix: 'ot-despues',
                otId: ot.id,
                field: 'fotosDespuesJson',
                yardaId: ot.yarda,
              })
              if (listos.urls.filter(esUrlFoto).length < 2) {
                throw new Error('Sin red: las fotos de cierre quedaron en bandeja. Al volver la señal se suben; reintenta cerrar.')
              }
              setFotosDespues(listos.urls)
              await actualizarOrdenServidor(ot.id, {
                cerrar: true,
                fotosDespuesJson: listos.urls.filter(esUrlFoto),
                kmSalida: kmSalida === '' ? undefined : Number(kmSalida),
                horometroSalida: horometroSalida === '' ? undefined : Number(horometroSalida),
                notas: notaCierre,
              })
              setMsg('OT cerrada. La unidad vuelve a disponible si no hay otra OT.')
            })}
          >
            Cerrar OT
          </button>
        </div>
      )}
    </section>
  )
}

export default function Mantenimiento({
  user = null,
  draft = null,
  equipos = [],
  movimientos = [],
  estadosUnidad = [],
}) {
  const [yardaFiltro, setYardaFiltro] = useState(draft?.yarda || 'todas')
  const [payload, setPayload] = useState(undefined)
  const [errorCarga, setErrorCarga] = useState(null)
  const [selectedOtId, setSelectedOtId] = useState(null)
  const [busca, setBusca] = useState('')
  const [unidadId, setUnidadId] = useState(draft?.unidadId || '')
  const [placa, setPlaca] = useState(draft?.placa || '')
  const [tipo, setTipo] = useState(draft?.tipo || 'CORRECTIVO')
  const [prioridad, setPrioridad] = useState(draft?.prioridad || (draft?.origen === 'parado' ? 'UNIDAD_PARADA' : 'MEDIA'))
  const [motivo, setMotivo] = useState(draft?.motivo || '')
  const [etr, setEtr] = useState('')
  const [yarda, setYarda] = useState(draft?.yarda || 'chihuahua')
  const [tallerTipo, setTallerTipo] = useState('INTERNO')
  const [responsableEmail, setResponsableEmail] = useState('')
  const [kmEntrada, setKmEntrada] = useState('')
  const [horometroEntrada, setHorometroEntrada] = useState('')
  const [fotosAntes, setFotosAntes] = useState(() => (Array.isArray(draft?.fotosAntesJson) ? draft.fotosAntesJson.filter(Boolean) : []))
  const formRef = useRef(null)
  const [movimientoOrigenId] = useState(draft?.movimientoOrigenId || '')
  const [zonaSlot] = useState(draft?.zonaSlot || '')
  const [servicioPreventivoId, setServicioPreventivoId] = useState('')
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState(() => {
    if (!draft) return null
    if (draft.origen === 'dano-salida') {
      return { level: 'info', text: 'Daño nuevo en la salida. Completa ETR y 2 fotos para abrir la OT.' }
    }
    if (draft.origen === 'entrada') {
      return { level: 'info', text: 'Viene de la entrada (falla o condición mala). Revisa fotos y ETR.' }
    }
    return { level: 'info', text: 'Viene de equipo parado (taller o fallas). El ETR y 2 fotos son obligatorios.' }
  })
  const [reloadKey, setReloadKey] = useState(0)
  const puedeAbrir = puedeAbrirOtCliente(user)

  const equipoSel = useMemo(() => {
    const id = unidadId.trim()
    const p = normalizePlacaMX(placa || id)
    return (
      equipos.find((eq) => eq.id === id) ||
      equipos.find((eq) => normalizePlacaMX(eq.placa) === p) ||
      null
    )
  }, [equipos, unidadId, placa])

  const otAbiertaMisma = useMemo(() => {
    if (!equipoSel && !unidadId && !placa) return null
    const key = normalizePlacaMX(equipoSel?.id || unidadId || placa)
    const grupos = payload?.tablero?.porYarda || []
    for (const grupo of grupos) {
      for (const ot of grupo.ordenes || []) {
        if (['CERRADA', 'CANCELADA', 'LISTA'].includes(ot.estatus)) continue
        if (normalizePlacaMX(ot.unidadId) === key) return ot
      }
    }
    return null
  }, [payload, equipoSel, unidadId, placa])

  useEffect(() => {
    if (!equipoSel) return
    setUnidadId(equipoSel.id)
    setPlaca(normalizePlacaMX(equipoSel.placa))
    const km = ultimoKm(movimientos, equipoSel.id)
    if (km != null && kmEntrada === '') setKmEntrada(String(km))
    const hor = ultimoHorometro(movimientos, equipoSel.id)
    if (hor != null && horometroEntrada === '') setHorometroEntrada(String(hor))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoSel?.id])

  useEffect(() => {
    let cancel = false
    const draftFotos = Array.isArray(draft?.fotosAntesJson) ? draft.fotosAntesJson.filter(Boolean) : []
    if (!draftFotos.some(esDataUrl)) return undefined
    asegurarFotosServidor(draftFotos, {
      slotPrefix: 'ot-antes-entrada',
      field: 'fotosAntesJson',
      yardaId: draft?.yarda || '',
    })
      .then((res) => {
        if (!cancel) setFotosAntes(res.urls)
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancel = false
    setErrorCarga(null)
    fetchTableroOpcional(yardaFiltro === 'todas' ? '' : yardaFiltro)
      .then((data) => {
        if (!cancel) setPayload(data)
      })
      .catch((err) => {
        if (!cancel) setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar')
      })
    return () => {
      cancel = true
    }
  }, [yardaFiltro, reloadKey])

  const ordenes = useMemo(() => {
    const grupos = payload?.tablero?.porYarda || []
    return grupos.flatMap((grupo) => grupo.ordenes || [])
  }, [payload])

  const hitsCatalogo = useMemo(() => {
    const q = busca.trim()
    if (!q) return equipos.slice(0, 12)
    const placaQ = normalizePlacaMX(q)
    const upper = q.toUpperCase()
    return equipos
      .filter(
        (eq) =>
          normalizePlacaMX(eq.placa).includes(placaQ) ||
          String(eq.numeroEconomico || '').toUpperCase().includes(upper) ||
          String(eq.id || '').includes(q),
      )
      .slice(0, 12)
  }, [busca, equipos])

  async function abrir(ev) {
    ev.preventDefault()
    setBanner(null)
    if (!unidadId.trim() && !placa.trim()) {
      setBanner({ level: 'error', text: 'Elige una unidad del catálogo.' })
      return
    }
    if (otAbiertaMisma) {
      setSelectedOtId(otAbiertaMisma.id)
      setBanner({ level: 'info', text: `Ya hay OT abierta (${otAbiertaMisma.folio}). Se abre el detalle.` })
      return
    }
    if (motivo.trim().length < 3) {
      setBanner({ level: 'error', text: 'El motivo es obligatorio.' })
      return
    }
    if (!etr) {
      setBanner({ level: 'error', text: 'El ETR es obligatorio.' })
      return
    }
    if (fotosAntes.length < 2) {
      setBanner({ level: 'error', text: 'Toma al menos 2 fotos con la cámara antes de guardar.' })
      return
    }
    setBusy(true)
    try {
      const listos = await asegurarFotosServidor(fotosAntes, {
        slotPrefix: 'ot-antes',
        field: 'fotosAntesJson',
        yardaId: yarda,
      })
      setFotosAntes(listos.urls)
      const fotosServidor = listos.urls.filter(esUrlFoto)
      const ordenBase = {
        unidadId: (unidadId || placa).trim(),
        placa: placa.trim(),
        tipo,
        prioridad,
        motivo: motivo.trim(),
        etr: new Date(etr).toISOString(),
        yarda,
        tallerTipo,
        responsableEmail: responsableEmail.trim() || undefined,
        reportadoPor: user?.email,
        kmEntrada: kmEntrada === '' ? undefined : Number(kmEntrada),
        horometroEntrada: horometroEntrada === '' ? undefined : Number(horometroEntrada),
        movimientoOrigenId: movimientoOrigenId || undefined,
        zonaSlot: zonaSlot || undefined,
        equipoTipo: equipoSel?.tipo,
      }

      if (fotosServidor.length < 2) {
        await enqueueOtCreate({
          orden: ordenBase,
          fotosAntes: listos.urls.filter((u) => esUrlFoto(u) || esDataUrl(u)),
          preventivo: Boolean(servicioPreventivoId && tipo === 'PREVENTIVO'),
          servicioId: servicioPreventivoId || '',
        })
        setBanner({
          level: 'warn',
          text: 'Sin red: la OT quedó en bandeja IndexedDB con las fotos. Al volver la señal se sube sola.',
        })
        setBusy(false)
        return
      }

      let result
      if (servicioPreventivoId && tipo === 'PREVENTIVO') {
        result = await abrirOtPreventivo({
          servicioId: servicioPreventivoId,
          yarda: yarda !== 'todas' ? yarda : undefined,
          etr: ordenBase.etr,
          motivo: ordenBase.motivo,
          kmEntrada: ordenBase.kmEntrada,
          horometroEntrada: ordenBase.horometroEntrada,
          fotosAntesJson: fotosServidor,
        })
      } else {
        result = await crearOrdenServidor({
          ...ordenBase,
          fotosAntesJson: fotosServidor,
        })
      }
      const orden = result?.orden || result?.ot
      setBanner({
        level: result?.linked ? 'info' : 'success',
        text: result?.linked
          ? `Ya había una OT abierta (${orden?.folio || 'sin folio'}). Se enlazó, no se duplicó.`
          : `OT ${orden?.folio || ''} abierta. La unidad queda en mantenimiento.`,
      })
      if (!result?.linked) {
        setMotivo('')
        setEtr('')
        setFotosAntes([])
        setServicioPreventivoId('')
      }
      if (orden?.id) setSelectedOtId(orden.id)
      setReloadKey((n) => n + 1)
    } catch (err) {
      if (isNetworkFailure(err) || isGateUnavailable(err)) {
        try {
          await enqueueOtCreate({
            orden: {
              unidadId: (unidadId || placa).trim(),
              placa: placa.trim(),
              tipo,
              prioridad,
              motivo: motivo.trim(),
              etr: new Date(etr).toISOString(),
              yarda,
              tallerTipo,
              responsableEmail: responsableEmail.trim() || undefined,
              kmEntrada: kmEntrada === '' ? undefined : Number(kmEntrada),
              horometroEntrada: horometroEntrada === '' ? undefined : Number(horometroEntrada),
              movimientoOrigenId: movimientoOrigenId || undefined,
              zonaSlot: zonaSlot || undefined,
              equipoTipo: equipoSel?.tipo,
            },
            fotosAntes,
            preventivo: Boolean(servicioPreventivoId && tipo === 'PREVENTIVO'),
            servicioId: servicioPreventivoId || '',
          })
          setBanner({
            level: 'warn',
            text: 'Sin red: la OT quedó en bandeja IndexedDB. Al volver la señal se sube sola.',
          })
        } catch (queueErr) {
          setBanner({
            level: 'error',
            text: queueErr instanceof Error ? queueErr.message : 'No se pudo guardar en bandeja',
          })
        }
      } else {
        setBanner({ level: 'error', text: err instanceof Error ? err.message : 'No se pudo abrir la OT' })
      }
    } finally {
      setBusy(false)
    }
  }

  if (selectedOtId) {
    return (
      <div className="page">
        <OtDetalle
          otId={selectedOtId}
          user={user}
          onBack={() => setSelectedOtId(null)}
          onChanged={() => setReloadKey((n) => n + 1)}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="form-head">
        <h1>Mantenimiento</h1>
        <p>Órdenes de trabajo del patio: abrir con cámara, seguir estatus y liberar la unidad.</p>
      </div>
      {payload === null && (
        <p className="banner warn">Sin validación de servidor. El tablero no está disponible; el patio sigue operando.</p>
      )}
      {errorCarga && <p className="banner warn">{errorCarga}</p>}
      <fieldset className="fieldset">
        <legend>Yarda</legend>
        <div className="seg big wrap">
          <button type="button" className={yardaFiltro === 'todas' ? 'seg-btn on-ok' : 'seg-btn'} onClick={() => setYardaFiltro('todas')}>
            Todas
          </button>
          {YARDAS.map((item) => (
            <button type="button" className={yardaFiltro === item.id ? 'seg-btn on-ok' : 'seg-btn'} onClick={() => setYardaFiltro(item.id)} key={item.id}>
              {item.nombre}
            </button>
          ))}
        </div>
      </fieldset>

      <PreventivoSection
        yarda={yardaFiltro}
        puedeAbrir={puedeAbrir}
        onCrearOt={(servicio, etrIso) => {
          setServicioPreventivoId(servicio.id)
          setUnidadId(servicio.unidadId)
          setPlaca(servicio.unidadId)
          setTipo('PREVENTIVO')
          setPrioridad('MEDIA')
          setMotivo(
            servicio.estatus === 'VENCIDO'
              ? `Servicio preventivo vencido · plan ${servicio.planId}`
              : `Servicio preventivo en aviso · plan ${servicio.planId}`,
          )
          if (etrIso) {
            const d = new Date(etrIso)
            const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
            setEtr(local)
          }
          if (servicio.yarda) setYarda(servicio.yarda)
          setBanner({ level: 'info', text: 'Preventivo: toma 2 fotos y guarda la OT abajo.' })
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
        }}
      />

      {payload?.tablero && (
        <section className="panel ot-board-panel">
          <div className="panel-head">
            <h2>Órdenes de la yarda</h2>
          </div>
          <Resumen resumen={payload.tablero.resumen} />
          {ordenes.length === 0 ? (
            <p className="empty">No hay OT abiertas en este filtro.</p>
          ) : (
            <ul className="ot-list">
              {ordenes.map((ot) => (
                <li className={`ot-card ${ot.semaforo?.nivel || 'rojo'}`} key={ot.id}>
                  <button type="button" className="text-btn" style={{ textAlign: 'left', width: '100%' }} onClick={() => setSelectedOtId(ot.id)}>
                    <p className="unit-placa">
                      {ot.folio} · {ot.unidadId}
                    </p>
                    <Semaforo semaforo={ot.semaforo} />
                    <p className="unit-meta">
                      {etiquetaTipo(ot.tipo)} · {etiquetaPrioridad(ot.prioridad)} · {etiquetaEstatus(ot.estatus)}
                      {' · '}{ot.tallerTipo === 'EXTERNO' ? 'Externo' : 'Interno'}
                      {' · ETR '}{fmt(ot.etr)}
                      {diasEnTallerDe(ot) != null ? ` · ${diasEnTallerDe(ot)} d` : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {puedeAbrir ? (
        <form className="form-panel" id="ot-alta-form" ref={formRef} onSubmit={(ev) => void abrir(ev)}>
          {createPortal(
            <div className="sticky-save-bar">
              <button
                type="button"
                className="btn primary sticky-save"
                disabled={busy}
                onClick={() => formRef.current?.requestSubmit()}
              >
                {busy ? 'Guardando…' : 'Guardar OT'}
              </button>
            </div>,
            document.body,
          )}
          <div className="form-head">
            <h2>Abrir orden de trabajo</h2>
            <p>Elige unidad del catálogo, prioridad, ETR y 2 fotos con la cámara. Sin pegar URLs.</p>
          </div>
          {banner && (
            <p className={`banner ${banner.level === 'error' ? 'error' : banner.level === 'success' ? 'success' : banner.level === 'info' ? 'info' : 'warn'}`}>
              {banner.text}
            </p>
          )}
          <label className="field">
            <span>Buscar unidad (placa o económico)</span>
            <input className="input" value={busca} onChange={(ev) => setBusca(ev.target.value)} placeholder="Placa o económico" autoComplete="off" />
          </label>
          <div className="chip-row">
            {hitsCatalogo.map((eq) => (
              <button
                type="button"
                className={unidadId === eq.id ? 'chip on' : 'chip'}
                key={eq.id}
                onClick={() => {
                  setUnidadId(eq.id)
                  setPlaca(normalizePlacaMX(eq.placa))
                  setBusca(eq.placa)
                }}
              >
                {eq.placa}
                {eq.numeroEconomico ? ` · ${eq.numeroEconomico}` : ''}
                {eq.tipo ? ` · ${eq.tipo}` : ''}
              </button>
            ))}
          </div>
          {equipoSel && (
            <div className="banner info">
              <strong>{equipoSel.placa}</strong>
              {equipoSel.numeroEconomico ? ` · eco ${equipoSel.numeroEconomico}` : ''}
              {equipoSel.tipo ? ` · ${equipoSel.tipo}` : ''}
              {` · yarda ${nombreYarda(yarda)}`}
              {` · reporta ${user?.email || 'sesión'}`}
            </div>
          )}
          {otAbiertaMisma && (
            <p className="banner warn">
              Ya hay OT abierta ({otAbiertaMisma.folio}).{' '}
              <button type="button" className="text-btn" onClick={() => setSelectedOtId(otAbiertaMisma.id)}>
                Abrir detalle
              </button>
            </p>
          )}
          <fieldset className="fieldset">
            <legend>Tipo *</legend>
            <div className="seg wrap">
              {TIPOS.map(([id, label]) => (
                <button type="button" className={tipo === id ? 'seg-btn on-ok' : 'seg-btn'} onClick={() => setTipo(id)} key={id}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="fieldset">
            <legend>Prioridad *</legend>
            <div className="seg wrap">
              {PRIORIDADES.map(([id, label]) => (
                <button type="button" className={prioridad === id ? 'seg-btn on-ok' : 'seg-btn'} onClick={() => setPrioridad(id)} key={id}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span>Motivo *</span>
            <textarea className="input textarea" rows={2} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Falla, llanta, thermo…" required />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>ETR *</span>
              <input className="input" type="datetime-local" value={etr} onChange={(ev) => setEtr(ev.target.value)} required />
            </label>
            <label className="field">
              <span>Yarda *</span>
              <select className="input" value={yarda} onChange={(ev) => setYarda(ev.target.value)}>
                {YARDAS.map((item) => (
                  <option value={item.id} key={item.id}>{item.nombre}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Km de entrada</span>
              <input className="input" type="number" value={kmEntrada} onChange={(ev) => setKmEntrada(ev.target.value)} placeholder="Último km si hay" />
            </label>
            <label className="field">
              <span>Horómetro de entrada</span>
              <input className="input" type="number" value={horometroEntrada} onChange={(ev) => setHorometroEntrada(ev.target.value)} placeholder="Último horómetro si hay" />
            </label>
          </div>
          <label className="field">
            <span>Responsable (correo)</span>
            <input className="input" value={responsableEmail} onChange={(ev) => setResponsableEmail(ev.target.value)} placeholder="encargado@…" />
          </label>
          <fieldset className="fieldset">
            <legend>Taller</legend>
            <div className="seg">
              <button type="button" className={tallerTipo === 'INTERNO' ? 'seg-btn on-ok' : 'seg-btn'} onClick={() => setTallerTipo('INTERNO')}>
                Interno
              </button>
              <button type="button" className={tallerTipo === 'EXTERNO' ? 'seg-btn on-warn' : 'seg-btn'} onClick={() => setTallerTipo('EXTERNO')}>
                Externo
              </button>
            </div>
          </fieldset>
          <FotosCamara
            label="Fotos antes"
            fotos={fotosAntes}
            onChange={setFotosAntes}
            min={2}
            slotPrefix="ot-antes"
            field="fotosAntesJson"
            yardaId={yarda}
          />
          <p className="hint">Estatus inicial: Abierta · Reportado por {user?.email || 'la sesión'}</p>
          <button type="submit" className="btn primary wide" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar OT'}
          </button>
        </form>
      ) : (
        <p className="banner info">Puedes consultar el tablero. Abrir una OT le toca a patio, encargado o admin.</p>
      )}
    </div>
  )
}
