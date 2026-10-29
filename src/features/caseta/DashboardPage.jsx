/** Inicio del patio: unidades en ciclo y accesos. */
import * as l from "react";
import { fetchEstadoUnidadesOpcional, fetchTableroOpcional } from "../../lib/serverApi.js";
import { LOCAL_READONLY_BANNER, hasServerSession, indexEstadosUnidad, isLocalReadOnly } from "../../lib/patioSync.js";
import { EstatusOperativoChip, MantenimientoBoard } from "../taller/Mantenimiento.jsx";
import LlegadasEsperadas from "./LlegadasEsperadas.jsx";
import { puedeMovimiento, rolLabel, ubicacionLabel } from "../../shared/domain/authProfile.js";
import { _e, ie, ye } from "../../shared/domain/constants.js";
import { A, Oe, Qe, _t, et, k, kn, se, wn } from "../../shared/domain/patioModel.js";

function ke(e, t, n) {
  let r = [];
  for (let i of e.equipos) {
    let a = Oe(e.movimientos, i.id);
    if (a?.tipo === `entrada` || a?.tipo === `parado`) {
      if (t && t !== `todas` && a.yardaId !== t || n && n !== `todas` && (a.empresaId ?? `api`) !== n) {
        continue;
      }
      r.push({
        equipo: i,
        entrada: a,
        estado: a.tipo === `parado` ? `parado` : `en-ciclo`
      });
    }
  }
  return r.sort((e, t) => new Date(t.entrada.fechaHora).getTime() - new Date(e.entrada.fechaHora).getTime());
}

function On(e, t = `todas`, n = `todas`) {
  let r = e.movimientos.filter(e => (t === `todas` || e.yardaId === t) && (n === `todas` || (e.empresaId ?? `api`) === n));
  let i = wn(r);
  let a = [];
  for (let e of i.slice(-30)) {
    if (e.selloOk === false) {
      a.push({
        id: `sello-${e.salida.id}`,
        level: `critical`,
        title: `Sello no coincide · ${e.placa}`,
        detail: `Entrada ${e.entrada.selloNumero ?? `—`} ≠ salida ${e.salida.selloNumero ?? `—`}`,
        when: e.salida.fechaHora
      });
    }
    if (e.dieselDeltaPct != null && e.dieselDeltaPct < -8) {
      a.push({
        id: `fuel-${e.salida.id}`,
        level: `warn`,
        title: `Merma diésel · ${e.placa}`,
        detail: `Δ ${e.dieselDeltaPct.toFixed(0)}% entre entrada y salida`,
        when: e.salida.fechaHora
      });
    }
    if (e.danoEntrada && !e.danoSalida) {
      a.push({
        id: `dano-in-${e.entrada.id}`,
        level: `warn`,
        title: `Daño al arribo · ${e.placa}`,
        detail: `Condición irregular/mala o falla en checklist de entrada`,
        when: e.entrada.fechaHora
      });
    }
  }
  for (let e of r.slice(0, 40)) {
    let t = e.cumplimiento?.bitacoraHorasServicio;
    let n = e.cumplimiento?.bitacoraHorasDescanso;
    if (t != null && t > 14 && (n == null || n < 8)) {
      a.push({
        id: `bit-${e.id}`,
        level: `critical`,
        title: `Bitácora NOM-087 · ${e.placa}`,
        detail: `${t} h servicio / ${n ?? 0} h descanso`,
        when: e.fechaHora
      });
    }
    if (e.tipo === `salida` && e.cumplimiento && e.cumplimiento.validadoGate === false) {
      a.push({
        id: `gate-${e.id}`,
        level: `warn`,
        title: `Gate sin validar · ${e.placa}`,
        detail: `Salida sin Carta Porte / licencia completa`,
        when: e.fechaHora
      });
    }
    if (e.llevaRefrigerada && e.tipo === `salida` && Qe(e.refrigerada?.dieselThermo)) {
      a.push({
        id: `thermo-diesel-${e.id}`,
        level: `critical`,
        title: `Diésel Thermo bajo · ${e.placa}`,
        detail: `Nivel ${et(e.refrigerada?.dieselThermo)} (menos de 1/2) en salida refrigerada`,
        when: e.fechaHora
      });
    }
    if (e.llevaRefrigerada && e.refrigerada?.codigoAlarma?.trim()) {
      a.push({
        id: `thermo-alarm-${e.id}`,
        level: `warn`,
        title: `Alarma Thermo · ${e.placa}`,
        detail: e.refrigerada.codigoAlarma,
        when: e.fechaHora
      });
    }
  }
  let o = new Map();
  for (let e of r) {
    let t = o.get(e.equipoId);
    if (!t || new Date(e.fechaHora) > new Date(t.fechaHora)) {
      o.set(e.equipoId, e);
    }
  }
  let s = Date.now();
  for (let e of o.values()) {
    if (e.tipo !== `parado`) {
      continue;
    }
    let t = (s - new Date(e.paradoDesde ?? e.fechaHora).getTime()) / 86400000;
    if (t >= 14) {
      a.push({
        id: `parado-14-${e.equipoId}`,
        level: `critical`,
        title: `Parado +14 días · ${e.placa}`,
        detail: `Unidad inventariada sin movimiento hace más de 14 días`,
        when: e.fechaHora
      });
    } else if (t >= 7) {
      a.push({
        id: `parado-7-${e.equipoId}`,
        level: `warn`,
        title: `Parado +7 días · ${e.placa}`,
        detail: `Revisar inventario / motivo de paro`,
        when: e.fechaHora
      });
    } else if (t >= 3) {
      a.push({
        id: `parado-3-${e.equipoId}`,
        level: `info`,
        title: `Parado +3 días · ${e.placa}`,
        detail: `Equipo parado en yarda sin ciclo`,
        when: e.fechaHora
      });
    }
  }
  return a.sort((e, t) => new Date(t.when).getTime() - new Date(e.when).getTime()).slice(0, 12);
}

export function DashboardPage({
  state: e,
  onEntrada: t,
  onSalida: n,
  onParado: r,
  onBaja: i,
  onHistorial: a,
  onKpis: o,
  mode: mode = `local`,
  onCloud: onCloud,
  onMantenimiento,
  onSalidaRapida,
  onRetornoRapido,
  user: authUser = null,
  estadosUnidad = null
}) {
  let [s, c] = (0, l.useState)(`todas`);
  let [u, d] = (0, l.useState)(`todas`);
  let f = (0, l.useMemo)(() => ke(e, s, u), [e, s, u]);
  let p = f.filter(e => e.estado === `en-ciclo`);
  let m = f.filter(e => e.estado === `parado`);
  let h = new Date().toDateString();
  let g = e.movimientos.filter(e => new Date(e.fechaHora).toDateString() === h && e.tipo !== `parado` && (s === `todas` || e.yardaId === s) && (u === `todas` || (e.empresaId ?? `api`) === u));
  let _ = g.filter(e => e.tipo === `entrada`).length;
  let v = g.filter(e => e.tipo === `salida`).length;
  let y = g.filter(e => e.condicionGeneral === `mala` || e.checklist.some(e => e.ok === false)).length;
  let b = (0, l.useMemo)(() => On(e, s, u), [e, s, u]);
  let x = b.filter(e => e.level === `critical`).length;
  let [estadoMap, setEstadoMap] = (0, l.useState)({});
  (0, l.useEffect)(() => {
    let cancel = false;
    async function load() {
      let list = Array.isArray(estadosUnidad) ? estadosUnidad : null;
      if (!list) {
        list = await fetchEstadoUnidadesOpcional();
      }
      if (!list) {
        let data = await fetchTableroOpcional();
        list = data?.estados || data?.tablero?.estados || [];
      }
      if (cancel) {
        return;
      }
      setEstadoMap(indexEstadosUnidad(list));
    }
    load().catch(() => {});
    return () => {
      cancel = true;
    };
  }, [estadosUnidad]);
  function S(e) {
    c(e);
    if (e !== `todas`) {
      A(e);
    }
  }
  function C(e) {
    d(e);
    if (e !== `todas`) {
      se(e);
    }
  }
  let soloLectura = isLocalReadOnly({
    mode,
    user: authUser
  });
  let identificado = Boolean(authUser) && (mode === `workspace` || hasServerSession(authUser));
  return <div className={`page`}>{identificado ? <div className={`banner success`} style={{
      marginBottom: 12
    }}><strong>{authUser.nombreKardex || authUser.name}</strong>{` · `}{rolLabel(authUser.rol)}{` · `}{ubicacionLabel(authUser.ubicacion)}{authUser.whatsapp ? ` · WA ${authUser.whatsapp}` : ``}{` · `}{authUser.email}</div> : soloLectura ? <div className={`banner warn`} style={{
      marginBottom: 12
    }}><strong>{`Modo local`}</strong>{` · `}{LOCAL_READONLY_BANNER}{`. `}{onCloud ? <button type={`button`} className={`text-btn`} onClick={onCloud}>{`Conectar Cloud ahora`}</button> : `Ve a Cloud y conecta Google.`}</div> : null}<section className={`hero-ops`}><div><p className={`eyebrow`}>{`Gate · 3 yardas · API / Carbal-Pia`}</p><h1>{`Control de accesos/salidas en los patios de trabajo`}</h1><p className={`lede`}>{`Chihuahua, Calera y Calpulalpan · ~25 viajes/día por sentido. Fotos guiadas, sello, firma y GPS.`}</p></div><p className={`hero-prompt`}>{`Selecciona el tipo de movimiento o registro que necesitas hacer:`}</p><div className={`hero-actions`}>{puedeMovimiento(authUser, `entrada`) && <button type={`button`} className={`btn ghost`} onClick={() => t()}>{`Registrar entrada`}</button>}{puedeMovimiento(authUser, `salida`) && <button type={`button`} className={`btn ghost`} onClick={() => n()}>{`Registrar salida`}</button>}{puedeMovimiento(authUser, `salida-rapida`) && <button type={`button`} className={`btn ghost`} onClick={() => onSalidaRapida?.()}>{`Salida rápida`}</button>}{puedeMovimiento(authUser, `retorno-rapido`) && <button type={`button`} className={`btn ghost`} onClick={() => onRetornoRapido?.()}>{`Retorno rápido`}</button>}{puedeMovimiento(authUser, `parado`) && <button type={`button`} className={`btn ghost`} onClick={() => r()}>{`Equipo parado`}<span className={`btn-sub`}>{`Inventariar`}</span></button>}{o && puedeMovimiento(authUser, `kpis`) && <button type={`button`} className={`btn ghost`} onClick={o}>{`Ver KPIs`}</button>}</div>{onMantenimiento && <button type={`button`} className={`btn hero-ot-taller`} onClick={() => onMantenimiento()}>{`OT de taller`}<span className={`btn-sub`}>{`Orden de trabajo taller`}</span></button>}<p className={`hero-hint`}><strong>{`Equipo parado`}</strong>{` = unidad que ya está en yarda sin viaje de entrada ni salida (vacío en pool, taller, retenida, drop sin ciclo…). No es un arribo: es un conteo.`}</p></section><fieldset className={`fieldset`}><legend>{`Empresa`}</legend><div className={`seg big wrap`}><button type={`button`} className={u === `todas` ? `seg-btn on-ok` : `seg-btn`} onClick={() => C(`todas`)}>{`Todas`}</button>{ie.map(e => <button type={`button`} className={u === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => C(e.id)} key={e.id}>{e.nombre}</button>)}</div></fieldset><fieldset className={`fieldset`}><legend>{`Yarda`}</legend><div className={`seg big wrap`}><button type={`button`} className={s === `todas` ? `seg-btn on-ok` : `seg-btn`} onClick={() => S(`todas`)}>{`Todas`}</button>{_e.map(e => <button type={`button`} className={s === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => S(e.id)} key={e.id}>{e.nombre}</button>)}</div></fieldset><section className={`stats stats-patio`}><article className={`stat`}><p className={`stat-label`}>{`En patio`}</p><p className={`stat-value`}>{f.length}</p></article><article className={`stat`}><p className={`stat-label`}>{`En ciclo`}</p><p className={`stat-value`}>{p.length}</p></article><article className={`stat`}><p className={`stat-label`}>{`Parados`}</p><p className={`stat-value`}>{m.length}</p></article></section><section className={`stats`}><article className={`stat`}><p className={`stat-label`}>{`Entradas hoy`}</p><p className={`stat-value`}>{_}</p></article><article className={`stat`}><p className={`stat-label`}>{`Salidas hoy`}</p><p className={`stat-value`}>{v}</p></article><article className={`stat`}><p className={`stat-label`}>{`Alertas`}</p><p className={`stat-value`}>{b.length || y}</p><p className={`hint`}>{x}{` críticas`}</p></article></section>{b.length > 0 && <section className={`panel alerts-panel`}><div className={`panel-head`}><h2>{`Alertas operativas`}</h2></div><ul className={`alert-list`}>{b.slice(0, 6).map(e => <li className={`alert-row ${e.level}`} key={e.id}><p className={`unit-placa`}>{e.title}</p><p className={`unit-meta`}>{e.detail}</p><p className={`unit-time`}>{kn(e.when)}</p></li>)}</ul></section>}<LlegadasEsperadas yarda={s} /><MantenimientoBoard onOpen={onMantenimiento} compact={true} /><section className={`panel`}><div className={`panel-head`}><h2>{`Equipos en patio`}{u === `todas` ? `` : ` · ${k(u)}`}{s === `todas` ? `` : ` · ${ye(s)}`}</h2>{puedeMovimiento(authUser, `historial`) && <button type={`button`} className={`text-btn`} onClick={a}>{`Ver historial`}</button>}</div>{f.length === 0 ? <p className={`empty`}>{`No hay equipos en patio en este filtro.`}</p> : <ul className={`unit-list`}>{f.map(({
          equipo: e,
          entrada: a,
          estado: o
        }) => <li className={`unit-row`} key={e.id}><div className={`unit-main`}><p className={`unit-placa`}>{e.placa}{` `}<span className={`badge ${o === `parado` ? `parado` : `ciclo`}`}>{o === `parado` ? `PARADO` : `EN CICLO`}</span>{estadoMap[e.id] || estadoMap[String(e.placa || ``).toUpperCase()] ? <EstatusOperativoChip estado={estadoMap[e.id] || estadoMap[String(e.placa || ``).toUpperCase()]} /> : null}</p><p className={`unit-meta`}>{jn(e.tipo)}{` · `}{e.numeroEconomico}{` ·`}{` `}{k(a.empresaId)}{` · `}{ye(a.yardaId)}{a.selloNumero ? ` · sello ${a.selloNumero}` : ``}{o === `parado` && a.motivoParo ? ` · ${_t(a.motivoParo, a.motivoParoOtro)}` : ``}</p><div className={`unit-actions`}>{puedeMovimiento(authUser, `salida`) && <button type={`button`} className={`text-btn`} onClick={() => n(e.placa)}>{`Salida`}</button>}{puedeMovimiento(authUser, `salida-rapida`) && <button type={`button`} className={`text-btn`} onClick={() => onSalidaRapida?.(e.placa)}>{`Salida rápida`}</button>}{o === `parado` ? puedeMovimiento(authUser, `entrada`) && <button type={`button`} className={`text-btn`} onClick={() => t(e.placa)}>{`Pasar a ciclo`}</button> : puedeMovimiento(authUser, `parado`) && <button type={`button`} className={`text-btn`} onClick={() => r(e.placa)}>{`Pasar a parado`}</button>}{puedeMovimiento(authUser, `baja`) && <button type={`button`} className={`text-btn`} onClick={() => i(e.placa)}>{`Baja`}</button>}</div></div><div className={`unit-side`}><p className={`unit-time`}>{o === `parado` ? `Desde` : `Llegó`}{` `}{kn(a.fechaHora)}</p><span className={`pill ${a.condicionGeneral}`}>{a.condicionGeneral}</span></div>{a.fotos[0] && <img className={`unit-thumb`} src={a.fotos[0]} alt={``} />}</li>)}</ul>}</section></div>;
}

function jn(e) {
  switch (e) {
    case `camion`:
      return `Camión`;
    case `caja`:
      return `Caja`;
    case `dolly`:
      return `Dolly`;
    default:
      return `Otro`;
  }
}
