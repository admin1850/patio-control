/** Indicadores del patio. */
import * as l from "react";
import KpiMantenimiento from "./KpiMantenimiento.jsx";
import DieselPanel from "./DieselPanel.jsx";
import EstadiasPanel from "./EstadiasPanel.jsx";
import { _e, ie, ye } from "../../shared/domain/constants.js";
import { A, be, k, oe, se, wn } from "../../shared/domain/patioModel.js";

function Tn(e, t, n) {
  let r = e.movimientos.filter(e => (!t || t === `todas` || e.yardaId === t) && (!n || n === `todas` || (e.empresaId ?? `api`) === n));
  let i = wn(r);
  let a = (() => {
    let e = new Map();
    for (let t of r) {
      let n = e.get(t.equipoId);
      if (!n || new Date(t.fechaHora) > new Date(n.fechaHora)) {
        e.set(t.equipoId, t);
      }
    }
    let t = 0;
    for (let n of e.values()) {
      if (n.tipo === `entrada` || n.tipo === `parado`) {
        t++;
      }
    }
    return t;
  })();
  let o = i.map(e => e.dwellHours).sort((e, t) => e - t);
  let s = o.length === 0 ? null : o.reduce((e, t) => e + t, 0) / o.length;
  let c = o.length === 0 ? null : o[Math.min(o.length - 1, Math.floor(o.length * 0.95))];
  let l = i.filter(e => e.danoEntrada).length;
  let u = i.filter(e => e.danoSalida).length;
  let d = i.length === 0 ? null : l / i.length * 100;
  let f = i.length === 0 ? null : u / i.length * 100;
  let p = i.filter(e => e.selloOk !== null);
  let m = p.filter(e => e.selloOk === false).length;
  let h = p.length === 0 ? null : m / p.length * 100;
  let g = i.filter(e => e.dieselDeltaPct != null);
  let _ = g.length === 0 ? null : g.reduce((e, t) => e + Math.abs(t.dieselDeltaPct), 0) / g.length;
  let v = g.filter(e => (e.dieselDeltaPct ?? 0) < -8).length;
  let y = i.filter(e => e.entrada.equipoTipo === `caja` || e.salida.equipoTipo === `caja`);
  let b = y.length === 0 ? null : y.reduce((e, t) => e + t.dwellHours, 0) / y.length;
  let x = r.filter(e => e.cumplimiento?.cartaPorteUuid || e.cumplimiento?.licenciaFederal);
  let S = x.filter(e => e.cumplimiento?.validadoGate).length;
  let C = x.length === 0 ? null : S / x.length * 100;
  return {
    ciclosCerrados: i.length,
    enPatioAhora: a,
    dwellPromedioHoras: s,
    dwellP95Horas: c,
    tasaDanosTransito: d,
    tasaDanosPatio: f,
    discrepanciaSellosPct: h,
    sellosRevisados: p.length,
    fuelDiscrepancyAvgPct: _,
    fuelAlertas: v,
    turnaroundCajasHoras: b,
    cumplimientoGatePct: C
  };
}

function En(e) {
  if (e == null || Number.isNaN(e)) {
    return `—`;
  } else if (e < 1) {
    return `${Math.round(e * 60)} min`;
  } else {
    return `${e.toFixed(1)} h`;
  }
}

function Dn(e) {
  if (e == null || Number.isNaN(e)) {
    return `—`;
  } else {
    return `${e.toFixed(1)}%`;
  }
}

export function KpisPage({
  state: e
}) {
  let [t, n] = (0, l.useState)(() => be());
  let [r, i] = (0, l.useState)(() => oe());
  let a = (0, l.useMemo)(() => Tn(e, t, r), [e, t, r]);
  let o = (0, l.useMemo)(() => wn(e.movimientos, t, r).slice(-12).reverse(), [e, t, r]);
  function s(e) {
    n(e);
    if (e !== `todas`) {
      A(e);
    }
  }
  function c(e) {
    i(e);
    if (e !== `todas`) {
      se(e);
    }
  }
  return <div className={`page`}><div className={`form-head`}><h1>{`KPIs de patio`}</h1><p>{`Gate dwell, daños, sellos, combustible y turnaround · filtro por empresa y yarda.`}</p></div><DieselPanel movimientos={e.movimientos} /><EstadiasPanel /><p className={`label`} style={{
      marginBottom: 6
    }}>{`Empresa`}</p><div className={`seg wrap yard-filter`}><button type={`button`} className={r === `todas` ? `seg-btn on-ok` : `seg-btn`} onClick={() => c(`todas`)}>{`Todas`}</button>{ie.map(e => <button type={`button`} className={r === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => c(e.id)} key={e.id}>{e.nombre}</button>)}</div><p className={`label`} style={{
      margin: `12px 0 6px`
    }}>{`Yarda`}</p><div className={`seg wrap yard-filter`}><button type={`button`} className={t === `todas` ? `seg-btn on-ok` : `seg-btn`} onClick={() => s(`todas`)}>{`Todas`}</button>{_e.map(e => <button type={`button`} className={t === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => s(e.id)} key={e.id}>{e.nombre}</button>)}</div><section className={`stats kpi-grid`}><article className={`stat`}><p className={`stat-label`}>{`Ciclos cerrados`}</p><p className={`stat-value`}>{a.ciclosCerrados}</p><p className={`hint`}>{`En patio ahora: `}{a.enPatioAhora}</p></article><article className={`stat`}><p className={`stat-label`}>{`Gate dwell (prom.)`}</p><p className={`stat-value`}>{En(a.dwellPromedioHoras)}</p><p className={`hint`}>{`P95: `}{En(a.dwellP95Horas)}</p></article><article className={`stat`}><p className={`stat-label`}>{`Daños al arribo`}</p><p className={`stat-value`}>{Dn(a.tasaDanosTransito)}</p><p className={`hint`}>{`Vs despacho: `}{Dn(a.tasaDanosPatio)}</p></article><article className={`stat`}><p className={`stat-label`}>{`Discrepancia sellos`}</p><p className={`stat-value`}>{Dn(a.discrepanciaSellosPct)}</p><p className={`hint`}>{a.sellosRevisados}{` ciclos con sello`}</p></article><article className={`stat`}><p className={`stat-label`}>{`Fuel discrepancy`}</p><p className={`stat-value`}>{Dn(a.fuelDiscrepancyAvgPct)}</p><p className={`hint`}>{a.fuelAlertas}{` alertas (>8% merma)`}</p></article><article className={`stat`}><p className={`stat-label`}>{`Turnaround cajas`}</p><p className={`stat-value`}>{En(a.turnaroundCajasHoras)}</p><p className={`hint`}>{`Tiempo promedio en patio`}</p></article><article className={`stat`}><p className={`stat-label`}>{`Gate cumplimiento`}</p><p className={`stat-value`}>{Dn(a.cumplimientoGatePct)}</p><p className={`hint`}>{`Carta Porte + licencia OK`}</p></article></section><KpiMantenimiento yarda={t} /><section className={`panel`}><div className={`panel-head`}><h2>{`Últimos ciclos`}{r === `todas` ? `` : ` · ${k(r)}`}{t === `todas` ? `` : ` · ${ye(t)}`}</h2></div>{o.length === 0 ? <p className={`empty`}>{`Aún no hay ciclos entrada→salida para calcular KPIs.`}</p> : <ul className={`unit-list`}>{o.map(e => <li className={`unit-row`} key={`${e.entrada.id}-${e.salida.id}`}><div className={`unit-main`}><p className={`unit-placa`}>{e.placa}</p><p className={`unit-meta`}>{k(e.empresaId)}{` · `}{ye(e.yardaId)}{` · dwell`}{` `}{En(e.dwellHours)}{e.selloOk === false ? ` · SELLO NO COINCIDE` : ``}{e.selloOk === true ? ` · sello OK` : ``}</p></div><div className={`unit-side`}><p className={`unit-meta`}>{`Diésel Δ`}{` `}{e.dieselDeltaPct == null ? `—` : `${e.dieselDeltaPct > 0 ? `+` : ``}${e.dieselDeltaPct.toFixed(0)}%`}</p><span className={`pill ${e.danoEntrada || e.danoSalida ? `mala` : `buena`}`}>{e.danoEntrada ? `daño arribo` : e.danoSalida ? `daño salida` : `sin falla`}</span></div></li>)}</ul>}</section></div>;
}
