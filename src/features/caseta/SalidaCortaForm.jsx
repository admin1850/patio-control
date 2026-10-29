/** Salida corta a ruta. */
import * as l from "react";
import { createPortal } from "react-dom";
import { v4 as ee } from "uuid";
import PlacaQuickOcr from "../../shared/ui/PlacaQuickOcr.jsx";
import { normalizePlacaMX } from "../../lib/placaOcr.js";
import { sessionLikelyAvailable, crearOrdenServidor, isGateUnavailable, validarSalidaAntesDeGuardar } from "../../lib/serverApi.js";
import { angulosDeEquipo, faltanMarcasDano, licenciaFederalValida, normalizarEstadoDano, precargaKmDiesel, requiereSelloSalida, textoAyudaSelloCiego, uuidCartaPorteValido } from "../../lib/salidaFuerte.js";
import { puedeAbrirOtCliente, puedeAutorizarSalidaCliente } from "../taller/Mantenimiento.jsx";
import { useZonaSlotFields } from "./ZonaSlotFields.jsx";
import { puedeCapturaTardia, resolverFechaCaptura } from "../../shared/domain/authProfile.js";
import { _e, ie } from "../../shared/domain/constants.js";
import { A, be, ge, ht, kn, mt, oe, re, se } from "../../shared/domain/patioModel.js";
import { FirmaCanvas } from "../../shared/ui/FirmaCanvas.jsx";
import { GuidedPhotos } from "../../shared/ui/GuidedPhotos.jsx";

var SALIDA_CORTA_SLOTS = [{
  id: `salida-puertas`,
  label: `Puertas / cierre`,
  hint: `Puertas cerradas, luces y cierre al salir.`,
  silhouette: `rear`,
  required: true
}, {
  id: `salida-sello`,
  label: `Sello de salida`,
  hint: `Número de serie del sello legible (zoom).`,
  silhouette: `seal`,
  required: true
}, {
  id: `salida-odometro`,
  label: `Odómetro`,
  hint: `Kilómetros legibles al salir.`,
  silhouette: `odometer`,
  required: true
}, {
  id: `salida-general`,
  label: `Vista general (opc.)`,
  hint: `Unidad completa al despachar.`,
  silhouette: `side`,
  required: false
}];

function slotsSalidaCorta(llevaRefrigerada) {
  if (!llevaRefrigerada) {
    return SALIDA_CORTA_SLOTS;
  }
  return [...SALIDA_CORTA_SLOTS, {
    id: `salida-thermo`,
    label: `Panel Thermo`,
    hint: `Set point, temperatura real y diésel del Thermo, legibles.`,
    silhouette: `thermo`,
    required: true
  }];
}

function findMovAbierto(movimientos, equipoId) {
  return movimientos.find(e => e.equipoId === equipoId);
}
/** Salida corta con gate fuerte: sello ciego, documentos, Thermo y daños. */

export function SalidaCortaForm({
  initialPlaca = ``,
  equipos,
  movimientos,
  onSubmit,
  onDone,
  user = null,
  onPromptOt = null
}) {
  let vacio = precargaKmDiesel();
  let [yardaId, setYardaId] = l.useState(() => be());
  let [empresaId, setEmpresaId] = l.useState(() => oe());
  let [selectedId, setSelectedId] = l.useState(null);
  let [placaText, setPlacaText] = l.useState(() => normalizePlacaMX(initialPlaca));
  let [operador, setOperador] = l.useState(``);
  let [abiertoEnSalida] = l.useState(() => new Date().toISOString());
  let [capturaTardiaSalida, setCapturaTardiaSalida] = l.useState(false);
  let [motivoCapturaTardiaSalida, setMotivoCapturaTardiaSalida] = l.useState(``);
  let [fechaTardia, setFechaTardia] = l.useState(() => mt());
  let [selloSalida, setSelloSalida] = l.useState(``);
  let [km, setKm] = l.useState(vacio.km);
  let [dieselPct, setDieselPct] = l.useState(vacio.dieselPct);
  let [dieselL, setDieselL] = l.useState(vacio.dieselL);
  let [condicion, setCondicion] = l.useState(`buena`);
  let [obs, setObs] = l.useState(``);
  let [fotos, setFotos] = l.useState({});
  let [firma, setFirma] = l.useState(null);
  let [firmaNombre, setFirmaNombre] = l.useState(``);
  let [cartaPorte, setCartaPorte] = l.useState(``);
  let [licencia, setLicencia] = l.useState(``);
  let [setPoint, setSetPoint] = l.useState(``);
  let [tempReal, setTempReal] = l.useState(``);
  let [dieselThermo, setDieselThermo] = l.useState(``);
  let [horometro, setHorometro] = l.useState(``);
  let [danos, setDanos] = l.useState({});
  let [error, setError] = l.useState(null);
  let [okMsg, setOkMsg] = l.useState(null);
  let [busy, setBusy] = l.useState(false);
  let [otBusy, setOtBusy] = l.useState(``);
  let [gateMsg, setGateMsg] = l.useState(null);
  let [gateLevel, setGateLevel] = l.useState(null);
  let [overrideMotivo, setOverrideMotivo] = l.useState(``);
  let [trasladoExterno, setTrasladoExterno] = l.useState(false);
  let [pideAutorizacion, setPideAutorizacion] = l.useState(false);
  let zonaSlotCap = useZonaSlotFields();
  let enPatio = l.useMemo(() => equipos.map(eq => {
    let mov = findMovAbierto(movimientos, eq.id);
    if (!mov || mov.tipo !== `entrada`) {
      return null;
    }
    if (mov.yardaId && mov.yardaId !== yardaId) {
      return null;
    }
    if ((mov.empresaId ?? `api`) !== empresaId) {
      return null;
    }
    return {
      equipo: eq,
      entrada: mov
    };
  }).filter(Boolean), [equipos, movimientos, yardaId, empresaId]);
  function pickUnit(row) {
    let limpio = precargaKmDiesel();
    setSelectedId(row.equipo.id);
    setPlacaText(normalizePlacaMX(row.equipo.placa));
    setSelloSalida(``);
    setKm(limpio.km);
    setDieselPct(limpio.dieselPct);
    setDieselL(limpio.dieselL);
    setCartaPorte(``);
    setLicencia(``);
    setSetPoint(``);
    setTempReal(``);
    setDieselThermo(``);
    setHorometro(``);
    setDanos({});
    setCondicion(`buena`);
    setObs(``);
    setFotos({});
    setError(null);
    setGateMsg(null);
    setGateLevel(null);
    setPideAutorizacion(false);
    setOverrideMotivo(``);
    setTrasladoExterno(false);
  }
  function aplicarPlacaSalida(raw) {
    let placa = normalizePlacaMX(raw);
    setPlacaText(placa);
    setOkMsg(null);
    if (!placa) {
      setSelectedId(null);
      setError(null);
      return;
    }
    let hit = enPatio.find(e => normalizePlacaMX(e.equipo.placa) === placa);
    if (hit) {
      pickUnit(hit);
      return;
    }
    setSelectedId(null);
    setError(`La placa ${placa} no tiene entrada abierta en esta yarda. Registra primero una entrada o elige otra yarda/empresa.`);
  }
  l.useEffect(() => {
    if (!initialPlaca.trim() || selectedId) {
      return;
    }
    aplicarPlacaSalida(initialPlaca);
  }, [initialPlaca, enPatio, selectedId]);
  l.useEffect(() => {
    if (!placaText) return;
    let hit = enPatio.find(e => normalizePlacaMX(e.equipo.placa) === normalizePlacaMX(placaText));
    if (hit) {
      if (selectedId !== hit.equipo.id) pickUnit(hit);
      setError(null);
    } else if (selectedId && !enPatio.some(row => row.equipo.id === selectedId)) {
      setSelectedId(null);
    }
  }, [enPatio, placaText, selectedId]);
  let sel = enPatio.find(e => e.equipo.id === selectedId) || null;
  let refrigerada = Boolean(sel?.entrada.llevaRefrigerada);
  let slots = slotsSalidaCorta(refrigerada);
  let angulos = sel ? angulosDeEquipo(sel.equipo.tipo || sel.entrada.equipoTipo, sel.entrada.fotosEvidencia) : [];
  let pideSello = Boolean(sel && requiereSelloSalida(sel.entrada, sel.equipo));
  let dieselDelta = (() => {
    if (sel?.entrada.dieselPorcentaje == null || dieselPct === ``) {
      return null;
    }
    return Number(dieselPct) - Number(sel.entrada.dieselPorcentaje);
  })();
  let thermoAviso = ``;
  if (refrigerada && setPoint !== `` && tempReal !== `` && Math.abs(Number(tempReal) - Number(setPoint)) > 2) {
    thermoAviso = `La temperatura se aleja más de 2°C del set point. El gate puede pedir autorización.`;
  }
  if (refrigerada && dieselThermo !== `` && Number(dieselThermo) < 25) {
    thermoAviso = thermoAviso ? `${thermoAviso} Diésel del Thermo menor a 25.` : `Diésel del Thermo menor a 25. El gate puede pedir autorización.`;
  }
  function marcarDano(anguloId, estado) {
    setDanos(prev => ({
      ...prev,
      [anguloId]: {
        ...prev[anguloId],
        estado: normalizarEstadoDano(estado)
      }
    }));
  }
  async function tomarDano(anguloId, file) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith(`image/`)) {
      setError(`Solo imágenes`);
      return;
    }
    let dataUrl = await re(file);
    setDanos(prev => ({
      ...prev,
      [anguloId]: {
        ...prev[anguloId],
        foto: dataUrl
      }
    }));
  }
  async function abrirOt(angulo) {
    if (!sel) {
      return;
    }
    setOtBusy(angulo.id);
    setError(null);
    try {
      let result = await crearOrdenServidor({
        unidadId: sel.equipo.id,
        placa: sel.equipo.placa,
        tipo: `CORRECTIVO`,
        motivo: `Daño nuevo en ${angulo.label} detectado al salir`,
        etr: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        yarda: yardaId,
        tallerTipo: `INTERNO`,
        prioridad: `ALTA`
      });
      let orden = result?.orden;
      setDanos(prev => ({
        ...prev,
        [angulo.id]: {
          ...prev[angulo.id],
          estado: `DANO_NUEVO`,
          otId: orden?.id || prev[angulo.id]?.otId || ``,
          otFolio: orden?.folio || ``,
          otMsg: result?.linked ? `Se enlazó la OT abierta ${orden?.folio || ``}.` : `OT correctiva ${orden?.folio || ``} creada.`
        }
      }));
    } catch (err) {
      let text = isGateUnavailable(err) ? `Sin servidor de OT. El daño queda en la salida y puedes seguir.` : err instanceof Error ? err.message : `No se pudo abrir la OT`;
      setDanos(prev => ({
        ...prev,
        [angulo.id]: {
          ...prev[angulo.id],
          otMsg: text
        }
      }));
    } finally {
      setOtBusy(``);
    }
  }
  async function onSave(ev) {
    ev.preventDefault();
    setError(null);
    setOkMsg(null);
    if (!sel) {
      setError(`Elige una unidad en patio para despachar`);
      return;
    }
    if (!operador.trim()) {
      setError(`Indica quién registra en caseta`);
      return;
    }
    if (pideSello && !selloSalida.trim()) {
      setError(`Captura el sello de salida`);
      return;
    }
    if (cartaPorte.trim() && !uuidCartaPorteValido(cartaPorte)) {
      setError(`Si capturas Carta Porte, el UUID debe tener formato correcto (o déjalo vacío)`);
      return;
    }
    if (!licenciaFederalValida(licencia)) {
      setError(`Captura la licencia federal (8 a 20 caracteres)`);
      return;
    }
    if (refrigerada && (setPoint === `` || tempReal === `` || dieselThermo === `` || horometro === ``)) {
      setError(`Completa set point, temperatura real, diésel y horómetro del Thermo`);
      return;
    }
    let faltan = faltanMarcasDano(angulos, danos);
    if (faltan.length) {
      setError(`Marca cada ángulo: sin cambio o daño nuevo`);
      return;
    }
    for (let angulo of angulos) {
      if (!danos[angulo.id]?.foto) {
        setError(`Toma la foto de salida de ${angulo.label}`);
        return;
      }
    }
    if (!ge(slots, fotos)) {
      setError(`Completa las fotos obligatorias de salida`);
      return;
    }
    if (!firmaNombre.trim() || !firma) {
      setError(`Se requiere firma digital y nombre de quien firma`);
      return;
    }
    let fechaCap = resolverFechaCaptura({
      user,
      capturaTardia: capturaTardiaSalida,
      fechaLocal: fechaTardia,
      motivo: motivoCapturaTardiaSalida
    });
    if (fechaCap.error) {
      setError(fechaCap.error);
      return;
    }
    setBusy(true);
    try {
      let relacionados = [];
      if (sel.entrada.placaCaja1) relacionados.push({ placa: sel.entrada.placaCaja1, tipo: `caja` });
      if (sel.entrada.placaCaja2) relacionados.push({ placa: sel.entrada.placaCaja2, tipo: `caja` });
      if (sel.equipo.tipo === `dolly` || sel.entrada.equipoTipo === `dolly`) {
        relacionados.push({ unidadId: sel.equipo.id, placa: sel.equipo.placa, tipo: `dolly` });
      }
      let uuid = cartaPorte.trim().toUpperCase();
      let lic = licencia.trim().toUpperCase();
      let gate = await validarSalidaAntesDeGuardar({
        equipoId: sel.equipo.id,
        placa: sel.equipo.placa,
        relacionados,
        selloCapturado: selloSalida.trim().toUpperCase(),
        kilometros: km === `` ? undefined : Number(km),
        cartaPorteUuid: uuid,
        licenciaFederal: lic,
        llevaRefrigerada: refrigerada || undefined,
        setPoint: refrigerada ? Number(setPoint) : undefined,
        tempReal: refrigerada ? Number(tempReal) : undefined,
        dieselThermo: refrigerada ? Number(dieselThermo) : undefined,
        horometro: refrigerada ? Number(horometro) : undefined,
        overrideMotivo: overrideMotivo.trim() || undefined,
        trasladoTallerExterno: trasladoExterno || undefined,
        consultar: sessionLikelyAvailable()
      });
      if (!gate.ok) {
        setGateLevel(`error`);
        setGateMsg(gate.message);
        setPideAutorizacion(Boolean(gate.puedeAutorizar) || puedeAutorizarSalidaCliente(user));
        return;
      }
      setPideAutorizacion(false);
      if (gate.warning) {
        setGateLevel(`warn`);
        setGateMsg(gate.warning);
      } else {
        setGateMsg(null);
        setGateLevel(null);
      }
      let geo = await ht();
      let fotosEvidencia = slots.filter(s => fotos[s.id]).map(s => ({
        slotId: s.id,
        label: s.label,
        url: fotos[s.id]
      }));
      for (let angulo of angulos) {
        if (danos[angulo.id]?.foto) {
          fotosEvidencia.push({
            slotId: `dano-${angulo.id}`,
            label: `Salida · ${angulo.label}`,
            url: danos[angulo.id].foto
          });
        }
      }
      let entrada = sel.entrada;
      let equipo = sel.equipo;
      let avisoInventario = await onSubmit({
        id: ee(),
        tipo: `salida`,
        yardaId,
        empresaId,
        equipoId: equipo.id,
        placa: equipo.placa,
        numeroEconomico: equipo.numeroEconomico,
        equipoTipo: equipo.tipo,
        fechaHora: fechaCap.fechaHora,
        ...(fechaCap.capturaTardiaMotivo ? {
          capturaTardiaMotivo: fechaCap.capturaTardiaMotivo,
          fechaCapturaDispositivo: fechaCap.fechaCapturaDispositivo
        } : {}),
        operador: operador.trim(),
        chofer: entrada.chofer,
        whatsapp: entrada.whatsapp,
        cliente: entrada.cliente,
        origen: entrada.origen,
        destino: entrada.destino,
        placaCamionTrasera: entrada.placaCamionTrasera,
        placaCaja1: entrada.placaCaja1,
        placaCaja2: entrada.placaCaja2,
        kilometros: km ? Number(km) : null,
        dieselPorcentaje: dieselPct !== `` ? Number(dieselPct) : null,
        dieselLitros: dieselL !== `` ? Number(dieselL) : null,
        checklist: entrada.checklist ?? [],
        fotos: fotosEvidencia.map(e => e.url),
        fotosEvidencia,
        condicionGeneral: condicion,
        selloNumero: selloSalida.trim().toUpperCase() || undefined,
        selloCapturado: selloSalida.trim().toUpperCase(),
        selloCoincideEntrada: null,
        observaciones: (() => {
          let texto = obs.trim();
          if (!fechaCap.nota) return texto || undefined;
          return texto ? `${texto}\n${fechaCap.nota}` : fechaCap.nota;
        })(),
        firmaNombre: firmaNombre.trim(),
        firmaUrl: firma,
        geoLat: geo?.lat ?? null,
        geoLng: geo?.lng ?? null,
        cumplimiento: {
          cartaPorteUuid: uuid,
          licenciaFederal: lic,
          salidaCorta: true,
          salidaFuerte: true,
          validadoGate: false,
          ...(fechaCap.capturaTardiaMotivo ? {
            capturaTardiaMotivo: fechaCap.capturaTardiaMotivo,
            fechaCapturaDispositivo: fechaCap.fechaCapturaDispositivo
          } : {}),
          danos: angulos.map(a => ({
            angulo: a.id,
            estado: normalizarEstadoDano(danos[a.id]?.estado)
          }))
        },
        defectos: angulos.filter(a => normalizarEstadoDano(danos[a.id]?.estado) === `DANO_NUEVO`).map(a => ({
          angulo: a.id,
          tipo: `DANO_NUEVO`,
          slotId: `dano-${a.id}`,
          otId: danos[a.id]?.otId || ``,
          fotos: []
        })),
        cartaPorteUuid: uuid,
        licenciaFederal: lic,
        overrideMotivo: overrideMotivo.trim() || undefined,
        trasladoTallerExterno: trasladoExterno || undefined,
        zona: zonaSlotCap.zona.trim() || undefined,
        slot: zonaSlotCap.slot.trim() || undefined,
        llevaRefrigerada: refrigerada || undefined,
        refrigerada: refrigerada ? {
          ...entrada.refrigerada,
          setPoint: Number(setPoint),
          temperaturaReal: Number(tempReal),
          dieselThermo: Number(dieselThermo),
          horometroThermo: Number(horometro)
        } : undefined,
        creadoEn: new Date().toISOString()
      });
      A(yardaId);
      se(empresaId);
      if (avisoInventario) {
        setGateLevel(`warn`);
        setGateMsg(avisoInventario);
      }
      setOkMsg(`Salida registrada: ${equipo.placa} · ciclo cerrado`);
      setTimeout(() => onDone(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : `No se pudo guardar la salida`);
    } finally {
      setBusy(false);
    }
  }
  return <form className={`form-panel`} id={`salida-corta-form`} onSubmit={e => void onSave(e)}>{createPortal(<div className={`sticky-save-bar`}><button type={`button`} className={`btn primary sticky-save`} disabled={busy} onClick={() => document.getElementById(`salida-corta-form`)?.requestSubmit()}>{busy ? `Guardando…` : `Guardar salida`}</button></div>, document.body)}<div className={`form-head`}><h1>{`Registrar salida a ruta`}</h1><p>{`Salida fuerte: sello ciego, licencia y daños. Carta Porte es opcional. El sello de la entrada no se muestra.`}</p></div><fieldset className={`fieldset`}><legend>{`Empresa`}</legend><div className={`seg big wrap`}>{ie.map(emp => <button type={`button`} className={empresaId === emp.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => {
        setEmpresaId(emp.id);
        se(emp.id);
        setSelectedId(null);
        setPlacaText(``);
        setError(null);
      }} key={emp.id}>{emp.nombre}</button>)}</div></fieldset><fieldset className={`fieldset`}><legend>{`Yarda`}</legend><div className={`seg big wrap`}>{_e.map(y => <button type={`button`} className={yardaId === y.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => {
        setYardaId(y.id);
        A(y.id);
        setSelectedId(null);
        setPlacaText(``);
        setError(null);
      }} key={y.id}>{y.nombre}</button>)}</div></fieldset><fieldset className={`fieldset`}><legend>{`Placa *`}</legend><label className={`field`}><span>{`Placa de la unidad`}</span><input className={`input`} value={placaText} onChange={e => aplicarPlacaSalida(e.target.value)} placeholder={`Placa sin guiones`} autoComplete={`off`} required={true} /><PlacaQuickOcr slotId={`salida-placa`} label={`Tomar foto y leer placa`} onPlaca={placa => aplicarPlacaSalida(placa)} /></label><p className={`hint`}>{`Toma la foto de la placa (Plate Recognizer / Vision) o elige una unidad en patio.`}</p></fieldset><div className={`quick-picks`}><p className={`label`}>{`Unidades en patio · `}{_e.find(y => y.id === yardaId)?.nombre}</p>{enPatio.length === 0 ? <p className={`empty`}>{`No hay unidades en ciclo/parado en esta yarda. Registra primero una entrada.`}</p> : <div className={`chip-row`}>{enPatio.map(row => <button type={`button`} className={selectedId === row.equipo.id ? `chip on` : `chip`} onClick={() => pickUnit(row)} key={row.equipo.id}>{row.equipo.placa}{row.equipo.numeroEconomico ? ` · ${row.equipo.numeroEconomico}` : ``}</button>)}</div>}</div>{sel && <div className={`banner info`} style={{
      marginTop: 12
    }}><strong>{sel.equipo.placa}</strong>{sel.equipo.numeroEconomico ? ` · eco ${sel.equipo.numeroEconomico}` : ``}{sel.entrada.chofer ? ` · chofer ${sel.entrada.chofer}` : ``}{` · llegó `}{kn(sel.entrada.fechaHora)}{refrigerada ? ` · caja refrigerada` : ``}</div>}{placaText && !sel && <p className={`banner warn`}>{`La placa ${placaText} no tiene entrada abierta en ${_e.find(y => y.id === yardaId)?.nombre || yardaId}.`}</p>}<fieldset className={`fieldset`}><legend>{`Caseta`}</legend><label className={`field`}><span>{`Operador de patio *`}</span><input className={`input`} value={operador} onChange={e => setOperador(e.target.value)} placeholder={`Quién registra la salida`} required={true} /></label><div className={`field`}><span>{`Fecha y hora`}</span><p className={`hint`} data-field={`fecha-hora`}>{kn(abiertoEnSalida)}</p></div>{puedeCapturaTardia(user) && <div className={`field`} data-field={`captura-tardia`}><label className={`check-inline`}><input type={`checkbox`} checked={capturaTardiaSalida} onChange={ev => setCapturaTardiaSalida(ev.target.checked)} />{`Captura tardía`}</label>{capturaTardiaSalida && <l.Fragment><label className={`field`}><span>{`Fecha y hora reales`}</span><input className={`input`} type={`datetime-local`} value={fechaTardia} onChange={ev => setFechaTardia(ev.target.value)} /></label><label className={`field`}><span>{`Motivo *`}</span><textarea className={`input textarea`} rows={2} value={motivoCapturaTardiaSalida} onChange={ev => setMotivoCapturaTardiaSalida(ev.target.value)} placeholder={`Por qué se registra después`} /></label></l.Fragment>}</div>}</fieldset>{sel && <fieldset className={`fieldset`}><legend>{`Sello ciego`}</legend><p className={`hint`}>{textoAyudaSelloCiego()}</p><label className={`field`}><span>{`Sello de salida`}{pideSello ? ` *` : ``}</span><input className={`input`} name={`sello-captura-salida`} autoComplete={`off`} value={selloSalida} onChange={e => setSelloSalida(e.target.value.toUpperCase())} placeholder={`Lee el sello en la puerta`} /></label></fieldset>}{sel && <fieldset className={`fieldset`}><legend>{`Documentos de salida`}</legend><div className={`grid-2`}><label className={`field`}><span>{`Carta Porte UUID (opcional)`}</span><input className={`input`} value={cartaPorte} onChange={e => setCartaPorte(e.target.value.toUpperCase())} placeholder={`XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`} autoComplete={`off`} /></label><label className={`field`}><span>{`Licencia federal *`}</span><input className={`input`} value={licencia} onChange={e => setLicencia(e.target.value.toUpperCase())} placeholder={`Número de licencia SCT/SICT`} autoComplete={`off`} required={true} /></label></div>{cartaPorte && !uuidCartaPorteValido(cartaPorte) && <p className={`field-error`}>{`El UUID no tiene formato de folio fiscal.`}</p>}{licencia && !licenciaFederalValida(licencia) && <p className={`field-error`}>{`La licencia debe tener de 8 a 20 caracteres.`}</p>}</fieldset>}{sel && <fieldset className={`fieldset`}><legend>{`Kilómetros y diésel`}</legend><p className={`hint`}>{`No se copian de la entrada. Si capturas kilómetros, no pueden ser menores al último registro.`}{sel.entrada.kilometros != null ? ` Último km: ${sel.entrada.kilometros}.` : ``}</p><div className={`grid-3`}><label className={`field`}><span>{`Kilómetros`}</span><input className={`input`} type={`number`} min={0} value={km} onChange={e => setKm(e.target.value)} placeholder={`Km al salir`} autoComplete={`off`} /></label><label className={`field`}><span>{`Diésel %`}</span><input className={`input`} type={`number`} min={0} max={100} value={dieselPct} onChange={e => setDieselPct(e.target.value)} placeholder={`%`} autoComplete={`off`} /></label><label className={`field`}><span>{`Diésel litros`}</span><input className={`input`} type={`number`} min={0} step={0.1} value={dieselL} onChange={e => setDieselL(e.target.value)} placeholder={`L`} autoComplete={`off`} /></label></div>{dieselDelta != null && dieselDelta <= -15 && <p className={`banner warn`} style={{
          marginTop: 10
        }}>{`Merma de diésel: ${dieselDelta.toFixed(0)}% vs entrada (${sel.entrada.dieselPorcentaje}% → ${dieselPct}%).`}</p>}</fieldset>}{refrigerada && <fieldset className={`fieldset`}><legend>{`Thermo / caja refrigerada`}</legend><div className={`grid-2`}><label className={`field`}><span>{`Set point (°C) *`}</span><input className={`input`} type={`number`} step={0.1} value={setPoint} onChange={e => setSetPoint(e.target.value)} placeholder={`Ej. 2`} required={true} /></label><label className={`field`}><span>{`Temperatura real (°C) *`}</span><input className={`input`} type={`number`} step={0.1} value={tempReal} onChange={e => setTempReal(e.target.value)} placeholder={`Display`} required={true} /></label><label className={`field`}><span>{`Diésel Thermo (%) *`}</span><input className={`input`} type={`number`} min={0} max={100} step={1} value={dieselThermo} onChange={e => setDieselThermo(e.target.value)} placeholder={`0 a 100`} required={true} /></label><label className={`field`}><span>{`Horómetro *`}</span><input className={`input`} type={`number`} min={0} step={0.1} value={horometro} onChange={e => setHorometro(e.target.value)} placeholder={`Horas`} required={true} /></label></div>{thermoAviso && <p className={`banner warn`} style={{
        marginTop: 10
      }}>{thermoAviso}</p>}</fieldset>}<fieldset className={`fieldset`}><legend>{`Condición al salir`}</legend><div className={`seg big`}>{[`buena`, `regular`, `mala`].map(c => <button type={`button`} className={condicion === c ? `seg-btn ${c === `buena` ? `on-ok` : c === `regular` ? `on-warn` : `on-bad`}` : `seg-btn`} onClick={() => setCondicion(c)} key={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</button>)}</div></fieldset>{sel && <fieldset className={`fieldset`}><legend>{`Daños · antes y después`}</legend><p className={`hint`}>{`Compara la foto de entrada con la de ahora. Marca sin cambio o daño nuevo.`}</p><div className={`dano-grid`}>{angulos.map(a => {
        let marca = danos[a.id] || {};
        let estado = normalizarEstadoDano(marca.estado);
        return <article className={`dano-card`} key={a.id}><div><p className={`label`}>{`Entrada · `}{a.label}</p>{a.entradaUrl ? <img src={a.entradaUrl} alt={`Entrada ${a.label}`} /> : <div className={`dano-ph`}>{`Sin foto de entrada`}</div>}</div><div><p className={`label`}>{`Salida · `}{a.label}</p>{marca.foto ? <img src={marca.foto} alt={`Salida ${a.label}`} /> : <div className={`dano-ph`}>{`Toma la foto de ahora`}</div>}<button type={`button`} className={`btn soft`} style={{
              marginTop: 8
            }} onClick={() => document.getElementById(`dano-file-${a.id}`)?.click()}>{marca.foto ? `Retomar` : `Tomar foto`}</button><input id={`dano-file-${a.id}`} type={`file`} accept={`image/*`} capture={`environment`} hidden={true} onChange={e => {
              void tomarDano(a.id, e.target.files?.[0]);
              e.target.value = ``;
            }} /></div><div className={`dano-actions`}><div className={`seg`}><button type={`button`} className={estado === `SIN_CAMBIO` ? `seg-btn on-ok` : `seg-btn`} onClick={() => marcarDano(a.id, `SIN_CAMBIO`)}>{`Sin cambio`}</button><button type={`button`} className={estado === `DANO_NUEVO` ? `seg-btn on-bad` : `seg-btn`} onClick={() => marcarDano(a.id, `DANO_NUEVO`)}>{`Daño nuevo`}</button></div>{estado === `DANO_NUEVO` && puedeAbrirOtCliente(user) && <button type={`button`} className={`btn primary`} disabled={otBusy === a.id || Boolean(marca.otId)} onClick={() => void abrirOt(a)}>{otBusy === a.id ? `Abriendo OT…` : marca.otId ? `OT ${marca.otFolio || `ligada`}` : `Crear OT correctiva`}</button>}{estado === `DANO_NUEVO` && onPromptOt && <button type={`button`} className={`text-btn`} onClick={() => onPromptOt({
              unidadId: sel.equipo.id,
              placa: sel.equipo.placa,
              tipo: `CORRECTIVO`,
              motivo: `Daño nuevo en ${a.label} detectado al salir`,
              yarda: yardaId,
              origen: `dano-salida`
            })}>{`Abrir en Taller`}</button>}{marca.otMsg && <p className={`hint`}>{marca.otMsg}</p>}</div></article>;
      })}</div></fieldset>}<fieldset className={`fieldset`}><legend>{`Fotos de salida`}</legend><GuidedPhotos slots={slots} captured={fotos} onChange={setFotos} /></fieldset><fieldset className={`fieldset`}><legend>{`Firma digital`}</legend><FirmaCanvas value={firma} onChange={setFirma} signerName={firmaNombre} onSignerNameChange={setFirmaNombre} /><p className={`hint`}>{`Al guardar se captura GPS (si el cel lo permite).`}</p></fieldset><fieldset className={`fieldset`}><legend>{`Observaciones`}</legend><textarea className={`input textarea`} rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder={`Daños, incidencias, autorización…`} /></fieldset>{gateMsg && <p className={`banner ${gateLevel === `error` ? `error` : `warn`}`}>{gateMsg}</p>}{gateLevel === `error` && <fieldset className={`fieldset`}><legend>{`Excepción de salida`}</legend><label className={`check-inline`}><input type={`checkbox`} checked={trasladoExterno} onChange={e => setTrasladoExterno(e.target.checked)} />{`Traslado a taller externo`}</label>{(pideAutorizacion || puedeAutorizarSalidaCliente(user)) && <label className={`field`} style={{
        marginTop: 10
      }}><span>{`Motivo de autorización (encargado o admin) *`}</span><textarea className={`input textarea`} rows={2} value={overrideMotivo} onChange={e => setOverrideMotivo(e.target.value)} placeholder={`Escríbelo. Queda en la bitácora.`} /></label>}</fieldset>}{zonaSlotCap.node}{error && <p className={`banner error`}>{error}</p>}{okMsg && <p className={`banner success`}>{okMsg}</p>}<button type={`submit`} className={`btn primary wide`} disabled={busy}>{busy ? `Guardando…` : `Guardar salida y cerrar ciclo`}</button></form>;
}
