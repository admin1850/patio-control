import { useEffect, useState } from 'react'
import {
  abrirOtPreventivo,
  fetchPreventivoOpcional,
  guardarPlanPreventivo,
  isGateUnavailable,
} from '../lib/serverApi.js'
const TIPOS = [
  ['camion', 'Camión'],
  ['caja', 'Caja'],
  ['dolly', 'Dolly'],
  ['thermo', 'Thermo'],
]

function fmt(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function numero(value) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString('es-MX') : '—'
}

function SemaforoPreventivo({ semaforo, estatus }) {
  const nivel = semaforo?.nivel || 'verde'
  const label = semaforo?.etiqueta || estatus || 'En tiempo'
  return (
    <span className={`semaforo ${nivel}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  )
}

export default function PreventivoSection({ yarda = 'todas', puedeAbrir = false }) {
  const [data, setData] = useState(undefined)
  const [errorCarga, setErrorCarga] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [busyId, setBusyId] = useState('')
  const [banner, setBanner] = useState(null)
  const [tipoUnidad, setTipoUnidad] = useState('camion')
  const [cadaKm, setCadaKm] = useState('')
  const [cadaDias, setCadaDias] = useState('')
  const [cadaHorasThermo, setCadaHorasThermo] = useState('')
  const [avisoPct, setAvisoPct] = useState('80')
  const [guardandoPlan, setGuardandoPlan] = useState(false)
  useEffect(() => {
    let cancel = false
    setErrorCarga(null)
    fetchPreventivoOpcional(yarda)
      .then((payload) => {
        if (!cancel) setData(payload)
      })
      .catch((err) => {
        if (!cancel) setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar el preventivo')
      })
    return () => {
      cancel = true
    }
  }, [yarda, reloadKey])

  useEffect(() => {
    const plan = data?.planes?.find((item) => item.tipoUnidad === tipoUnidad)
    if (!plan) return
    setCadaKm(plan.cadaKm == null ? '' : String(plan.cadaKm))
    setCadaDias(plan.cadaDias == null ? '' : String(plan.cadaDias))
    setCadaHorasThermo(plan.cadaHorasThermo == null ? '' : String(plan.cadaHorasThermo))
    setAvisoPct(plan.avisoPct == null ? '80' : String(plan.avisoPct))
  }, [data, tipoUnidad])

  async function abrir(servicio) {
    setBanner(null)
    setBusyId(servicio.id)
    try {
      const result = await abrirOtPreventivo({
        servicioId: servicio.id,
        yarda: yarda !== 'todas' ? yarda : servicio.yarda || undefined,
      })
      if (!result?.orden?.id) {
        setBanner({ level: 'warn', text: 'Sin validación de servidor. La OT no se guardó; el patio sigue operando.' })
        return
      }
      const folio = result.orden.folio || 'OT'
      setBanner({
        level: result?.linked ? 'info' : 'success',
        text: result?.linked
          ? `Ya había una OT abierta (${folio}). Quedó ligada a este servicio.`
          : `OT ${folio} de preventivo abierta. La unidad queda en mantenimiento.`,
      })
      setReloadKey((n) => n + 1)
    } catch (err) {
      if (isGateUnavailable(err)) {
        setBanner({ level: 'warn', text: 'Sin validación de servidor. La OT no se guardó; el patio sigue operando.' })
      } else {
        setBanner({ level: 'error', text: err instanceof Error ? err.message : 'No se pudo abrir la OT' })
      }
    } finally {
      setBusyId('')
    }
  }

  async function guardarPlan(ev) {
    ev.preventDefault()
    setBanner(null)
    setGuardandoPlan(true)
    try {
      const guardado = await guardarPlanPreventivo({
        tipoUnidad,
        cadaKm: cadaKm === '' ? null : Number(cadaKm),
        cadaDias: cadaDias === '' ? null : Number(cadaDias),
        cadaHorasThermo: cadaHorasThermo === '' ? null : Number(cadaHorasThermo),
        avisoPct: avisoPct === '' ? 80 : Number(avisoPct),
      })
      if (!guardado?.plan?.tipoUnidad) {
        setBanner({ level: 'warn', text: 'Sin validación de servidor. El plan no se guardó; el patio sigue operando.' })
        return
      }
      setBanner({ level: 'success', text: `Plan de ${tipoUnidad} guardado. El próximo movimiento con km u horómetro recalcula el servicio.` })
      setReloadKey((n) => n + 1)
    } catch (err) {
      if (isGateUnavailable(err)) {
        setBanner({ level: 'warn', text: 'Sin validación de servidor. El plan no se guardó; el patio sigue operando.' })
      } else {
        setBanner({ level: 'error', text: err instanceof Error ? err.message : 'No se pudo guardar el plan' })
      }
    } finally {
      setGuardandoPlan(false)
    }
  }

  const servicios = data?.servicios || []

  return (
    <section className="panel ot-board-panel">
      <div className="panel-head">
        <h2>Preventivo</h2>
      </div>
      <p className="hint">Verde: en tiempo. Amarillo: ya pasó el porcentaje de aviso. Rojo: km, fecha u horómetro vencidos.</p>
      {errorCarga && <p className="banner warn">{errorCarga}</p>}
      {data === null && (
        <p className="banner warn">Sin validación de servidor. El preventivo no está disponible; el patio sigue operando.</p>
      )}
      {banner && <p className={`banner ${banner.level === 'error' ? 'error' : banner.level === 'success' ? 'success' : banner.level === 'info' ? 'info' : 'warn'}`}>{banner.text}</p>}
      {data?.resumen && (
        <div className="ot-resumen">
          <span className="semaforo verde"><i aria-hidden="true" />{data.resumen.verde} en tiempo</span>
          <span className="semaforo amarillo"><i aria-hidden="true" />{data.resumen.amarillo} en aviso</span>
          <span className="semaforo rojo"><i aria-hidden="true" />{data.resumen.rojo} vencidos</span>
        </div>
      )}
      {data && servicios.length === 0 && (
        <p className="empty">No hay servicios próximos en este filtro. Define un plan y registra un movimiento con km u horómetro.</p>
      )}
      {servicios.length > 0 && (
        <ul className="ot-list">
          {servicios.map((servicio) => {
            const puede = puedeAbrir && (servicio.estatus === 'AVISO' || servicio.estatus === 'VENCIDO') && !servicio.otId
            return (
              <li className={`ot-card ${servicio.semaforo?.nivel || 'verde'}`} key={servicio.id}>
                <p className="unit-placa">{servicio.unidadId} · plan {servicio.planId}</p>
                <SemaforoPreventivo semaforo={servicio.semaforo} estatus={servicio.estatus} />
                <p className="unit-meta">
                  {servicio.yarda ? `${servicio.yarda} · ` : ''}
                  Próx. km {numero(servicio.proximoKm)} · fecha {fmt(servicio.proximaFecha)} · horómetro {numero(servicio.proximoHorometro)}
                  {servicio.otId ? ' · OT ligada' : ''}
                </p>
                {puede && (
                  <button type="button" className="btn soft" disabled={busyId === servicio.id} onClick={() => void abrir(servicio)}>
                    {busyId === servicio.id ? 'Abriendo…' : 'Abrir OT'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {puedeAbrir && data && (
        <form className="form-panel compact" onSubmit={(ev) => void guardarPlan(ev)} style={{ marginTop: 12 }}>
          <div className="form-head">
            <h3>Plan por tipo de unidad</h3>
            <p>cadaKm, cadaDías, horas de thermo y el porcentaje para pasar a aviso. Una fila por tipo.</p>
          </div>
          <fieldset className="fieldset">
            <legend>Tipo</legend>
            <div className="seg wrap">
              {TIPOS.map(([id, label]) => (
                <button type="button" className={tipoUnidad === id ? 'seg-btn on-ok' : 'seg-btn'} onClick={() => setTipoUnidad(id)} key={id}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid-2">
            <label className="field">
              <span>Cada km</span>
              <input className="input" inputMode="decimal" value={cadaKm} onChange={(ev) => setCadaKm(ev.target.value)} placeholder="Ej. 15000" />
            </label>
            <label className="field">
              <span>Cada días</span>
              <input className="input" inputMode="decimal" value={cadaDias} onChange={(ev) => setCadaDias(ev.target.value)} placeholder="Ej. 90" />
            </label>
            <label className="field">
              <span>Cada horas thermo</span>
              <input className="input" inputMode="decimal" value={cadaHorasThermo} onChange={(ev) => setCadaHorasThermo(ev.target.value)} placeholder="Ej. 1000" />
            </label>
            <label className="field">
              <span>Aviso %</span>
              <input className="input" inputMode="decimal" value={avisoPct} onChange={(ev) => setAvisoPct(ev.target.value)} placeholder="80" />
            </label>
          </div>
          <button type="submit" className="btn soft" disabled={guardandoPlan}>
            {guardandoPlan ? 'Guardando…' : 'Guardar plan'}
          </button>
        </form>
      )}
    </section>
  )
}
