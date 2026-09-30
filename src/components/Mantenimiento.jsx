import { useEffect, useMemo, useState } from 'react'
import {
  actualizarOrdenServidor,
  crearOrdenServidor,
  fetchTableroOpcional,
  isGateUnavailable,
} from '../lib/serverApi.js'

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

const ESTATUS = [
  ['ABIERTA', 'Abierta'],
  ['DIAGNOSTICO', 'Diagnóstico'],
  ['ESPERA_REFACCION', 'Espera de refacción'],
  ['EN_REPARACION', 'En reparación'],
  ['LISTA', 'Lista'],
  ['CERRADA', 'Cerrada'],
  ['CANCELADA', 'Cancelada'],
]

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

function urlsDe(texto) {
  return String(texto || '')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
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

function OrdenEditable({ ot, user, onChanged }) {
  const [estatus, setEstatus] = useState(ot.estatus)
  const [etr, setEtr] = useState('')
  const [motivoEtr, setMotivoEtr] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const puedeEditar = puedeAbrirOtCliente(user)
  const puedeEtr = puedeMoverEtrCliente(user)

  async function aplicarEstatus(ev) {
    ev.preventDefault()
    setErr(null)
    setMsg(null)
    setBusy(true)
    try {
      await actualizarOrdenServidor(ot.id, { estatus })
      setMsg('Estatus actualizado.')
      onChanged?.()
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'No se pudo cambiar el estatus')
    } finally {
      setBusy(false)
    }
  }

  async function moverEtr(ev) {
    ev.preventDefault()
    setErr(null)
    setMsg(null)
    if (!motivoEtr.trim()) {
      setErr('Mover el ETR exige un motivo.')
      return
    }
    setBusy(true)
    try {
      await actualizarOrdenServidor(ot.id, { etr: new Date(etr).toISOString(), motivo: motivoEtr.trim() })
      setMsg('ETR actualizado.')
      setMotivoEtr('')
      onChanged?.()
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'No se pudo mover el ETR')
    } finally {
      setBusy(false)
    }
  }

  async function cerrar() {
    setErr(null)
    setMsg(null)
    setBusy(true)
    try {
      await actualizarOrdenServidor(ot.id, { cerrar: true, motivo: 'Cierre desde tablero' })
      setMsg('OT cerrada. Si no hay otra orden abierta, la unidad vuelve a disponible.')
      onChanged?.()
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'No se pudo cerrar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={`ot-card ${ot.semaforo?.nivel || 'rojo'}`}>
      <p className="unit-placa">
        {ot.folio} · {ot.unidadId}
      </p>
      <Semaforo semaforo={ot.semaforo} />
      <p className="unit-meta">
        {nombreYarda(ot.yarda)} · {etiquetaTipo(ot.tipo)} · {ot.motivo}
        {ot.etrOriginal ? ` · ETR original ${fmt(ot.etrOriginal)}` : ''}
        {ot.etrMovimientosCount ? ` · ${ot.etrMovimientosCount} movimiento(s) de ETR` : ''}
      </p>
      <p className="unit-meta">ETR {fmt(ot.etr)}</p>
      {err && <p className="banner error">{err}</p>}
      {msg && <p className="banner success">{msg}</p>}
      {puedeEditar && (
        <form className="ot-actions" onSubmit={(ev) => void aplicarEstatus(ev)}>
          <label className="field">
            <span>Estatus</span>
            <select className="input" value={estatus} onChange={(ev) => setEstatus(ev.target.value)}>
              {ESTATUS.map(([id, label]) => (
                <option value={id} key={id}>{label}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn soft" disabled={busy || estatus === ot.estatus}>
            Actualizar
          </button>
          <button type="button" className="btn soft" disabled={busy} onClick={() => void cerrar()}>
            Cerrar OT
          </button>
        </form>
      )}
      {puedeEtr && (
        <form className="ot-actions" onSubmit={(ev) => void moverEtr(ev)}>
          <label className="field">
            <span>Nuevo ETR</span>
            <input className="input" type="datetime-local" value={etr} onChange={(ev) => setEtr(ev.target.value)} required />
          </label>
          <label className="field">
            <span>Motivo del cambio *</span>
            <input className="input" value={motivoEtr} onChange={(ev) => setMotivoEtr(ev.target.value)} placeholder="Por qué se mueve el ETR" required />
          </label>
          <button type="submit" className="btn soft" disabled={busy}>
            Mover ETR
          </button>
        </form>
      )}
    </li>
  )
}

export default function Mantenimiento({ user = null, draft = null }) {
  const [yardaFiltro, setYardaFiltro] = useState(draft?.yarda || 'todas')
  const [payload, setPayload] = useState(undefined)
  const [errorCarga, setErrorCarga] = useState(null)
  const [unidadId, setUnidadId] = useState(draft?.unidadId || '')
  const [placa, setPlaca] = useState(draft?.placa || '')
  const [tipo, setTipo] = useState(draft?.tipo || 'CORRECTIVO')
  const [motivo, setMotivo] = useState(draft?.motivo || '')
  const [etr, setEtr] = useState('')
  const [yarda, setYarda] = useState(draft?.yarda || 'chihuahua')
  const [fotos, setFotos] = useState(() => (Array.isArray(draft?.fotosAntesJson) ? draft.fotosAntesJson.filter(Boolean).join('\n') : ''))
  const [tallerTipo, setTallerTipo] = useState('INTERNO')
  const [movimientoOrigenId] = useState(draft?.movimientoOrigenId || '')
  const [zonaSlot] = useState(draft?.zonaSlot || '')
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState(() =>
    draft
      ? { level: 'info', text: 'Viene de equipo parado (taller o fallas). El ETR es obligatorio para abrir o enlazar la OT.' }
      : null,
  )
  const [reloadKey, setReloadKey] = useState(0)
  const puedeAbrir = puedeAbrirOtCliente(user)

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

  async function abrir(ev) {
    ev.preventDefault()
    setBanner(null)
    if (!unidadId.trim() && !placa.trim()) {
      setBanner({ level: 'error', text: 'Indica la unidad (id o placa).' })
      return
    }
    if (motivo.trim().length < 3) {
      setBanner({ level: 'error', text: 'El motivo es obligatorio.' })
      return
    }
    if (!etr) {
      setBanner({ level: 'error', text: 'El ETR es obligatorio en el primer guardado.' })
      return
    }
    const fotosUrls = urlsDe(fotos)
    if (fotosUrls.length === 1) {
      setBanner({ level: 'error', text: 'Si ya tienes fotos, pega al menos 2 URLs.' })
      return
    }
    setBusy(true)
    try {
      const result = await crearOrdenServidor({
        unidadId: (unidadId || placa).trim(),
        placa: placa.trim(),
        tipo,
        motivo: motivo.trim(),
        etr: new Date(etr).toISOString(),
        yarda,
        tallerTipo,
        fotosAntesJson: fotosUrls,
        movimientoOrigenId: movimientoOrigenId || undefined,
        zonaSlot: zonaSlot || undefined,
      })
      const orden = result?.orden
      setBanner({
        level: result?.linked ? 'info' : 'success',
        text: result?.linked
          ? `Ya había una OT abierta (${orden?.folio || 'sin folio'}). Se enlazó, no se duplicó.`
          : `OT ${orden?.folio || ''} abierta. La unidad queda en mantenimiento.`,
      })
      if (!result?.linked) {
        setMotivo('')
        setEtr('')
        setFotos('')
      }
      setReloadKey((n) => n + 1)
    } catch (err) {
      if (isGateUnavailable(err)) {
        setBanner({
          level: 'warn',
          text: 'Sin validación de servidor. La OT no se guardó en la hoja; el patio sigue operando. Conecta Cloud e intenta de nuevo.',
        })
      } else {
        setBanner({ level: 'error', text: err instanceof Error ? err.message : 'No se pudo abrir la OT' })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="form-head">
        <h1>Mantenimiento</h1>
        <p>Órdenes de trabajo por yarda. Verde: en tiempo. Amarillo: el ETR vence en 24 horas o menos. Rojo: ETR vencido.</p>
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
      {payload?.tablero && (
        <section className="panel ot-board-panel">
          <div className="panel-head">
            <h2>En mantenimiento</h2>
          </div>
          <Resumen resumen={payload.tablero.resumen} />
          {ordenes.length === 0 ? (
            <p className="empty">No hay unidades en mantenimiento en este filtro.</p>
          ) : (
            <ul className="ot-list">
              {ordenes.map((ot) => (
                <OrdenEditable ot={ot} user={user} onChanged={() => setReloadKey((n) => n + 1)} key={ot.id} />
              ))}
            </ul>
          )}
        </section>
      )}
      {puedeAbrir ? (
        <form className="form-panel" onSubmit={(ev) => void abrir(ev)}>
          <div className="form-head">
            <h2>Abrir orden de trabajo</h2>
            <p>Unidad, tipo, motivo, ETR y yarda. Si la unidad ya tiene una OT abierta, se enlaza.</p>
          </div>
          {banner && <p className={`banner ${banner.level === 'error' ? 'error' : banner.level === 'success' ? 'success' : banner.level === 'info' ? 'info' : 'warn'}`}>{banner.text}</p>}
          <div className="grid-2">
            <label className="field">
              <span>Unidad (id de equipo) *</span>
              <input className="input" value={unidadId} onChange={(ev) => setUnidadId(ev.target.value)} placeholder="Id o placa" required />
            </label>
            <label className="field">
              <span>Placa</span>
              <input className="input" value={placa} onChange={(ev) => setPlaca(ev.target.value.toUpperCase())} placeholder="Si es distinta del id" />
            </label>
          </div>
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
          <label className="field">
            <span>Motivo *</span>
            <textarea className="input textarea" rows={2} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Falla, llanta, thermo…" required />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>ETR (fecha y hora prometida) *</span>
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
          <label className="field">
            <span>Fotos (URLs, mínimo 2 si ya las tienes)</span>
            <textarea className="input textarea" rows={3} value={fotos} onChange={(ev) => setFotos(ev.target.value)} placeholder={'https://…\nhttps://…'} />
          </label>
          <button type="submit" className="btn primary wide" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar OT'}
          </button>
        </form>
      ) : (
        <p className="banner info">Puedes consultar el tablero. Abrir una OT o mover el ETR le toca a patio, al encargado de yarda o a admin.</p>
      )}
    </div>
  )
}
