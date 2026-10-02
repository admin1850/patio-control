import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { v4 as uuid } from 'uuid'
import { normalizePlacaMX } from '../lib/placaOcr.js'
import {
  MOTIVOS_RAPIDO,
  detalleMotivoRapidoDe,
  etiquetaMotivoRapido,
  motivoRapidoDe,
  motivoRapidoRequiereDetalle,
  motivoRapidoValido,
  observacionesRapidas,
  poolSalidaRapidaAbierta,
} from '../lib/movimientoRapido.js'

function vigente(movimientos, equipoId) {
  return (movimientos || []).find((mov) => mov?.equipoId === equipoId) || null
}

/**
 * Salida o retorno de un momento. Sin carta porte, licencia, sello, thermo, daños, firma ni fotos.
 * Salida: solo placa + motivo (Otros pide detalle).
 * Retorno: solo pool de placas con salida rápida abierta.
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
  const [motivo, setMotivo] = useState('')
  const [detalle, setDetalle] = useState('')
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
    return poolSalidaRapidaAbierta(movimientos, equipos, { yardaId, empresaId })
  }, [salida, equipos, movimientos, yardaId, empresaId])

  const chips = salida ? enPatio : fuera
  const yardaNombre = yardas.find((y) => y.id === yardaId)?.nombre || ''

  useEffect(() => {
    if (!initialPlaca.trim() || selectedId) return
    const hit = chips.find((row) => normalizePlacaMX(row.equipo.placa) === normalizePlacaMX(initialPlaca))
    if (hit) setSelectedId(hit.equipo.id)
  }, [initialPlaca, chips, selectedId])

  const selChip = chips.find((row) => row.equipo.id === selectedId) || null
  const equipo = selChip?.equipo || null

  useEffect(() => {
    if (salida || !selChip) return
    const id = selChip.motivoId || motivoRapidoDe(selChip.salida)
    if (id && motivoRapidoValido(id)) setMotivo(id)
    const extra = selChip.detalle || detalleMotivoRapidoDe(selChip.salida)
    setDetalle(extra)
  }, [salida, selChip])

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

  function elegirMotivo(id) {
    setMotivo(id)
    if (!motivoRapidoRequiereDetalle(id)) setDetalle('')
    setError(null)
  }

  async function onSave(ev) {
    ev.preventDefault()
    setError(null)
    setOkMsg(null)
    if (!equipo) {
      setError(salida ? 'Elige la placa que sale' : 'Elige una placa del pool de salida rápida')
      return
    }
    if (salida && !motivoRapidoValido(motivo)) {
      setError('Elige el motivo: lavado, llantas u otros')
      return
    }
    if (salida && motivoRapidoRequiereDetalle(motivo) && !detalle.trim()) {
      setError('En Otros escribe el detalle o descripción')
      return
    }
    if (salida && !enPatio.some((row) => row.equipo.id === equipo.id)) {
      setError('Esa unidad no tiene una entrada abierta en esta yarda')
      return
    }
    if (!salida) {
      const enPool = fuera.some((row) => row.equipo.id === equipo.id)
      if (!enPool) {
        setError('Solo puedes regresar placas que salieron en salida rápida')
        return
      }
    }

    const motivoFinal = salida ? motivo : selChip?.motivoId || motivoRapidoDe(selChip?.salida) || motivo
    const detalleFinal = salida
      ? detalle.trim()
      : selChip?.detalle || detalleMotivoRapidoDe(selChip?.salida) || detalle.trim()

    setBusy(true)
    try {
      const entrada = selChip?.entrada
      const mov = {
        id: uuid(),
        tipo: salida ? 'salida' : 'entrada',
        rapido: true,
        motivoRapido: motivoFinal,
        ...(detalleFinal ? { motivoRapidoDetalle: detalleFinal } : {}),
        yardaId,
        empresaId,
        equipoId: equipo.id,
        placa: equipo.placa,
        numeroEconomico: equipo.numeroEconomico || equipo.placa,
        equipoTipo: equipo.tipo || 'camion',
        fechaHora: abiertoEn,
        operador: '',
        observaciones: observacionesRapidas('', motivoFinal, detalleFinal),
        condicionGeneral: 'buena',
        checklist: [],
        fotos: [],
        fotosEvidencia: [],
        cumplimiento: {
          rapido: true,
          motivoRapido: motivoFinal,
          ...(detalleFinal ? { motivoRapidoDetalle: detalleFinal } : {}),
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
    ? 'Solo placa y motivo (lavado, llantas u otros). Sin fotos ni documentos.'
    : 'Elige una placa del pool que salió en salida rápida.'
  const guardar = salida ? 'Guardar salida rápida' : 'Guardar retorno rápido'
  const motivoChip = selChip?.motivo || (motivo ? etiquetaMotivoRapido(motivo) : '')

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
        <p className="label">{salida ? `Placa en patio · ${yardaNombre}` : `Pool salida rápida · ${yardaNombre}`}</p>
        {chips.length === 0 ? (
          <p className="empty">
            {salida
              ? 'No hay unidades con entrada abierta en esta yarda.'
              : 'No hay placas en el pool: nadie tiene una salida rápida pendiente de retorno.'}
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
                {row.equipo.numeroEconomico ? ` · ${row.equipo.numeroEconomico}` : ''}
                {row.motivo ? ` · ${row.motivo}` : ''}
              </button>
            ))}
          </div>
        )}
      </div>
      {equipo && (
        <div className="banner info" style={{ marginTop: 12 }}>
          <strong>{equipo.placa}</strong>
          {equipo.numeroEconomico ? ` · eco ${equipo.numeroEconomico}` : ''}
          {selChip?.entrada ? ` · llegó ${formatCuando(selChip.entrada.fechaHora)}` : ''}
          {selChip?.salida ? ` · salió ${formatCuando(selChip.salida.fechaHora)}` : ''}
          {motivoChip ? ` · ${motivoChip}` : ''}
          {selChip?.detalle ? ` · ${selChip.detalle}` : ''}
        </div>
      )}
      <div className="field" style={{ marginTop: 12 }}>
        <span className="label">Fecha y hora</span>
        <p className="hint" data-field="fecha-hora">{formatCuando(abiertoEn)}</p>
      </div>
      {salida && (
        <fieldset className="fieldset">
          <legend>Motivo *</legend>
          <div className="seg big" role="group" aria-label="Motivo del viaje corto">
            {MOTIVOS_RAPIDO.map((item) => (
              <button
                type="button"
                className={motivo === item.id ? 'seg-btn on-ok' : 'seg-btn'}
                onClick={() => elegirMotivo(item.id)}
                key={item.id}
                aria-pressed={motivo === item.id}
              >
                {item.label}
              </button>
            ))}
          </div>
          {motivoRapidoRequiereDetalle(motivo) && (
            <label className="field" style={{ marginTop: 12 }}>
              <span>Detalles / descripción *</span>
              <textarea
                className="input textarea"
                rows={3}
                value={detalle}
                onChange={(ev) => setDetalle(ev.target.value)}
                placeholder="Describe el motivo"
                required
              />
            </label>
          )}
        </fieldset>
      )}
      {!salida && equipo && motivoChip && (
        <p className="hint" style={{ marginTop: 8 }}>
          Motivo de la salida: {motivoChip}
          {detalle ? ` — ${detalle}` : ''}
        </p>
      )}
      {error && <p className="banner error">{error}</p>}
      {okMsg && <p className="banner success">{okMsg}</p>}
      <button type="submit" className="btn primary wide" disabled={busy}>
        {busy ? 'Guardando…' : guardar}
      </button>
    </form>
  )
}
