/** Historial de movimientos. */
import * as l from "react";
import { esMovimientoRapido, etiquetaMotivoRapido, motivoRapidoDe, tituloMovimiento } from "../../lib/movimientoRapido.js";
import EntregaShare from "./EntregaShare.jsx";
import { _e, ie, qe, ye } from "../../shared/domain/constants.js";
import { dt, et, ft, k } from "../../shared/domain/patioModel.js";

function $e(e) {
  return qe.find(t => t.id === e)?.label ?? `—`;
}

function pt(e) {
  let t = e ? ft(e) : undefined;
  if (!t) {
    return `—`;
  }
  let n = t.slice(3);
  return `+52 ${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}`;
}

function tituloDrawer(mov) {
  return tituloMovimiento(mov);
}

function Fn(e) {
  let t = `id.tipo.empresa.yarda.placa.placaCamionTrasera.placaCaja1.placaCaja2.economico.fechaHora.operador.chofer.whatsapp.cliente.origen.destino.km.dieselPct.dieselL.condicion.sello.selloCoincide.llevaRefrigerada.lineaTransportista.economicoCajaRefrig.setPoint.tempReal.preEnfriado.dieselThermo.horometroThermo.modoThermo.alarmaThermo.ticketLavado.folioPedido.folioMvo.termografo.cartaPorteUuid.licencia.bitacoraServicio.bitacoraDescanso.gateOk.lat.lng.observaciones`.split(`.`);
  let n = e.map(e => {
    let t = e.refrigerada;
    return [e.id, e.tipo, k(e.empresaId), ye(e.yardaId), e.placa, e.placaCamionTrasera ?? ``, e.placaCaja1 ?? ``, e.placaCaja2 ?? ``, e.numeroEconomico, e.fechaHora, e.operador, e.chofer ?? ``, e.whatsapp ?? ``, e.cliente ?? ``, e.origen ?? e.origenDestino ?? ``, e.destino ?? ``, e.kilometros ?? ``, e.dieselPorcentaje ?? ``, e.dieselLitros ?? ``, e.condicionGeneral, e.selloNumero ?? ``, e.selloCoincideEntrada == null ? `` : e.selloCoincideEntrada ? `SI` : `NO`, e.llevaRefrigerada ? `SI` : `NO`, t?.lineaTransportista ?? ``, t?.economicoCajaRefrigerada ?? ``, $e(t?.setPoint), t?.temperaturaReal ?? ``, t?.preEnfriado == null ? `` : t.preEnfriado ? `SI` : `NO`, et(t?.dieselThermo), t?.horometroThermo ?? ``, t?.modoOperacion ?? ``, t?.codigoAlarma ?? ``, t?.ticketLavado ?? ``, t?.folioPedido ?? ``, t?.folioMvo ?? ``, t?.numeroTermografo ?? ``, e.cumplimiento?.cartaPorteUuid ?? ``, e.cumplimiento?.licenciaFederal ?? ``, e.cumplimiento?.bitacoraHorasServicio ?? ``, e.cumplimiento?.bitacoraHorasDescanso ?? ``, e.cumplimiento?.validadoGate ? `SI` : `NO`, e.geoLat ?? ``, e.geoLng ?? ``, (e.observaciones ?? ``).replace(/\n/g, ` `)].map(In).join(`,`);
  });
  return [t.join(`,`), ...n].join(`
`);
}

function In(e) {
  let t = String(e);
  if (/[",\n]/.test(t)) {
    return `"${t.replace(/"/g, `""`)}"`;
  } else {
    return t;
  }
}

function Ln(e, t) {
  let n = new Blob([`﻿${t}`], {
    type: `text/csv;charset=utf-8;`
  });
  let r = URL.createObjectURL(n);
  let i = document.createElement(`a`);
  i.href = r;
  i.download = e;
  i.click();
  URL.revokeObjectURL(r);
}

function etiquetaFiltroHistorial(id) {
  if (id === `todos`) return `Todos`;
  if (id === `entrada`) return `Entradas`;
  if (id === `salida`) return `Salidas`;
  if (id === `rapida`) return `Rápidas`;
  if (id === `parado`) return `Parados`;
  return `Bajas`;
}

function Rn(e) {
  return new Date(e).toLocaleString(`es-MX`, {
    day: `2-digit`,
    month: `short`,
    year: `numeric`,
    hour: `2-digit`,
    minute: `2-digit`
  });
}

export function HistorialPage({
  state: e
}) {
  let [t, n] = (0, l.useState)(``);
  let [r, i] = (0, l.useState)(`todos`);
  let [a, o] = (0, l.useState)(`todas`);
  let [s, c] = (0, l.useState)(`todas`);
  let [u, d] = (0, l.useState)(null);
  let f = (0, l.useMemo)(() => {
    let n = t.trim().toUpperCase();
    return e.movimientos.filter(e => (r === `rapida` ? !esMovimientoRapido(e) : r !== `todos` && e.tipo !== r) || a !== `todas` && e.yardaId !== a || s !== `todas` && (e.empresaId ?? `api`) !== s ? false : !n || e.placa.includes(n) || (e.placaCamionTrasera ?? ``).includes(n) || (e.placaCaja1 ?? ``).includes(n) || (e.placaCaja2 ?? ``).includes(n) || (e.numeroEconomico ?? ``).toUpperCase().includes(n) || (e.chofer ?? ``).toUpperCase().includes(n) || (e.operador ?? ``).toUpperCase().includes(n) || (e.selloNumero ?? ``).toUpperCase().includes(n) || (e.observaciones ?? ``).toUpperCase().includes(n) || etiquetaMotivoRapido(motivoRapidoDe(e)).toUpperCase().includes(n));
  }, [e.movimientos, t, r, a, s]);
  return <div className={`page`}><div className={`form-head`}><h1>{`Historial`}</h1><p>{`Consulta por empresa, yarda, sello, evidencias guiadas y firma.`}</p></div><EntregaShare movimientos={e.movimientos} /><div className={`hero-actions`} style={{
      marginBottom: 12
    }}><button type={`button`} className={`btn soft`} disabled={f.length === 0} onClick={() => Ln(`patiocontrol-historial-${new Date().toISOString().slice(0, 10)}.csv`, Fn(f))}>{`Exportar CSV (`}{f.length}{`)`}</button></div><div className={`filters`}><input className={`input`} placeholder={`Buscar placa, sello, chofer…`} value={t} onChange={e => n(e.target.value)} /><div className={`seg wrap`}>{[`todos`, `entrada`, `salida`, `rapida`, `parado`, `baja`].map(e => <button type={`button`} className={r === e ? `seg-btn on-ok` : `seg-btn`} onClick={() => i(e)} key={e}>{etiquetaFiltroHistorial(e)}</button>)}</div><div className={`seg wrap`}><button type={`button`} className={s === `todas` ? `seg-btn on-ok` : `seg-btn`} onClick={() => c(`todas`)}>{`Todas empresas`}</button>{ie.map(e => <button type={`button`} className={s === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => c(e.id)} key={e.id}>{e.nombre}</button>)}</div><div className={`seg wrap`}><button type={`button`} className={a === `todas` ? `seg-btn on-ok` : `seg-btn`} onClick={() => o(`todas`)}>{`Todas yardas`}</button>{_e.map(e => <button type={`button`} className={a === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => o(e.id)} key={e.id}>{e.nombre}</button>)}</div></div>{f.length === 0 ? <p className={`empty`}>{`Sin movimientos que coincidan.`}</p> : <ul className={`history-list`}>{f.map(e => <li key={e.id}><button type={`button`} className={`history-row`} onClick={() => d(e)}><div><p className={`unit-placa`}><span className={`tag ${e.tipo}`}>{e.tipo}</span>{esMovimientoRapido(e) ? <span className={`badge rapido`}>{`rápida`}</span> : null}{` `}{e.placa}</p><p className={`unit-meta`}>{Rn(e.fechaHora)}{` · `}{k(e.empresaId)}{` ·`}{` `}{ye(e.yardaId)}{` · `}{e.numeroEconomico}{e.selloNumero ? ` · sello ${e.selloNumero}` : ``}{esMovimientoRapido(e) && etiquetaMotivoRapido(motivoRapidoDe(e)) ? ` · ${etiquetaMotivoRapido(motivoRapidoDe(e))}` : ``}</p></div><div className={`unit-side`}><p className={`unit-meta`}>{e.kilometros == null ? `—` : `${e.kilometros.toLocaleString(`es-MX`)} km`}{` · `}{e.dieselPorcentaje == null ? e.dieselLitros == null ? `—` : `${e.dieselLitros} L` : `${e.dieselPorcentaje}%`}</p><span className={`pill ${e.condicionGeneral}`}>{e.condicionGeneral}</span></div></button></li>)}</ul>}{u && <div className={`drawer-backdrop`} onClick={() => d(null)}><aside className={`drawer`} onClick={e => e.stopPropagation()}><div className={`panel-head`}><h2>{tituloDrawer(u)}{` · `}{u.placa}</h2><button type={`button`} className={`text-btn`} onClick={() => d(null)}>{`Cerrar`}</button></div><dl className={`detail-grid`}><div><dt>{`Empresa`}</dt><dd>{k(u.empresaId)}</dd></div><div><dt>{`Yarda`}</dt><dd>{ye(u.yardaId)}</dd></div><div><dt>{`Fecha`}</dt><dd>{Rn(u.fechaHora)}</dd></div><div><dt>{`Económico`}</dt><dd>{u.numeroEconomico}</dd></div><div><dt>{`Placa frontal / principal`}</dt><dd>{u.placa}</dd></div><div><dt>{`Placa camión trasera`}</dt><dd>{u.placaCamionTrasera || `—`}</dd></div><div><dt>{`Placa 1ª caja`}</dt><dd>{u.placaCaja1 || `—`}</dd></div><div><dt>{`Placa 2ª caja`}</dt><dd>{u.placaCaja2 || `—`}</dd></div><div><dt>{`Sello`}</dt><dd>{u.selloNumero || `—`}</dd></div><div><dt>{`Operador`}</dt><dd>{u.operador}</dd></div>{esMovimientoRapido(u) ? <div><dt>{`Motivo rápido`}</dt><dd>{etiquetaMotivoRapido(motivoRapidoDe(u)) || `—`}</dd></div> : null}<div><dt>{`Chofer`}</dt><dd>{u.chofer || `—`}</dd></div><div><dt>{`WhatsApp`}</dt><dd>{pt(u.whatsapp)}</dd></div><div><dt>{`Cliente`}</dt><dd>{u.cliente || `—`}</dd></div><div><dt>{`Origen`}</dt><dd>{u.origen || u.origenDestino || `—`}</dd></div><div><dt>{`Destino`}</dt><dd>{u.destino || `—`}</dd></div><div><dt>{`Kilómetros`}</dt><dd>{u.kilometros ?? `—`}</dd></div><div><dt>{`Diésel`}</dt><dd>{u.dieselPorcentaje == null ? `—` : `${u.dieselPorcentaje}%`}{u.dieselLitros == null ? `` : ` / ${u.dieselLitros} L`}</dd></div><div><dt>{`Condición`}</dt><dd>{u.condicionGeneral}</dd></div><div><dt>{`Firma`}</dt><dd>{u.firmaNombre || `—`}</dd></div><div><dt>{`GPS`}</dt><dd>{u.geoLat != null && u.geoLng != null ? `${u.geoLat.toFixed(5)}, ${u.geoLng.toFixed(5)}` : `—`}</dd></div><div><dt>{`Carta Porte UUID`}</dt><dd>{u.cumplimiento?.cartaPorteUuid || `—`}</dd></div><div><dt>{`RFC emisor`}</dt><dd>{u.cumplimiento?.cartaPorteRfcEmisor || `—`}</dd></div><div><dt>{`Licencia federal`}</dt><dd>{u.cumplimiento?.licenciaFederal || `—`}</dd></div><div><dt>{`Bitácora h`}</dt><dd>{u.cumplimiento?.bitacoraHorasServicio ?? `—`}{` serv /`}{` `}{u.cumplimiento?.bitacoraHorasDescanso ?? `—`}{` desc`}</dd></div><div><dt>{`Gate validado`}</dt><dd>{u.cumplimiento?.validadoGate ? `Sí` : `No`}</dd></div><div><dt>{`Sello vs entrada`}</dt><dd>{u.selloCoincideEntrada == null ? `—` : u.selloCoincideEntrada ? `Coincide` : `DISCREPANCIA`}</dd></div></dl>{u.llevaRefrigerada && u.refrigerada && <l.Fragment><h3 className={`subhead`}>{`Caja refrigerada / Thermo King`}</h3><dl className={`detail-grid`}><div><dt>{`Marca / modelo Thermo`}</dt><dd>{u.refrigerada.marcaThermo || `—`}{` `}{u.refrigerada.modeloThermo || ``}</dd></div><div><dt>{`Activo interno`}</dt><dd>{u.refrigerada.numeroActivoThermo || `—`}</dd></div><div><dt>{`Eco. montado`}</dt><dd>{u.refrigerada.economicoMontadoThermo || u.refrigerada.economicoCajaRefrigerada || `—`}</dd></div><div><dt>{`Línea transportista`}</dt><dd>{u.refrigerada.lineaTransportista || `—`}</dd></div><div><dt>{`Set Point`}</dt><dd>{$e(u.refrigerada.setPoint)}</dd></div><div><dt>{`Temp. real`}</dt><dd>{u.refrigerada.temperaturaReal == null ? `—` : `${u.refrigerada.temperaturaReal} °C`}</dd></div><div><dt>{`Pre-enfriado`}</dt><dd>{u.refrigerada.preEnfriado == null ? `—` : u.refrigerada.preEnfriado ? `Sí` : `No`}</dd></div><div><dt>{`Diésel Thermo`}</dt><dd>{et(u.refrigerada.dieselThermo)}</dd></div><div><dt>{`Horómetro`}</dt><dd>{u.refrigerada.horometroThermo ?? `—`}</dd></div><div><dt>{`Modo`}</dt><dd>{u.refrigerada.modoOperacion || `—`}</dd></div><div><dt>{`Alarma panel`}</dt><dd>{u.refrigerada.codigoAlarma || `OK`}</dd></div><div><dt>{`Ticket lavado`}</dt><dd>{u.refrigerada.ticketLavado || `—`}</dd></div><div><dt>{`Folio pedido`}</dt><dd>{u.refrigerada.folioPedido || `—`}</dd></div><div><dt>{`Folio MVO`}</dt><dd>{u.refrigerada.folioMvo || `—`}</dd></div><div><dt>{`Termógrafo`}</dt><dd>{u.refrigerada.numeroTermografo || `—`}</dd></div></dl><h3 className={`subhead`}>{`Inocuidad TIF`}</h3><ul className={`mini-check`}>{u.refrigerada.inocuidad.map(e => <li className={e.ok ? `ok` : `bad`} key={e.id}>{e.ok ? `Aprobado` : `Rechazado`}{` — `}{e.label}{e.nota ? `: ${e.nota}` : ``}</li>)}</ul></l.Fragment>}{u.firmaUrl && <l.Fragment><h3 className={`subhead`}>{`Firma`}</h3><img className={`firma-preview`} src={u.firmaUrl} alt={`Firma`} /></l.Fragment>}{u.observaciones && <p className={`obs`}>{u.observaciones}</p>}<h3 className={`subhead`}>{`Checklist`}</h3><ul className={`mini-check`}>{u.checklist.map(e => {
            let t = e.fotoUrls?.length ? e.fotoUrls : e.fotoUrl ? [e.fotoUrl] : [];
            return <li className={e.ok ? `ok` : `bad`} key={e.id}>{e.ok ? `OK` : `Falla`}{` — `}{e.label}{e.nota ? `: ${e.nota}` : ``}{t.length > 0 && <div className={`falla-foto-grid`} style={{
                marginTop: 8
              }}>{t.map((t, n) => <img className={`falla-hist-thumb`} src={t} alt={`Falla ${e.label} ${n + 1}`} key={`${e.id}-${n}`} />)}</div>}</li>;
          })}</ul><h3 className={`subhead`}>{`Fotos guiadas`}</h3><div className={`photo-grid labeled`}>{(u.fotosEvidencia?.length ? u.fotosEvidencia : u.fotos.map((e, t) => ({
            slotId: String(t),
            label: `Foto ${t + 1}`,
            url: e
          }))).map(e => <figure className={`photo-figure`} key={e.slotId}><img className={`photo-full`} src={e.url} alt={e.label} /><figcaption>{e.label}</figcaption></figure>)}</div></aside></div>}</div>;
}
