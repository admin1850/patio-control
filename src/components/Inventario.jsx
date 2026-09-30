import { useEffect, useMemo, useState } from 'react'
import { inventarioCsv } from '../lib/inventarioCsv.js'
import { ApiError, capturarConteo, cerrarConteo, fetchInventario, guardarZonaSlot, iniciarConteo, isBackendUnavailable } from '../lib/serverApi.js'

const YARDAS = [
  { id: 'chihuahua', nombre: 'Chihuahua' },
  { id: 'calera', nombre: 'Calera' },
  { id: 'calpulalpan', nombre: 'Calpulalpan' },
]

const TIPOS_SLOT = [
  ['LINEA', 'Línea'],
  ['ANDEN', 'Andén'],
  ['TALLER', 'Taller'],
  ['LAVADO', 'Lavado'],
  ['CUARENTENA', 'Cuarentena'],
  ['OTRO', 'Otro'],
]

const ETIQUETA_OPERATIVO = {
  DISPONIBLE: 'Disponible',
  EN_MANTENIMIENTO: 'En mantenimiento',
  DANADO_NO_OPERABLE: 'Dañado',
  BAJA: 'Baja',
  SIN_ESTATUS: 'Sin estatus',
}

const ETIQUETA_CARGA = {
  VACIA: 'Vacía',
  CARGADA: 'Cargada',
  EN_CARGA: 'En carga',
  NA: 'N/A',
}

const ETIQUETA_UBICACION = {
  EN_PATIO: 'En patio',
  EN_RUTA: 'En ruta',
  EN_TALLER_EXTERNO: 'Taller externo',
  EN_CLIENTE: 'En cliente',
}

const ETIQUETA_TIPO = {
  camion: 'Camión',
  caja: 'Caja',
  dolly: 'Dolly',
  sin_tipo: 'Sin tipo',
}

function etiqueta(map, value) {
  if (!value) return '—'
  return map[value] || value
}

function mensajeApi(err) {
  if (err instanceof ApiError && err.status === 401) {
    return 'Inicia sesión en Cloud para consultar el inventario.'
  }
  if (isBackendUnavailable(err) || !(err instanceof ApiError)) {
    return 'Inventario no disponible en el servidor. El patio sigue operando.'
  }
  return err.message || 'No se pudo consultar el inventario.'
}

function descargar(nombre, texto) {
  const blob = new Blob([texto], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nombre
  link.click()
  URL.revokeObjectURL(url)
}

function nombreYarda(id) {
  return YARDAS.find((y) => y.id === id)?.nombre || id || 'Sin yarda'
}

export default function Inventario({ user = null }) {
  const inicial = YARDAS.some((y) => y.id === user?.ubicacion) ? user.ubicacion : 'chihuahua'
  const [yarda, setYarda] = useState(inicial)
  const [data, setData] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('todos')
  const [operativo, setOperativo] = useState('todos')
  const [carga, setCarga] = useState('todos')
  const [zonaFiltro, setZonaFiltro] = useState('todas')
  const [conteo, setConteo] = useState(null)
  const [zonaConteo, setZonaConteo] = useState('')
  const [slotManual, setSlotManual] = useState('')
  const [placaManual, setPlacaManual] = useState('')
  const [placasSlot, setPlacasSlot] = useState({})
  const [resultado, setResultado] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [slotForm, setSlotForm] = useState({ zona: '', slot: '', tipo: 'LINEA', capacidad: '1' })

  async function cargar(siguiente = yarda) {
    setCargando(true)
    try {
      const payload = await fetchInventario(siguiente)
      const inventario = payload?.inventario
      if (!inventario) {
        setData(null)
        setAviso('Inventario no disponible en el servidor. El patio sigue operando.')
        return
      }
      setData(inventario)
    } catch (err) {
      setData(null)
      setAviso(mensajeApi(err))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    let cancel = false
    setCargando(true)
    setAviso(null)
    fetchInventario(yarda)
      .then((payload) => {
        if (cancel) return
        if (!payload?.inventario) {
          setData(null)
          setAviso('Inventario no disponible en el servidor. El patio sigue operando.')
          return
        }
        setData(payload.inventario)
        const abierto = payload.inventario.conteosAbiertos?.[0] || null
        setConteo(abierto)
        setResultado(null)
        if (abierto) setZonaConteo(abierto.zona || '')
      })
      .catch((err) => {
        if (cancel) return
        setData(null)
        setAviso(mensajeApi(err))
      })
      .finally(() => {
        if (!cancel) setCargando(false)
      })
    return () => {
      cancel = true
    }
  }, [yarda])

  const unidades = data?.unidades || []
  const filtradas = useMemo(() => {
    const texto = q.trim().toLowerCase()
    return unidades.filter((item) => {
      if (tipo !== 'todos' && String(item.tipo).toLowerCase() !== tipo) return false
      if (operativo !== 'todos' && item.estatusOperativo !== operativo) return false
      if (carga !== 'todos' && item.estatusCarga !== carga) return false
      if (!texto) return true
      const bolsa = [item.placa, item.unidadId, item.zona, item.slot, item.clienteCarga, item.folioCarga, item.enganchadaA]
        .join(' ')
        .toLowerCase()
      return bolsa.includes(texto)
    })
  }, [unidades, q, tipo, operativo, carga])

  const zonas = useMemo(() => {
    const set = new Set()
    for (const slot of data?.slots || []) if (slot.zona) set.add(slot.zona)
    for (const item of unidades) if (item.zona) set.add(item.zona)
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [data, unidades])

  const slotsZona = useMemo(() => {
    const lista = data?.slots || []
    if (zonaFiltro === 'todas') return lista
    return lista.filter((slot) => slot.zona === zonaFiltro)
  }, [data, zonaFiltro])

  const slotsConteo = useMemo(() => {
    return (data?.slots || []).filter((slot) => !zonaConteo || slot.zona === zonaConteo)
  }, [data, zonaConteo])

  async function onIniciar(e) {
    e.preventDefault()
    setAviso(null)
    setResultado(null)
    setOcupado(true)
    try {
      const res = await iniciarConteo({ yardaId: yarda, zona: zonaConteo.trim() })
      setConteo(res.conteo)
      setAviso(res.idempotent ? 'Ya había un conteo abierto en esa zona. Se continúa.' : 'Conteo iniciado.')
    } catch (err) {
      setAviso(mensajeApi(err))
    } finally {
      setOcupado(false)
    }
  }

  async function enviarCaptura(slot, placa) {
    if (!conteo?.id) {
      setAviso('Inicia el conteo antes de capturar placas.')
      return
    }
    const limpia = String(placa || '').trim()
    if (!limpia || !slot) return
    setOcupado(true)
    setAviso(null)
    try {
      const res = await capturarConteo(conteo.id, { slot, placa: limpia, zona: zonaConteo.trim() })
      setConteo(res.conteo)
      return true
    } catch (err) {
      setAviso(mensajeApi(err))
      return false
    } finally {
      setOcupado(false)
    }
  }

  async function onCerrar() {
    if (!conteo?.id) return
    setOcupado(true)
    setAviso(null)
    try {
      const res = await cerrarConteo(conteo.id, { aplicarAjustes: true })
      setResultado(res)
      setConteo(null)
      await cargar(yarda)
      setAviso('Conteo cerrado. Los slots que no coincidían se actualizaron.')
    } catch (err) {
      setAviso(mensajeApi(err))
    } finally {
      setOcupado(false)
    }
  }

  async function onAltaSlot(e) {
    e.preventDefault()
    setOcupado(true)
    setAviso(null)
    try {
      await guardarZonaSlot({
        yardaId: yarda,
        zona: slotForm.zona.trim(),
        slot: slotForm.slot.trim(),
        tipo: slotForm.tipo,
        capacidad: Number(slotForm.capacidad) || 1,
      })
      setSlotForm({ zona: '', slot: '', tipo: 'LINEA', capacidad: '1' })
      await cargar(yarda)
      setAviso('Slot guardado.')
    } catch (err) {
      setAviso(mensajeApi(err))
    } finally {
      setOcupado(false)
    }
  }

  const resumen = data?.resumen
  const capturas = conteo?.resumenJson?.capturas || conteo?.capturas || []

  return (
    <div className="page">
      <div className="form-head">
        <h1>Inventario</h1>
        <p>Unidades por tipo y estatus, mapa de slots y conteo físico de la yarda.</p>
      </div>
      {aviso && <p className={`banner ${aviso.includes('no está disponible') || aviso.includes('no disponible') || aviso.includes('Inicia sesión') ? 'warn' : 'info'}`}>{aviso}</p>}
      <fieldset className="fieldset">
        <legend>Yarda</legend>
        <div className="seg wrap yard-filter">
          {YARDAS.map((item) => (
            <button type="button" className={yarda === item.id ? 'seg-btn on-ok' : 'seg-btn'} onClick={() => setYarda(item.id)} key={item.id}>
              {item.nombre}
            </button>
          ))}
          <button type="button" className={yarda === 'todas' ? 'seg-btn on-ok' : 'seg-btn'} onClick={() => setYarda('todas')}>
            Todas
          </button>
        </div>
      </fieldset>
      {cargando && <p className="hint">Cargando inventario…</p>}
      {resumen && (
        <div className="stats kpi-grid">
          <div className="stat">
            <p className="stat-label">Unidades</p>
            <p className="stat-value">{resumen.unidades}</p>
          </div>
          <div className="stat">
            <p className="stat-label">En patio</p>
            <p className="stat-value">{resumen.enPatio}</p>
          </div>
          <div className="stat">
            <p className="stat-label">En ruta</p>
            <p className="stat-value">{resumen.enRuta}</p>
          </div>
          <div className="stat">
            <p className="stat-label">Taller externo</p>
            <p className="stat-value">{resumen.enTallerExterno}</p>
          </div>
        </div>
      )}
      <section className="panel">
        <div className="panel-head">
          <h2>Por tipo y estatus</h2>
        </div>
        {(data?.porTipoOperativo || []).length === 0 ? (
          <p className="empty">Sin unidades en esta yarda.</p>
        ) : (
          <ul className="inv-counts">
            {data.porTipoOperativo.map((row) => (
              <li key={`${row.yarda}-${row.tipo}-${row.estatusOperativo}`}>
                <strong>{row.cantidad}</strong>
                {` ${etiqueta(ETIQUETA_TIPO, row.tipo)} · ${etiqueta(ETIQUETA_OPERATIVO, row.estatusOperativo)}`}
                {yarda === 'todas' ? ` · ${nombreYarda(row.yarda)}` : ''}
              </li>
            ))}
          </ul>
        )}
        <h3 className="inv-sub">Por tipo y carga</h3>
        <ul className="inv-counts">
          {(data?.porTipoCarga || []).map((row) => (
            <li key={`${row.yarda}-${row.tipo}-${row.estatusCarga}`}>
              <strong>{row.cantidad}</strong>
              {` ${etiqueta(ETIQUETA_TIPO, row.tipo)} · ${etiqueta(ETIQUETA_CARGA, row.estatusCarga)}`}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Unidades</h2>
          <button
            type="button"
            className="btn soft"
            disabled={filtradas.length === 0}
            onClick={() => descargar(`inventario-${yarda}.csv`, inventarioCsv(filtradas))}
          >
            Exportar CSV ({filtradas.length})
          </button>
        </div>
        <p className="hint">Los conteos de arriba son de la yarda. Esta lista respeta el filtro.</p>
        <div className="filters">
          <input className="input" placeholder="Buscar placa, folio, cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="seg wrap">
            {['todos', 'camion', 'caja', 'dolly'].map((item) => (
              <button type="button" className={tipo === item ? 'seg-btn on-ok' : 'seg-btn'} onClick={() => setTipo(item)} key={item}>
                {item === 'todos' ? 'Todos' : etiqueta(ETIQUETA_TIPO, item)}
              </button>
            ))}
          </div>
          <div className="seg wrap">
            {['todos', 'DISPONIBLE', 'EN_MANTENIMIENTO', 'DANADO_NO_OPERABLE', 'BAJA'].map((item) => (
              <button type="button" className={operativo === item ? 'seg-btn on-ok' : 'seg-btn'} onClick={() => setOperativo(item)} key={item}>
                {item === 'todos' ? 'Estatus' : etiqueta(ETIQUETA_OPERATIVO, item)}
              </button>
            ))}
          </div>
          <div className="seg wrap">
            {['todos', 'VACIA', 'CARGADA', 'EN_CARGA', 'NA'].map((item) => (
              <button type="button" className={carga === item ? 'seg-btn on-ok' : 'seg-btn'} onClick={() => setCarga(item)} key={item}>
                {item === 'todos' ? 'Carga' : etiqueta(ETIQUETA_CARGA, item)}
              </button>
            ))}
          </div>
        </div>
        {filtradas.length === 0 ? (
          <p className="empty">Nada coincide con el filtro.</p>
        ) : (
          <ul className="inv-list">
            {filtradas.map((item) => (
              <li className="unit-row" key={item.unidadId}>
                <p className="unit-placa">
                  {item.placa || item.unidadId}{' '}
                  <span className={`badge op-${String(item.estatusOperativo || 'sin').toLowerCase()}`}>
                    {etiqueta(ETIQUETA_OPERATIVO, item.estatusOperativo)}
                  </span>
                </p>
                <p className="unit-meta">
                  {etiqueta(ETIQUETA_TIPO, String(item.tipo || '').toLowerCase())}
                  {' · '}
                  {nombreYarda(item.yarda)}
                  {item.zona ? ` · ${item.zona}` : ''}
                  {item.slot ? ` · slot ${item.slot}` : ''}
                  {' · '}
                  {etiqueta(ETIQUETA_UBICACION, item.ubicacion)}
                  {' · '}
                  {etiqueta(ETIQUETA_CARGA, item.estatusCarga)}
                  {item.clienteCarga ? ` · ${item.clienteCarga}` : ''}
                  {item.enganchadaA ? ` · eng. ${item.enganchadaA}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Mapa de slots</h2>
        </div>
        <div className="seg wrap">
          <button type="button" className={zonaFiltro === 'todas' ? 'seg-btn on-ok' : 'seg-btn'} onClick={() => setZonaFiltro('todas')}>
            Todas las zonas
          </button>
          {zonas.map((zona) => (
            <button type="button" className={zonaFiltro === zona ? 'seg-btn on-ok' : 'seg-btn'} onClick={() => setZonaFiltro(zona)} key={zona}>
              {zona}
            </button>
          ))}
        </div>
        {slotsZona.length === 0 ? (
          <p className="empty">No hay slots en esta yarda. Da de alta una zona abajo.</p>
        ) : (
          <div className="slot-grid">
            {slotsZona.map((slot) => {
              const ocupante = slot.ocupantes?.[0]
              return (
                <article className={ocupante ? 'slot-cell ocupado' : 'slot-cell'} key={slot.id}>
                  <p className="slot-code">
                    {slot.zona} · {slot.slot}
                  </p>
                  <p className="slot-unit">{ocupante ? ocupante.placa || ocupante.unidadId : 'Libre'}</p>
                  <p className="hint">
                    {etiqueta(TIPOS_SLOT_MAP, slot.tipo)}
                    {slot.ocupantes?.length > 1 ? ` · ${slot.ocupantes.length} unidades` : ''}
                    {slot.sobreCupo ? ' · sobre cupo' : ''}
                  </p>
                </article>
              )
            })}
          </div>
        )}
        <form className="form-panel compact inv-slot-form" onSubmit={(e) => void onAltaSlot(e)}>
          <h3 className="inv-sub">Alta de slot</h3>
          <div className="grid-2">
            <label className="field">
              <span>Zona</span>
              <input className="input" value={slotForm.zona} onChange={(e) => setSlotForm({ ...slotForm, zona: e.target.value })} placeholder="Norte" required />
            </label>
            <label className="field">
              <span>Slot</span>
              <input className="input" value={slotForm.slot} onChange={(e) => setSlotForm({ ...slotForm, slot: e.target.value })} placeholder="A-12" required />
            </label>
            <label className="field">
              <span>Tipo</span>
              <select className="input" value={slotForm.tipo} onChange={(e) => setSlotForm({ ...slotForm, tipo: e.target.value })}>
                {TIPOS_SLOT.map(([id, label]) => (
                  <option value={id} key={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Capacidad</span>
              <input className="input" type="number" min={1} value={slotForm.capacidad} onChange={(e) => setSlotForm({ ...slotForm, capacidad: e.target.value })} />
            </label>
          </div>
          <button type="submit" className="btn primary" disabled={ocupado}>
            Guardar slot
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Conteo físico</h2>
        </div>
        <form className="grid-2" onSubmit={(e) => void onIniciar(e)}>
          <label className="field">
            <span>Zona a contar</span>
            <input className="input" value={zonaConteo} onChange={(e) => setZonaConteo(e.target.value)} placeholder="Vacío = toda la yarda" list="zonas-inventario" />
            <datalist id="zonas-inventario">
              {zonas.map((zona) => (
                <option value={zona} key={zona} />
              ))}
            </datalist>
          </label>
          <div className="hero-actions">
            <button type="submit" className="btn primary" disabled={ocupado}>
              {conteo ? 'Continuar conteo' : 'Iniciar conteo'}
            </button>
            <button type="button" className="btn soft" disabled={!conteo || ocupado} onClick={() => void onCerrar()}>
              Cerrar conteo
            </button>
          </div>
        </form>
        {conteo && <p className="hint">Conteo {conteo.id.slice(0, 8)} · {capturas.length} placa(s) capturada(s).</p>}
        {conteo && slotsConteo.length > 0 && (
          <ul className="inv-list">
            {slotsConteo.map((slot) => (
              <li className="conteo-row" key={slot.id}>
                <span className="slot-code">
                  {slot.zona} · {slot.slot}
                </span>
                <input
                  className="input"
                  value={placasSlot[slot.id] ?? ''}
                  onChange={(e) => setPlacasSlot({ ...placasSlot, [slot.id]: e.target.value.toUpperCase() })}
                  placeholder="Placa en este slot"
                  autoCapitalize="characters"
                />
                <button type="button" className="btn soft" disabled={ocupado} onClick={() => void enviarCaptura(slot.slot, placasSlot[slot.id])}>
                  Registrar
                </button>
              </li>
            ))}
          </ul>
        )}
        {conteo && (
          <form
            className="grid-2"
            onSubmit={(e) => {
              e.preventDefault()
              void enviarCaptura(slotManual.trim(), placaManual).then((ok) => {
                if (ok) setPlacaManual('')
              })
            }}
          >
            <label className="field">
              <span>Slot manual</span>
              <input className="input" value={slotManual} onChange={(e) => setSlotManual(e.target.value)} placeholder="B-4" required />
            </label>
            <label className="field">
              <span>Placa</span>
              <input className="input" value={placaManual} onChange={(e) => setPlacaManual(e.target.value.toUpperCase())} placeholder="ABC123A" required autoCapitalize="characters" />
            </label>
            <button type="submit" className="btn primary" disabled={ocupado}>
              Capturar placa
            </button>
          </form>
        )}
        {capturas.length > 0 && (
          <ul className="inv-counts">
            {capturas.map((item) => (
              <li key={`${item.slot}-${item.placa}`}>
                {item.placa} · slot {item.slot}
                {item.zona ? ` · ${item.zona}` : ''}
              </li>
            ))}
          </ul>
        )}
        {resultado && (
          <div className="conteo-resultado">
            <h3>Faltantes ({resultado.faltantes?.length || 0})</h3>
            {(resultado.faltantes || []).length === 0 ? (
              <p className="empty">No hay faltantes.</p>
            ) : (
              <ul className="inv-counts">
                {resultado.faltantes.map((item) => (
                  <li key={item.unidadId}>
                    {item.placa || item.unidadId}
                    {item.slot ? ` · esperado en ${item.zona} ${item.slot}` : ''}
                  </li>
                ))}
              </ul>
            )}
            <h3>Sobrantes ({resultado.sobrantes?.length || 0})</h3>
            {(resultado.sobrantes || []).length === 0 ? (
              <p className="empty">No hay sobrantes.</p>
            ) : (
              <ul className="inv-counts">
                {resultado.sobrantes.map((item) => (
                  <li key={`${item.placa}-${item.slot}`}>
                    {item.placa} · slot {item.slot}
                  </li>
                ))}
              </ul>
            )}
            {(resultado.ajustes || []).length > 0 && (
              <>
                <h3>Ajustes de slot ({resultado.ajustes.length})</h3>
                <ul className="inv-counts">
                  {resultado.ajustes.map((item) => (
                    <li key={item.unidadId}>
                      {item.placa || item.unidadId}: {item.antes?.slot || 'sin slot'} → {item.despues?.slot}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

const TIPOS_SLOT_MAP = Object.fromEntries(TIPOS_SLOT)
