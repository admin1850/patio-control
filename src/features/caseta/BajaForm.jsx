/** Baja de un equipo que ya no está en el patio. */
import * as l from "react";
import { createPortal } from "react-dom";
import { v4 as ee } from "uuid";
import PlacaQuickOcr from "../../shared/ui/PlacaQuickOcr.jsx";
import { normalizePlacaMX } from "../../lib/placaOcr.js";
import { _e, ie } from "../../shared/domain/constants.js";
import { A, De, Oe, be, ge, oe, se } from "../../shared/domain/patioModel.js";
import { GuidedPhotos } from "../../shared/ui/GuidedPhotos.jsx";

var Ae = [{
  id: `baja-evidencia`,
  label: `Evidencia del lugar`,
  hint: `Foto del slot vacío o de que la unidad ya no está.`,
  silhouette: `side`,
  required: true
}];

var je = [{
  id: `salio-sin-registrar`,
  label: `Salió sin registrar`
}, {
  id: `no-era-nuestro`,
  label: `No era de nosotros`
}, {
  id: `error-inventario`,
  label: `Error de inventario`
}, {
  id: `otro`,
  label: `Otro`
}];

function Me() {
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

export function BajaForm({
  equipos: e,
  movimientos: t,
  initialPlaca: n = ``,
  onSubmit: r,
  onDone: i
}) {
  let [a, o] = (0, l.useState)(() => be());
  let [s, c] = (0, l.useState)(() => oe());
  let [u, d] = (0, l.useState)(n);
  let [f, p] = (0, l.useState)(`salio-sin-registrar`);
  let [m, h] = (0, l.useState)(``);
  let [g, _] = (0, l.useState)(``);
  let [v, y] = (0, l.useState)({});
  let [b, x] = (0, l.useState)(null);
  let [S, C] = (0, l.useState)(null);
  let [w, te] = (0, l.useState)(false);
  async function T(n) {
    n.preventDefault();
    x(null);
    C(null);
    if (!u.trim()) {
      x(`Indica la placa a dar de baja`);
      return;
    }
    if (!g.trim()) {
      x(`Indica quién registra la baja`);
      return;
    }
    if (f === `otro` && m.trim().length < 3) {
      x(`Describe el motivo`);
      return;
    }
    if (!ge(Ae, v)) {
      x(`Toma la foto de evidencia`);
      return;
    }
    let o = De({
      equipos: e
    }, u);
    if (!o) {
      x(`No hay equipo con esa placa en el catálogo`);
      return;
    }
    let c = Oe(t, o.id);
    if (c?.tipo !== `entrada` && c?.tipo !== `parado`) {
      x(`Esa placa no está en patio`);
      return;
    }
    te(true);
    try {
      let e = await Me();
      let t = Ae.filter(e => v[e.id]).map(e => ({
        slotId: e.id,
        label: e.label,
        url: v[e.id]
      }));
      let n = f === `otro` ? m.trim() : je.find(e => e.id === f)?.label ?? f;
      let c = {
        id: ee(),
        tipo: `baja`,
        yardaId: a,
        empresaId: s,
        equipoId: o.id,
        placa: o.placa,
        numeroEconomico: o.numeroEconomico,
        equipoTipo: o.tipo,
        fechaHora: new Date().toISOString(),
        operador: g.trim(),
        checklist: [],
        fotos: t.map(e => e.url),
        fotosEvidencia: t,
        condicionGeneral: `regular`,
        observaciones: `Baja de inventario: ${n}`,
        motivoParoOtro: n,
        kilometros: null,
        dieselPorcentaje: null,
        dieselLitros: null,
        geoLat: e?.lat ?? null,
        geoLng: e?.lng ?? null,
        creadoEn: new Date().toISOString()
      };
      A(a);
      se(s);
      await r(c);
      C(`${o.placa} baja de inventario · ya no cuenta en patio.`);
      setTimeout(() => i(), 1200);
    } catch (e) {
      x(e instanceof Error ? e.message : `No se pudo guardar`);
    } finally {
      te(false);
    }
  }
  return <form className={`form-panel`} id={`baja-form`} onSubmit={e => void T(e)}>{(0, createPortal)(<div className={`sticky-save-bar`}><button type={`button`} className={`btn primary sticky-save`} disabled={w} onClick={() => {
        document.getElementById(`baja-form`)?.requestSubmit();
      }}>{w ? `Guardando…` : `Guardar cambios`}</button></div>, document.body)}<div className={`form-head`}><h1>{`Baja de inventario`}</h1><p>{`La unidad ya no está en yarda (salió sin registrar, no era nuestra, error). Requiere foto y motivo.`}</p></div><fieldset className={`fieldset`}><legend>{`Empresa / Yarda`}</legend><div className={`seg wrap`}>{ie.map(e => <button type={`button`} className={s === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => c(e.id)} key={e.id}>{e.nombre}</button>)}</div><div className={`seg wrap`} style={{
        marginTop: 8
      }}>{_e.map(e => <button type={`button`} className={a === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => o(e.id)} key={e.id}>{e.nombre}</button>)}</div></fieldset><fieldset className={`fieldset`}><legend>{`Placa *`}</legend><input className={`input`} value={u} onChange={e => d(normalizePlacaMX(e.target.value))} placeholder={`Placa sin guiones`} required={true} /><PlacaQuickOcr slotId={`placa`} label={`Tomar foto y leer placa`} onPlaca={placa => d(normalizePlacaMX(placa))} /></fieldset><fieldset className={`fieldset`}><legend>{`Motivo *`}</legend><div className={`tipo-checks`}>{je.map(e => <label className={`tipo-check${f === e.id ? ` on` : ``}`} key={e.id}><input type={`radio`} name={`motivoBaja`} checked={f === e.id} onChange={() => p(e.id)} /><span className={`tipo-box`} aria-hidden={`true`} /><span className={`tipo-text`}>{e.label}</span></label>)}</div>{f === `otro` && <input className={`input`} style={{
        marginTop: 10
      }} value={m} onChange={e => h(e.target.value)} placeholder={`Describe el motivo`} required={true} />}</fieldset><fieldset className={`fieldset`}><legend>{`Quién registra *`}</legend><input className={`input`} value={g} onChange={e => _(e.target.value)} placeholder={`Nombre de caseta`} required={true} /></fieldset><fieldset className={`fieldset`}><legend>{`Foto evidencia *`}</legend><GuidedPhotos slots={Ae} captured={v} onChange={y} /></fieldset>{b && <p className={`banner error`}>{b}</p>}{S && <p className={`banner success`}>{S}</p>}<button type={`submit`} className={`btn primary wide`} disabled={w}>{w ? `Guardando…` : `Confirmar baja`}</button></form>;
}
