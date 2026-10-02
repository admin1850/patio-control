import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { v4 as uuid } from 'uuid'
import { normalizePlacaMX } from '../lib/placaOcr.js'
import {
  MOTIVOS_RAPIDO,
  esMovimientoRapido,
  etiquetaMotivoRapido,
  motivoRapidoDe,
  motivoRapidoValido,
  observacionesRapidas,
} from '../lib/movimientoRapido.js'

function ultimoDeEquipo(movimientos, equipoId) {
  let best = null
  let bestT = -1
  for (const mov of movimientos || []) {
    if (!mov || mov.equipoId !== equipoId) continue
    const parsed = Date.parse(mov.fechaHora || mov.horaServidor || mov.creadoEn || '')
    const time = Number.isFinite(parsed) ? parsed : 0
    if (!best || time > bestT) {
      best = mov
      bestT = time
    }
  }
  return best
}

function vigente(movimientos, equipoId) {
  return (movimientos || []).find((mov) => mov?.equipoId === equipoId) || null
}

/**
 * Salida o retorno de un momento. Sin carta porte, licencia, sello, thermo, daños, firma ni fotos.
 * @param {'salida'|'retorno'} modo
 */
export default function MovimientoRapidoForm({
  modo = 'salida',
  initialPlaca = '',
  equipos = [],
  movimientos = [],
  empresas = [],
  yardas = [],
  yardaInicial = 'chihuahua',
  empresaInicial = 'api',
  onRememberYarda,
  onRememberEmpresa,
  formatCuando = (value) => value,
  onSubmit,
  onDone,
}) {
  const salida = modo !== 'retorno'
  const [yardaId, setYardaId] = useState(yardaInicial)
  const [empresaId, setEmpresaId] = useState(empresaInicial)
  const [selectedId, setSelectedId] = useState(null)
  const [operador, setOperador] = useState('')
  const [motivo, setMotivo] = useState('')
  const [obs, setObs] = useState('')
  const [busca, setBusca] = useState('')
  const [abiertoEn] = useState(() => new Date().toISOString())
  const [error, setError] = useState(null)
  const [okMsg, setOkMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const enPatio = useMemo(() => {
    if (!salida) return []
    return equipos
      .map((eq) => {
        const mov = vigente(movimientos, eq.id)
        if (!mov || mov.tipo !== 'entrada') return null
        if (mov.yardaId && mov.yardaId !== yardaId) return null
        if ((mov.empresaId ?? 'api') !== empresaId) return null
        return { equipo: eq, entrada: mov }
      })
      .filter(Boolean)
  }, [salida, equipos, movimientos, yardaId, empresaId])

  const fuera = useMemo(() => {
    if (salida) return []
    return equipos
      .map((eq) => {
        const mov = ultimoDeEquipo(movimientos, eq.id)
        if (!mov || String(mov.tipo || '').toLowerCase() !== 'salida') return null
        if (!esMovimientoRapido(mov)) return null
        if (mov.yardaId && mov.yardaId !== yardaId) return null
        if ((mov.empresaId ?? 'api') !== empresaId) return null
        return { equipo: eq, salida: mov, motivo: etiquetaMotivoRapido(motivoRapidoDe(mov)) }
      })
      .filter(Boolean)
  }, [salida, equipos, movimientos, yardaId, empresaId])

  const chips = salida ? enPatio : fuera
  const yardaNombre = yardas.find((y) => y.id === yardaId)?.nombre || ''

  const hits = useMemo(() => {
    if (salida) return []
    const q = busca.trim()
    if (!q) return []
    const placa = normalizePlacaMX(q)
    const upper = q.toUpperCase()
    return equipos
      .filter((eq) => {
        if (fuera.some((row) => row.equipo.id === eq.id)) return false
        return (
          normalizePlacaMX(eq.placa).includes(placa) ||
          String(eq.numeroEconomico || '').toUpperCase().includes(upper)
        )
      })
      .slice(0, 8)
  }, [salida, busca, equipos, fuera])

  useEffect(() => {
    if (!initialPlaca.trim() || selectedId) return
    const hit = chips.find((row) => normalizePlacaMX(row.equipo.placa) === normalizePlacaMX(initialPlaca))
    if (hit) setSelectedId(hit.equipo.id)
  }, [initialPlaca, chips, selectedId])

  const selChip = chips.find((row) => row.equipo.id === selectedId) || null
  const selCatalogo = !salida ? equipos.find((eq) => eq.id === selectedId) || null : null
  const equipo = selChip?.equipo || selCatalogo || null

  function cambiarEmpresa(id) {
    setEmpresaId(id)
    onRememberEmpresa?.(id)
    setSelectedId(null)
    setError(null)
  }

  function cambiarYarda(id) {
    setYardaId(id)
    onRememberYarda?.(id)
    setSelectedId(null)
    setError(null)
  }

  function elegir(id) {
    setSelectedId(id)
    setError(null)
    setOkMsg(null)
  }

  async function onSave(ev) {
    ev.preventDefault()
    setError(null)
    setOkMsg(null)
    if (!equipo) {
      setError(salida ? 'Elige una unidad que esté en patio' : 'Elige la unidad que regresa')
      return
    }
    if (!operador.trim()) {
      setError('Indica el operador de patio')
      return
    }
    if (!motivoRapidoValido(motivo)) {
      setError('Elige el motivo: lavado, combustible o trámite')
      return
    }
    if (salida && !enPatio.some((row) => row.equipo.id === equipo.id)) {
      setError('Esa unidad no tiene una entrada abierta en esta yarda')
      return
    }
    if (!salida) {
      const ultimo = ultimoDeEquipo(movimientos, equipo.id)
      const tipo = String(ultimo?.tipo || '').toLowerCase()
      if (tipo === 'entrada' || tipo === 'parado') {
        setError('Esta unidad sigue en patio. El retorno es para quien ya salió.')
        return
      }
    }

    setBusy(true)
    try {
      const entrada = selChip?.entrada
      const mov = {
        id: uuid(),
        tipo: salida ? 'salida' : 'entrada',
        rapido: true,
        motivoRapido: motivo,
        yardaId,
        empresaId,
        equipoId: equipo.id,
        placa: equipo.placa,
        numeroEconomico: equipo.numeroEconomico || equipo.placa,
        equipoTipo: equipo.tipo || 'camion',
        fechaHora: abiertoEn,
        operador: operador.trim(),
        observaciones: observacionesRapidas(obs, motivo),
        condicionGeneral: 'buena',
        checklist: [],
        fotos: [],
        fotosEvidencia: [],
        cumplimiento: {
          rapido: true,
          motivoRapido: motivo,
          validadoGate: true,
        },
        creadoEn: new Date().toISOString(),
      }
      if (salida && entrada) {
        if (entrada.chofer) mov.chofer = entrada.chofer
        if (entrada.whatsapp) mov.whatsapp = entrada.whatsapp
        if (entrada.cliente) mov.cliente = entrada.cliente
        if (entrada.origen) mov.origen = entrada.origen
        if (entrada.destino) mov.destino = entrada.destino
        if (entrada.placaCamionTrasera) mov.placaCamionTrasera = entrada.placaCamionTrasera
        if (entrada.placaCaja1) mov.placaCaja1 = entrada.placaCaja1
        if (entrada.placaCaja2) mov.placaCaja2 = entrada.placaCaja2
      }
      const aviso = await onSubmit(mov)
      const base = salida
        ? `Salida rápida registrada: ${equipo.placa}`
        : `Retorno rápido registrado: ${equipo.placa}`
      setOkMsg(aviso ? `${base}. ${aviso}` : base)
      setTimeout(() => onDone?.(), 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  const titulo = salida ? 'Salida rápida' : 'Retorno rápido'
  const lede = salida
    ? 'Sale un momento del patio (lavado, combustible o trámite).'
    : 'Regresa de una salida rápida.'
  const guardar = salida ? 'Guardar salida rápida' : 'Guardar retorno rápido'

  return (
    <form className="form-panel" id="movimiento-rapido-form" data-form="movimiento-rapido" data-modo={modo} onSubmit={(ev) => void onSave(ev)}>
      {createPortal(
        <div className="sticky-save-bar">
          <button
            type="button"
            className="btn primary sticky-save"
            disabled={busy}
            onClick={() => document.getElementById('movimiento-rapido-form')?.requestSubmit()}
          >
            {busy ? 'Guardando…' : guardar}
          </button>
        </div>,
        document.body,
      )}
      <div className="form-head">
        <h1>{titulo}</h1>
        <p>{lede}</p>
      </div>
      <fieldset className="fieldset">
        <legend>Empresa</legend>
        <div className="seg big wrap">
          {empresas.map((emp) => (
            <button
              type="button"
              className={empresaId === emp.id ? 'seg-btn on-ok' : 'seg-btn'}
              onClick={() => cambiarEmpresa(emp.id)}
              key={emp.id}
            >
              {emp.nombre}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="fieldset">
        <legend>Yarda</legend>
        <div className="seg big wrap">
          {yardas.map((y) => (
            <button
              type="button"
              className={yardaId === y.id ? 'seg-btn on-ok' : 'seg-btn'}
              onClick={() => cambiarYarda(y.id)}
              key={y.id}
            >
              {y.nombre}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="quick-picks">
        <p className="label">{salida ? `En patio · ${yardaNombre}` : `Fuera por salida rápida · ${yardaNombre}`}</p>
        {chips.length === 0 ? (
          <p className="empty">
            {salida
              ? 'No hay unidades con entrada abierta en esta yarda.'
              : 'No hay unidades fuera por una salida rápida.'}
          </p>
        ) : (
          <div className="chip-row">
            {chips.map((row) => (
              <button
                type="button"
                className={selectedId === row.equipo.id ? 'chip on' : 'chip'}
                onClick={() => elegir(row.equipo.id)}
                key={row.equipo.id}
              >
                {row.equipo.placa}
                {` · `}
                {row.equipo.numeroEconomico}
                {row.motivo ? ` · ${row.motivo}` : ''}
              </button>
            ))}
          </div>
        )}
      </div>
      {!salida && (
        <label className="field" style={{ marginTop: 12 }}>
          <span>{chips.length === 0 ? 'Buscar placa en el catálogo' : 'Otra placa del catálogo'}</span>
          <input
            className="input"
            value={busca}
            onChange={(ev) => setBusca(ev.target.value)}
            placeholder="Placa o económico"
            autoComplete="off"
          />
        </label>
      )}
      {!salida && hits.length > 0 && (
        <div className="chip-row" style={{ marginTop: 8 }}>
          {hits.map((eq) => (
            <button
              type="button"
              className={selectedId === eq.id ? 'chip on' : 'chip'}
              onClick={() => elegir(eq.id)}
              key={eq.id}
            >
              {eq.placa}
              {` · `}
              {eq.numeroEconomico}
            </button>
          ))}
        </div>
      )}
      {!salida && busca.trim() && hits.length === 0 && !selCatalogo && (
        <p className="empty">Esa placa no está en el catálogo.</p>
      )}
      {equipo && (
        <div className="banner info" style={{ marginTop: 12 }}>
          <strong>{equipo.placa}</strong>
          {` · eco `}
          {equipo.numeroEconomico}
          {selChip?.entrada ? ` · llegó ${formatCuando(selChip.entrada.fechaHora)}` : ''}
          {selChip?.salida ? ` · salió ${formatCuando(selChip.salida.fechaHora)}` : ''}
          {selChip?.motivo ? ` · ${selChip.motivo}` : ''}
        </div>
      )}
      <fieldset className="fieldset">
        <legend>Caseta</legend>
        <label className="field">
          <span>Operador de patio *</span>
          <input
            className="input"
            value={operador}
            onChange={(ev) => setOperador(ev.target.value)}
            placeholder="Quién registra"
            required
          />
        </label>
        <div className="field">
          <span>Fecha y hora</span>
          <p className="hint" data-field="fecha-hora">{formatCuando(abiertoEn)}</p>
        </div>
      </fieldset>
      <fieldset className="fieldset">
        <legend>Motivo *</legend>
        <div className="seg big" role="group" aria-label="Motivo del viaje corto">
          {MOTIVOS_RAPIDO.map((item) => (
            <button
              type="button"
              className={motivo === item.id ? 'seg-btn on-ok' : 'seg-btn'}
              onClick={() => setMotivo(item.id)}
              key={item.id}
              aria-pressed={motivo === item.id}
            >
              {item.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="fieldset">
        <legend>Observaciones</legend>
        <textarea
          className="input textarea"
          rows={2}
          value={obs}
          onChange={(ev) => setObs(ev.target.value)}
          placeholder="Opcional"
        />
      </fieldset>
      {error && <p className="banner error">{error}</p>}
      {okMsg && <p className="banner success">{okMsg}</p>}
      <button type="submit" className="btn primary wide" disabled={busy}>
        {busy ? 'Guardando…' : guardar}
      </button>
    </form>
  )
}
