/** Registro de equipo parado en yarda. */
import * as l from "react";
import { createPortal } from "react-dom";
import { v4 as ee } from "uuid";
import PlacaQuickOcr from "../../shared/ui/PlacaQuickOcr.jsx";
import { applyPlacaOcrToForm, normalizePlacaMX } from "../../lib/placaOcr.js";
import { useZonaSlotFields } from "./ZonaSlotFields.jsx";
import { F, _e, ie } from "../../shared/domain/constants.js";
import { A, De, Oe, _t, be, ge, oe, se } from "../../shared/domain/patioModel.js";
import { GuidedPhotos } from "../../shared/ui/GuidedPhotos.jsx";

var vt = [{
  id: `parado-placa`,
  label: `Placa`,
  hint: `Placa legible, de frente.`,
  silhouette: `plate`,
  required: true
}, {
  id: `parado-general`,
  label: `Vista general`,
  hint: `Unidad completa en el patio / slot.`,
  silhouette: `side`,
  required: true
}, {
  id: `parado-sello`,
  label: `Sello o puertas`,
  hint: `Sello de seguridad o puertas de la caja.`,
  silhouette: `seal`,
  required: true
}, {
  id: `parado-general-1`,
  label: `Foto general 1`,
  hint: `Otro ángulo o detalle de la unidad en patio.`,
  silhouette: `side`,
  required: true
}, {
  id: `parado-general-2`,
  label: `Foto general 2`,
  hint: `Otro ángulo o detalle de la unidad en patio.`,
  silhouette: `front`,
  required: true
}, {
  id: `parado-general-3`,
  label: `Foto general 3`,
  hint: `Otro ángulo o detalle de la unidad en patio.`,
  silhouette: `rear`,
  required: true
}, {
  id: `parado-general-4`,
  label: `Foto general 4`,
  hint: `Otro ángulo o detalle de la unidad en patio.`,
  silhouette: `side`,
  required: true
}];

function yt() {
  let e = new Date();
  let t = e => String(e).padStart(2, `0`);
  return `${e.getFullYear()}-${t(e.getMonth() + 1)}-${t(e.getDate())}`;
}

function bt() {
  return new Promise(e => {
    if (!navigator.geolocation) {
      e(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(t => e({
      lat: t.coords.latitude,
      lng: t.coords.longitude
    }), () => e(null), {
      enableHighAccuracy: true,
      timeout: 8000
    });
  });
}

export function ParadoForm({
  equipos: e,
  movimientos: t,
  initialPlaca: n = ``,
  onSaveEquipo: r,
  onSubmit: i,
  onDone: a,
  onPromptOt
}) {
  let [o, s] = (0, l.useState)(() => be());
  let [c, u] = (0, l.useState)(() => oe());
  let [d, f] = (0, l.useState)(true);
  let [p, m] = (0, l.useState)(false);
  let [h, g] = (0, l.useState)(false);
  let [_, v] = (0, l.useState)(false);
  let [y, b] = (0, l.useState)(n);
  let [x, S] = (0, l.useState)(``);
  let [C, w] = (0, l.useState)(`espera-carga`);
  let [te, T] = (0, l.useState)(``);
  let [O, re] = (0, l.useState)(yt());
  let [desdeNoSe, setDesdeNoSe] = (0, l.useState)(false);
  let [ae, k] = (0, l.useState)(`buena`);
  let [ce, le] = (0, l.useState)(``);
  let [ue, de] = (0, l.useState)(``);
  let [fe, pe] = (0, l.useState)(``);
  let [me, he] = (0, l.useState)(``);
  let [ve, ye] = (0, l.useState)({});
  let [j, xe] = (0, l.useState)(null);
  let [Se, Ce] = (0, l.useState)(null);
  let [M, we] = (0, l.useState)(false);
  let [N, Te] = (0, l.useState)(false);
  let [otPrompt, setOtPrompt] = (0, l.useState)(null);
  let [fechaEstimadaSalida, setFechaEstimadaSalida] = (0, l.useState)(``);
  let [sinFechaSalida, setSinFechaSalida] = (0, l.useState)(false);
  let zonaSlotCap = useZonaSlotFields();
  let Ee = d ? `camion` : h && !p && !_ ? `dolly` : p || _ ? `caja` : `camion`;
  let ke = (0, l.useMemo)(() => y.trim() ? De({
    equipos: e
  }, y) : undefined, [e, y]);
  let Ae = ke ? Oe(t, ke.id) : undefined;
  let je = Ae?.tipo === `entrada`;
  let Me = Ae?.tipo === `parado`;
  async function Ne(e) {
    e.preventDefault();
    xe(null);
    Ce(null);
    if (!y.trim()) {
      xe(`La placa es obligatoria`);
      return;
    }
    if (!d && !p && !h && !_) {
      xe(`Selecciona al menos un tipo de equipo`);
      return;
    }
    if (!C) {
      xe(`Indica el motivo de paro`);
      return;
    }
    if (C === `otro` && te.trim().length < 3) {
      xe(`Describe el motivo (Otro)`);
      return;
    }
    let pideOtCheck = C === `taller` || C === `thermo`;
    if (!pideOtCheck && !sinFechaSalida && !fechaEstimadaSalida) {
      xe(`Indica la fecha estimada de salida del patio, o marca que no tiene fecha`);
      return;
    }
    if (!desdeNoSe && !O) {
      xe(`Indica desde cuándo está ahí, o marca que no lo sabes`);
      return;
    }
    if (!ce.trim()) {
      xe(`Indica quién inventaría (caseta)`);
      return;
    }
    if (!ge(vt, ve)) {
      xe(`Completa las 7 fotos: placa, vista general, sello/puertas y 4 generales`);
      return;
    }
    if (je && !N) {
      xe(`Esta placa ya está en ciclo (entrada abierta). Confirma si la pasas a parado.`);
      return;
    }
    we(true);
    try {
      let e = await bt();
      let t = ke;
      if (t) {
        if (t.tipo !== Ee || x.trim() && t.numeroEconomico !== x.trim()) {
          t = {
            ...t,
            tipo: Ee,
            numeroEconomico: x.trim() || t.numeroEconomico
          };
          void Promise.resolve(r(t)).catch(() => {});
        }
      } else {
        t = {
          id: ee(),
          tipo: Ee,
          placa: normalizePlacaMX(y),
          numeroEconomico: x.trim() || normalizePlacaMX(y),
          creadoEn: new Date().toISOString()
        };
        void Promise.resolve(r(t)).catch(() => {});
      }
      let n = vt.filter(e => ve[e.id]).map(e => ({
        slotId: e.id,
        label: e.label,
        url: ve[e.id]
      }));
      let s = desdeNoSe ? null : new Date(`${O}T12:00:00`).toISOString();
      let l = {
        id: ee(),
        tipo: `parado`,
        yardaId: o,
        empresaId: c,
        equipoId: t.id,
        placa: normalizePlacaMX(t.placa),
        numeroEconomico: t.numeroEconomico,
        equipoTipo: t.tipo,
        fechaHora: new Date().toISOString(),
        operador: ce.trim(),
        checklist: [],
        fotos: n.map(e => e.url),
        fotosEvidencia: n,
        condicionGeneral: ae,
        selloNumero: fe.trim().toUpperCase() || undefined,
        observaciones: me.trim() || undefined,
        motivoParo: C,
        motivoParoOtro: C === `otro` && te.trim() || undefined,
        paradoDesde: s || undefined,
        paradoDesdeDesconocido: desdeNoSe ? true : undefined,
        fechaEstimadaSalida: !(C === `taller` || C === `thermo`) && !sinFechaSalida && fechaEstimadaSalida
          ? new Date(`${fechaEstimadaSalida}T12:00:00`).toISOString()
          : undefined,
        sinFechaEstimadaSalida: !(C === `taller` || C === `thermo`) && sinFechaSalida ? true : undefined,
        zonaSlot: [zonaSlotCap.zona, zonaSlotCap.slot].filter(Boolean).join(` `) || ue.trim() || undefined,
        zona: zonaSlotCap.zona.trim() || undefined,
        slot: zonaSlotCap.slot.trim() || undefined,
        llevaRefrigerada: _ || undefined,
        kilometros: null,
        dieselPorcentaje: null,
        dieselLitros: null,
        geoLat: e?.lat ?? null,
        geoLng: e?.lng ?? null,
        creadoEn: new Date().toISOString()
      };
      A(o);
      se(c);
      let avisoInventario = await i(l);
      if (avisoInventario) xe(avisoInventario);
      let u = _t(C, te);
      let yardaNombre = _e.find(e => e.id === o)?.nombre ?? o;
      let pideOt = C === `taller` || C === `thermo`;
      if (pideOt) {
        let fotosOt = n.map(item => item.url).filter(Boolean);
        setOtPrompt({
          unidadId: t.id,
          placa: t.placa,
          yarda: o,
          tipo: C === `thermo` ? `THERMO` : `CORRECTIVO`,
          motivo: me.trim() || u,
          movimientoOrigenId: l.id,
          fotosAntesJson: fotosOt,
          zonaSlot: ue.trim() || ``
        });
        Ce(`${t.placa} queda en ${yardaNombre} como PARADO · ${u}. Motivo de taller o fallas: abre o enlaza la orden de trabajo. El ETR es obligatorio.`);
      } else {
        setOtPrompt(null);
        Ce(`${t.placa} queda en ${yardaNombre} como PARADO · ${u}. No cuenta como entrada de hoy.`);
        setTimeout(() => a(), 1400);
      }
    } catch (e) {
      xe(e instanceof Error ? e.message : `No se pudo guardar`);
    } finally {
      we(false);
    }
  }
  return <form className={`form-panel`} id={`parado-form`} onSubmit={e => void Ne(e)}>{(0, createPortal)(<div className={`sticky-save-bar`}><button type={`button`} className={`btn primary sticky-save`} disabled={M} onClick={() => {
        document.getElementById(`parado-form`)?.requestSubmit();
      }}>{M ? `Guardando…` : `Guardar cambios`}</button></div>, document.body)}<div className={`form-head`}><h1>{`Inventariar equipo parado`}</h1><p>{`Unidad que está en yarda sin viaje de entrada ni salida. No es un arribo: es un conteo.`}</p></div><fieldset className={`fieldset`}><legend>{`Empresa`}</legend><div className={`seg wrap`}>{ie.map(e => <button type={`button`} className={c === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => u(e.id)} key={e.id}>{e.nombre}</button>)}</div></fieldset><fieldset className={`fieldset`}><legend>{`Yarda`}</legend><div className={`seg wrap`}>{_e.map(e => <button type={`button`} className={o === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => s(e.id)} key={e.id}>{e.nombre}</button>)}</div></fieldset><fieldset className={`fieldset`}><legend>{`Equipo`}</legend><div className={`field`}><span className={`label`}>{`Tipo (marca uno o varios)`}</span><div className={`tipo-checks`}><label className={`tipo-check${d ? ` on` : ``}`}><input type={`checkbox`} checked={d} onChange={e => f(e.target.checked)} /><span className={`tipo-box`} aria-hidden={`true`} /><span className={`tipo-text`}>{`Camión/Tracto`}</span></label><label className={`tipo-check${p ? ` on` : ``}`}><input type={`checkbox`} checked={p} onChange={e => m(e.target.checked)} /><span className={`tipo-box`} aria-hidden={`true`} /><span className={`tipo-text`}>{`Caja Encortinada`}</span></label><label className={`tipo-check${h ? ` on` : ``}`}><input type={`checkbox`} checked={h} onChange={e => g(e.target.checked)} /><span className={`tipo-box`} aria-hidden={`true`} /><span className={`tipo-text`}>{`Dolly`}</span></label><label className={`tipo-check${_ ? ` on` : ``}`}><input type={`checkbox`} checked={_} onChange={e => v(e.target.checked)} /><span className={`tipo-box`} aria-hidden={`true`} /><span className={`tipo-text`}>{`Caja Refrigerada`}</span></label></div></div><div className={`grid-2`} style={{
        marginTop: 12
      }}><label className={`field`}><span>{`Placa *`}</span><input className={`input`} value={y} onChange={e => {
            b(normalizePlacaMX(e.target.value));
            Te(false);
          }} placeholder={`Placa sin guiones`} required={true} /><PlacaQuickOcr slotId={`parado-placa`} label={`Tomar foto y leer placa`} onPlaca={placa => {
            b(normalizePlacaMX(placa));
            Te(false);
          }} /></label><label className={`field`}><span>{`No. económico`}</span><input className={`input`} value={x} onChange={e => S(e.target.value)} placeholder={`ECO-045`} /></label></div>{je && <div className={`banner warn`} style={{
        marginTop: 12
      }}>{`Ya está en ciclo (entrada abierta).`}{` `}<label className={`check-inline`} style={{
          marginTop: 8
        }}><input type={`checkbox`} checked={N} onChange={e => Te(e.target.checked)} />{`Pasarla a parado (cierra el ciclo de viaje)`}</label></div>}{Me && <p className={`hint`} style={{
        marginTop: 8
      }}>{`Ya figura como parado: este guardado actualiza el inventario (re-inventario).`}</p>}</fieldset><fieldset className={`fieldset`}><legend>{`Motivo de paro *`}</legend><div className={`tipo-checks`}>{F.map(e => <label className={`tipo-check${C === e.id ? ` on` : ``}`} key={e.id}><input type={`radio`} name={`motivoParo`} checked={C === e.id} onChange={() => w(e.id)} /><span className={`tipo-box`} aria-hidden={`true`} /><span className={`tipo-text`}>{e.label}</span></label>)}</div>{C === `otro` && <label className={`field`} style={{
        marginTop: 12
      }}><span>{`Describe el motivo *`}</span><input className={`input`} value={te} onChange={e => T(e.target.value)} placeholder={`Motivo`} required={true} /></label>}{C && C !== `taller` && C !== `thermo` && <div style={{
        marginTop: 12
      }}><label className={`field`}><span>{sinFechaSalida ? `Fecha estimada de salida` : `Fecha estimada de salida *`}</span><input className={`input`} type={`date`} value={fechaEstimadaSalida} onChange={e => {
            setFechaEstimadaSalida(e.target.value);
            if (e.target.value) setSinFechaSalida(false);
          }} required={!sinFechaSalida} disabled={sinFechaSalida} /></label><label className={`check-inline`} style={{
          marginTop: 10,
          display: `flex`
        }}><input type={`checkbox`} checked={sinFechaSalida} onChange={e => {
            let on = e.target.checked;
            setSinFechaSalida(on);
            if (on) setFechaEstimadaSalida(``);
          }} />{`No tiene fecha de salida`}</label></div>}</fieldset><fieldset className={`fieldset`}><legend>{`Detalle`}</legend><div className={`grid-2`}><label className={`field`}><span>{desdeNoSe ? `Desde cuándo está ahí` : `Desde cuándo está ahí *`}</span><input className={`input`} type={`date`} value={O} onChange={e => {
            re(e.target.value);
            if (e.target.value) setDesdeNoSe(false);
          }} required={!desdeNoSe} disabled={desdeNoSe} /><label className={`check-inline`} style={{
            marginTop: 10,
            display: `flex`
          }}><input type={`checkbox`} checked={desdeNoSe} onChange={e => {
              let on = e.target.checked;
              setDesdeNoSe(on);
              if (on) re(``);
              else re(yt());
            }} />{`No lo sé`}</label></label><div className={`field`}><span className={`label`}>{`Condición *`}</span><div className={`seg wrap`} style={{
            marginTop: 6
          }}>{[`buena`, `regular`, `mala`].map(e => <button type={`button`} className={ae === e ? `seg-btn ${e === `buena` ? `on-ok` : e === `regular` ? `on-warn` : `on-bad`}` : `seg-btn`} onClick={() => k(e)} key={e}>{e === `buena` ? `Buena` : e === `regular` ? `Regular` : `Mala`}</button>)}</div></div><label className={`field`}><span>{`Quién inventaría (caseta) *`}</span><input className={`input`} value={ce} onChange={e => le(e.target.value)} placeholder={`Nombre`} required={true} /></label>{zonaSlotCap.node}<label className={`field`}><span>{`Zona o slot`}</span><input className={`input`} value={ue} onChange={e => de(e.target.value)} placeholder={`Andén 2, fondo norte…`} /></label><label className={`field`}><span>{`Sello actual`}</span><input className={`input`} value={fe} onChange={e => pe(e.target.value.toUpperCase())} placeholder={`Opcional`} /></label></div><label className={`field`} style={{
        marginTop: 12
      }}><span>{`Observación`}</span><textarea className={`input textarea`} rows={2} value={me} onChange={e => he(e.target.value)} placeholder={`Opcional`} /></label></fieldset><fieldset className={`fieldset`}><legend>{`Fotos (7)`}</legend><GuidedPhotos slots={vt} captured={ve} onChange={ye} onPlateOcr={(slotId, placa) => {
          applyPlacaOcrToForm(slotId, placa, {
            setPlaca: b
          });
        }} /></fieldset>{j && <p className={`banner error`}>{j}</p>}{Se && <p className={`banner success`}>{Se}</p>}{otPrompt && <p className={`banner warn`}>{`Esta unidad va a taller. `}<button type={`button`} className={`btn primary`} onClick={() => onPromptOt?.(otPrompt)}>{`Abrir orden de trabajo`}</button></p>}<button type={`submit`} className={`btn primary wide`} disabled={M}>{M ? `Guardando…` : `Sumar a patio`}</button></form>;
}
