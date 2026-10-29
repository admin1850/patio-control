/** Catálogo de unidades y de refrigeración. */
import * as l from "react";
import { v4 as ee } from "uuid";
import PlacaQuickOcr from "../../shared/ui/PlacaQuickOcr.jsx";
import { normalizePlacaMX } from "../../lib/placaOcr.js";
import { LOCAL_READONLY_BANNER } from "../../lib/patioSync.js";
import { HistorialMantenimientoUnidad } from "../taller/Mantenimiento.jsx";
import { tt } from "../../shared/domain/constants.js";
import VigenciasPanel from "./VigenciasPanel.jsx";

var nt = [{
  id: `operando`,
  label: `Operando`
}, {
  id: `taller`,
  label: `Taller`
}, {
  id: `refaccion`,
  label: `Refacción`
}, {
  id: `baja`,
  label: `Baja`
}];

function rt(e) {
  return nt.find(t => t.id === e)?.label ?? `—`;
}

export function EquiposPage({
  state: e,
  onSave: t,
  onDelete: n,
  onSaveRefrigeracion: r,
  onDeleteRefrigeracion: i,
  readOnly = false,
  initialPlaca = ``
}) {
  let [a, o] = (0, l.useState)(`unidades`);
  return <div className={`page`}><div className={`form-head`}><h1>{`Equipos`}</h1><p>{`Catálogo de tractos/cajas y de equipos de refrigeración (Thermo).`}</p></div><VigenciasPanel readOnly={readOnly} /><div className={`seg wrap`} style={{
      marginBottom: 14
    }}><button type={`button`} className={a === `unidades` ? `seg-btn on-ok` : `seg-btn`} onClick={() => o(`unidades`)}>{`Unidades (camión / caja)`}</button><button type={`button`} className={a === `refrigeracion` ? `seg-btn on-ok` : `seg-btn`} onClick={() => o(`refrigeracion`)}>{`Refrigeración`}</button></div>{readOnly && <p className={`banner warn`} style={{
      marginBottom: 12
    }}>{LOCAL_READONLY_BANNER}</p>}{a === `unidades` ? <CatalogoUnidades state={e} onSave={t} onDelete={n} readOnly={readOnly} initialPlaca={initialPlaca} /> : <CatalogoRefrigeracion state={e} onSave={r} onDelete={i} readOnly={readOnly} />}</div>;
}

function CatalogoUnidades({
  state: e,
  onSave: t,
  onDelete: n,
  readOnly = false,
  initialPlaca = ``
}) {
  let [r, i] = (0, l.useState)(`camion`);
  let [a, o] = (0, l.useState)(() => normalizePlacaMX(initialPlaca));
  let [s, c] = (0, l.useState)(``);
  let [u, d] = (0, l.useState)(``);
  let [f, p] = (0, l.useState)(``);
  let [m, h] = (0, l.useState)(``);
  let [g, _] = (0, l.useState)(``);
  let [equipoBusca, setEquipoBusca] = (0, l.useState)(``);
  let [histEquipoId, setHistEquipoId] = (0, l.useState)(null);
  (0, l.useEffect)(() => {
    let placa = normalizePlacaMX(initialPlaca);
    if (placa) o(placa);
  }, [initialPlaca]);
  function v(e) {
    e.preventDefault();
    if (readOnly) {
      return;
    }
    if (a.trim()) {
      t({
        id: ee(),
        tipo: r,
        placa: normalizePlacaMX(a),
        numeroEconomico: s.trim(),
        marca: u.trim() || undefined,
        modelo: f.trim() || undefined,
        operadorAsignado: m.trim() || undefined,
        notas: g.trim() || undefined,
        creadoEn: new Date().toISOString()
      });
      o(``);
      c(``);
      d(``);
      p(``);
      h(``);
      _(``);
    }
  }
  let equiposFiltrados = (0, l.useMemo)(() => {
    let q = equipoBusca.trim().toUpperCase();
    if (!q) {
      return e.equipos;
    }
    return e.equipos.filter(eq => normalizePlacaMX(eq.placa).includes(normalizePlacaMX(q)) || (eq.numeroEconomico ?? ``).toUpperCase().includes(q) || (eq.operadorAsignado ?? ``).toUpperCase().includes(q) || (eq.tipo ?? ``).toUpperCase().includes(q));
  }, [e.equipos, equipoBusca]);
  return <l.Fragment><form className={`form-panel compact`} onSubmit={v}>{normalizePlacaMX(initialPlaca) && <p className={`banner info`} style={{
      marginBottom: 12
    }}>{`Alta desde Taller · placa `}{normalizePlacaMX(initialPlaca)}{`. Completa económico y tipo, guarda, y regresa a Mantenimiento para abrir la OT.`}</p>}<div className={`grid-2`}><label className={`field`}><span>{`Tipo`}</span><select className={`input`} value={r} onChange={e => i(e.target.value)}><option value={`camion`}>{`Camión`}</option><option value={`caja`}>{`Caja / remolque`}</option><option value={`dolly`}>{`Dolly`}</option><option value={`otro`}>{`Otro`}</option></select></label><label className={`field`}><span>{`Placa`}</span><input className={`input`} value={a} onChange={e => o(normalizePlacaMX(e.target.value))} placeholder={`Placa sin guiones`} required={true} /><PlacaQuickOcr slotId={`placa`} label={`Tomar foto y leer placa`} onPlaca={placa => o(normalizePlacaMX(placa))} /></label><label className={`field`}><span>{`No. económico (opcional)`}</span><input className={`input`} value={s} onChange={e => c(e.target.value)} placeholder={r === `dolly` ? `Dolly: sin económico` : `ECO-045 · vacío si no aplica`} /></label><label className={`field`}><span>{`Marca`}</span><input className={`input`} value={u} onChange={e => d(e.target.value)} /></label><label className={`field`}><span>{`Modelo`}</span><input className={`input`} value={f} onChange={e => p(e.target.value)} /></label><label className={`field`}><span>{`Notas`}</span><input className={`input`} value={g} onChange={e => _(e.target.value)} /></label></div><label className={`field`} style={{
        marginTop: 12
      }}><span>{`Nombre operador/chofer asignado a este camión o unidad:`}</span><input className={`input`} value={m} onChange={e => h(e.target.value)} placeholder={`Ej. Luis Pérez`} /></label><button type={`submit`} className={`btn primary`} disabled={readOnly}>{`Agregar equipo`}</button></form><p className={`hint`} style={{
      margin: `12px 0 8px`
    }}>{`Catálogo vivo: al teclear o leer la placa en Entrada/Salida se autocompletan económico, chofer y último sello.`}</p><input className={`input`} value={equipoBusca} onChange={e => setEquipoBusca(e.target.value)} placeholder={`Buscar en catálogo (placa, económico, chofer)…`} style={{
      marginBottom: 10
    }} /><ul className={`unit-list`}>{e.equipos.length === 0 && <p className={`empty`}>{`Aún no hay equipos. Da de alta tractos, cajas y dollies aquí para que caseta solo busque la placa.`}</p>}{e.equipos.length > 0 && equiposFiltrados.length === 0 && <p className={`empty`}>{`Sin coincidencias.`}</p>}{equiposFiltrados.map(e => <li className={`unit-row`} key={e.id}><div className={`unit-main`}><p className={`unit-placa`}>{e.placa}</p><p className={`unit-meta`}>{e.tipo}{` · `}{e.numeroEconomico}{e.marca ? ` · ${e.marca}` : ``}{e.modelo ? ` ${e.modelo}` : ``}{e.operadorAsignado ? ` · chofer ${e.operadorAsignado}` : ``}</p>{histEquipoId === e.id && <HistorialMantenimientoUnidad unidadId={e.id} placa={e.placa} />}</div><button type={`button`} className={`text-btn`} onClick={() => setHistEquipoId(histEquipoId === e.id ? null : e.id)}>{histEquipoId === e.id ? `Ocultar mant.` : `Mantenimiento`}</button><button type={`button`} className={`text-btn danger`} disabled={readOnly} onClick={() => {
        if (!readOnly) void Promise.resolve(n(e.id)).catch(() => {});
      }}>{`Eliminar`}</button></li>)}</ul></l.Fragment>;
}

function CatalogoRefrigeracion({
  state: e,
  onSave: t,
  onDelete: n,
  readOnly = false
}) {
  let [r, i] = (0, l.useState)(``);
  let [a, o] = (0, l.useState)(``);
  let [s, c] = (0, l.useState)(``);
  let [u, d] = (0, l.useState)(``);
  let [f, p] = (0, l.useState)(``);
  let [m, h] = (0, l.useState)(`operando`);
  let [g, _] = (0, l.useState)(``);
  let [v, y] = (0, l.useState)(null);
  function b() {
    i(``);
    o(``);
    c(``);
    d(``);
    p(``);
    h(`operando`);
    _(``);
    y(null);
  }
  function x(e) {
    y(e.id);
    i(e.marca);
    o(e.modelo);
    c(e.numeroActivo);
    d(e.economicoMontado);
    p(e.horometro == null ? `` : String(e.horometro));
    h(e.estatus);
    _(e.notas ?? ``);
  }
  function S(n) {
    n.preventDefault();
    if (readOnly) {
      return;
    }
    if (r.trim() && a.trim() && s.trim() && u.trim()) {
      t({
        id: v ?? ee(),
        marca: r.trim(),
        modelo: a.trim(),
        numeroActivo: s.trim().toUpperCase(),
        economicoMontado: u.trim().toUpperCase(),
        horometro: f === `` ? null : Number(f),
        estatus: m,
        notas: g.trim() || undefined,
        creadoEn: v ? e.refrigeraciones.find(e => e.id === v)?.creadoEn ?? new Date().toISOString() : new Date().toISOString()
      });
      b();
    }
  }
  return <l.Fragment><form className={`form-panel compact`} onSubmit={S}><p className={`hint`} style={{
        marginTop: 0
      }}>{`Alta de cada caja / equipo de refrigeración (Thermo King u otro).`}</p><div className={`grid-2`}><label className={`field`}><span>{`Marca *`}</span><select className={`input`} value={r} onChange={e => i(e.target.value)} required={true}><option value={``}>{`Seleccionar…`}</option>{tt.map(e => <option value={e} key={e}>{e}</option>)}</select></label><label className={`field`}><span>{`Modelo *`}</span><input className={`input`} value={a} onChange={e => o(e.target.value)} placeholder={`SB-210 / X-Series…`} required={true} /></label><label className={`field`}><span>{`Número de activo interno *`}</span><input className={`input`} value={s} onChange={e => c(e.target.value.toUpperCase())} placeholder={`ACT-REF-001`} required={true} /></label><label className={`field`}><span>{`Económico de la caja/camión donde está montado *`}</span><input className={`input`} value={u} onChange={e => d(e.target.value.toUpperCase())} placeholder={`R-220 / T-101`} required={true} /></label><label className={`field`}><span>{`Horómetro (horas)`}</span><input className={`input`} type={`number`} min={0} step={0.1} value={f} onChange={e => p(e.target.value)} placeholder={`12450`} /></label><label className={`field`}><span>{`Estatus *`}</span><select className={`input`} value={m} onChange={e => h(e.target.value)}>{nt.map(e => <option value={e.id} key={e.id}>{e.label}</option>)}</select></label><label className={`field full`}><span>{`Notas`}</span><input className={`input`} value={g} onChange={e => _(e.target.value)} /></label></div><div className={`hero-actions`} style={{
        marginTop: 12
      }}><button type={`submit`} className={`btn primary`} disabled={readOnly}>{v ? `Guardar cambios` : `Agregar refrigeración`}</button>{v && <button type={`button`} className={`btn soft`} onClick={b}>{`Cancelar`}</button>}</div></form><ul className={`unit-list`}>{e.refrigeraciones.length === 0 && <p className={`empty`}>{`Aún no hay equipos de refrigeración dados de alta.`}</p>}{e.refrigeraciones.map(e => <li className={`unit-row`} key={e.id}><div className={`unit-main`}><p className={`unit-placa`}>{e.marca}{` `}{e.modelo}</p><p className={`unit-meta`}>{`Activo `}{e.numeroActivo}{` · montado en `}{e.economicoMontado}{e.horometro == null ? `` : ` · ${e.horometro.toLocaleString(`es-MX`)} h`}{` · `}{rt(e.estatus)}</p></div><div className={`unit-side`}><button type={`button`} className={`text-btn`} onClick={() => x(e)}>{`Editar`}</button><button type={`button`} className={`text-btn danger`} disabled={readOnly} onClick={() => {
        if (!readOnly) void Promise.resolve(n(e.id)).catch(() => {});
      }}>{`Eliminar`}</button></div></li>)}</ul></l.Fragment>;
}
