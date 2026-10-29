/** Registro de entrada a patio. */
import * as l from "react";
import { createPortal } from "react-dom";
import { v4 as ee } from "uuid";
import PlacaQuickOcr from "../../shared/ui/PlacaQuickOcr.jsx";
import { applyPlacaOcrToForm, normalizePlacaMX } from "../../lib/placaOcr.js";
import { buscarLlegadaServidor } from "../../lib/serverApi.js";
import { useZonaSlotFields } from "./ZonaSlotFields.jsx";
import { puedeCapturaTardia, resolverFechaCaptura } from "../../shared/domain/authProfile.js";
import { _e, ie } from "../../shared/domain/constants.js";
import { A, De, be, dt, ft, ge, ht, kn, mt, oe, se } from "../../shared/domain/patioModel.js";
import { ChecklistInspeccion } from "../../shared/ui/ChecklistInspeccion.jsx";
import { DocumentosGate } from "../../shared/ui/DocumentosGate.jsx";
import { FirmaCanvas } from "../../shared/ui/FirmaCanvas.jsx";
import { GuidedPhotos } from "../../shared/ui/GuidedPhotos.jsx";
import { RefrigeracionForm } from "../../shared/ui/RefrigeracionForm.jsx";

var ce = [{
  id: `placa-camion-frontal`,
  label: `Placa camión · frontal`,
  hint: `Acerca la cámara: números y letras de la placa frontal bien legibles.`,
  silhouette: `plate`,
  required: true
}, {
  id: `placa-camion-trasera`,
  label: `Placa camión · trasera`,
  hint: `Placa trasera del tractocamión, enfocada y legible.`,
  silhouette: `plate`,
  required: true
}];

var le = {
  id: `placa-caja-1-trasera`,
  label: `1ª caja · placa trasera`,
  hint: `Placa trasera de la primera caja / remolque, legible.`,
  silhouette: `plate`,
  required: true
};

var ue = {
  id: `placa-caja-2-trasera`,
  label: `2ª caja · placa trasera`,
  hint: `Placa trasera de la segunda caja (full), legible.`,
  silhouette: `plate`,
  required: true
};

var de = [{
  id: `tractor-frontal`,
  label: `Frontal completa`,
  hint: `Parabrisas, defensa y vista general (además de la foto de placa).`,
  silhouette: `front`,
  required: true
}, {
  id: `tractor-lat-izq`,
  label: `Lateral izquierdo`,
  hint: `Carrocería, espejos, tanque de diésel y tapón.`,
  silhouette: `side`,
  required: true
}, {
  id: `tractor-lat-der`,
  label: `Lateral derecho`,
  hint: `Carrocería, espejos y tanque opuesto.`,
  silhouette: `side`,
  required: true
}, {
  id: `tractor-odometro`,
  label: `Odómetro (legible)`,
  hint: `Acerca la cámara al odómetro: kilómetros bien legibles, sin reflejos.`,
  silhouette: `odometer`,
  required: true
}, {
  id: `tractor-combustible`,
  label: `Combustible / nivel tablero`,
  hint: `Foto del medidor de combustible o nivel de diésel en el tablero, legible.`,
  silhouette: `fuel`,
  required: true
}, {
  id: `tractor-tablero`,
  label: `Tablero · testigos`,
  hint: `Tablero encendido: Check Engine, ABS u otros testigos encendidos.`,
  silhouette: `dash`,
  required: true
}, {
  id: `tractor-llantas`,
  label: `Llantas por eje`,
  hint: `NOM-068: lisas, cortadas o baja presión.`,
  silhouette: `tire`,
  required: true
}, {
  id: `tractor-quinta`,
  label: `Quinta rueda y conexiones`,
  hint: `Líneas de aire (roja/azul) y cable siete vías.`,
  silhouette: `fifth`,
  required: true
}];

var fe = [{
  id: `caja-costado-izq`,
  label: `Costado izquierdo`,
  hint: `Lona, golpes en caja seca/refrigerada o abolladuras.`,
  silhouette: `side`,
  required: true
}, {
  id: `caja-costado-der`,
  label: `Costado derecho`,
  hint: `Recorrido completo del costado.`,
  silhouette: `side`,
  required: true
}, {
  id: `caja-trasera`,
  label: `Trasera · puertas cerradas`,
  hint: `Luces, defensas y cierre (la placa va en captura aparte).`,
  silhouette: `rear`,
  required: true
}, {
  id: `caja-sello`,
  label: `Sello de seguridad (zoom)`,
  hint: `Número de serie legible del perno/cable (C-TPAT / OEA).`,
  silhouette: `seal`,
  required: true
}, {
  id: `caja-llantas`,
  label: `Llantas del remolque`,
  hint: `Estado visual por eje (NOM-068).`,
  silhouette: `tire`,
  required: true
}, {
  id: `caja-interior`,
  label: `Interior de la caja`,
  hint: `Limpieza, piso, olores o humedad (vacío / consolidación).`,
  silhouette: `interior`,
  required: false
}];

var pe = [{
  id: `dolly-enganche`,
  label: `Enganche / quinta`,
  hint: `Estado del enganche y estructura.`,
  silhouette: `fifth`,
  required: true
}, {
  id: `dolly-llantas`,
  label: `Llantas`,
  hint: `Desgaste, cortes o baja presión.`,
  silhouette: `tire`,
  required: true
}, {
  id: `dolly-luces`,
  label: `Luces / laterales`,
  hint: `Luces y daños visibles.`,
  silhouette: `side`,
  required: true
}];

var me = [{
  id: `thermo-panel`,
  label: `Panel Thermo King`,
  hint: `Set Point, temperatura real y alarmas claramente legibles. Solo cámara.`,
  silhouette: `thermo`,
  required: true
}, {
  id: `thermo-diesel`,
  label: `Tanque / medidor diésel Thermo`,
  hint: `Nivel de diésel de la unidad Thermo King, legible.`,
  silhouette: `thermo-fuel`,
  required: true
}, {
  id: `caja-interior-refrig`,
  label: `Interior caja refrigerada`,
  hint: `Desde las puertas hacia el fondo: limpieza y ducto de aire (chute).`,
  silhouette: `interior`,
  required: true
}, {
  id: `caja-marchamo`,
  label: `Marchamo / sello en puertas`,
  hint: `Sello colocado en puertas, número legible.`,
  silhouette: `seal`,
  required: true
}];

function he(e, t) {
  let n = e => e.map(e => e.id === `caja-interior` ? {
    ...e,
    required: !!t?.pedirInterior && !t?.llevaRefrigerada
  } : e);
  if (e === `caja`) {
    let e = [le, ...n(fe)];
    if (t?.segundaCaja) {
      e.splice(1, 0, ue);
    }
    if (t?.llevaRefrigerada) {
      e.push(...me);
    }
    return e;
  }
  if (e === `dolly`) {
    return pe;
  }
  if (e === `otro`) {
    return [{
      id: `otro-general`,
      label: `Vista general`,
      hint: `Evidencia completa del equipo.`,
      silhouette: `side`,
      required: true
    }];
  }
  let r = [...(t?.traePlacaTrasera === false ? ce.filter(e => e.id !== `placa-camion-trasera`) : ce.map(e => e.id === `placa-camion-trasera` ? {
    ...e,
    hint: `Misma placa que la frontal: foto trasera legible.`
  } : e)), ...de];
  if (t?.incluyeRemolque) {
    r.push(le);
    if (t.segundaCaja) {
      r.push(ue);
    }
    r.push(...n(fe));
    if (t.llevaRefrigerada) {
      r.push(...me);
    }
  }
  return r;
}

function Ke(e) {
  if (e) {
    return !!e.validadoGate;
  } else {
    return false;
  }
}

function Xe() {
  return [{
    id: `ino-olores`,
    label: `Olores y limpieza · libre de químicos, humedad o sangre estancada`,
    ok: null
  }, {
    id: `ino-piso`,
    label: `Piso acanalado · limpio, sin obstrucciones ni madera rota`,
    ok: null
  }, {
    id: `ino-drenes`,
    label: `Drenes · destapados y con trampas instaladas`,
    ok: null
  }, {
    id: `ino-burletes`,
    label: `Burletes y puertas · gomas sellando al 100% (sin fugas)`,
    ok: null
  }, {
    id: `ino-chute`,
    label: `Ducto de aire (chute) · lona colocada y sin rasgaduras`,
    ok: null
  }];
}

function Ze() {
  return {
    inocuidad: Xe(),
    temperaturaReal: null,
    horometroThermo: null,
    preEnfriado: null
  };
}

function at(e, t) {
  if (e.lineaTransportista?.trim()) {
    if (!e.economicoCajaRefrigerada?.trim() && !e.economicoMontadoThermo?.trim()) {
      return `Captura el económico de la caja refrigerada`;
    } else if (e.marcaThermo?.trim()) {
      if (e.modeloThermo?.trim()) {
        if (e.numeroActivoThermo?.trim()) {
          if (e.setPoint) {
            if (e.temperaturaReal == null || Number.isNaN(e.temperaturaReal)) {
              return `Captura la temperatura real del display`;
            } else if (e.dieselThermo) {
              if (e.horometroThermo == null || Number.isNaN(e.horometroThermo)) {
                return `Captura el horómetro del Thermo King`;
              } else if (e.modoOperacion) {
                if (e.inocuidad.some(e => e.ok === null)) {
                  return `Completa el checklist de inocuidad TIF (Aprobado / Rechazado)`;
                } else if (t === `entrada` && !e.ticketLavado?.trim()) {
                  return `Ticket de lavado grado alimenticio obligatorio en entradas`;
                } else if (e.folioPedido?.trim()) {
                  if (e.folioMvo?.trim()) {
                    if (e.numeroTermografo?.trim()) {
                      return null;
                    } else {
                      return `Captura el número de termógrafo`;
                    }
                  } else {
                    return `Captura el folio / firma del MVO`;
                  }
                } else {
                  return `Captura el folio del pedido / viaje`;
                }
              } else {
                return `Selecciona el modo de operación del Thermo`;
              }
            } else {
              return `Selecciona el nivel de diésel del Thermo`;
            }
          } else {
            return `Selecciona el Set Point del Thermo`;
          }
        } else {
          return `Captura el número de activo interno`;
        }
      } else {
        return `Captura el modelo del equipo de refrigeración`;
      }
    } else {
      return `Captura la marca del equipo de refrigeración`;
    }
  } else {
    return `Selecciona la línea transportista`;
  }
}

export function EntradaForm({
  tipo: e,
  initialPlaca: t = ``,
  equipos: n,
  refrigeraciones: r = [],
  movimientos: i,
  onSaveEquipo: a,
  onSubmit: o,
  onDone: s,
  user: authUser = null,
  onPromptOt = null
}) {
  let [c, u] = (0, l.useState)(() => be());
  let [d, f] = (0, l.useState)(() => oe());
  let [p, m] = (0, l.useState)(true);
  let [h, g] = (0, l.useState)(false);
  let [_, v] = (0, l.useState)(false);
  let [y, b] = (0, l.useState)(false);
  let [x, S] = (0, l.useState)(`sencillo`);
  let [C, w] = (0, l.useState)(false);
  let [te, T] = (0, l.useState)(() => Ze());
  let [O, re] = (0, l.useState)(t);
  let [placaCamionTraseraVal, setPlacaCamionTraseraVal] = (0, l.useState)(``);
  let [ae, k] = (0, l.useState)(true);
  let [motivoSinPlacaTrasera, setMotivoSinPlacaTrasera] = (0, l.useState)(``);
  let [ce, le] = (0, l.useState)(``);
  let [ue, de] = (0, l.useState)(``);
  let [fe, pe] = (0, l.useState)(``);
  let [me, ve] = (0, l.useState)(``);
  let [ye, j] = (0, l.useState)(mt());
  let [abiertoEn] = (0, l.useState)(() => new Date().toISOString());
  let [capturaTardia, setCapturaTardia] = (0, l.useState)(false);
  let [motivoCapturaTardia, setMotivoCapturaTardia] = (0, l.useState)(``);
  let [xe, Se] = (0, l.useState)(``);
  let [Ce, M] = (0, l.useState)(``);
  let [we, N] = (0, l.useState)(``);
  let [Te, Ee] = (0, l.useState)(``);
  let [Oe, ke] = (0, l.useState)(``);
  let [Ae, je] = (0, l.useState)(``);
  let [Me, Ne] = (0, l.useState)(``);
  let [Pe, Fe] = (0, l.useState)(``);
  let [Ie, Le] = (0, l.useState)(``);
  let [Re, ze] = (0, l.useState)(``);
  let [Be, He] = (0, l.useState)(`buena`);
  let [Ue, We] = (0, l.useState)(``);
  let [viajeId, setViajeId] = (0, l.useState)(``);
  let [llegadaHint, setLlegadaHint] = (0, l.useState)(``);
  let [P, qe] = (0, l.useState)(null);
  let [Je, Ye] = (0, l.useState)(false);
  let [Xe, Qe] = (0, l.useState)(``);
  let [grokObsBusy, setGrokObsBusy] = (0, l.useState)(false);
  let [$e, et] = (0, l.useState)(() => dt(`camion`));
  let [tt, nt] = (0, l.useState)({});
  let [rt, st] = (0, l.useState)(null);
  let [ct, lt] = (0, l.useState)(``);
  let [ut, pt] = (0, l.useState)({});
  let [gt, F] = (0, l.useState)(null);
  let [_t, vt] = (0, l.useState)(null);
  let [yt, bt] = (0, l.useState)(false);
  let zonaSlotCap = useZonaSlotFields();
  let xt = h || y;
  let St = p && xt;
  let Ct = h && x === `full`;
  let wt = y;
  let I = p ? `camion` : _ && !xt ? `dolly` : xt ? `caja` : _ ? `dolly` : `camion`;
  let Tt = (0, l.useMemo)(() => he(I, {
    incluyeRemolque: I === `camion` && St,
    segundaCaja: (I === `caja` || St) && Ct,
    pedirInterior: !wt && C,
    llevaRefrigerada: wt && (I === `caja` || I === `camion` && St || !p),
    traePlacaTrasera: p ? ae : undefined
  }), [I, St, Ct, C, wt, ae, p]);
  (0, l.useEffect)(() => {
    nt({});
    setPlacaCamionTraseraVal(``);
    if (ae) {
      setMotivoSinPlacaTrasera(``);
    }
  }, [I, St, Ct, C, wt, ae, p, h, _, y, x]);
  (0, l.useEffect)(() => {
    et(dt(I));
  }, [I]);
  (0, l.useEffect)(() => {
    if (y) {
      w(false);
      T(e => e.inocuidad.length ? e : Ze());
    }
  }, [y]);
  (0, l.useEffect)(() => {
    if (e !== `salida` || !O.trim()) {
      return;
    }
    let t = De({
      equipos: n
    }, O);
    if (!t) {
      return;
    }
    let r = i.find(e => e.equipoId === t.id);
    if (r?.tipo === `entrada` && r.selloNumero) {
      qe(r.selloNumero.trim().toUpperCase());
    }
  }, [e, O, n, i]);
  let Et = (0, l.useMemo)(() => n.map(e => {
    let t = i.find(t => t.equipoId === e.id);
    if (t?.tipo !== `entrada` || t.yardaId && t.yardaId !== c || (t.empresaId ?? `api`) !== d) {
      return null;
    } else {
      return e;
    }
  }).filter(Boolean), [n, i, c, d]);
  function Dt(e) {
    u(e);
    A(e);
  }
  function Ot(e) {
    f(e);
    se(e);
  }
  function kt(e) {
    m(e.tipo === `camion`);
    g(e.tipo === `caja`);
    v(e.tipo === `dolly`);
    b(false);
    S(`sencillo`);
    re(e.placa);
    ve(e.numeroEconomico);
    if (e.operadorAsignado) {
      let t = e.operadorAsignado.trim().split(/\s+/);
      M(t[0] ?? ``);
      N(t.slice(1).join(` `));
    }
    let t = i.filter(t => t.equipoId === e.id || normalizePlacaMX(t.placa) === normalizePlacaMX(e.placa)).sort((a, b) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime())[0];
    qe(t?.selloNumero?.trim().toUpperCase() || null);
    We(``);
    Ye(false);
    if (t?.whatsapp) {
      Ee(String(t.whatsapp).replace(/\D/g, ``).slice(-10));
    }
    if (t?.chofer && !e.operadorAsignado) {
      let parts = t.chofer.trim().split(/\s+/);
      M(parts[0] ?? ``);
      N(parts.slice(1).join(` `));
    }
    k(!!t?.placaCamionTrasera || t?.placaCamionTrasera === undefined);
    setPlacaCamionTraseraVal(t?.placaCamionTrasera ?? ``);
    le(t?.placaCaja1 ?? (e.tipo === `caja` ? e.placa : ``));
    de(t?.placaCaja2 ?? ``);
    if (t?.placaCaja1 || t?.placaCaja2 || e.tipo === `caja`) {
      g(true);
      if (e.tipo === `camion`) {
        m(true);
      }
    }
    if (t?.placaCaja2) {
      S(`full`);
    }
    if (t?.llevaRefrigerada) {
      b(true);
    }
  }
  function aplicarCatalogoPorPlaca(raw) {
    let placa = normalizePlacaMX(raw);
    if (placa.length < 5) {
      return false;
    }
    let eq = n.find(e => normalizePlacaMX(e.placa) === placa);
    if (eq) {
      kt(eq);
      return true;
    }
    let mov = i.filter(e => normalizePlacaMX(e.placa) === placa || normalizePlacaMX(e.placaCaja1 ?? ``) === placa || normalizePlacaMX(e.placaCamionTrasera ?? ``) === placa).sort((a, b) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime())[0];
    if (!mov) {
      return false;
    }
    re(placa);
    if (mov.numeroEconomico) {
      ve(mov.numeroEconomico);
    }
    if (mov.chofer) {
      let parts = mov.chofer.trim().split(/\s+/);
      M(parts[0] ?? ``);
      N(parts.slice(1).join(` `));
    }
    if (mov.whatsapp) {
      Ee(String(mov.whatsapp).replace(/\D/g, ``).slice(-10));
    }
    if (mov.selloNumero && e === `salida`) {
      qe(mov.selloNumero.trim().toUpperCase());
    }
    if (mov.placaCaja1) {
      g(true);
      le(mov.placaCaja1);
    }
    if (mov.placaCaja2) {
      S(`full`);
      de(mov.placaCaja2);
    }
    return true;
  }
  let [catalogQuery, setCatalogQuery] = (0, l.useState)(``);
  let catalogMatches = (0, l.useMemo)(() => {
    let q = normalizePlacaMX(catalogQuery) || catalogQuery.trim().toUpperCase();
    let list = n;
    if (q) {
      list = n.filter(e => normalizePlacaMX(e.placa).includes(normalizePlacaMX(q)) || (e.numeroEconomico ?? ``).toUpperCase().includes(q) || (e.operadorAsignado ?? ``).toUpperCase().includes(q));
    }
    return list.slice(0, 12);
  }, [n, catalogQuery]);
  (0, l.useEffect)(() => {
    if (t?.trim()) {
      aplicarCatalogoPorPlaca(t);
    }
    // solo al montar con placa inicial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  let At = (0, l.useMemo)(() => {
    if (e !== `salida` || !P) {
      return null;
    }
    let t = Ue.trim().toUpperCase();
    if (t) {
      if (t === P) {
        return `ok`;
      } else {
        return `mismatch`;
      }
    } else {
      return `pending`;
    }
  }, [e, P, Ue]);
  async function jt(t) {
    t.preventDefault();
    F(null);
    vt(null);
    if (!O.trim()) {
      F(`La placa es obligatoria`);
      return;
    }
    if (!p && !h && !_ && !y) {
      F(`Selecciona al menos un tipo de equipo`);
      return;
    }
    if (h && !x) {
      F(`Indica si la caja encortinada es sencillo o full`);
      return;
    }
    if (!xe.trim()) {
      F(`Indica quién registra (operador de patio)`);
      return;
    }
    if (!Ce.trim() || !we.trim()) {
      F(`Captura nombre y apellido del chofer/operador`);
      return;
    }
    let r = ft(Te);
    if (!r) {
      F(`WhatsApp del chofer/operador: captura los 10 dígitos (+52)`);
      return;
    }
    if ($e.some(e => e.ok === null)) {
      F(`Completa todo el checklist (OK o Falla)`);
      return;
    }
    if (!ge(Tt, tt)) {
      F(`Completa todas las fotos obligatorias guiadas`);
      return;
    }
    if (!ct.trim() || !rt) {
      F(`Se requiere firma digital y nombre de quien firma`);
      return;
    }
    if ((xt || St) && !Ue.trim()) {
      F(`Captura el número de sello de seguridad`);
      return;
    }
    let l = h ? (p ? ce.trim() : O.trim()) || ce.trim() : ``;
    let u = y ? fe.trim() : ``;
    let f = l || u || (!p && xt ? O.trim() : ``) || ce.trim();
    if (h && !l && !ce.trim() && (p || !O.trim())) {
      F(`Captura la placa de la 1ª caja encortinada`);
      return;
    }
    if (y && !fe.trim()) {
      F(`Captura la placa de la caja refrigerada`);
      return;
    }
    if (y && !te.economicoCajaRefrigerada?.trim()) {
      F(`Captura el No. económico de la caja refrigerada`);
      return;
    }
    if ((xt || St) && !f && !y) {
      F(`Captura la placa de la 1ª caja`);
      return;
    }
    if (Ct && !ue.trim()) {
      F(`Captura la placa de la 2ª caja (full)`);
      return;
    }
    if (p && !ae && motivoSinPlacaTrasera.trim().length < 3) {
      F(`Indica el motivo porque el camión no trae placa trasera`);
      return;
    }
    if (e === `salida` && At === `mismatch` && !Je) {
      F(`El sello no coincide con la entrada. Confirma la discrepancia y detalla en observaciones.`);
      return;
    }
    if (e === `salida` && At === `mismatch` && Je && Xe.trim().length < 8) {
      F(`Describe la discrepancia de sello en observaciones (mín. 8 caracteres).`);
      return;
    }
    if (!Ke(ut)) {
      F(`Completa licencia federal y bitácora para autorizar el gate (Carta Porte es opcional)`);
      return;
    }
    let fechaCap = resolverFechaCaptura({
      user: authUser,
      capturaTardia,
      fechaLocal: ye,
      motivo: motivoCapturaTardia
    });
    if (fechaCap.error) {
      F(fechaCap.error);
      return;
    }
    let C = wt;
    if (C) {
      let t = at(te, e);
      if (t) {
        F(t);
        return;
      }
    }
    if (e === `salida`) {
      let e = De({
        equipos: n
      }, O);
      if (!e) {
        F(`No hay equipo registrado con esa placa`);
        return;
      }
      let t = i.find(t => t.equipoId === e.id);
      if (t?.tipo !== `entrada`) {
        F(`Ese equipo no está marcado como en patio. Registra primero la entrada.`);
        return;
      }
      if (!P && t.selloNumero) {
        qe(t.selloNumero.trim().toUpperCase());
      }
    }
    let E = De({
      equipos: n
    }, O);
    if (E) {
      if (E.numeroEconomico !== (me.trim() || E.numeroEconomico) || E.tipo !== I) {
        E = {
          ...E,
          tipo: I,
          numeroEconomico: me.trim() || E.numeroEconomico
        };
        void Promise.resolve(a(E)).catch(() => {});
      }
    } else {
      E = {
        id: ee(),
        tipo: I,
        placa: O.trim().toUpperCase(),
        numeroEconomico: me.trim() || O.trim().toUpperCase(),
        creadoEn: new Date().toISOString()
      };
      void Promise.resolve(a(E)).catch(() => {});
    }
    let D = Tt.filter(e => tt[e.id]).map(e => ({
      slotId: e.id,
      label: e.label,
      url: tt[e.id]
    }));
    bt(true);
    let ne = await ht();
    let ie = {
      id: ee(),
      tipo: e,
      yardaId: c,
      empresaId: d,
      equipoId: E.id,
      placa: E.placa,
      numeroEconomico: E.numeroEconomico,
      equipoTipo: E.tipo,
      fechaHora: fechaCap.fechaHora,
      ...(fechaCap.capturaTardiaMotivo ? {
        capturaTardiaMotivo: fechaCap.capturaTardiaMotivo,
        fechaCapturaDispositivo: fechaCap.fechaCapturaDispositivo
      } : {}),
      operador: xe.trim(),
      chofer: `${Ce.trim()} ${we.trim()}`,
      whatsapp: r,
      cliente: Oe.trim() || undefined,
      origen: Ae.trim() || undefined,
      destino: Me.trim() || undefined,
      placaCamionTrasera: (() => {
        let rear = placaCamionTraseraVal.trim().toUpperCase() || (p && ae ? O.trim().toUpperCase() : ``);
        return rear || undefined;
      })(),
      traePlacaTrasera: p ? ae : undefined,
      motivoSinPlacaTrasera: p && !ae ? motivoSinPlacaTrasera.trim() : undefined,
      placaCaja1: (() => {
        if (h) {
          return (p ? ce : O).trim().toUpperCase() || undefined;
        }
        if (y) {
          return fe.trim().toUpperCase() || undefined;
        }
        if (St) {
          return ce.trim().toUpperCase() || undefined;
        }
      })(),
      placaCaja2: Ct && ue.trim().toUpperCase() || undefined,
      kilometros: Pe ? Number(Pe) : null,
      dieselPorcentaje: Ie ? Number(Ie) : null,
      dieselLitros: Re ? Number(Re) : null,
      checklist: $e,
      fotos: D.map(e => e.url),
      fotosEvidencia: D,
      condicionGeneral: Be,
      selloNumero: Ue.trim() || undefined,
      viajeId: e === `entrada` ? viajeId.trim() || undefined : undefined,
      selloCoincideEntrada: e === `salida` && P ? At === `ok` : e === `salida` ? null : undefined,
      observaciones: (() => {
        let obs = Xe.trim();
        if (!fechaCap.nota) return obs || undefined;
        return obs ? `${obs}\n${fechaCap.nota}` : fechaCap.nota;
      })(),
      firmaNombre: ct.trim(),
      firmaUrl: rt,
      geoLat: ne?.lat ?? null,
      geoLng: ne?.lng ?? null,
      cumplimiento: fechaCap.capturaTardiaMotivo ? {
        ...ut,
        capturaTardiaMotivo: fechaCap.capturaTardiaMotivo,
        fechaCapturaDispositivo: fechaCap.fechaCapturaDispositivo
      } : ut,
      llevaRefrigerada: C || undefined,
      refrigerada: C ? te : undefined,
      zona: zonaSlotCap.zona.trim() || undefined,
      slot: zonaSlotCap.slot.trim() || undefined,
      creadoEn: new Date().toISOString()
    };
    try {
      let avisoInventario = await o(ie);
      vt(e === `entrada` ? `Entrada registrada: ${E.placa}` : `Salida registrada: ${E.placa}`);
      if (avisoInventario) F(avisoInventario);
      re(``);
      k(true);
      le(``);
      de(``);
      ve(``);
      M(``);
      N(``);
      Ee(``);
      ke(``);
      je(``);
      Ne(``);
      Fe(``);
      Le(``);
      ze(``);
      Qe(``);
      We(``);
      setViajeId(``);
      setLlegadaHint(``);
      qe(null);
      Ye(false);
      nt({});
      st(null);
      lt(``);
      pt({});
      m(true);
      g(false);
      v(false);
      b(false);
      S(`sencillo`);
      w(false);
      T(Ze());
      et(dt(`camion`));
      j(mt());
      He(`buena`);
      window.setTimeout(() => s(), 900);
    } catch (e) {
      F(e instanceof Error ? e.message : `No se pudo guardar`);
    } finally {
      bt(false);
    }
  }
  async function buscarPreaviso(raw) {
    if (e !== `entrada`) return;
    let texto = String(raw ?? ``).trim();
    if (!texto) {
      setLlegadaHint(``);
      return;
    }
    try {
      let data = await buscarLlegadaServidor(texto);
      let match = data?.match;
      if (!match) {
        setLlegadaHint(`Sin preaviso para ese viaje.`);
        return;
      }
      if (match.viajeId) setViajeId(String(match.viajeId));
      let selloEsp = String(match.selloEsperado || match.sello || ``).trim().toUpperCase();
      if (selloEsp) We(selloEsp);
      let cajas = Array.isArray(match.cajas) ? match.cajas : [];
      if (selloEsp || cajas.length) g(true);
      if (cajas[0]) {
        let placaCaja = typeof cajas[0] === `object` ? cajas[0].placa || cajas[0].id || `` : cajas[0];
        if (placaCaja) le(String(placaCaja).toUpperCase());
      }
      if (match.yardaId) Dt(String(match.yardaId));
      let placas = Array.isArray(match.placas) ? match.placas.filter(Boolean) : [];
      if (!O.trim() && placas[0]) re(String(placas[0]).toUpperCase());
      setLlegadaHint(`Preaviso ${match.viajeId}${match.selloEsperado || match.sello ? ` · sello esperado ${match.selloEsperado || match.sello}` : ``}${placas.length ? ` · ${placas.join(`, `)}` : ``}`);
    } catch {
      setLlegadaHint(``);
    }
  }
  async function redactarConGrok() {
    setGrokObsBusy(true);
    F(null);
    try {
      const movement = {
        tipo: e,
        yardaId: c,
        empresaId: d,
        placa: normalizePlacaMX(O),
        placaCamionTrasera: normalizePlacaMX(placaCamionTraseraVal),
        motivoSinPlacaTrasera: motivoSinPlacaTrasera.trim(),
        numeroEconomico: me.trim(),
        chofer: `${Ce.trim()} ${we.trim()}`.trim(),
        operador: xe.trim(),
        cliente: Oe.trim(),
        origen: Ae.trim(),
        destino: Me.trim(),
        selloNumero: Ue.trim(),
        selloEntrada: P || ``,
        selloCoincideEntrada: At === `ok` ? true : At === `mismatch` ? false : null,
        condicionGeneral: Be,
        kilometros: Pe === `` ? null : Number(Pe),
        dieselPorcentaje: Ie === `` ? null : Number(Ie),
        checklist: $e,
        llevaRefrigerada: Boolean(wt)
      };
      const res = await fetch(`/api/patio-grok`, {
        method: `POST`,
        headers: {
          "Content-Type": `application/json`
        },
        body: JSON.stringify({
          action: `redactar-observaciones`,
          draft: Xe,
          movement
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.error || `Grok HTTP ${res.status}`);
      }
      if (!j.text) {
        throw new Error(`Grok no devolvió texto`);
      }
      Qe(String(j.text));
      vt(`Borrador de Grok listo. Revísalo y guarda tú el movimiento.`);
    } catch (err) {
      F(err instanceof Error ? err.message : `No se pudo redactar con Grok`);
    } finally {
      setGrokObsBusy(false);
    }
  }
  return <form className={`form-panel`} id={`movement-form`} onSubmit={e => void jt(e)}>{(0, createPortal)(<div className={`sticky-save-bar`}><button type={`button`} className={`btn primary sticky-save`} disabled={yt} onClick={() => {
        document.getElementById(`movement-form`)?.requestSubmit();
      }}>{yt ? `Guardando…` : e === `entrada` ? `Guardar entrada` : `Guardar salida`}</button></div>, document.body)}<div className={`form-head`}><h1>{e === `entrada` ? `Registrar entrada a patio` : `Registrar salida a ruta`}</h1><p>{`Gate check con fotos guiadas, sello, firma y GPS · ~50 mov/día entre Chihuahua, Calera y Calpulalpan.`}</p></div>{e === `entrada` && <fieldset className={`fieldset`}><legend>{`Viaje (App Chofer)`}</legend><label className={`field`}><span>{`viajeId o texto del QR (opcional)`}</span><input className={`input`} data-field={`viaje-id`} value={viajeId} onChange={ev => {
        setViajeId(ev.target.value);
        setLlegadaHint(``);
      }} onBlur={ev => void buscarPreaviso(ev.target.value)} onPaste={ev => {
        let text = ev.clipboardData?.getData(`text`) || ``;
        if (!text.trim()) return;
        ev.preventDefault();
        setViajeId(text.trim());
        void buscarPreaviso(text);
      }} placeholder={`Pega el QR o el viajeId`} autoComplete={`off`} /></label>{llegadaHint && <p className={`hint`} data-field={`llegada-hint`}>{llegadaHint}</p>}</fieldset>}<fieldset className={`fieldset`}><legend>{`Empresa`}</legend><div className={`seg big wrap`}>{ie.map(e => <button type={`button`} className={d === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => Ot(e.id)} key={e.id}>{e.nombre}</button>)}</div></fieldset><fieldset className={`fieldset`}><legend>{`Yarda`}</legend><div className={`seg big wrap`}>{_e.map(e => <button type={`button`} className={c === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => Dt(e.id)} key={e.id}>{e.nombre}</button>)}</div></fieldset>{e === `entrada` && <div className={`quick-picks`}><p className={`label`}>{`Catálogo de equipos`}{n.length === 0 ? ` (vacío · cárgalos en Equipos)` : ``}</p>{n.length > 0 && <l.Fragment><input className={`input`} style={{
          marginTop: 8,
          marginBottom: 8
        }} value={catalogQuery} onChange={ev => setCatalogQuery(ev.target.value)} placeholder={`Buscar placa, económico o chofer…`} /><div className={`chip-row`}>{catalogMatches.map(eq => <button type={`button`} className={`chip`} onClick={() => {
            kt(eq);
            setCatalogQuery(``);
          }} key={eq.id}>{eq.placa}{` · `}{eq.numeroEconomico}{eq.operadorAsignado ? ` · ${eq.operadorAsignado}` : ``}</button>)}</div>{catalogMatches.length === 0 && <p className={`hint`}>{`Sin coincidencias en catálogo.`}</p>}</l.Fragment>}</div>}{e === `salida` && Et.length > 0 && <div className={`quick-picks`}><p className={`label`}>{`Equipos en patio · `}{_e.find(e => e.id === c)?.nombre}</p><div className={`chip-row`}>{Et.map(e => <button type={`button`} className={`chip`} onClick={() => kt(e)} key={e.id}>{e.placa}{` · `}{e.numeroEconomico}</button>)}</div></div>}<fieldset className={`fieldset`}><legend>{`Equipo`}</legend><div className={`field`}><span className={`label`}>{`Tipo (marca uno o varios)`}</span><div className={`tipo-checks`}><label className={`tipo-check${p ? ` on` : ``}`}><input type={`checkbox`} checked={p} onChange={e => m(e.target.checked)} /><span className={`tipo-box`} aria-hidden={`true`} /><span className={`tipo-text`}>{`Camión/Tracto`}</span></label><label className={`tipo-check${h ? ` on` : ``}`}><input type={`checkbox`} checked={h} onChange={e => {
              g(e.target.checked);
              if (!e.target.checked) {
                S(`sencillo`);
              }
            }} /><span className={`tipo-box`} aria-hidden={`true`} /><span className={`tipo-text`}>{`Caja Encortinada`}</span></label><label className={`tipo-check${_ ? ` on` : ``}`}><input type={`checkbox`} checked={_} onChange={e => v(e.target.checked)} /><span className={`tipo-box`} aria-hidden={`true`} /><span className={`tipo-text`}>{`Dolly`}</span></label><label className={`tipo-check${y ? ` on` : ``}`}><input type={`checkbox`} checked={y} onChange={e => {
              b(e.target.checked);
              if (e.target.checked) {
                T(Ze());
              }
            }} /><span className={`tipo-box`} aria-hidden={`true`} /><span className={`tipo-text`}>{`Caja Refrigerada`}</span></label></div></div>{h && <div className={`field encortinada-modo`}><span className={`label`}>{`Caja encortinada *`}</span><div className={`seg wrap`}><button type={`button`} className={x === `sencillo` ? `seg-btn on-ok` : `seg-btn`} onClick={() => S(`sencillo`)}>{`Sencillo`}</button><button type={`button`} className={x === `full` ? `seg-btn on-ok` : `seg-btn`} onClick={() => S(`full`)}>{`Full`}</button></div><p className={`hint`} style={{
          marginTop: 8
        }}>{x === `full` ? `Full = 2 cajas → captura placa de cada una (no son la misma).` : `Sencillo = 1 caja → una sola placa.`}</p><label className={`field`} style={{
          marginTop: 10
        }}><span>{`Placa 1ª caja *`}</span><input className={`input`} value={p ? ce : O} onChange={e => {
            let t = normalizePlacaMX(e.target.value);
            le(t);
            if (!p) {
              re(t);
            }
          }} placeholder={`Placa de la 1ª caja`} required={true} /><PlacaQuickOcr slotId={`placa-caja-1-trasera`} label={`Tomar foto y leer placa`} onPlaca={placa => {
            let t = normalizePlacaMX(placa);
            le(t);
            if (!p) {
              re(t);
            }
          }} /></label>{x === `full` && <label className={`field`} style={{
          marginTop: 10
        }}><span>{`Placa 2ª caja *`}</span><input className={`input`} value={ue} onChange={e => de(normalizePlacaMX(e.target.value))} placeholder={`Placa de la 2ª caja (distinta)`} required={true} /><PlacaQuickOcr slotId={`placa-caja-2-trasera`} label={`Tomar foto y leer placa`} onPlaca={placa => de(normalizePlacaMX(placa))} /></label>}</div>}{y && <div className={`field encortinada-modo`} style={{
        marginTop: 12
      }}><span className={`label`}>{`Caja refrigerada *`}</span><p className={`hint`} style={{
          marginTop: 4
        }}>{`Ingresa la placa y el número económico de la caja refrigerada.`}</p><label className={`field`} style={{
          marginTop: 10
        }}><span>{`Placa caja refrigerada *`}</span><input className={`input`} value={fe} onChange={e => {
            let t = normalizePlacaMX(e.target.value);
            pe(t);
            if (!p && !h) {
              re(t);
              le(t);
            }
          }} placeholder={`Placa de la caja refrigerada`} required={true} /><PlacaQuickOcr slotId={`placa-refrigerada`} label={`Tomar foto y leer placa`} onPlaca={placa => {
            let t = normalizePlacaMX(placa);
            pe(t);
            if (!p && !h) {
              re(t);
              le(t);
            }
          }} /></label><label className={`field`} style={{
          marginTop: 10
        }}><span>{`No. económico caja refrigerada *`}</span><input className={`input`} value={te.economicoCajaRefrigerada ?? ``} onChange={e => T({
            ...te,
            economicoCajaRefrigerada: e.target.value.toUpperCase(),
            economicoMontadoThermo: e.target.value.toUpperCase()
          })} placeholder={`Ej. RF-220`} required={true} /></label></div>}<div className={`grid-2`} style={{
        marginTop: 12
      }}>{p && <label className={`field`}><span>{`Placa camión *`}</span><input className={`input`} value={O} onChange={e => {
            let t = normalizePlacaMX(e.target.value);
            re(t);
            aplicarCatalogoPorPlaca(t);
          }} placeholder={`Placa frontal camión`} required={true} /><PlacaQuickOcr slotId={`placa-camion-frontal`} label={`Tomar foto y leer placa`} onPlaca={placa => {
            let t = normalizePlacaMX(placa);
            re(t);
            if (h && !ce.trim()) {
              le(t);
            }
            aplicarCatalogoPorPlaca(t);
          }} /></label>}{!p && !h && <label className={`field`}><span>{`Placa *`}</span><input className={`input`} value={O} onChange={e => {
            let t = normalizePlacaMX(e.target.value);
            re(t);
            if (xt) {
              le(t);
            }
            aplicarCatalogoPorPlaca(t);
          }} placeholder={xt ? `Placa caja` : `Placa sin guiones`} required={true} /><PlacaQuickOcr slotId={xt ? `placa-caja-1-trasera` : `placa-camion-frontal`} label={`Tomar foto y leer placa`} onPlaca={placa => {
            let t = normalizePlacaMX(placa);
            re(t);
            if (xt) {
              le(t);
            }
            aplicarCatalogoPorPlaca(t);
          }} /></label>}{p && <div className={`field full`}><span className={`label`}>{`Trae placa trasera (sí / no)`}</span><div className={`seg wrap`} style={{
            marginTop: 6
          }}><button type={`button`} className={ae ? `seg-btn on-ok` : `seg-btn`} onClick={() => k(true)}>{`Sí`}</button><button type={`button`} className={ae ? `seg-btn` : `seg-btn on-ok`} onClick={() => k(false)}>{`No`}</button></div>{ae && (placaCamionTraseraVal.trim() || O.trim()) && <p className={`hint`} style={{
            marginTop: 6
          }}>{`Trasera: `}<strong>{(placaCamionTraseraVal.trim() || O.trim()).toUpperCase()}</strong>{placaCamionTraseraVal.trim() && placaCamionTraseraVal.trim().toUpperCase() !== O.trim().toUpperCase() ? ` (OCR ≠ frontal — revisa)` : ` (misma / OCR)`}</p>}{!ae && <div className={`field`} style={{
            marginTop: 10
          }}><span>{`Explícame el motivo porque no trae placa:`}</span><textarea className={`input textarea`} rows={2} value={motivoSinPlacaTrasera} onChange={e => setMotivoSinPlacaTrasera(e.target.value)} placeholder={`Ej. dañada, extraviada, solo frontal…`} required={true} /></div>}</div>}<label className={`field`}><span>{p ? `No. económico tractocamión` : `No. económico`}</span><input className={`input`} value={me} onChange={e => ve(e.target.value)} placeholder={`ECO-045`} /></label><label className={`field`}><span>{`Fecha y hora`}</span><p className={`hint`} data-field={`fecha-hora`}>{kn(abiertoEn)}</p></label>{puedeCapturaTardia(authUser) && <div className={`field`} data-field={`captura-tardia`}><label className={`check-inline`}><input type={`checkbox`} checked={capturaTardia} onChange={ev => setCapturaTardia(ev.target.checked)} />{`Captura tardía`}</label>{capturaTardia && <l.Fragment><label className={`field`}><span>{`Fecha y hora reales`}</span><input className={`input`} type={`datetime-local`} value={ye} onChange={ev => j(ev.target.value)} /></label><label className={`field`}><span>{`Motivo *`}</span><textarea className={`input textarea`} rows={2} value={motivoCapturaTardia} onChange={ev => setMotivoCapturaTardia(ev.target.value)} placeholder={`Por qué se registra después`} /></label></l.Fragment>}</div>}</div>{(xt || St) && !wt && <label className={`check-inline`}><input type={`checkbox`} checked={C} onChange={e => w(e.target.checked)} />{`Exigir foto de interior (vacío / consolidación)`}</label>}</fieldset>{wt && <RefrigeracionForm tipo={e} value={te} onChange={T} entradaVacia={e === `entrada`} refrigeraciones={r} />}<fieldset className={`fieldset`}><legend>{`Personas y ruta`}</legend><div className={`grid-2`}><label className={`field`}><span>{`Operador de patio *`}</span><input className={`input`} value={xe} onChange={e => Se(e.target.value)} placeholder={`Quién registra`} required={true} /></label><label className={`field full`}><span>{`Chofer/Operador (quien entra o sale con la unidad)`}</span></label><label className={`field`}><span>{`Nombre *`}</span><input className={`input`} value={Ce} onChange={e => M(e.target.value)} placeholder={`Nombre`} autoComplete={`given-name`} required={true} /></label><label className={`field`}><span>{`Apellido *`}</span><input className={`input`} value={we} onChange={e => N(e.target.value)} placeholder={`Apellido`} autoComplete={`family-name`} required={true} /></label><label className={`field full`}><span>{`WhatsApp *`}</span><div className={`phone-input`}><span className={`phone-prefix`}>{`+52`}</span><input className={`input`} inputMode={`numeric`} autoComplete={`tel-national`} maxLength={10} value={Te} onChange={e => Ee(e.target.value.replace(/\D/g, ``).slice(0, 10))} placeholder={`10 dígitos del celular`} required={true} /></div></label><label className={`field full`}><span>{`Cliente`}</span><input className={`input`} value={Oe} onChange={e => ke(e.target.value)} placeholder={`Nombre del cliente`} /></label><label className={`field`}><span>{`Origen`}</span><input className={`input`} value={Ae} onChange={e => je(e.target.value)} placeholder={`De dónde viene`} /></label><label className={`field`}><span>{`Destino`}</span><input className={`input`} value={Me} onChange={e => Ne(e.target.value)} placeholder={`A dónde va`} /></label></div></fieldset><fieldset className={`fieldset`}><legend>{`Odómetro y diésel`}</legend><div className={`grid-3`}><label className={`field`}><span>{`Kilómetros`}</span><input className={`input`} type={`number`} min={0} step={1} value={Pe} onChange={e => Fe(e.target.value)} placeholder={`125480`} /></label><label className={`field`}><span>{`Diésel %`}</span><input className={`input`} type={`number`} min={0} max={100} step={1} value={Ie} onChange={e => Le(e.target.value)} placeholder={`65`} /></label><label className={`field`}><span>{`Diésel litros`}</span><input className={`input`} type={`number`} min={0} step={0.1} value={Re} onChange={e => ze(e.target.value)} placeholder={`180`} /></label></div></fieldset>{(xt || St) && <fieldset className={`fieldset`}><legend>{`Sello de seguridad (C-TPAT / OEA)`}</legend>{e === `salida` && <p className={`hint`}>{`Recaptura el sello al salir. No se autocompleta para validar contra la entrada.`}</p>}{e === `salida` && P && <p className={`banner info`}>{`Sello registrado en entrada: `}<strong>{P}</strong></p>}<label className={`field`}><span>{`Número de serie del sello *`}</span><input className={`input`} value={Ue} onChange={t => {
          We(t.target.value.toUpperCase());
          if (e === `salida` && !P && O.trim()) {
            let e = De({
              equipos: n
            }, O);
            let t = e && i.find(t => t.equipoId === e.id);
            if (t?.tipo === `entrada` && t.selloNumero) {
              qe(t.selloNumero.trim().toUpperCase());
            }
          }
        }} placeholder={`Ej. MX-HS-004821`} /></label>{At === `ok` && <p className={`banner success`}>{`Sello coincide con la entrada.`}</p>}{At === `mismatch` && <l.Fragment><p className={`banner error`}>{`Discrepancia de sello: entrada `}{P}{` ≠ salida `}{Ue.trim().toUpperCase()}</p><label className={`check-inline`}><input type={`checkbox`} checked={Je} onChange={e => Ye(e.target.checked)} />{`Confirmo discrepancia (queda en KPIs / alerta de seguridad)`}</label></l.Fragment>}</fieldset>}<fieldset className={`fieldset`}><legend>{`Condición general`}</legend><div className={`seg big`}>{[`buena`, `regular`, `mala`].map(e => <button type={`button`} className={Be === e ? `seg-btn ${e === `buena` ? `on-ok` : e === `regular` ? `on-warn` : `on-bad`}` : `seg-btn`} onClick={() => He(e)} key={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</button>)}</div></fieldset>{e === `entrada` && onPromptOt && (Be === `mala` || $e.some(item => item.ok === false)) && <p className={`banner warn`}>{`Falla crítica o condición mala. `}<button type={`button`} className={`btn primary`} onClick={() => onPromptOt({
  unidadId: O.trim() || undefined,
  placa: normalizePlacaMX(O),
  tipo: `CORRECTIVO`,
  prioridad: Be === `mala` ? `ALTA` : `MEDIA`,
  motivo: Be === `mala` ? `Condición mala en entrada` : `Falla en checklist de entrada`,
  yarda: c,
  origen: `entrada`,
  fotosAntesJson: Tt.filter(slot => tt[slot.id]).map(slot => tt[slot.id]).filter(Boolean),
  movimientoOrigenId: undefined,
  zonaSlot: zonaSlotCap?.zonaSlot || zonaSlotCap?.zona || ``
})}>{`Enviar a mantenimiento`}</button></p>}<fieldset className={`fieldset`}><legend>{`Checklist NOM / físico-mecánico`}</legend><ChecklistInspeccion items={$e} onChange={et} /></fieldset><fieldset className={`fieldset`}><legend>{`Registro fotográfico guiado`}</legend><GuidedPhotos slots={Tt} captured={tt} onChange={nt} onPlateOcr={(slotId, placa) => {
          applyPlacaOcrToForm(slotId, placa, {
            setPlaca: re,
            setPlacaCamionTrasera: setPlacaCamionTraseraVal,
            setPlacaCaja1: le,
            setPlacaCaja2: de
          });
        }} /></fieldset><fieldset className={`fieldset`}><legend>{`Cumplimiento México (gate)`}</legend><DocumentosGate value={ut} onChange={pt} /></fieldset><fieldset className={`fieldset`}><legend>{`Firma digital`}</legend><FirmaCanvas value={rt} onChange={st} signerName={ct} onSignerNameChange={lt} /><p className={`hint`}>{`Al guardar se captura GPS del dispositivo (si el cel lo permite).`}</p></fieldset><fieldset className={`fieldset`}><legend>{`Observaciones`}</legend><textarea className={`input textarea`} rows={3} value={Xe} onChange={e => Qe(e.target.value)} placeholder={`Daños, incidencias, NOM-068 / pesos…`} /><div className={`hero-actions`} style={{
          marginTop: 10
        }}><button type={`button`} className={`btn soft`} disabled={grokObsBusy} onClick={() => void redactarConGrok()}>{grokObsBusy ? `Redactando…` : `Redactar con Grok`}</button><span className={`hint`}>{`Solo sugiere texto. Tú revisas y guardas.`}</span></div></fieldset>{gt && <p className={`banner error`}>{gt}</p>}{_t && <p className={`banner success`}>{_t}</p>}{zonaSlotCap.node}<button type={`submit`} className={`btn primary wide`} disabled={yt}>{yt ? `Guardando…` : e === `entrada` ? `Guardar entrada` : `Guardar salida`}</button></form>;
}
