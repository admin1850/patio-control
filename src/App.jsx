import * as l from "react";
import { createPortal } from "react-dom";
import { v4 as ee } from "uuid";
import PlacaQuickOcr from "./components/PlacaQuickOcr.jsx";
import {
  applyPlacaOcrToForm,
  getPlateRecognizerToken,
  isPlateSlot,
  normalizePlacaMX,
  readPlacaFromDataUrl,
  setPlateRecognizerToken,
} from "./lib/placaOcr.js";

function _Component({
  slots: e,
  captured: t,
  onChange: n,
  onPlateOcr: onPlateOcrProp
}) {
  let r = (0, l.useRef)(null);
  let [i, a] = (0, l.useState)(e[0]?.id ?? ``);
  let [o, s] = (0, l.useState)(null);
  let [ocrHint, setOcrHint] = (0, l.useState)(null);
  let [ocrBusy, setOcrBusy] = (0, l.useState)(false);
  let c = e.find(e => e.id === i) ?? e[0];
  let u = e.filter(e => t[e.id]).length;
  let d = e.filter(e => e.required && t[e.id]).length;
  let f = e.filter(e => e.required).length;
  let canLeer = !!(c && isPlateSlot(c) && t[c.id] && onPlateOcrProp);
  async function p(file) {
    if (!file || !c) {
      return;
    }
    if (!file.type.startsWith(`image/`)) {
      s(`Solo imágenes`);
      return;
    }
    s(null);
    setOcrHint(null);
    let dataUrl = await re(file);
    let next = {
      ...t,
      [c.id]: dataUrl
    };
    n(next);
    let idx = e.findIndex(e => e.id === c.id);
    let nextEmpty = e.slice(idx + 1).find(e => !next[e.id]);
    if (nextEmpty) {
      a(nextEmpty.id);
    }
  }
  async function leerPlaca() {
    if (!c || !t[c.id] || !onPlateOcrProp) return;
    setOcrBusy(true);
    s(null);
    setOcrHint(`Leyendo placa…`);
    try {
      let result = await readPlacaFromDataUrl(t[c.id]);
      let placa = normalizePlacaMX(result.placa);
      onPlateOcrProp(c.id, placa, { confidence: result.confidence, engine: result.engine });
      let pct = Math.round(result.confidence * 100);
      setOcrHint(
        result.confidence >= 0.55
          ? `Placa sugerida: ${placa} (${pct}% · ${result.engine}). Confirma o edita.`
          : `Lectura débil: ${placa} (${pct}%). Revisa y corrige a mano.`
      );
    } catch (err) {
      setOcrHint(null);
      s(err instanceof Error ? err.message : `No se pudo leer la placa`);
    } finally {
      setOcrBusy(false);
    }
  }
  function m(slotId) {
    let r = {
      ...t
    };
    delete r[slotId];
    n(r);
    a(slotId);
    setOcrHint(null);
  }
  if (c) {
    const Component = `span`;
    const Component2 = `span`;
    const Component3 = `div`;
    const Component4 = `button`;
    const Component5 = `div`;
    const Component6 = `div`;
    const Component7 = `img`;
    const Component8 = `p`;
    const Component9 = `p`;
    const Component10 = `div`;
    const Component11 = `div`;
    const Component12 = `button`;
    const Component13 = `button`;
    const Component14 = `div`;
    const Component15 = `p`;
    const Component16 = `input`;
    const Component17 = `p`;
    const Component18 = `div`;
    const ComponentOcr = `p`;
    const ComponentLeer = `button`;
    return <Component18 className={`guided-photos`}><Component3 className={`guided-progress`}><Component>{d}{`/`}{f}{` obligatorias`}</Component><Component2 className={`hint`}>{u}{`/`}{e.length}{` capturadas`}</Component2></Component3><Component5 className={`slot-chips`}>{e.map((e, n) => <Component4 type={`button`} className={`slot-chip ${c.id === e.id ? `active` : ``} ${t[e.id] ? `done` : ``} ${e.required ? `` : `optional`}`} onClick={() => a(e.id)} key={e.id}>{n + 1}{`. `}{e.label}{e.required ? `` : ` (opc.)`}</Component4>)}</Component5><Component11 className={`guide-stage sil-${c.silhouette}`}><Component6 className={`sil-overlay`} aria-hidden={true}><O kind={c.silhouette} /></Component6>{t[c.id] ? <Component7 className={`guide-preview`} src={t[c.id]} alt={c.label} /> : <Component10 className={`guide-placeholder`}><Component8 className={`guide-title`}>{c.label}</Component8><Component9 className={`guide-hint`}>{c.hint}</Component9></Component10>}</Component11><Component14 className={`hero-actions`}><Component12 type={`button`} className={`btn primary`} onClick={() => r.current?.click()}>{t[c.id] ? `Retomar con cámara` : `Tomar foto (solo cámara)`}</Component12>{canLeer && <ComponentLeer type={`button`} className={`btn soft`} disabled={ocrBusy} onClick={() => void leerPlaca()}>{ocrBusy ? `Leyendo…` : `Leer placa`}</ComponentLeer>}{t[c.id] && <Component13 type={`button`} className={`btn soft`} onClick={() => m(c.id)}>{`Quitar`}</Component13>}</Component14><Component15 className={`hint`}>{`Usa la cámara del dispositivo. No uses fotos de la galería.`}{isPlateSlot(c) ? ` En placa: toma la foto y pulsa “Leer placa” (Plate Recognizer / Vision).` : ``}</Component15>{ocrHint && <ComponentOcr className={`ocr-msg hint`}>{ocrHint}</ComponentOcr>}<Component16 ref={r} type={`file`} accept={`image/*`} capture={`environment`} hidden={true} onChange={e => {
        p(e.target.files?.[0]);
        e.target.value = ``;
      }} />{o && <Component17 className={`field-error`}>{o}</Component17>}</Component18>;
  } else {
    return null;
  }
}
function O({
  kind: e
}) {
  switch (e) {
    case `front`:
      const Component19 = `rect`;
      const Component20 = `rect`;
      const Component21 = `text`;
      const Component22 = `svg`;
      return <Component22 viewBox={`0 0 200 120`} className={`sil-svg`}><Component19 x={`40`} y={`35`} width={`120`} height={`55`} rx={`8`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><Component20 x={`70`} y={`45`} width={`60`} height={`28`} rx={`3`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`} /><Component21 x={`100`} y={`110`} textAnchor={`middle`} fontSize={`11`} fill={`currentColor`}>{`FRONTAL`}</Component21></Component22>;
    case `side`:
      const Component23 = `path`;
      const Component24 = `circle`;
      const Component25 = `circle`;
      const Component26 = `svg`;
      return <Component26 viewBox={`0 0 200 120`} className={`sil-svg`}><Component23 d={`M25 75 H155 L170 55 H95 L80 40 H40 L25 55 Z`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><Component24 cx={`50`} cy={`78`} r={`12`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`} /><Component25 cx={`140`} cy={`78`} r={`12`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`} /></Component26>;
    case `dash`:
      const Component27 = `rect`;
      const Component28 = `rect`;
      const Component29 = `circle`;
      const Component30 = `text`;
      const Component31 = `svg`;
      return <Component31 viewBox={`0 0 200 120`} className={`sil-svg`}><Component27 x={`30`} y={`40`} width={`140`} height={`50`} rx={`6`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><Component28 x={`45`} y={`55`} width={`50`} height={`20`} rx={`2`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`} /><Component29 cx={`140`} cy={`65`} r={`14`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`} /><Component30 x={`100`} y={`110`} textAnchor={`middle`} fontSize={`11`} fill={`currentColor`}>{`TABLERO`}</Component30></Component31>;
    case `odometer`:
      const Component32 = `rect`;
      const Component33 = `text`;
      const Component34 = `text`;
      const Component35 = `svg`;
      return <Component35 viewBox={`0 0 200 120`} className={`sil-svg`}><Component32 x={`40`} y={`38`} width={`120`} height={`36`} rx={`4`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><Component33 x={`100`} y={`62`} textAnchor={`middle`} fontSize={`18`} fill={`currentColor`} fontFamily={`monospace`}>{`452 180`}</Component33><Component34 x={`100`} y={`100`} textAnchor={`middle`} fontSize={`11`} fill={`currentColor`}>{`ODÓMETRO · LEGIBLE`}</Component34></Component35>;
    case `fuel`:
      const Component36 = `circle`;
      const Component37 = `path`;
      const Component38 = `line`;
      const Component39 = `text`;
      const Component40 = `svg`;
      return <Component40 viewBox={`0 0 200 120`} className={`sil-svg`}><Component36 cx={`100`} cy={`58`} r={`28`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><Component37 d={`M85 70 A22 22 0 0 1 118 48`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} /><Component38 x1={`100`} y1={`58`} x2={`118`} y2={`42`} stroke={`currentColor`} strokeWidth={`2.5`} /><Component39 x={`100`} y={`105`} textAnchor={`middle`} fontSize={`11`} fill={`currentColor`}>{`COMBUSTIBLE`}</Component39></Component40>;
    case `rear`:
      const Component41 = `rect`;
      const Component42 = `line`;
      const Component43 = `svg`;
      return <Component43 viewBox={`0 0 200 120`} className={`sil-svg`}><Component41 x={`55`} y={`25`} width={`90`} height={`70`} rx={`4`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><Component42 x1={`100`} y1={`25`} x2={`100`} y2={`95`} stroke={`currentColor`} strokeWidth={`2`} strokeDasharray={`4 3`} /></Component43>;
    case `seal`:
      const Component44 = `rect`;
      const Component45 = `text`;
      const Component46 = `svg`;
      return <Component46 viewBox={`0 0 200 120`} className={`sil-svg`}><Component44 x={`60`} y={`35`} width={`80`} height={`50`} rx={`4`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><Component45 x={`100`} y={`65`} textAnchor={`middle`} fontSize={`14`} fill={`currentColor`}>{`SELLO #`}</Component45></Component46>;
    case `interior`:
      const Component47 = `polygon`;
      const Component48 = `line`;
      const Component49 = `svg`;
      return <Component49 viewBox={`0 0 200 120`} className={`sil-svg`}><Component47 points={`40,90 100,30 160,90`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><Component48 x1={`55`} y1={`90`} x2={`145`} y2={`90`} stroke={`currentColor`} strokeWidth={`2`} /></Component49>;
    case `tire`:
      const Component50 = `circle`;
      const Component51 = `circle`;
      const Component52 = `svg`;
      return <Component52 viewBox={`0 0 200 120`} className={`sil-svg`}><Component50 cx={`100`} cy={`60`} r={`35`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><Component51 cx={`100`} cy={`60`} r={`12`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`} /></Component52>;
    case `fifth`:
      const Component53 = `rect`;
      const Component54 = `line`;
      const Component55 = `line`;
      const Component56 = `svg`;
      return <Component56 viewBox={`0 0 200 120`} className={`sil-svg`}><Component53 x={`70`} y={`40`} width={`60`} height={`40`} rx={`6`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><Component54 x1={`40`} y1={`55`} x2={`70`} y2={`55`} stroke={`#c0392b`} strokeWidth={`4`} /><Component55 x1={`40`} y1={`70`} x2={`70`} y2={`70`} stroke={`#2980b9`} strokeWidth={`4`} /></Component56>;
    case `plate`:
      const Component57 = `rect`;
      const Component58 = `text`;
      const Component59 = `text`;
      const Component60 = `svg`;
      return <Component60 viewBox={`0 0 200 120`} className={`sil-svg`}><Component57 x={`35`} y={`40`} width={`130`} height={`42`} rx={`6`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><Component58 x={`100`} y={`67`} textAnchor={`middle`} fontSize={`16`} fill={`currentColor`} fontFamily={`monospace`}>{`PLACA`}</Component58><Component59 x={`100`} y={`105`} textAnchor={`middle`} fontSize={`11`} fill={`currentColor`}>{`ACERCAR · LEGIBLE`}</Component59></Component60>;
    case `thermo`:
      const Component61 = `rect`;
      const Component62 = `text`;
      const Component63 = `text`;
      const Component64 = `text`;
      const Component65 = `svg`;
      return <Component65 viewBox={`0 0 200 120`} className={`sil-svg`}><Component61 x={`45`} y={`28`} width={`110`} height={`64`} rx={`6`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><Component62 x={`100`} y={`52`} textAnchor={`middle`} fontSize={`12`} fill={`currentColor`}>{`SET · REAL`}</Component62><Component63 x={`100`} y={`72`} textAnchor={`middle`} fontSize={`14`} fill={`currentColor`} fontFamily={`monospace`}>{`-18.0°C`}</Component63><Component64 x={`100`} y={`110`} textAnchor={`middle`} fontSize={`11`} fill={`currentColor`}>{`PANEL THERMO`}</Component64></Component65>;
    case `thermo-fuel`:
      const Component66 = `rect`;
      const Component67 = `line`;
      const Component68 = `text`;
      const Component69 = `svg`;
      return <Component69 viewBox={`0 0 200 120`} className={`sil-svg`}><Component66 x={`70`} y={`30`} width={`60`} height={`55`} rx={`4`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><Component67 x1={`78`} y1={`70`} x2={`122`} y2={`70`} stroke={`currentColor`} strokeWidth={`3`} /><Component68 x={`100`} y={`110`} textAnchor={`middle`} fontSize={`11`} fill={`currentColor`}>{`DIÉSEL THERMO`}</Component68></Component69>;
    default:
      return null;
  }
}
function re(e, t = 1280, n = 0.72) {
  return new Promise((r, i) => {
    let a = new FileReader();
    a.onload = () => {
      let e = new Image();
      e.onload = () => {
        let a = Math.min(1, t / e.width);
        let o = document.createElement(`canvas`);
        o.width = Math.round(e.width * a);
        o.height = Math.round(e.height * a);
        let s = o.getContext(`2d`);
        if (!s) {
          i(Error(`No canvas`));
          return;
        }
        s.drawImage(e, 0, 0, o.width, o.height);
        r(o.toDataURL(`image/jpeg`, n));
      };
      e.onerror = i;
      e.src = a.result;
    };
    a.onerror = i;
    a.readAsDataURL(e);
  });
}
var ie = [{
  id: `api`,
  nombre: `API`
}, {
  id: `carbal-pia`,
  nombre: `Carbal/Pia`
}];
var ae = `patio-control-empresa`;
function k(e) {
  return ie.find(t => t.id === e)?.nombre ?? `—`;
}
function oe() {
  let e = localStorage.getItem(ae);
  if (e && ie.some(t => t.id === e)) {
    return e;
  } else {
    return `api`;
  }
}
function se(e) {
  localStorage.setItem(ae, e);
}
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
function ge(e, t) {
  return e.filter(e => e.required).every(e => !!t[e.id]);
}
var _e = [{
  id: `chihuahua`,
  nombre: `Chihuahua`,
  estado: `Chihuahua`
}, {
  id: `calera`,
  nombre: `Calera`,
  estado: `Zacatecas`
}, {
  id: `calpulalpan`,
  nombre: `Calpulalpan`,
  estado: `Tlaxcala`
}];
var ve = `patio-control-yarda`;
function ye(e) {
  return _e.find(t => t.id === e)?.nombre ?? `—`;
}
function be() {
  let e = localStorage.getItem(ve);
  if (e && _e.some(t => t.id === e)) {
    return e;
  } else {
    return `chihuahua`;
  }
}
function A(e) {
  localStorage.setItem(ve, e);
}
var j = `patio-control-v1`;
var xe = {
  equipos: [],
  refrigeraciones: [],
  movimientos: []
};
function Se(e) {
  let t = e.fotosEvidencia?.length ? e.fotosEvidencia : (e.fotos ?? []).map((e, t) => ({
    slotId: `legacy-${t}`,
    label: `Foto ${t + 1}`,
    url: e
  }));
  return {
    ...e,
    yardaId: e.yardaId ?? `chihuahua`,
    empresaId: e.empresaId ?? `api`,
    fotosEvidencia: t,
    fotos: t.map(e => e.url)
  };
}
function Ce() {
  try {
    let e = localStorage.getItem(j);
    if (!e) {
      return structuredClone(xe);
    }
    let t = JSON.parse(e);
    return {
      equipos: t.equipos ?? [],
      refrigeraciones: t.refrigeraciones ?? [],
      movimientos: (t.movimientos ?? []).map(Se)
    };
  } catch {
    return structuredClone(xe);
  }
}
function M(e) {
  localStorage.setItem(j, JSON.stringify(e));
}
function we(e, t) {
  let n = e.equipos.findIndex(e => e.id === t.id) >= 0 ? e.equipos.map(e => e.id === t.id ? t : e) : [t, ...e.equipos];
  let r = {
    ...e,
    equipos: n
  };
  M(r);
  return r;
}
function N(e, t) {
  let n = e.refrigeraciones.findIndex(e => e.id === t.id) >= 0 ? e.refrigeraciones.map(e => e.id === t.id ? t : e) : [t, ...e.refrigeraciones];
  let r = {
    ...e,
    refrigeraciones: n
  };
  M(r);
  return r;
}
function Te(e, t) {
  let n = {
    ...e,
    refrigeraciones: e.refrigeraciones.filter(e => e.id !== t)
  };
  M(n);
  return n;
}
function Ee(e, t) {
  let n = {
    ...e,
    movimientos: [Se(t), ...e.movimientos]
  };
  M(n);
  return n;
}
function De(e, t) {
  let n = t.trim().toUpperCase();
  return e.equipos.find(e => e.placa.toUpperCase() === n);
}
function Oe(e, t) {
  return e.find(e => e.equipoId === t);
}
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
function Ne({
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
  const Component70 = `button`;
  const Component71 = `div`;
  const Component72 = `h1`;
  const Component73 = `p`;
  const Component74 = `div`;
  const Component75 = `legend`;
  const Component76 = `button`;
  const Component77 = `div`;
  const Component78 = `button`;
  const Component79 = `div`;
  const Component80 = `fieldset`;
  const Component81 = `legend`;
  const Component82 = `input`;
  const Component83 = `fieldset`;
  const Component84 = `legend`;
  const Component85 = `input`;
  const Component86 = `span`;
  const Component87 = `span`;
  const Component88 = `label`;
  const Component89 = `div`;
  const Component90 = `input`;
  const Component91 = `fieldset`;
  const Component92 = `legend`;
  const Component93 = `input`;
  const Component94 = `fieldset`;
  const Component95 = `legend`;
  const Component96 = `fieldset`;
  const Component97 = `p`;
  const Component98 = `p`;
  const Component99 = `button`;
  const Component100 = `form`;
  return <Component100 className={`form-panel`} id={`baja-form`} onSubmit={e => void T(e)}>{(0, createPortal)(<Component71 className={`sticky-save-bar`}><Component70 type={`button`} className={`btn primary sticky-save`} disabled={w} onClick={() => {
        document.getElementById(`baja-form`)?.requestSubmit();
      }}>{w ? `Guardando…` : `Guardar cambios`}</Component70></Component71>, document.body)}<Component74 className={`form-head`}><Component72>{`Baja de inventario`}</Component72><Component73>{`La unidad ya no está en yarda (salió sin registrar, no era nuestra, error). Requiere foto y motivo.`}</Component73></Component74><Component80 className={`fieldset`}><Component75>{`Empresa / Yarda`}</Component75><Component77 className={`seg wrap`}>{ie.map(e => <Component76 type={`button`} className={s === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => c(e.id)} key={e.id}>{e.nombre}</Component76>)}</Component77><Component79 className={`seg wrap`} style={{
        marginTop: 8
      }}>{_e.map(e => <Component78 type={`button`} className={a === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => o(e.id)} key={e.id}>{e.nombre}</Component78>)}</Component79></Component80><Component83 className={`fieldset`}><Component81>{`Placa *`}</Component81><Component82 className={`input`} value={u} onChange={e => d(normalizePlacaMX(e.target.value))} placeholder={`Placa sin guiones`} required={true} /><PlacaQuickOcr slotId={`placa`} label={`Tomar foto y leer placa`} onPlaca={placa => d(normalizePlacaMX(placa))} /></Component83><Component91 className={`fieldset`}><Component84>{`Motivo *`}</Component84><Component89 className={`tipo-checks`}>{je.map(e => <Component88 className={`tipo-check${f === e.id ? ` on` : ``}`} key={e.id}><Component85 type={`radio`} name={`motivoBaja`} checked={f === e.id} onChange={() => p(e.id)} /><Component86 className={`tipo-box`} aria-hidden={`true`} /><Component87 className={`tipo-text`}>{e.label}</Component87></Component88>)}</Component89>{f === `otro` && <Component90 className={`input`} style={{
        marginTop: 10
      }} value={m} onChange={e => h(e.target.value)} placeholder={`Describe el motivo`} required={true} />}</Component91><Component94 className={`fieldset`}><Component92>{`Quién registra *`}</Component92><Component93 className={`input`} value={g} onChange={e => _(e.target.value)} placeholder={`Nombre de caseta`} required={true} /></Component94><Component96 className={`fieldset`}><Component95>{`Foto evidencia *`}</Component95><_Component slots={Ae} captured={v} onChange={y} /></Component96>{b && <Component97 className={`banner error`}>{b}</Component97>}{S && <Component98 className={`banner success`}>{S}</Component98>}<Component99 type={`submit`} className={`btn primary wide`} disabled={w}>{w ? `Guardando…` : `Confirmar baja`}</Component99></Component100>;
}
var Pe = `patio-control-kiosk`;
function Fe() {
  return localStorage.getItem(Pe) === `1`;
}
function Ie(e) {
  localStorage.setItem(Pe, e ? `1` : `0`);
}
function Le() {
  let [e, t] = (0, l.useState)(null);
  let [n, r] = (0, l.useState)(() => localStorage.getItem(`patio-hide-install`) === `1`);
  (0, l.useEffect)(() => {
    let e = e => {
      e.preventDefault();
      t(e);
    };
    window.addEventListener(`beforeinstallprompt`, e);
    return () => window.removeEventListener(`beforeinstallprompt`, e);
  }, []);
  if (n || !e) {
    return null;
  } else {
    const Component101 = `p`;
    const Component102 = `button`;
    const Component103 = `button`;
    const Component104 = `div`;
    const Component105 = `div`;
    return <Component105 className={`install-banner`}><Component101>{`Instala PatioControl en este dispositivo para usarlo como app de caseta.`}</Component101><Component104 className={`hero-actions`}><Component102 type={`button`} className={`btn primary`} onClick={() => {
          e.prompt().then(() => {
            t(null);
          });
        }}>{`Instalar`}</Component102><Component103 type={`button`} className={`btn soft`} onClick={() => {
          localStorage.setItem(`patio-hide-install`, `1`);
          r(true);
        }}>{`Ahora no`}</Component103></Component104></Component105>;
  }
}
var Re = [{
  id: `dashboard`,
  label: `Patio`,
  short: `Patio`
}, {
  id: `entrada`,
  label: `Entrada`,
  short: `Entrada`
}, {
  id: `salida`,
  label: `Salida`,
  short: `Salida`
}, {
  id: `historial`,
  label: `Historial`,
  short: `Historial`
}, {
  id: `kpis`,
  label: `KPIs`,
  short: `KPIs`
}, {
  id: `equipos`,
  label: `Equipos`,
  short: `Equipos`
}, {
  id: `workspace`,
  label: `Workspace`,
  short: `Cloud`
}];
function _Component7({
  page: e,
  onNavigate: t,
  onBack: n,
  children: r,
  modeLabel: i,
  syncing: a,
  online: o = true,
  queueCount: s = 0,
  onFlushQueue: c
}) {
  let [u, d] = (0, l.useState)(() => Fe());
  (0, l.useEffect)(() => {
    document.documentElement.classList.toggle(`kiosk`, u);
    Ie(u);
  }, [u]);
  let f = e !== `dashboard` && !!n;
  const Component106 = `p`;
  const Component107 = `p`;
  const Component108 = `div`;
  const Component109 = `button`;
  const Component110 = `button`;
  const Component111 = `nav`;
  const Component112 = `div`;
  const Component113 = `header`;
  const Component114 = `p`;
  const Component115 = `button`;
  const Component116 = `p`;
  const Component117 = `main`;
  const Component118 = `button`;
  const Component119 = `button`;
  const Component120 = `nav`;
  const Component121 = `div`;
  return <Component121 className={u ? `app-shell kiosk-shell` : `app-shell`}><Component113 className={`topbar`}><Component108 className={`brand-block`}><Component106 className={`brand`}>{`PatioControl`}</Component106><Component107 className={`brand-sub`}>{`Gate · evidencias · cumplimiento`}{i ? ` · ${i}` : ``}{a ? ` · sync…` : ``}{u ? ` · quiosco` : ``}{o ? `` : ` · OFFLINE`}</Component107></Component108><Component112 className={`topbar-actions`}><Component109 type={`button`} className={u ? `nav-link active` : `nav-link`} onClick={() => d(e => !e)} title={`Botones y textos más grandes para tablet de caseta`}>{u ? `Quiosco ON` : `Quiosco`}</Component109><Component111 className={`nav-desktop`} aria-label={`Principal`}>{Re.map(n => <Component110 type={`button`} className={e === n.id ? `nav-link active` : `nav-link`} onClick={() => t(n.id)} key={n.id}>{n.label}</Component110>)}</Component111></Component112></Component113>{!o && <Component114 className={`banner error status-strip`}>{`Sin conexión · los registros se guardan en este dispositivo y se suben después.`}</Component114>}{o && s > 0 && <Component116 className={`banner info status-strip`}>{s}{` movimiento(s) pendientes de subir a Workspace.`}{` `}{c && <Component115 type={`button`} className={`text-btn`} onClick={c}>{`Subir ahora`}</Component115>}</Component116>}<Le /><Component117 className={`main`}>{r}</Component117>{f && <Component118 type={`button`} className={`btn-back-fixed`} onClick={n} aria-label={`Atrás`}>{`← Atrás`}</Component118>}<Component120 className={`nav-mobile`} aria-label={`Móvil`}>{Re.map(n => <Component119 type={`button`} className={e === n.id ? `mob-link active` : `mob-link`} onClick={() => t(n.id)} key={n.id}>{n.short}</Component119>)}</Component120></Component121>;
}
function Be(e) {
  if (e.fotoUrls?.length) {
    return e.fotoUrls;
  } else if (e.fotoUrl) {
    return [e.fotoUrl];
  } else {
    return [];
  }
}
function Ve({
  items: e,
  onChange: t,
  mode: n = `ok-falla`
}) {
  let r = (0, l.useRef)({});
  let i = (0, l.useRef)({});
  let [a, o] = (0, l.useState)(null);
  let [s, c] = (0, l.useState)(null);
  function u(n, r) {
    t(e.map(e => e.id === n ? {
      ...e,
      ...r
    } : e));
  }
  function d(e, t) {
    u(e, {
      ok: t,
      ...(t ? {
        nota: undefined,
        fotoUrls: undefined,
        fotoUrl: undefined
      } : {})
    });
  }
  function f(e, t) {
    u(e, {
      nota: t
    });
  }
  function p(e, t) {
    u(e, {
      fotoUrls: t.length ? t : undefined,
      fotoUrl: undefined
    });
  }
  async function m(t, n) {
    if (!n?.length) {
      return;
    }
    let r = Array.from(n).filter(e => e.type.startsWith(`image/`));
    if (!r.length) {
      c(`Solo imágenes`);
      return;
    }
    c(null);
    o(t);
    try {
      let n = [];
      for (let e of r) {
        n.push(await He(e));
      }
      let i = e.find(e => e.id === t);
      p(t, [...(i ? Be(i) : []), ...n]);
    } catch {
      c(`No se pudo procesar alguna foto`);
    } finally {
      o(null);
    }
  }
  function h(t, n) {
    let r = e.find(e => e.id === t);
    if (r) {
      p(t, Be(r).filter((e, t) => t !== n));
    }
  }
  let g = e.filter(e => e.ok === null).length;
  let _ = e.filter(e => e.ok === false).length;
  let v = n === `aprobado-rechazado` ? `Aprobado` : `OK`;
  let y = n === `aprobado-rechazado` ? `Rechazado` : `Falla`;
  const Component122 = `span`;
  const Component123 = `span`;
  const Component124 = `span`;
  const Component125 = `div`;
  const Component146 = `ul`;
  const Component147 = `p`;
  const Component148 = `div`;
  return <Component148 className={`checklist`}><Component125 className={`checklist-meta`}><Component122>{e.length - g}{` revisados`}</Component122>{g > 0 && <Component123 className={`warn`}>{g}{` pendientes`}</Component123>}{_ > 0 && <Component124 className={`bad`}>{_}{` con falla`}</Component124>}</Component125><Component146 className={`checklist-list`}>{e.map(e => {
        let t = Be(e);
        const Component126 = `span`;
        const Component127 = `button`;
        const Component128 = `button`;
        const Component129 = `div`;
        const Component130 = `div`;
        const Component131 = `input`;
        const Component132 = `span`;
        const Component133 = `p`;
        const Component134 = `img`;
        const Component135 = `button`;
        const Component136 = `div`;
        const Component137 = `div`;
        const Component138 = `button`;
        const Component139 = `button`;
        const Component140 = `div`;
        const Component141 = `input`;
        const Component142 = `input`;
        const Component143 = `div`;
        const Component144 = `div`;
        const Component145 = `li`;
        return <Component145 className={`checklist-row`} key={e.id}><Component130 className={`checklist-main`}><Component126 className={`checklist-label`}>{e.label}</Component126><Component129 className={`seg`}><Component127 type={`button`} className={e.ok === true ? `seg-btn on-ok` : `seg-btn`} onClick={() => d(e.id, true)}>{v}</Component127><Component128 type={`button`} className={e.ok === false ? `seg-btn on-bad` : `seg-btn`} onClick={() => d(e.id, false)}>{y}</Component128></Component129></Component130>{e.ok === false && <Component144 className={`falla-extra`}><Component131 className={`input compact`} placeholder={`Detalle de la falla`} value={e.nota ?? ``} onChange={t => f(e.id, t.target.value)} /><Component143 className={`falla-foto`}><Component133 className={`falla-foto-title`}>{`Fotos de la falla `}<Component132 className={`badge opcional`}>{`opcional`}</Component132>{t.length > 0 ? ` · ${t.length} adjunta${t.length === 1 ? `` : `s`}` : ` · sin límite`}</Component133>{t.length > 0 && <Component137 className={`falla-foto-grid`}>{t.map((t, n) => <Component136 className={`falla-foto-card`} key={`${e.id}-foto-${n}`}><Component134 src={t} alt={`Falla ${e.label} ${n + 1}`} /><Component135 type={`button`} className={`falla-foto-remove`} onClick={() => h(e.id, n)} aria-label={`Quitar foto`}>{`Quitar`}</Component135></Component136>)}</Component137>}<Component140 className={`falla-foto-actions`}><Component138 type={`button`} className={`btn primary falla-foto-btn`} onClick={() => i.current[e.id]?.click()} disabled={a === e.id}>{a === e.id ? `Procesando…` : `Tomar foto`}</Component138><Component139 type={`button`} className={`btn soft falla-foto-btn`} onClick={() => r.current[e.id]?.click()} disabled={a === e.id}>{`Subir foto(s)`}</Component139></Component140><Component141 ref={t => {
                i.current[e.id] = t;
              }} type={`file`} accept={`image/*`} capture={`environment`} hidden={true} onChange={t => {
                m(e.id, t.target.files);
                t.target.value = ``;
              }} /><Component142 ref={t => {
                r.current[e.id] = t;
              }} type={`file`} accept={`image/*`} multiple={true} hidden={true} onChange={t => {
                m(e.id, t.target.files);
                t.target.value = ``;
              }} /></Component143></Component144>}</Component145>;
      })}</Component146>{s && <Component147 className={`field-error`}>{s}</Component147>}</Component148>;
}
function He(e, t = 1280, n = 0.72) {
  return new Promise((r, i) => {
    let a = new FileReader();
    a.onload = () => {
      let e = new Image();
      e.onload = () => {
        let a = Math.min(1, t / e.width);
        let o = document.createElement(`canvas`);
        o.width = Math.round(e.width * a);
        o.height = Math.round(e.height * a);
        let s = o.getContext(`2d`);
        if (!s) {
          i(Error(`No canvas`));
          return;
        }
        s.drawImage(e, 0, 0, o.width, o.height);
        r(o.toDataURL(`image/jpeg`, n));
      };
      e.onerror = i;
      e.src = a.result;
    };
    a.onerror = i;
    a.readAsDataURL(e);
  });
}
function Ue(e) {
  let t = e.trim();
  if (!t) {
    return {};
  }
  try {
    let e = new URL(t);
    let n = e.searchParams.get(`id`) || e.searchParams.get(`Id`) || undefined;
    let r = e.searchParams.get(`re`) || e.searchParams.get(`RE`) || undefined;
    let i = e.searchParams.get(`rr`) || e.searchParams.get(`RR`) || undefined;
    if (n || r || i) {
      return {
        uuid: n?.toUpperCase(),
        rfcEmisor: r?.toUpperCase(),
        rfcReceptor: i?.toUpperCase()
      };
    }
  } catch {}
  let n = t.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  let r = t.match(/[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}/gi);
  return {
    uuid: n?.[0]?.toUpperCase(),
    rfcEmisor: r?.[0]?.toUpperCase(),
    rfcReceptor: r?.[1]?.toUpperCase()
  };
}
function We(e) {
  let t = e.trim().toUpperCase();
  return /^[A-Z0-9-]{8,20}$/.test(t);
}
function P(e, t) {
  if (e == null || e > 14 && (t == null || t < 8)) {
    return false;
  } else {
    return e >= 0;
  }
}
function Ge({
  value: e,
  onChange: t,
  requireForGate: n = true
}) {
  let r = (0, l.useRef)(null);
  let [i, a] = (0, l.useState)(null);
  function o(n) {
    let r = {
      ...e,
      ...n
    };
    let i = !!r.cartaPorteUuid && !!r.cartaPorteRfcEmisor && !!r.licenciaFederal && We(r.licenciaFederal || ``) && P(r.bitacoraHorasServicio, r.bitacoraHorasDescanso);
    t({
      ...r,
      validadoGate: i
    });
  }
  function s(t) {
    let n = Ue(t);
    o({
      cartaPorteQrRaw: t,
      cartaPorteUuid: n.uuid || e.cartaPorteUuid,
      cartaPorteRfcEmisor: n.rfcEmisor || e.cartaPorteRfcEmisor,
      cartaPorteRfcReceptor: n.rfcReceptor || e.cartaPorteRfcReceptor
    });
    a(n.uuid ? `CFDI leído: ${n.uuid.slice(0, 8)}…` : `No se detectó UUID. Pega el QR o captura folio manual.`);
  }
  async function c(e) {
    a(null);
    let t = window.BarcodeDetector;
    if (!t) {
      a(`Este navegador no lee QR por cámara. Pega el texto del QR o el UUID.`);
      return;
    }
    try {
      let n = await createImageBitmap(e);
      let r = await new t({
        formats: [`qr_code`]
      }).detect(n);
      n.close();
      if (!r.length) {
        a(`No se encontró QR en la imagen. Intenta de cerca o pega el texto.`);
        return;
      }
      s(r[0].rawValue);
    } catch {
      a(`No se pudo leer el QR. Captura manual.`);
    }
  }
  let u = e.licenciaFederal ? We(e.licenciaFederal) : null;
  let d = P(e.bitacoraHorasServicio, e.bitacoraHorasDescanso);
  const Component149 = `p`;
  const Component150 = `span`;
  const Component151 = `textarea`;
  const Component152 = `label`;
  const Component153 = `div`;
  const Component154 = `button`;
  const Component155 = `input`;
  const Component156 = `div`;
  const Component157 = `p`;
  const Component158 = `span`;
  const Component159 = `input`;
  const Component160 = `label`;
  const Component161 = `span`;
  const Component162 = `input`;
  const Component163 = `label`;
  const Component164 = `span`;
  const Component165 = `input`;
  const Component166 = `label`;
  const Component167 = `span`;
  const Component168 = `input`;
  const Component169 = `label`;
  const Component170 = `div`;
  const Component171 = `h3`;
  const Component172 = `span`;
  const Component173 = `input`;
  const Component174 = `span`;
  const Component175 = `label`;
  const Component176 = `span`;
  const Component177 = `input`;
  const Component178 = `label`;
  const Component179 = `span`;
  const Component180 = `input`;
  const Component181 = `label`;
  const Component182 = `span`;
  const Component183 = `input`;
  const Component184 = `label`;
  const Component185 = `div`;
  const Component186 = `p`;
  const Component187 = `div`;
  const Component188 = `div`;
  return <Component188 className={`compliance`}><Component149 className={`hint`}>{`Validaciones México: Complemento Carta Porte (CFDI) + Licencia Federal + bitácora NOM-087. `}{n ? `Requerido para autorizar gate.` : ``}</Component149><Component153 className={`grid-2`}><Component152 className={`field full`}><Component150>{`QR / URL CFDI Carta Porte`}</Component150><Component151 className={`input textarea`} rows={2} value={e.cartaPorteQrRaw ?? ``} onChange={e => s(e.target.value)} placeholder={`Pega URL del SAT o UUID del CFDI de traslado`} /></Component152></Component153><Component156 className={`hero-actions`}><Component154 type={`button`} className={`btn soft`} onClick={() => r.current?.click()}>{`Escanear QR (foto)`}</Component154><Component155 ref={r} type={`file`} accept={`image/*`} capture={`environment`} hidden={true} onChange={e => {
        let t = e.target.files?.[0];
        if (t) {
          c(t);
        }
        e.target.value = ``;
      }} /></Component156>{i && <Component157 className={`hint`}>{i}</Component157>}<Component170 className={`grid-2`}><Component160 className={`field`}><Component158>{`UUID / Folio fiscal *`}</Component158><Component159 className={`input`} value={e.cartaPorteUuid ?? ``} onChange={e => o({
          cartaPorteUuid: e.target.value.toUpperCase()
        })} placeholder={`XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`} /></Component160><Component163 className={`field`}><Component161>{`RFC emisor *`}</Component161><Component162 className={`input`} value={e.cartaPorteRfcEmisor ?? ``} onChange={e => o({
          cartaPorteRfcEmisor: e.target.value.toUpperCase()
        })} placeholder={`AAA010101AAA`} /></Component163><Component166 className={`field`}><Component164>{`RFC operador / receptor`}</Component164><Component165 className={`input`} value={e.cartaPorteRfcReceptor ?? ``} onChange={e => o({
          cartaPorteRfcReceptor: e.target.value.toUpperCase()
        })} /></Component166><Component169 className={`field`}><Component167>{`Mercancías (resumen)`}</Component167><Component168 className={`input`} value={e.cartaPorteMercancias ?? ``} onChange={e => o({
          cartaPorteMercancias: e.target.value
        })} placeholder={`Lista breve / clave SAT`} /></Component169></Component170><Component171 className={`subhead`}>{`Licencia Federal Digital (SCT/SICT)`}</Component171><Component185 className={`grid-2`}><Component175 className={`field`}><Component172>{`No. licencia *`}</Component172><Component173 className={`input`} value={e.licenciaFederal ?? ``} onChange={e => o({
          licenciaFederal: e.target.value.toUpperCase()
        })} placeholder={`Escanea o captura`} />{u === false && <Component174 className={`field-error`}>{`Formato de licencia no válido`}</Component174>}</Component175><Component178 className={`field`}><Component176>{`Titular`}</Component176><Component177 className={`input`} value={e.licenciaTitular ?? ``} onChange={e => o({
          licenciaTitular: e.target.value
        })} /></Component178><Component181 className={`field`}><Component179>{`Horas de servicio (última bitácora) *`}</Component179><Component180 className={`input`} type={`number`} min={0} max={24} step={0.5} value={e.bitacoraHorasServicio ?? ``} onChange={e => o({
          bitacoraHorasServicio: e.target.value === `` ? null : Number(e.target.value),
          bitacoraUltimaCaptura: new Date().toISOString()
        })} /></Component181><Component184 className={`field`}><Component182>{`Horas de descanso`}</Component182><Component183 className={`input`} type={`number`} min={0} max={24} step={0.5} value={e.bitacoraHorasDescanso ?? ``} onChange={e => o({
          bitacoraHorasDescanso: e.target.value === `` ? null : Number(e.target.value)
        })} /></Component184></Component185>{!d && e.bitacoraHorasServicio != null && <Component186 className={`banner error`}>{`Bitácora fuera de rango seguro (NOM-087): revisa horas de servicio / descanso antes de despachar.`}</Component186>}<Component187 className={`banner ${e.validadoGate ? `success` : `info`}`}>{e.validadoGate ? `Cumplimiento gate OK — listo para autorizar movimiento.` : `Completa Carta Porte + licencia + bitácora para validar el gate.`}</Component187></Component188>;
}
function Ke(e) {
  if (e) {
    return !!e.validadoGate;
  } else {
    return false;
  }
}
var qe = [{
  id: `fresco-0-2`,
  label: `Fresco 0°C a 2°C`
}, {
  id: `congelado-18-22`,
  label: `Congelado -18°C a -22°C`
}, {
  id: `otro`,
  label: `Otro (indicar en observaciones)`
}];
var Je = [{
  id: `reserva`,
  label: `Reserva`,
  bajo: true
}, {
  id: `1/4`,
  label: `1/4`,
  bajo: true
}, {
  id: `1/2`,
  label: `1/2`,
  bajo: false
}, {
  id: `3/4`,
  label: `3/4`,
  bajo: false
}, {
  id: `lleno`,
  label: `Lleno`,
  bajo: false
}];
var Ye = [`API`, `Carbal/Pia`];
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
function Qe(e) {
  if (e) {
    return Je.find(t => t.id === e)?.bajo ?? false;
  } else {
    return false;
  }
}
function $e(e) {
  return qe.find(t => t.id === e)?.label ?? `—`;
}
function et(e) {
  return Je.find(t => t.id === e)?.label ?? `—`;
}
var tt = [`Carrier`, `Thermoking`];
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
function _Component2({
  tipo: e,
  value: t,
  onChange: n,
  entradaVacia: r
}) {
  function i(e) {
    n({
      ...t,
      ...e
    });
  }
  function a(e) {
    i({
      inocuidad: e
    });
  }
  let o = e === `salida` && Qe(t.dieselThermo);
  const Component189 = `legend`;
  const Component190 = `span`;
  const Component191 = `button`;
  const Component192 = `div`;
  const Component193 = `div`;
  const Component194 = `span`;
  const Component195 = `input`;
  const Component196 = `label`;
  const Component197 = `span`;
  const Component198 = `input`;
  const Component199 = `label`;
  const Component200 = `span`;
  const Component201 = `input`;
  const Component202 = `label`;
  const Component203 = `div`;
  const Component204 = `fieldset`;
  const Component205 = `legend`;
  const Component206 = `span`;
  const Component207 = `option`;
  const Component208 = `option`;
  const Component209 = `select`;
  const Component210 = `label`;
  const Component211 = `span`;
  const Component212 = `input`;
  const Component213 = `label`;
  const Component214 = `div`;
  const Component215 = `fieldset`;
  const Component216 = `legend`;
  const Component217 = `span`;
  const Component218 = `option`;
  const Component219 = `option`;
  const Component220 = `select`;
  const Component221 = `label`;
  const Component222 = `span`;
  const Component223 = `input`;
  const Component224 = `label`;
  const Component225 = `input`;
  const Component226 = `label`;
  const Component227 = `span`;
  const Component228 = `option`;
  const Component229 = `option`;
  const Component230 = `select`;
  const Component231 = `label`;
  const Component232 = `span`;
  const Component233 = `input`;
  const Component234 = `label`;
  const Component235 = `span`;
  const Component236 = `button`;
  const Component237 = `div`;
  const Component238 = `div`;
  const Component239 = `span`;
  const Component240 = `input`;
  const Component241 = `label`;
  const Component242 = `div`;
  const Component243 = `p`;
  const Component244 = `fieldset`;
  const Component245 = `legend`;
  const Component246 = `p`;
  const Component247 = `span`;
  const Component248 = `input`;
  const Component249 = `label`;
  const Component250 = `fieldset`;
  const Component251 = `legend`;
  const Component252 = `span`;
  const Component253 = `input`;
  const Component254 = `label`;
  const Component255 = `span`;
  const Component256 = `input`;
  const Component257 = `label`;
  const Component258 = `span`;
  const Component259 = `input`;
  const Component260 = `label`;
  const Component261 = `div`;
  const Component262 = `p`;
  const Component263 = `fieldset`;
  const Component264 = `div`;
  return <Component264 className={`refrig-block`}><Component204 className={`fieldset`}><Component189>{`Equipo de refrigeración`}</Component189><Component193 className={`field`}><Component190 className={`label`}>{`Marca *`}</Component190><Component192 className={`seg big wrap`} style={{
          marginTop: 6
        }}>{tt.map(e => <Component191 type={`button`} className={t.marcaThermo === e ? `seg-btn on-ok` : `seg-btn`} onClick={() => i({
            marcaThermo: e,
            refrigeracionId: undefined
          })} key={e}>{e}</Component191>)}</Component192></Component193><Component203 className={`grid-2`} style={{
        marginTop: 12
      }}><Component196 className={`field`}><Component194>{`Modelo *`}</Component194><Component195 className={`input`} value={t.modeloThermo ?? ``} onChange={e => i({
            modeloThermo: e.target.value
          })} placeholder={`SB-210…`} required={true} /></Component196><Component199 className={`field`}><Component197>{`Número de activo interno *`}</Component197><Component198 className={`input`} value={t.numeroActivoThermo ?? ``} onChange={e => i({
            numeroActivoThermo: e.target.value.toUpperCase()
          })} placeholder={`ACT-REF-001`} required={true} /></Component199><Component202 className={`field full`}><Component200>{`Económico caja/camión donde está montado *`}</Component200><Component201 className={`input`} value={t.economicoMontadoThermo ?? t.economicoCajaRefrigerada ?? ``} onChange={e => {
            let t = e.target.value.toUpperCase();
            i({
              economicoMontadoThermo: t,
              economicoCajaRefrigerada: t
            });
          }} placeholder={`R-220`} required={true} /></Component202></Component203></Component204><Component215 className={`fieldset`}><Component205>{`Datos generales · caja refrigerada`}</Component205><Component214 className={`grid-2`}><Component210 className={`field`}><Component206>{`Línea transportista *`}</Component206><Component209 className={`input`} value={t.lineaTransportista ?? ``} onChange={e => i({
            lineaTransportista: e.target.value || undefined
          })} required={true}><Component207 value={``}>{`Seleccionar…`}</Component207>{Ye.map(e => <Component208 value={e} key={e}>{e}</Component208>)}</Component209></Component210><Component213 className={`field`}><Component211>{`No. económico caja refrigerada *`}</Component211><Component212 className={`input`} value={t.economicoCajaRefrigerada ?? ``} onChange={e => i({
            economicoCajaRefrigerada: e.target.value.toUpperCase(),
            economicoMontadoThermo: e.target.value.toUpperCase()
          })} placeholder={`Ej. RF-220`} required={true} /></Component213></Component214></Component215><Component244 className={`fieldset`}><Component216>{`Control de refrigeración / Thermo King`}</Component216><Component242 className={`grid-2`}><Component221 className={`field`}><Component217>{`Temperatura Set Point *`}</Component217><Component220 className={`input`} value={t.setPoint ?? ``} onChange={e => i({
            setPoint: e.target.value || undefined
          })} required={true}><Component218 value={``}>{`Seleccionar…`}</Component218>{qe.map(e => <Component219 value={e.id} key={e.id}>{e.label}</Component219>)}</Component220></Component221><Component224 className={`field`}><Component222>{`Temperatura real en display (°C) *`}</Component222><Component223 className={`input`} type={`number`} step={0.1} value={t.temperaturaReal ?? ``} onChange={e => i({
            temperaturaReal: e.target.value === `` ? null : Number(e.target.value)
          })} placeholder={`Ej. 1.5`} required={true} /></Component224>{e === `salida` && <Component226 className={`check-inline field full`}><Component225 type={`checkbox`} checked={t.preEnfriado === true} onChange={e => i({
            preEnfriado: e.target.checked
          })} />{`Pre-enfriado: ya alcanzó Set Point antes de cargar`}</Component226>}<Component231 className={`field`}><Component227>{`Nivel diésel del Thermo *`}</Component227><Component230 className={`input`} value={t.dieselThermo ?? ``} onChange={e => i({
            dieselThermo: e.target.value || undefined
          })} required={true}><Component228 value={``}>{`Seleccionar…`}</Component228>{Je.map(e => <Component229 value={e.id} key={e.id}>{e.label}</Component229>)}</Component230></Component231><Component234 className={`field`}><Component232>{`Horómetro Thermo King *`}</Component232><Component233 className={`input`} type={`number`} min={0} step={0.1} value={t.horometroThermo ?? ``} onChange={e => i({
            horometroThermo: e.target.value === `` ? null : Number(e.target.value)
          })} placeholder={`Horas`} required={true} /></Component234><Component238 className={`field full`}><Component235 className={`label`}>{`Modo de operación *`}</Component235><Component237 className={`seg wrap`} style={{
            marginTop: 6
          }}>{[{
              id: `continuo`,
              label: `Continuo`
            }, {
              id: `ciclo`,
              label: `Ciclo Start-Stop`
            }].map(e => <Component236 type={`button`} className={t.modoOperacion === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => i({
              modoOperacion: e.id
            })} key={e.id}>{e.label}</Component236>)}</Component237></Component238><Component241 className={`field full`}><Component239>{`Códigos de alarma en panel`}</Component239><Component240 className={`input`} value={t.codigoAlarma ?? ``} onChange={e => i({
            codigoAlarma: e.target.value.toUpperCase()
          })} placeholder={`Dejar vacío si “OK” · ej. CODE 89`} /></Component241></Component242>{o && <Component243 className={`banner error`}>{`Alerta: diésel del Thermo por debajo de 1/2 en salida. Reponer antes de despachar.`}</Component243>}</Component244><Component250 className={`fieldset`}><Component245>{`Checklist de inocuidad (TIF · API/Carbal)`}</Component245><Component246 className={`hint`}>{`Aprobado = OK · Rechazado = Falla`}</Component246><Ve items={t.inocuidad} onChange={a} mode={`aprobado-rechazado`} /><Component249 className={`field`} style={{
        marginTop: 12
      }}><Component247>{`Ticket de lavado grado alimenticio`}{r || e === `entrada` ? ` *` : ``}</Component247><Component248 className={`input`} value={t.ticketLavado ?? ``} onChange={e => i({
          ticketLavado: e.target.value.toUpperCase()
        })} placeholder={`Folio del lavado`} /></Component249></Component250><Component263 className={`fieldset`}><Component251>{`Trazabilidad y seguridad documental`}</Component251><Component261 className={`grid-2`}><Component254 className={`field`}><Component252>{`Folio del pedido / viaje *`}</Component252><Component253 className={`input`} value={t.folioPedido ?? ``} onChange={e => i({
            folioPedido: e.target.value.toUpperCase()
          })} placeholder={`Folio viaje`} required={true} /></Component254><Component257 className={`field`}><Component255>{`Firma o folio MVO (médico veterinario) *`}</Component255><Component256 className={`input`} value={t.folioMvo ?? ``} onChange={e => i({
            folioMvo: e.target.value.toUpperCase()
          })} placeholder={`Folio MVO / liberación TIF`} required={true} /></Component257><Component260 className={`field full`}><Component258>{`Número de termógrafo (data logger) *`}</Component258><Component259 className={`input`} value={t.numeroTermografo ?? ``} onChange={e => i({
            numeroTermografo: e.target.value.toUpperCase()
          })} placeholder={`Serie USB / dispositivo`} required={true} /></Component260></Component261><Component262 className={`hint`}>{`El marchamo / sello se captura en la sección de sello de seguridad (y en foto obligatoria).`}</Component262></Component263></Component264>;
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
function _Component3({
  value: e,
  onChange: t,
  signerName: n,
  onSignerNameChange: r
}) {
  let i = (0, l.useRef)(null);
  let a = (0, l.useRef)(false);
  let o = (0, l.useRef)(!!e);
  let [s, c] = (0, l.useState)(!!e);
  (0, l.useEffect)(() => {
    let t = i.current;
    if (!t) {
      return;
    }
    let n = t.getContext(`2d`);
    if (!n) {
      return;
    }
    let r = window.devicePixelRatio || 1;
    let a = t.clientWidth;
    let o = t.clientHeight;
    t.width = a * r;
    t.height = o * r;
    n.setTransform(1, 0, 0, 1, 0, 0);
    n.scale(r, r);
    n.lineWidth = 2.2;
    n.lineCap = `round`;
    n.strokeStyle = `#15202b`;
    n.fillStyle = `#ffffff`;
    n.fillRect(0, 0, a, o);
    if (e) {
      let t = new Image();
      t.onload = () => n.drawImage(t, 0, 0, a, o);
      t.src = e;
    }
  }, []);
  function u(e) {
    let t = i.current.getBoundingClientRect();
    return {
      x: e.clientX - t.left,
      y: e.clientY - t.top
    };
  }
  function d(e) {
    let t = i.current;
    let n = t?.getContext(`2d`);
    if (!t || !n) {
      return;
    }
    a.current = true;
    t.setPointerCapture(e.pointerId);
    let r = u(e);
    n.beginPath();
    n.moveTo(r.x, r.y);
  }
  function f(e) {
    if (!a.current) {
      return;
    }
    let t = i.current?.getContext(`2d`);
    if (!t) {
      return;
    }
    let n = u(e);
    t.lineTo(n.x, n.y);
    t.stroke();
    o.current = true;
    c(true);
  }
  function p() {
    if (!a.current) {
      return;
    }
    a.current = false;
    let e = i.current;
    if (e && o.current) {
      t(e.toDataURL(`image/png`));
    }
  }
  function m() {
    let e = i.current;
    let n = e?.getContext(`2d`);
    if (e && n) {
      n.fillStyle = `#ffffff`;
      n.fillRect(0, 0, e.clientWidth, e.clientHeight);
      o.current = false;
      c(false);
      t(null);
    }
  }
  const Component265 = `span`;
  const Component266 = `input`;
  const Component267 = `label`;
  const Component268 = `p`;
  const Component269 = `canvas`;
  const Component270 = `button`;
  const Component271 = `div`;
  return <Component271 className={`signature-pad`}><Component267 className={`field`}><Component265>{`Nombre de quien firma *`}</Component265><Component266 className={`input`} value={n} onChange={e => r(e.target.value)} placeholder={`Operador / chofer`} /></Component267><Component268 className={`hint`}>{`Firma aceptando el estado mecánico registrado`}{s ? ` · capturada` : ``}</Component268><Component269 ref={i} className={`sign-canvas`} onPointerDown={d} onPointerMove={f} onPointerUp={p} onPointerLeave={p} /><Component270 type={`button`} className={`text-btn`} onClick={m}>{`Borrar firma`}</Component270></Component271>;
}
var st = [`Llantas en buen estado`, `Luces funcionando`, `Espejos completos`, `Sin daños visibles en carrocería`, `Documentación a bordo`];
var ct = [...st, `Nivel de aceite OK`, `Frenos responden`, `Cabina limpia / sin objetos sueltos`, `Tanque de diésel sin fugas`];
var lt = [`Puertas cierran correctamente`, `Piso sin daños graves`, `Techo sin perforaciones`, `Sellos / candados en orden`, `Sin humedad o fuga de carga`, `Llantas en buen estado`, `Luces / reflejantes OK`];
var ut = [`Quinta rueda / enganche OK`, `Llantas en buen estado`, `Luces funcionando`, `Sin daños estructurales`];
function dt(e) {
  return (e === `camion` ? ct : e === `caja` ? lt : e === `dolly` ? ut : st).map((t, n) => ({
    id: `${e}-${n}`,
    label: t,
    ok: null
  }));
}
function ft(e) {
  let t = e.replace(/\D/g, ``);
  if (t.startsWith(`52`) && t.length === 12) {
    t = t.slice(2);
  }
  if (t.startsWith(`521`) && t.length === 13) {
    t = t.slice(3);
  }
  if (t.length === 10) {
    return `+52${t}`;
  }
}
function pt(e) {
  let t = e ? ft(e) : undefined;
  if (!t) {
    return `—`;
  }
  let n = t.slice(3);
  return `+52 ${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}`;
}
function mt() {
  let e = new Date();
  let t = e => String(e).padStart(2, `0`);
  return `${e.getFullYear()}-${t(e.getMonth() + 1)}-${t(e.getDate())}T${t(e.getHours())}:${t(e.getMinutes())}`;
}
function ht() {
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
function _Component4({
  tipo: e,
  initialPlaca: t = ``,
  equipos: n,
  refrigeraciones: r = [],
  movimientos: i,
  onSaveEquipo: a,
  onSubmit: o,
  onDone: s
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
  let [ce, le] = (0, l.useState)(``);
  let [ue, de] = (0, l.useState)(``);
  let [fe, pe] = (0, l.useState)(``);
  let [me, ve] = (0, l.useState)(``);
  let [ye, j] = (0, l.useState)(mt());
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
  let [P, qe] = (0, l.useState)(null);
  let [Je, Ye] = (0, l.useState)(false);
  let [Xe, Qe] = (0, l.useState)(``);
  let [$e, et] = (0, l.useState)(() => dt(`camion`));
  let [tt, nt] = (0, l.useState)({});
  let [rt, st] = (0, l.useState)(null);
  let [ct, lt] = (0, l.useState)(``);
  let [ut, pt] = (0, l.useState)({});
  let [gt, F] = (0, l.useState)(null);
  let [_t, vt] = (0, l.useState)(null);
  let [yt, bt] = (0, l.useState)(false);
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
    let t = i.find(t => t.equipoId === e.id);
    qe(t?.selloNumero?.trim().toUpperCase() || null);
    We(``);
    Ye(false);
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
    if (e === `salida` && At === `mismatch` && !Je) {
      F(`El sello no coincide con la entrada. Confirma la discrepancia y detalla en observaciones.`);
      return;
    }
    if (e === `salida` && At === `mismatch` && Je && Xe.trim().length < 8) {
      F(`Describe la discrepancia de sello en observaciones (mín. 8 caracteres).`);
      return;
    }
    if (!Ke(ut)) {
      F(`Completa Carta Porte, licencia federal y bitácora para autorizar el gate`);
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
        a(E);
      }
    } else {
      E = {
        id: ee(),
        tipo: I,
        placa: O.trim().toUpperCase(),
        numeroEconomico: me.trim() || O.trim().toUpperCase(),
        creadoEn: new Date().toISOString()
      };
      a(E);
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
      fechaHora: new Date(ye).toISOString(),
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
      selloCoincideEntrada: e === `salida` && P ? At === `ok` : e === `salida` ? null : undefined,
      observaciones: Xe.trim() || undefined,
      firmaNombre: ct.trim(),
      firmaUrl: rt,
      geoLat: ne?.lat ?? null,
      geoLng: ne?.lng ?? null,
      cumplimiento: ut,
      llevaRefrigerada: C || undefined,
      refrigerada: C ? te : undefined,
      creadoEn: new Date().toISOString()
    };
    try {
      await o(ie);
      vt(e === `entrada` ? `Entrada registrada: ${E.placa}` : `Salida registrada: ${E.placa}`);
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
  const Component272 = `button`;
  const Component273 = `div`;
  const Component274 = `h1`;
  const Component275 = `p`;
  const Component276 = `div`;
  const Component277 = `legend`;
  const Component278 = `button`;
  const Component279 = `div`;
  const Component280 = `fieldset`;
  const Component281 = `legend`;
  const Component282 = `button`;
  const Component283 = `div`;
  const Component284 = `fieldset`;
  const Component285 = `p`;
  const Component286 = `button`;
  const Component287 = `div`;
  const Component288 = `div`;
  const Component289 = `legend`;
  const Component290 = `span`;
  const Component291 = `input`;
  const Component292 = `span`;
  const Component293 = `span`;
  const Component294 = `label`;
  const Component295 = `input`;
  const Component296 = `span`;
  const Component297 = `span`;
  const Component298 = `label`;
  const Component299 = `input`;
  const Component300 = `span`;
  const Component301 = `span`;
  const Component302 = `label`;
  const Component303 = `input`;
  const Component304 = `span`;
  const Component305 = `span`;
  const Component306 = `label`;
  const Component307 = `div`;
  const Component308 = `div`;
  const Component309 = `span`;
  const Component310 = `button`;
  const Component311 = `button`;
  const Component312 = `div`;
  const Component313 = `p`;
  const Component314 = `span`;
  const Component315 = `input`;
  const Component316 = `label`;
  const Component317 = `span`;
  const Component318 = `input`;
  const Component319 = `label`;
  const Component320 = `div`;
  const Component321 = `span`;
  const Component322 = `p`;
  const Component323 = `span`;
  const Component324 = `input`;
  const Component325 = `label`;
  const Component326 = `span`;
  const Component327 = `input`;
  const Component328 = `label`;
  const Component329 = `div`;
  const Component330 = `span`;
  const Component331 = `input`;
  const Component332 = `label`;
  const Component333 = `span`;
  const Component334 = `input`;
  const Component335 = `label`;
  const Component336 = `span`;
  const Component337 = `button`;
  const Component338 = `button`;
  const Component339 = `div`;
  const Component340 = `strong`;
  const Component341 = `p`;
  const Component342 = `div`;
  const Component343 = `span`;
  const Component344 = `input`;
  const Component345 = `label`;
  const Component346 = `span`;
  const Component347 = `input`;
  const Component348 = `label`;
  const Component349 = `div`;
  const Component350 = `input`;
  const Component351 = `label`;
  const Component352 = `fieldset`;
  const Component353 = `legend`;
  const Component354 = `span`;
  const Component355 = `input`;
  const Component356 = `label`;
  const Component357 = `span`;
  const Component358 = `label`;
  const Component359 = `span`;
  const Component360 = `input`;
  const Component361 = `label`;
  const Component362 = `span`;
  const Component363 = `input`;
  const Component364 = `label`;
  const Component365 = `span`;
  const Component366 = `span`;
  const Component367 = `input`;
  const Component368 = `div`;
  const Component369 = `label`;
  const Component370 = `span`;
  const Component371 = `input`;
  const Component372 = `label`;
  const Component373 = `span`;
  const Component374 = `input`;
  const Component375 = `label`;
  const Component376 = `span`;
  const Component377 = `input`;
  const Component378 = `label`;
  const Component379 = `div`;
  const Component380 = `fieldset`;
  const Component381 = `legend`;
  const Component382 = `span`;
  const Component383 = `input`;
  const Component384 = `label`;
  const Component385 = `span`;
  const Component386 = `input`;
  const Component387 = `label`;
  const Component388 = `span`;
  const Component389 = `input`;
  const Component390 = `label`;
  const Component391 = `div`;
  const Component392 = `fieldset`;
  const Component393 = `legend`;
  const Component394 = `p`;
  const Component395 = `strong`;
  const Component396 = `p`;
  const Component397 = `span`;
  const Component398 = `input`;
  const Component399 = `label`;
  const Component400 = `p`;
  const Component401 = `p`;
  const Component402 = `input`;
  const Component403 = `label`;
  const Component404 = `fieldset`;
  const Component405 = `legend`;
  const Component406 = `button`;
  const Component407 = `div`;
  const Component408 = `fieldset`;
  const Component409 = `legend`;
  const Component410 = `fieldset`;
  const Component411 = `legend`;
  const Component412 = `fieldset`;
  const Component413 = `legend`;
  const Component414 = `fieldset`;
  const Component415 = `legend`;
  const Component416 = `p`;
  const Component417 = `fieldset`;
  const Component418 = `legend`;
  const Component419 = `textarea`;
  const Component420 = `fieldset`;
  const Component421 = `p`;
  const Component422 = `p`;
  const Component423 = `button`;
  const Component424 = `form`;
  return <Component424 className={`form-panel`} id={`movement-form`} onSubmit={e => void jt(e)}>{(0, createPortal)(<Component273 className={`sticky-save-bar`}><Component272 type={`button`} className={`btn primary sticky-save`} disabled={yt} onClick={() => {
        document.getElementById(`movement-form`)?.requestSubmit();
      }}>{yt ? `Guardando…` : `Guardar cambios`}</Component272></Component273>, document.body)}<Component276 className={`form-head`}><Component274>{e === `entrada` ? `Registrar entrada a planta` : `Registrar salida a ruta`}</Component274><Component275>{`Gate check con fotos guiadas, sello, firma y GPS · ~50 mov/día entre Chihuahua, Calera y Calpulalpan.`}</Component275></Component276><Component280 className={`fieldset`}><Component277>{`Empresa`}</Component277><Component279 className={`seg big wrap`}>{ie.map(e => <Component278 type={`button`} className={d === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => Ot(e.id)} key={e.id}>{e.nombre}</Component278>)}</Component279></Component280><Component284 className={`fieldset`}><Component281>{`Yarda`}</Component281><Component283 className={`seg big wrap`}>{_e.map(e => <Component282 type={`button`} className={c === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => Dt(e.id)} key={e.id}>{e.nombre}</Component282>)}</Component283></Component284>{e === `salida` && Et.length > 0 && <Component288 className={`quick-picks`}><Component285 className={`label`}>{`Equipos en patio · `}{_e.find(e => e.id === c)?.nombre}</Component285><Component287 className={`chip-row`}>{Et.map(e => <Component286 type={`button`} className={`chip`} onClick={() => kt(e)} key={e.id}>{e.placa}{` · `}{e.numeroEconomico}</Component286>)}</Component287></Component288>}<Component352 className={`fieldset`}><Component289>{`Equipo`}</Component289><Component308 className={`field`}><Component290 className={`label`}>{`Tipo (marca uno o varios)`}</Component290><Component307 className={`tipo-checks`}><Component294 className={`tipo-check${p ? ` on` : ``}`}><Component291 type={`checkbox`} checked={p} onChange={e => m(e.target.checked)} /><Component292 className={`tipo-box`} aria-hidden={`true`} /><Component293 className={`tipo-text`}>{`Camión/Tracto`}</Component293></Component294><Component298 className={`tipo-check${h ? ` on` : ``}`}><Component295 type={`checkbox`} checked={h} onChange={e => {
              g(e.target.checked);
              if (!e.target.checked) {
                S(`sencillo`);
              }
            }} /><Component296 className={`tipo-box`} aria-hidden={`true`} /><Component297 className={`tipo-text`}>{`Caja Encortinada`}</Component297></Component298><Component302 className={`tipo-check${_ ? ` on` : ``}`}><Component299 type={`checkbox`} checked={_} onChange={e => v(e.target.checked)} /><Component300 className={`tipo-box`} aria-hidden={`true`} /><Component301 className={`tipo-text`}>{`Dolly`}</Component301></Component302><Component306 className={`tipo-check${y ? ` on` : ``}`}><Component303 type={`checkbox`} checked={y} onChange={e => {
              b(e.target.checked);
              if (e.target.checked) {
                T(Ze());
              }
            }} /><Component304 className={`tipo-box`} aria-hidden={`true`} /><Component305 className={`tipo-text`}>{`Caja Refrigerada`}</Component305></Component306></Component307></Component308>{h && <Component320 className={`field encortinada-modo`}><Component309 className={`label`}>{`Caja encortinada *`}</Component309><Component312 className={`seg wrap`}><Component310 type={`button`} className={x === `sencillo` ? `seg-btn on-ok` : `seg-btn`} onClick={() => S(`sencillo`)}>{`Sencillo`}</Component310><Component311 type={`button`} className={x === `full` ? `seg-btn on-ok` : `seg-btn`} onClick={() => S(`full`)}>{`Full`}</Component311></Component312><Component313 className={`hint`} style={{
          marginTop: 8
        }}>{x === `full` ? `Full = 2 cajas → captura placa de cada una (no son la misma).` : `Sencillo = 1 caja → una sola placa.`}</Component313><Component316 className={`field`} style={{
          marginTop: 10
        }}><Component314>{`Placa 1ª caja *`}</Component314><Component315 className={`input`} value={p ? ce : O} onChange={e => {
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
          }} /></Component316>{x === `full` && <Component319 className={`field`} style={{
          marginTop: 10
        }}><Component317>{`Placa 2ª caja *`}</Component317><Component318 className={`input`} value={ue} onChange={e => de(normalizePlacaMX(e.target.value))} placeholder={`Placa de la 2ª caja (distinta)`} required={true} /><PlacaQuickOcr slotId={`placa-caja-2-trasera`} label={`Tomar foto y leer placa`} onPlaca={placa => de(normalizePlacaMX(placa))} /></Component319>}</Component320>}{y && <Component329 className={`field encortinada-modo`} style={{
        marginTop: 12
      }}><Component321 className={`label`}>{`Caja refrigerada *`}</Component321><Component322 className={`hint`} style={{
          marginTop: 4
        }}>{`Ingresa la placa y el número económico de la caja refrigerada.`}</Component322><Component325 className={`field`} style={{
          marginTop: 10
        }}><Component323>{`Placa caja refrigerada *`}</Component323><Component324 className={`input`} value={fe} onChange={e => {
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
          }} /></Component325><Component328 className={`field`} style={{
          marginTop: 10
        }}><Component326>{`No. económico caja refrigerada *`}</Component326><Component327 className={`input`} value={te.economicoCajaRefrigerada ?? ``} onChange={e => T({
            ...te,
            economicoCajaRefrigerada: e.target.value.toUpperCase(),
            economicoMontadoThermo: e.target.value.toUpperCase()
          })} placeholder={`Ej. RF-220`} required={true} /></Component328></Component329>}<Component349 className={`grid-2`} style={{
        marginTop: 12
      }}>{p && <Component332 className={`field`}><Component330>{`Placa camión *`}</Component330><Component331 className={`input`} value={O} onChange={e => re(normalizePlacaMX(e.target.value))} placeholder={`Placa frontal camión`} required={true} /><PlacaQuickOcr slotId={`placa-camion-frontal`} label={`Tomar foto y leer placa`} onPlaca={placa => {
            let t = normalizePlacaMX(placa);
            re(t);
            if (h && !ce.trim()) {
              le(t);
            }
          }} /></Component332>}{!p && !h && <Component335 className={`field`}><Component333>{`Placa *`}</Component333><Component334 className={`input`} value={O} onChange={e => {
            let t = normalizePlacaMX(e.target.value);
            re(t);
            if (xt) {
              le(t);
            }
          }} placeholder={xt ? `Placa caja` : `Placa sin guiones`} required={true} /><PlacaQuickOcr slotId={xt ? `placa-caja-1-trasera` : `placa-camion-frontal`} label={`Tomar foto y leer placa`} onPlaca={placa => {
            let t = normalizePlacaMX(placa);
            re(t);
            if (xt) {
              le(t);
            }
          }} /></Component335>}{p && <Component342 className={`field full`}><Component336 className={`label`}>{`Trae placa trasera (sí / no)`}</Component336><Component339 className={`seg wrap`} style={{
            marginTop: 6
          }}><Component337 type={`button`} className={ae ? `seg-btn on-ok` : `seg-btn`} onClick={() => k(true)}>{`Sí`}</Component337><Component338 type={`button`} className={ae ? `seg-btn` : `seg-btn on-ok`} onClick={() => k(false)}>{`No`}</Component338></Component339>{ae && (placaCamionTraseraVal.trim() || O.trim()) && <Component341 className={`hint`} style={{
            marginTop: 6
          }}>{`Trasera: `}<Component340>{(placaCamionTraseraVal.trim() || O.trim()).toUpperCase()}</Component340>{placaCamionTraseraVal.trim() && placaCamionTraseraVal.trim().toUpperCase() !== O.trim().toUpperCase() ? ` (OCR ≠ frontal — revisa)` : ` (misma / OCR)`}</Component341>}</Component342>}<Component345 className={`field`}><Component343>{p ? `No. económico tractocamión` : `No. económico`}</Component343><Component344 className={`input`} value={me} onChange={e => ve(e.target.value)} placeholder={`ECO-045`} /></Component345><Component348 className={`field`}><Component346>{`Fecha y hora *`}</Component346><Component347 className={`input`} type={`datetime-local`} value={ye} onChange={e => j(e.target.value)} required={true} /></Component348></Component349>{(xt || St) && !wt && <Component351 className={`check-inline`}><Component350 type={`checkbox`} checked={C} onChange={e => w(e.target.checked)} />{`Exigir foto de interior (vacío / consolidación)`}</Component351>}</Component352>{wt && <_Component2 tipo={e} value={te} onChange={T} entradaVacia={e === `entrada`} refrigeraciones={r} />}<Component380 className={`fieldset`}><Component353>{`Personas y ruta`}</Component353><Component379 className={`grid-2`}><Component356 className={`field`}><Component354>{`Operador de patio *`}</Component354><Component355 className={`input`} value={xe} onChange={e => Se(e.target.value)} placeholder={`Quién registra`} required={true} /></Component356><Component358 className={`field full`}><Component357>{`Chofer/Operador (quien entra o sale con la unidad)`}</Component357></Component358><Component361 className={`field`}><Component359>{`Nombre *`}</Component359><Component360 className={`input`} value={Ce} onChange={e => M(e.target.value)} placeholder={`Nombre`} autoComplete={`given-name`} required={true} /></Component361><Component364 className={`field`}><Component362>{`Apellido *`}</Component362><Component363 className={`input`} value={we} onChange={e => N(e.target.value)} placeholder={`Apellido`} autoComplete={`family-name`} required={true} /></Component364><Component369 className={`field full`}><Component365>{`WhatsApp *`}</Component365><Component368 className={`phone-input`}><Component366 className={`phone-prefix`}>{`+52`}</Component366><Component367 className={`input`} inputMode={`numeric`} autoComplete={`tel-national`} maxLength={10} value={Te} onChange={e => Ee(e.target.value.replace(/\D/g, ``).slice(0, 10))} placeholder={`10 dígitos del celular`} required={true} /></Component368></Component369><Component372 className={`field full`}><Component370>{`Cliente`}</Component370><Component371 className={`input`} value={Oe} onChange={e => ke(e.target.value)} placeholder={`Nombre del cliente`} /></Component372><Component375 className={`field`}><Component373>{`Origen`}</Component373><Component374 className={`input`} value={Ae} onChange={e => je(e.target.value)} placeholder={`De dónde viene`} /></Component375><Component378 className={`field`}><Component376>{`Destino`}</Component376><Component377 className={`input`} value={Me} onChange={e => Ne(e.target.value)} placeholder={`A dónde va`} /></Component378></Component379></Component380><Component392 className={`fieldset`}><Component381>{`Odómetro y diésel`}</Component381><Component391 className={`grid-3`}><Component384 className={`field`}><Component382>{`Kilómetros`}</Component382><Component383 className={`input`} type={`number`} min={0} step={1} value={Pe} onChange={e => Fe(e.target.value)} placeholder={`125480`} /></Component384><Component387 className={`field`}><Component385>{`Diésel %`}</Component385><Component386 className={`input`} type={`number`} min={0} max={100} step={1} value={Ie} onChange={e => Le(e.target.value)} placeholder={`65`} /></Component387><Component390 className={`field`}><Component388>{`Diésel litros`}</Component388><Component389 className={`input`} type={`number`} min={0} step={0.1} value={Re} onChange={e => ze(e.target.value)} placeholder={`180`} /></Component390></Component391></Component392>{(xt || St) && <Component404 className={`fieldset`}><Component393>{`Sello de seguridad (C-TPAT / OEA)`}</Component393>{e === `salida` && <Component394 className={`hint`}>{`Recaptura el sello al salir. No se autocompleta para validar contra la entrada.`}</Component394>}{e === `salida` && P && <Component396 className={`banner info`}>{`Sello registrado en entrada: `}<Component395>{P}</Component395></Component396>}<Component399 className={`field`}><Component397>{`Número de serie del sello *`}</Component397><Component398 className={`input`} value={Ue} onChange={t => {
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
        }} placeholder={`Ej. MX-HS-004821`} /></Component399>{At === `ok` && <Component400 className={`banner success`}>{`Sello coincide con la entrada.`}</Component400>}{At === `mismatch` && <l.Fragment><Component401 className={`banner error`}>{`Discrepancia de sello: entrada `}{P}{` ≠ salida `}{Ue.trim().toUpperCase()}</Component401><Component403 className={`check-inline`}><Component402 type={`checkbox`} checked={Je} onChange={e => Ye(e.target.checked)} />{`Confirmo discrepancia (queda en KPIs / alerta de seguridad)`}</Component403></l.Fragment>}</Component404>}<Component408 className={`fieldset`}><Component405>{`Condición general`}</Component405><Component407 className={`seg big`}>{[`buena`, `regular`, `mala`].map(e => <Component406 type={`button`} className={Be === e ? `seg-btn ${e === `buena` ? `on-ok` : e === `regular` ? `on-warn` : `on-bad`}` : `seg-btn`} onClick={() => He(e)} key={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</Component406>)}</Component407></Component408><Component410 className={`fieldset`}><Component409>{`Checklist NOM / físico-mecánico`}</Component409><Ve items={$e} onChange={et} /></Component410><Component412 className={`fieldset`}><Component411>{`Registro fotográfico guiado`}</Component411><_Component slots={Tt} captured={tt} onChange={nt} onPlateOcr={(slotId, placa) => {
          applyPlacaOcrToForm(slotId, placa, {
            setPlaca: re,
            setPlacaCamionTrasera: setPlacaCamionTraseraVal,
            setPlacaCaja1: le,
            setPlacaCaja2: de
          });
        }} /></Component412><Component414 className={`fieldset`}><Component413>{`Cumplimiento México (gate)`}</Component413><Ge value={ut} onChange={pt} /></Component414><Component417 className={`fieldset`}><Component415>{`Firma digital`}</Component415><_Component3 value={rt} onChange={st} signerName={ct} onSignerNameChange={lt} /><Component416 className={`hint`}>{`Al guardar se captura GPS del dispositivo (si el cel lo permite).`}</Component416></Component417><Component420 className={`fieldset`}><Component418>{`Observaciones`}</Component418><Component419 className={`input textarea`} rows={3} value={Xe} onChange={e => Qe(e.target.value)} placeholder={`Daños, incidencias, NOM-068 / pesos…`} /></Component420>{gt && <Component421 className={`banner error`}>{gt}</Component421>}{_t && <Component422 className={`banner success`}>{_t}</Component422>}<Component423 type={`submit`} className={`btn primary wide`} disabled={yt}>{yt ? `Guardando…` : e === `entrada` ? `Guardar entrada` : `Guardar salida`}</Component423></Component424>;
}
var F = [{
  id: `espera-carga`,
  label: `Espera de carga / pedido`
}, {
  id: `vacio-pool`,
  label: `Vacío en pool`
}, {
  id: `taller`,
  label: `Taller / fallas`
}, {
  id: `thermo`,
  label: `Thermo / frío`
}, {
  id: `documentos`,
  label: `Documentos / Carta Porte`
}, {
  id: `retencion-cliente`,
  label: `Retención de cliente`
}, {
  id: `drop-sin-ciclo`,
  label: `Drop sin ciclo cerrado`
}, {
  id: `otro`,
  label: `Otro`
}];
function _t(e, t) {
  if (e) {
    if (e === `otro`) {
      return t?.trim() || `Otro`;
    } else {
      return F.find(t => t.id === e)?.label ?? e;
    }
  } else {
    return `—`;
  }
}
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
function _Component5({
  equipos: e,
  movimientos: t,
  initialPlaca: n = ``,
  onSaveEquipo: r,
  onSubmit: i,
  onDone: a
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
          r(t);
        }
      } else {
        t = {
          id: ee(),
          tipo: Ee,
          placa: normalizePlacaMX(y),
          numeroEconomico: x.trim() || normalizePlacaMX(y),
          creadoEn: new Date().toISOString()
        };
        r(t);
      }
      let n = vt.filter(e => ve[e.id]).map(e => ({
        slotId: e.id,
        label: e.label,
        url: ve[e.id]
      }));
      let s = new Date(`${O}T12:00:00`).toISOString();
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
        paradoDesde: s,
        zonaSlot: ue.trim() || undefined,
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
      await i(l);
      let u = _t(C, te);
      Ce(`${t.placa} queda en ${_e.find(e => e.id === o)?.nombre ?? o} como PARADO · ${u}. No cuenta como entrada de hoy.`);
      setTimeout(() => a(), 1400);
    } catch (e) {
      xe(e instanceof Error ? e.message : `No se pudo guardar`);
    } finally {
      we(false);
    }
  }
  const Component425 = `button`;
  const Component426 = `div`;
  const Component427 = `h1`;
  const Component428 = `p`;
  const Component429 = `div`;
  const Component430 = `legend`;
  const Component431 = `button`;
  const Component432 = `div`;
  const Component433 = `fieldset`;
  const Component434 = `legend`;
  const Component435 = `button`;
  const Component436 = `div`;
  const Component437 = `fieldset`;
  const Component438 = `legend`;
  const Component439 = `span`;
  const Component440 = `input`;
  const Component441 = `span`;
  const Component442 = `span`;
  const Component443 = `label`;
  const Component444 = `input`;
  const Component445 = `span`;
  const Component446 = `span`;
  const Component447 = `label`;
  const Component448 = `input`;
  const Component449 = `span`;
  const Component450 = `span`;
  const Component451 = `label`;
  const Component452 = `input`;
  const Component453 = `span`;
  const Component454 = `span`;
  const Component455 = `label`;
  const Component456 = `div`;
  const Component457 = `div`;
  const Component458 = `span`;
  const Component459 = `input`;
  const Component460 = `label`;
  const Component461 = `span`;
  const Component462 = `input`;
  const Component463 = `label`;
  const Component464 = `div`;
  const Component465 = `input`;
  const Component466 = `label`;
  const Component467 = `div`;
  const Component468 = `p`;
  const Component469 = `fieldset`;
  const Component470 = `legend`;
  const Component471 = `input`;
  const Component472 = `span`;
  const Component473 = `span`;
  const Component474 = `label`;
  const Component475 = `div`;
  const Component476 = `span`;
  const Component477 = `input`;
  const Component478 = `label`;
  const Component479 = `fieldset`;
  const Component480 = `legend`;
  const Component481 = `span`;
  const Component482 = `input`;
  const Component483 = `label`;
  const Component484 = `span`;
  const Component485 = `button`;
  const Component486 = `div`;
  const Component487 = `div`;
  const Component488 = `span`;
  const Component489 = `input`;
  const Component490 = `label`;
  const Component491 = `span`;
  const Component492 = `input`;
  const Component493 = `label`;
  const Component494 = `span`;
  const Component495 = `input`;
  const Component496 = `label`;
  const Component497 = `div`;
  const Component498 = `span`;
  const Component499 = `textarea`;
  const Component500 = `label`;
  const Component501 = `fieldset`;
  const Component502 = `legend`;
  const Component503 = `fieldset`;
  const Component504 = `p`;
  const Component505 = `p`;
  const Component506 = `button`;
  const Component507 = `form`;
  return <Component507 className={`form-panel`} id={`parado-form`} onSubmit={e => void Ne(e)}>{(0, createPortal)(<Component426 className={`sticky-save-bar`}><Component425 type={`button`} className={`btn primary sticky-save`} disabled={M} onClick={() => {
        document.getElementById(`parado-form`)?.requestSubmit();
      }}>{M ? `Guardando…` : `Guardar cambios`}</Component425></Component426>, document.body)}<Component429 className={`form-head`}><Component427>{`Inventariar equipo parado`}</Component427><Component428>{`Unidad que está en yarda sin viaje de entrada ni salida. No es un arribo: es un conteo.`}</Component428></Component429><Component433 className={`fieldset`}><Component430>{`Empresa`}</Component430><Component432 className={`seg wrap`}>{ie.map(e => <Component431 type={`button`} className={c === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => u(e.id)} key={e.id}>{e.nombre}</Component431>)}</Component432></Component433><Component437 className={`fieldset`}><Component434>{`Yarda`}</Component434><Component436 className={`seg wrap`}>{_e.map(e => <Component435 type={`button`} className={o === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => s(e.id)} key={e.id}>{e.nombre}</Component435>)}</Component436></Component437><Component469 className={`fieldset`}><Component438>{`Equipo`}</Component438><Component457 className={`field`}><Component439 className={`label`}>{`Tipo (marca uno o varios)`}</Component439><Component456 className={`tipo-checks`}><Component443 className={`tipo-check${d ? ` on` : ``}`}><Component440 type={`checkbox`} checked={d} onChange={e => f(e.target.checked)} /><Component441 className={`tipo-box`} aria-hidden={`true`} /><Component442 className={`tipo-text`}>{`Camión/Tracto`}</Component442></Component443><Component447 className={`tipo-check${p ? ` on` : ``}`}><Component444 type={`checkbox`} checked={p} onChange={e => m(e.target.checked)} /><Component445 className={`tipo-box`} aria-hidden={`true`} /><Component446 className={`tipo-text`}>{`Caja Encortinada`}</Component446></Component447><Component451 className={`tipo-check${h ? ` on` : ``}`}><Component448 type={`checkbox`} checked={h} onChange={e => g(e.target.checked)} /><Component449 className={`tipo-box`} aria-hidden={`true`} /><Component450 className={`tipo-text`}>{`Dolly`}</Component450></Component451><Component455 className={`tipo-check${_ ? ` on` : ``}`}><Component452 type={`checkbox`} checked={_} onChange={e => v(e.target.checked)} /><Component453 className={`tipo-box`} aria-hidden={`true`} /><Component454 className={`tipo-text`}>{`Caja Refrigerada`}</Component454></Component455></Component456></Component457><Component464 className={`grid-2`} style={{
        marginTop: 12
      }}><Component460 className={`field`}><Component458>{`Placa *`}</Component458><Component459 className={`input`} value={y} onChange={e => {
            b(normalizePlacaMX(e.target.value));
            Te(false);
          }} placeholder={`Placa sin guiones`} required={true} /><PlacaQuickOcr slotId={`parado-placa`} label={`Tomar foto y leer placa`} onPlaca={placa => {
            b(normalizePlacaMX(placa));
            Te(false);
          }} /></Component460><Component463 className={`field`}><Component461>{`No. económico`}</Component461><Component462 className={`input`} value={x} onChange={e => S(e.target.value)} placeholder={`ECO-045`} /></Component463></Component464>{je && <Component467 className={`banner warn`} style={{
        marginTop: 12
      }}>{`Ya está en ciclo (entrada abierta).`}{` `}<Component466 className={`check-inline`} style={{
          marginTop: 8
        }}><Component465 type={`checkbox`} checked={N} onChange={e => Te(e.target.checked)} />{`Pasarla a parado (cierra el ciclo de viaje)`}</Component466></Component467>}{Me && <Component468 className={`hint`} style={{
        marginTop: 8
      }}>{`Ya figura como parado: este guardado actualiza el inventario (re-inventario).`}</Component468>}</Component469><Component479 className={`fieldset`}><Component470>{`Motivo de paro *`}</Component470><Component475 className={`tipo-checks`}>{F.map(e => <Component474 className={`tipo-check${C === e.id ? ` on` : ``}`} key={e.id}><Component471 type={`radio`} name={`motivoParo`} checked={C === e.id} onChange={() => w(e.id)} /><Component472 className={`tipo-box`} aria-hidden={`true`} /><Component473 className={`tipo-text`}>{e.label}</Component473></Component474>)}</Component475>{C === `otro` && <Component478 className={`field`} style={{
        marginTop: 12
      }}><Component476>{`Describe el motivo *`}</Component476><Component477 className={`input`} value={te} onChange={e => T(e.target.value)} placeholder={`Motivo`} required={true} /></Component478>}</Component479><Component501 className={`fieldset`}><Component480>{`Detalle`}</Component480><Component497 className={`grid-2`}><Component483 className={`field`}><Component481>{`Desde cuándo está ahí *`}</Component481><Component482 className={`input`} type={`date`} value={O} onChange={e => re(e.target.value)} required={true} /></Component483><Component487 className={`field`}><Component484 className={`label`}>{`Condición *`}</Component484><Component486 className={`seg wrap`} style={{
            marginTop: 6
          }}>{[`buena`, `regular`, `mala`].map(e => <Component485 type={`button`} className={ae === e ? `seg-btn ${e === `buena` ? `on-ok` : e === `regular` ? `on-warn` : `on-bad`}` : `seg-btn`} onClick={() => k(e)} key={e}>{e === `buena` ? `Buena` : e === `regular` ? `Regular` : `Mala`}</Component485>)}</Component486></Component487><Component490 className={`field`}><Component488>{`Quién inventaría (caseta) *`}</Component488><Component489 className={`input`} value={ce} onChange={e => le(e.target.value)} placeholder={`Nombre`} required={true} /></Component490><Component493 className={`field`}><Component491>{`Zona o slot`}</Component491><Component492 className={`input`} value={ue} onChange={e => de(e.target.value)} placeholder={`Andén 2, fondo norte…`} /></Component493><Component496 className={`field`}><Component494>{`Sello actual`}</Component494><Component495 className={`input`} value={fe} onChange={e => pe(e.target.value.toUpperCase())} placeholder={`Opcional`} /></Component496></Component497><Component500 className={`field`} style={{
        marginTop: 12
      }}><Component498>{`Observación`}</Component498><Component499 className={`input textarea`} rows={2} value={me} onChange={e => he(e.target.value)} placeholder={`Opcional`} /></Component500></Component501><Component503 className={`fieldset`}><Component502>{`Fotos (7)`}</Component502><_Component slots={vt} captured={ve} onChange={ye} onPlateOcr={(slotId, placa) => {
          applyPlacaOcrToForm(slotId, placa, {
            setPlaca: b
          });
        }} /></Component503>{j && <Component504 className={`banner error`}>{j}</Component504>}{Se && <Component505 className={`banner success`}>{Se}</Component505>}<Component506 type={`submit`} className={`btn primary wide`} disabled={M}>{M ? `Guardando…` : `Sumar a patio`}</Component506></Component507>;
}
var St = `1yH8vAbXoMFvHdKEt8XMvXWDOc0R1VjVdp1Y3MtCGLp0`;
var Ct = `1Usz_zTK3kqO-Pah3seSdPpMQPMfLHDJh`;
var wt = `https://docs.google.com/spreadsheets/d/1yH8vAbXoMFvHdKEt8XMvXWDOc0R1VjVdp1Y3MtCGLp0/edit`;
var I = `https://drive.google.com/drive/folders/1Usz_zTK3kqO-Pah3seSdPpMQPMfLHDJh`;
var Tt = [`https://www.googleapis.com/auth/spreadsheets`, `https://www.googleapis.com/auth/drive.file`, `openid`, `email`, `profile`].join(` `);
var Et = `patio-control-workspace-config`;
function Dt() {
  try {
    let e = localStorage.getItem(Et);
    if (e) {
      let t = JSON.parse(e);
      return {
        clientId: t.clientId ?? ``,
        spreadsheetId: t.spreadsheetId || `1yH8vAbXoMFvHdKEt8XMvXWDOc0R1VjVdp1Y3MtCGLp0`,
        driveFolderId: t.driveFolderId || `1Usz_zTK3kqO-Pah3seSdPpMQPMfLHDJh`,
        hostedDomain: t.hostedDomain ?? `camircapital.com`
      };
    }
  } catch {}
  return {
    clientId: ``,
    spreadsheetId: St,
    driveFolderId: Ct,
    hostedDomain: `camircapital.com`
  };
}
function Ot(e) {
  localStorage.setItem(Et, JSON.stringify(e));
}
var kt = null;
var At = 0;
function jt() {
  if (!kt || Date.now() > At) {
    return null;
  } else {
    return kt;
  }
}
function Mt(e, t = 3500) {
  kt = e;
  At = Date.now() + t * 1000;
}
function Nt() {
  let e = kt;
  kt = null;
  At = 0;
  if (e && window.google?.accounts.oauth2.revoke) {
    window.google.accounts.oauth2.revoke(e, () => undefined);
  }
}
function Pt() {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  } else {
    return new Promise((e, t) => {
      let n = document.querySelector(`script[data-gis]`);
      if (n) {
        n.addEventListener(`load`, () => e());
        n.addEventListener(`error`, () => t(Error(`GIS load failed`)));
        return;
      }
      let r = document.createElement(`script`);
      r.src = `https://accounts.google.com/gsi/client`;
      r.async = true;
      r.dataset.gis = `1`;
      r.onload = () => e();
      r.onerror = () => t(Error(`No se pudo cargar Google Identity`));
      document.head.appendChild(r);
    });
  }
}
function Ft(e) {
  return new Promise((t, n) => {
    if (!e.clientId.trim()) {
      n(Error(`Falta el Google Client ID. Configúralo en la pantalla de Workspace.`));
      return;
    }
    Pt().then(() => {
      if (!window.google?.accounts?.oauth2) {
        n(Error(`Google Identity no disponible`));
        return;
      }
      window.google.accounts.oauth2.initTokenClient({
        client_id: e.clientId.trim(),
        scope: Tt,
        hosted_domain: e.hostedDomain.trim() || undefined,
        callback: e => {
          if (e.error || !e.access_token) {
            n(Error(e.error || `No se obtuvo token`));
            return;
          }
          Mt(e.access_token);
          t(e.access_token);
        },
        error_callback: e => {
          n(Error(e.message || e.type || `Error de autenticación`));
        }
      }).requestAccessToken({
        prompt: ``
      });
    }).catch(n);
  });
}
async function It(e) {
  let t = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, {
    headers: {
      Authorization: `Bearer ${e}`
    }
  });
  if (!t.ok) {
    throw Error(`No se pudo leer el perfil de Google`);
  }
  let n = await t.json();
  return {
    email: n.email ?? ``,
    name: n.name ?? n.email ?? `Usuario`,
    picture: n.picture
  };
}
async function Lt(e) {
  return jt() || Ft(e);
}
function Rt(e) {
  let [t, n] = e.split(`,`);
  let r = /data:(.*?);base64/.exec(t)?.[1] ?? `image/jpeg`;
  let i = atob(n);
  let a = new Uint8Array(i.length);
  for (let e = 0; e < i.length; e++) {
    a[e] = i.charCodeAt(e);
  }
  return new Blob([a], {
    type: r
  });
}
async function zt(e, t, n) {
  let r = await Lt(e);
  let i = Rt(t);
  let a = {
    name: n,
    parents: [e.driveFolderId]
  };
  let o = new FormData();
  o.append(`metadata`, new Blob([JSON.stringify(a)], {
    type: `application/json`
  }));
  o.append(`file`, i);
  let s = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink`, {
    method: `POST`,
    headers: {
      Authorization: `Bearer ${r}`
    },
    body: o
  });
  if (!s.ok) {
    let e = await s.text();
    throw Error(`Drive upload ${s.status}: ${e.slice(0, 200)}`);
  }
  let c = await s.json();
  await fetch(`https://www.googleapis.com/drive/v3/files/${c.id}/permissions`, {
    method: `POST`,
    headers: {
      Authorization: `Bearer ${r}`,
      "Content-Type": `application/json`
    },
    body: JSON.stringify({
      role: `reader`,
      type: `anyone`
    })
  }).catch(() => undefined);
  return `https://drive.google.com/uc?id=${c.id}&export=view`;
}
async function Bt(e, t, n) {
  let r = [];
  for (let i of t) {
    if (i.url.startsWith(`http`)) {
      r.push(i);
      continue;
    }
    let t = `${n}-${i.slotId}-${Date.now()}.jpg`;
    r.push({
      ...i,
      url: await zt(e, i.url, t)
    });
  }
  return r;
}
async function Vt(e, t, n) {
  let r = await Lt(e);
  let i = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${e.spreadsheetId}${t}`, {
    ...n,
    headers: {
      Authorization: `Bearer ${r}`,
      "Content-Type": `application/json`,
      ...(n?.headers ?? {})
    }
  });
  if (!i.ok) {
    let e = await i.text();
    throw Error(`Sheets error ${i.status}: ${e.slice(0, 200)}`);
  }
  return i;
}
function Ht(e) {
  if (!e[0] || !e[2]) {
    return null;
  } else {
    return {
      id: e[0],
      tipo: e[1] || `camion`,
      placa: e[2],
      numeroEconomico: e[3] || e[2],
      marca: e[4] || undefined,
      modelo: e[5] || undefined,
      notas: e[6] || undefined,
      creadoEn: e[7] || new Date().toISOString(),
      operadorAsignado: e[8] || undefined
    };
  }
}
function Ut(e) {
  return [e.id, e.tipo, e.placa, e.numeroEconomico, e.marca ?? ``, e.modelo ?? ``, e.notas ?? ``, e.creadoEn, e.operadorAsignado ?? ``];
}
function Wt(e) {
  try {
    return JSON.parse(e || `[]`);
  } catch {
    return [];
  }
}
function Gt(e) {
  if (!e) {
    return {};
  }
  try {
    let t = JSON.parse(e);
    if (t && typeof t == `object`) {
      return {
        cliente: t.cliente || undefined,
        origen: t.origen || undefined,
        destino: t.destino || undefined
      };
    }
  } catch {}
  return {
    origenDestino: e,
    origen: e
  };
}
function Kt(e) {
  if (e.cliente || e.origen || e.destino) {
    return JSON.stringify({
      cliente: e.cliente ?? ``,
      origen: e.origen ?? ``,
      destino: e.destino ?? ``
    });
  } else {
    return e.origenDestino ?? ``;
  }
}
function qt(e) {
  if (!e) {
    return {};
  }
  try {
    let t = JSON.parse(e);
    if (t && typeof t == `object`) {
      return {
        placaCamionTrasera: t.placaCamionTrasera || undefined,
        placaCaja1: t.placaCaja1 || undefined,
        placaCaja2: t.placaCaja2 || undefined
      };
    }
  } catch {}
  return {};
}
function L(e) {
  if (!e.placaCamionTrasera && !e.placaCaja1 && !e.placaCaja2) {
    return ``;
  } else {
    return JSON.stringify({
      placaCamionTrasera: e.placaCamionTrasera ?? ``,
      placaCaja1: e.placaCaja1 ?? ``,
      placaCaja2: e.placaCaja2 ?? ``
    });
  }
}
function Jt(e, t) {
  if (e) {
    try {
      let t = JSON.parse(e);
      if (Array.isArray(t)) {
        return t;
      }
    } catch {}
  }
  return t.map((e, t) => ({
    slotId: `legacy-${t}`,
    label: `Foto ${t + 1}`,
    url: e
  }));
}
function Yt(e) {
  if (!e[0] || !e[1]) {
    return null;
  }
  let t = (e[14] || ``).split(`|`).map(e => e.trim()).filter(Boolean);
  let n = Jt(e[23] || ``, t);
  return {
    id: e[0],
    tipo: e[1],
    equipoId: e[2],
    placa: e[3],
    numeroEconomico: e[4],
    equipoTipo: e[5] || `camion`,
    fechaHora: e[6],
    operador: e[7],
    chofer: e[8] || undefined,
    whatsapp: e[29] || undefined,
    ...Gt(e[9] || ``),
    kilometros: e[10] === `` || e[10] == null ? null : Number(e[10]),
    dieselPorcentaje: e[11] === `` || e[11] == null ? null : Number(e[11]),
    dieselLitros: e[12] === `` || e[12] == null ? null : Number(e[12]),
    checklist: Wt(e[13]),
    fotos: n.map(e => e.url),
    condicionGeneral: e[15] || `buena`,
    observaciones: e[16] || undefined,
    creadoEn: e[17] || e[6],
    yardaId: e[18] || `chihuahua`,
    selloNumero: e[19] || undefined,
    firmaNombre: e[20] || undefined,
    firmaUrl: e[21] || undefined,
    geoLat: e[22] === `` || e[22] == null ? null : Number(e[22]),
    geoLng: e[24] === `` || e[24] == null ? null : Number(e[24]),
    fotosEvidencia: n,
    ...(() => {
      let t = Zt(e[25] || ``);
      return {
        cumplimiento: t.cumplimiento,
        selloCoincideEntrada: t.selloCoincideEntrada
      };
    })(),
    ...qt(e[26] || ``),
    empresaId: e[27] || `api`,
    ...(() => {
      let t = Xt(e[28] || ``);
      return {
        llevaRefrigerada: t ? true : undefined,
        refrigerada: t
      };
    })()
  };
}
function Xt(e) {
  if (e) {
    try {
      let t = JSON.parse(e);
      if (t && typeof t == `object` && Array.isArray(t.inocuidad)) {
        return t;
      }
    } catch {}
  }
}
function Zt(e) {
  if (!e) {
    return {};
  }
  try {
    let {
      selloCoincideEntrada: t,
      ...n
    } = JSON.parse(e);
    return {
      cumplimiento: n,
      selloCoincideEntrada: t
    };
  } catch {
    return {};
  }
}
function Qt(e) {
  return [e.id, e.tipo, e.equipoId, e.placa, e.numeroEconomico, e.equipoTipo, e.fechaHora, e.operador, e.chofer ?? ``, Kt(e), e.kilometros, e.dieselPorcentaje, e.dieselLitros, JSON.stringify(e.checklist), e.fotos.join(`|`), e.condicionGeneral, e.observaciones ?? ``, e.creadoEn, e.yardaId, e.selloNumero ?? ``, e.firmaNombre ?? ``, e.firmaUrl ?? ``, e.geoLat ?? ``, JSON.stringify(e.fotosEvidencia ?? []), e.geoLng ?? ``, JSON.stringify({
    ...(e.cumplimiento ?? {}),
    selloCoincideEntrada: e.selloCoincideEntrada ?? null
  }), L(e), e.empresaId ?? `api`, e.llevaRefrigerada && e.refrigerada ? JSON.stringify(e.refrigerada) : ``, e.whatsapp ?? ``];
}
async function $t(e) {
  return ((await (await Vt(e, `/values/Equipos!A2:I`)).json()).values ?? []).map(Ht).filter(Boolean);
}
async function en(e) {
  return ((await (await Vt(e, `/values/Movimientos!A2:AD`)).json()).values ?? []).map(Yt).filter(Boolean).sort((e, t) => new Date(t.fechaHora).getTime() - new Date(e.fechaHora).getTime());
}
async function tn(e, t) {
  await Vt(e, `/values/Equipos!A:I:append?valueInputOption=USER_ENTERED`, {
    method: `POST`,
    body: JSON.stringify({
      values: [Ut(t)]
    })
  });
}
async function nn(e, t) {
  let n = await Lt(e);
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${e.spreadsheetId}/values/Equipos!A2:I:clear`, {
    method: `POST`,
    headers: {
      Authorization: `Bearer ${n}`
    }
  });
  if (t.length !== 0) {
    await Vt(e, `/values/Equipos!A2?valueInputOption=USER_ENTERED`, {
      method: `PUT`,
      body: JSON.stringify({
        values: t.map(Ut)
      })
    });
  }
}
async function rn(e, t, n) {
  let r = n.findIndex(e => e.id === t.id);
  if (r < 0) {
    await tn(e, t);
    return;
  }
  let i = r + 2;
  await Vt(e, `/values/Equipos!A${i}:I${i}?valueInputOption=USER_ENTERED`, {
    method: `PUT`,
    body: JSON.stringify({
      values: [Ut(t)]
    })
  });
}
async function an(e, t) {
  await Vt(e, `/values/Movimientos!A:AD:append?valueInputOption=USER_ENTERED`, {
    method: `POST`,
    body: JSON.stringify({
      values: [Qt(t)]
    })
  });
}
async function on(e, t, n) {
  await nn(e, n.filter(e => e.id !== t));
}
function sn(e) {
  if (!e[0] || !e[3]) {
    return null;
  } else {
    return {
      id: e[0],
      marca: e[1] || ``,
      modelo: e[2] || ``,
      numeroActivo: e[3],
      economicoMontado: e[4] || ``,
      horometro: e[5] === `` || e[5] == null ? null : Number(e[5]),
      estatus: e[6] || `operando`,
      notas: e[7] || undefined,
      creadoEn: e[8] || new Date().toISOString()
    };
  }
}
function cn(e) {
  return [e.id, e.marca, e.modelo, e.numeroActivo, e.economicoMontado, e.horometro ?? ``, e.estatus, e.notas ?? ``, e.creadoEn];
}
async function ln(e) {
  try {
    return ((await (await Vt(e, `/values/Refrigeracion!A2:I`)).json()).values ?? []).map(sn).filter(Boolean);
  } catch {
    return [];
  }
}
async function un(e, t) {
  await Vt(e, `/values/Refrigeracion!A:I:append?valueInputOption=USER_ENTERED`, {
    method: `POST`,
    body: JSON.stringify({
      values: [cn(t)]
    })
  });
}
async function dn(e, t) {
  let n = await Lt(e);
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${e.spreadsheetId}/values/Refrigeracion!A2:I:clear`, {
    method: `POST`,
    headers: {
      Authorization: `Bearer ${n}`
    }
  });
  if (t.length !== 0) {
    await Vt(e, `/values/Refrigeracion!A2?valueInputOption=USER_ENTERED`, {
      method: `PUT`,
      body: JSON.stringify({
        values: t.map(cn)
      })
    });
  }
}
async function fn(e, t, n) {
  let r = n.findIndex(e => e.id === t.id);
  if (r < 0) {
    await un(e, t);
    return;
  }
  let i = r + 2;
  await Vt(e, `/values/Refrigeracion!A${i}:I${i}?valueInputOption=USER_ENTERED`, {
    method: `PUT`,
    body: JSON.stringify({
      values: [cn(t)]
    })
  });
}
async function pn(e, t, n) {
  await dn(e, n.filter(e => e.id !== t));
}
var mn = `patio-control-offline-queue`;
function hn() {
  try {
    let e = localStorage.getItem(mn);
    if (e) {
      return JSON.parse(e);
    } else {
      return [];
    }
  } catch {
    return [];
  }
}
function gn(e) {
  localStorage.setItem(mn, JSON.stringify(e));
}
function _n(e, t) {
  let n = hn().filter(t => t.id !== e.id);
  n.push({
    id: e.id,
    movimiento: e,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: t
  });
  gn(n);
  return n;
}
function vn(e) {
  let t = hn().filter(t => t.id !== e);
  gn(t);
  return t;
}
function yn(e, t) {
  let n = hn().map(n => n.id === e ? {
    ...n,
    attempts: n.attempts + 1,
    lastError: t
  } : n);
  gn(n);
  return n;
}
async function bn(e, t) {
  let n = await Bt(e, t.fotosEvidencia?.length ? t.fotosEvidencia : t.fotos.map((e, t) => ({
    slotId: `foto-${t}`,
    label: `Foto ${t + 1}`,
    url: e
  })), `${t.yardaId}-${t.tipo}-${t.placa}`);
  let r = t.firmaUrl;
  if (r && !r.startsWith(`http`)) {
    r = await zt(e, r, `${t.yardaId}-firma-${t.placa}-${Date.now()}.png`);
  }
  let i = {
    ...t,
    fotosEvidencia: n,
    fotos: n.map(e => e.url),
    firmaUrl: r
  };
  await an(e, i);
  return i;
}
async function xn(e, t) {
  let n = hn();
  let r = 0;
  for (let i of n) {
    try {
      let n = await bn(e, i.movimiento);
      vn(i.id);
      t?.(n);
      r++;
    } catch (e) {
      yn(i.id, e instanceof Error ? e.message : `Error sync`);
    }
  }
  return {
    synced: r,
    remaining: hn()
  };
}
function Sn() {
  let [e, t] = (0, l.useState)(() => Dt());
  let [n, r] = (0, l.useState)(() => jt() && Dt().clientId ? `workspace` : `local`);
  let [i, a] = (0, l.useState)(null);
  let [o, s] = (0, l.useState)(() => Ce());
  let [c, u] = (0, l.useState)(false);
  let [d, f] = (0, l.useState)(null);
  let [p, m] = (0, l.useState)(() => navigator.onLine);
  let [h, g] = (0, l.useState)(() => hn());
  (0, l.useEffect)(() => {
    M(o);
  }, [o]);
  (0, l.useEffect)(() => {
    let e = () => m(true);
    let t = () => m(false);
    window.addEventListener(`online`, e);
    window.addEventListener(`offline`, t);
    return () => {
      window.removeEventListener(`online`, e);
      window.removeEventListener(`offline`, t);
    };
  }, []);
  let _ = (0, l.useCallback)(async (t = e) => {
    u(true);
    f(null);
    try {
      let [e, n, i] = await Promise.all([$t(t), ln(t), en(t)]);
      s({
        equipos: e,
        refrigeraciones: n,
        movimientos: i
      });
      r(`workspace`);
    } catch (e) {
      f(e instanceof Error ? e.message : `Error al sincronizar`);
      throw e;
    } finally {
      u(false);
    }
  }, [e]);
  let v = (0, l.useCallback)(async () => {
    if (n === `workspace` && navigator.onLine && e.clientId && hn().length !== 0) {
      u(true);
      try {
        let {
          remaining: t
        } = await xn(e, e => {
          s(t => ({
            ...t,
            movimientos: t.movimientos.map(t => t.id === e.id ? e : t)
          }));
        });
        g(t);
      } finally {
        u(false);
      }
    }
  }, [n, e]);
  (0, l.useEffect)(() => {
    if (p && n === `workspace`) {
      v();
    }
  }, [p, n, v]);
  let y = (0, l.useCallback)(async n => {
    let i = n ?? e;
    if (n) {
      Ot(n);
      t(n);
    }
    u(true);
    f(null);
    try {
      let e = await It(await Ft(i));
      a(e);
      await _(i);
      r(`workspace`);
      let {
        remaining: t
      } = await xn(i);
      g(t);
    } catch (e) {
      f(e instanceof Error ? e.message : `No se pudo conectar`);
      throw e;
    } finally {
      u(false);
    }
  }, [e, _]);
  let b = (0, l.useCallback)(() => {
    Nt();
    a(null);
    r(`local`);
    s(Ce());
  }, []);
  let x = (0, l.useCallback)(e => {
    Ot(e);
    t(e);
  }, []);
  let S = (0, l.useCallback)(async t => {
    s(e => we(e, t));
    if (n === `workspace` && navigator.onLine) {
      u(true);
      f(null);
      try {
        await rn(e, t, o.equipos);
      } catch (e) {
        f(e instanceof Error ? e.message : `Error al guardar equipo`);
      } finally {
        u(false);
      }
    }
  }, [n, e, o.equipos]);
  let C = (0, l.useCallback)(async t => {
    s(e => N(e, t));
    if (n === `workspace` && navigator.onLine) {
      u(true);
      f(null);
      try {
        await fn(e, t, o.refrigeraciones);
      } catch (e) {
        f(e instanceof Error ? e.message : `Error al guardar refrigeración`);
      } finally {
        u(false);
      }
    }
  }, [n, e, o.refrigeraciones]);
  let ee = (0, l.useCallback)(async t => {
    s(e => Te(e, t));
    if (n === `workspace` && navigator.onLine) {
      u(true);
      try {
        await pn(e, t, o.refrigeraciones);
      } finally {
        u(false);
      }
    }
  }, [n, e, o.refrigeraciones]);
  let w = (0, l.useCallback)(async t => {
    s(e => {
      let n = Ee(e, t);
      let r = t.refrigerada?.refrigeracionId;
      let i = t.refrigerada?.horometroThermo;
      if (r && i != null) {
        let e = n.refrigeraciones.find(e => e.id === r);
        if (e) {
          n = N(n, {
            ...e,
            horometro: i
          });
        }
      }
      return n;
    });
    if (n === `workspace`) {
      if (!navigator.onLine) {
        g(_n(t, `Sin conexión`));
        return;
      }
      u(true);
      f(null);
      try {
        let n = await bn(e, t);
        s(e => ({
          ...e,
          movimientos: e.movimientos.map(e => e.id === n.id ? n : e)
        }));
        let r = t.refrigerada?.refrigeracionId;
        let i = t.refrigerada?.horometroThermo;
        if (r && i != null) {
          let t = o.refrigeraciones.find(e => e.id === r);
          if (t) {
            await fn(e, {
              ...t,
              horometro: i
            }, o.refrigeraciones);
          }
        }
      } catch (e) {
        let n = e instanceof Error ? e.message : `Error al registrar movimiento`;
        f(`${n} · quedó en cola offline`);
        g(_n(t, n));
      } finally {
        u(false);
      }
    }
  }, [n, e, o.refrigeraciones]);
  let te = (0, l.useCallback)(async t => {
    s(e => {
      let n = {
        ...e,
        equipos: e.equipos.filter(e => e.id !== t)
      };
      M(n);
      return n;
    });
    if (n === `workspace` && navigator.onLine) {
      u(true);
      try {
        await on(e, t, o.equipos);
      } finally {
        u(false);
      }
    }
  }, [n, e, o.equipos]);
  let T = (0, l.useCallback)(() => {
    let e = {
      equipos: [],
      refrigeraciones: [],
      movimientos: []
    };
    M(e);
    s(e);
  }, []);
  return {
    state: o,
    config: e,
    mode: n,
    user: i,
    syncing: c,
    syncError: d,
    online: p,
    queueCount: h.length,
    flushQueue: v,
    guardarEquipo: S,
    guardarRefrigeracion: C,
    eliminarRefrigeracion: ee,
    registrarMovimiento: w,
    eliminarEquipo: te,
    connectWorkspace: y,
    disconnectWorkspace: b,
    updateConfig: x,
    refreshFromWorkspace: _,
    limpiarDatos: T
  };
}
function Cn(e) {
  return e.condicionGeneral === `mala` || e.condicionGeneral === `regular` || e.checklist.some(e => e.ok === false);
}
function wn(e, t, n) {
  let r = [...e].sort((e, t) => new Date(e.fechaHora).getTime() - new Date(t.fechaHora).getTime());
  let i = new Map();
  let a = [];
  for (let e of r) {
    if (t && t !== `todas` && e.yardaId !== t || n && n !== `todas` && (e.empresaId ?? `api`) !== n) {
      continue;
    }
    if (e.tipo === `entrada`) {
      i.set(e.equipoId, e);
      continue;
    }
    if (e.tipo !== `salida`) {
      continue;
    }
    let r = i.get(e.equipoId);
    if (!r) {
      continue;
    }
    i.delete(e.equipoId);
    let o = new Date(e.fechaHora).getTime() - new Date(r.fechaHora).getTime();
    let s = Math.max(0, o / 3600000);
    let c = null;
    if (r.selloNumero || e.selloNumero) {
      c = !!r.selloNumero && !!e.selloNumero && r.selloNumero.trim().toUpperCase() === e.selloNumero.trim().toUpperCase();
    }
    let l = null;
    if (r.dieselPorcentaje != null && e.dieselPorcentaje != null) {
      l = e.dieselPorcentaje - r.dieselPorcentaje;
    }
    a.push({
      equipoId: e.equipoId,
      placa: e.placa,
      yardaId: e.yardaId,
      empresaId: e.empresaId ?? `api`,
      entrada: r,
      salida: e,
      dwellHours: s,
      selloOk: c,
      dieselDeltaPct: l,
      danoEntrada: Cn(r),
      danoSalida: Cn(e)
    });
  }
  return a;
}
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
function kn(e) {
  return new Date(e).toLocaleString(`es-MX`, {
    day: `2-digit`,
    month: `short`,
    hour: `2-digit`,
    minute: `2-digit`
  });
}
function An({
  state: e,
  onEntrada: t,
  onSalida: n,
  onParado: r,
  onBaja: i,
  onHistorial: a,
  onKpis: o
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
  const Component508 = `p`;
  const Component509 = `h1`;
  const Component510 = `p`;
  const Component511 = `div`;
  const Component512 = `p`;
  const Component513 = `button`;
  const Component514 = `button`;
  const Component515 = `span`;
  const Component516 = `button`;
  const Component517 = `button`;
  const Component518 = `div`;
  const Component519 = `strong`;
  const Component520 = `p`;
  const Component521 = `section`;
  const Component522 = `legend`;
  const Component523 = `button`;
  const Component524 = `button`;
  const Component525 = `div`;
  const Component526 = `fieldset`;
  const Component527 = `legend`;
  const Component528 = `button`;
  const Component529 = `button`;
  const Component530 = `div`;
  const Component531 = `fieldset`;
  const Component532 = `p`;
  const Component533 = `p`;
  const Component534 = `article`;
  const Component535 = `p`;
  const Component536 = `p`;
  const Component537 = `article`;
  const Component538 = `p`;
  const Component539 = `p`;
  const Component540 = `article`;
  const Component541 = `section`;
  const Component542 = `p`;
  const Component543 = `p`;
  const Component544 = `article`;
  const Component545 = `p`;
  const Component546 = `p`;
  const Component547 = `article`;
  const Component548 = `p`;
  const Component549 = `p`;
  const Component550 = `p`;
  const Component551 = `article`;
  const Component552 = `section`;
  const Component553 = `h2`;
  const Component554 = `div`;
  const Component555 = `p`;
  const Component556 = `p`;
  const Component557 = `p`;
  const Component558 = `li`;
  const Component559 = `ul`;
  const Component560 = `section`;
  const Component561 = `h2`;
  const Component562 = `button`;
  const Component563 = `div`;
  const Component564 = `p`;
  const Component565 = `span`;
  const Component566 = `p`;
  const Component567 = `p`;
  const Component568 = `button`;
  const Component569 = `button`;
  const Component570 = `button`;
  const Component571 = `button`;
  const Component572 = `div`;
  const Component573 = `div`;
  const Component574 = `p`;
  const Component575 = `span`;
  const Component576 = `div`;
  const Component577 = `img`;
  const Component578 = `li`;
  const Component579 = `ul`;
  const Component580 = `section`;
  const Component581 = `div`;
  return <Component581 className={`page`}><Component521 className={`hero-ops`}><Component511><Component508 className={`eyebrow`}>{`Gate · 3 yardas · API / Carbal-Pia`}</Component508><Component509>{`Control de accesos/salidas en los patios de trabajo`}</Component509><Component510 className={`lede`}>{`Chihuahua, Calera y Calpulalpan · ~25 viajes/día por sentido. Fotos guiadas, sello, firma y GPS.`}</Component510></Component511><Component512 className={`hero-prompt`}>{`Selecciona el tipo de movimiento o registro que necesitas hacer:`}</Component512><Component518 className={`hero-actions`}><Component513 type={`button`} className={`btn ghost`} onClick={() => t()}>{`Nueva entrada`}</Component513><Component514 type={`button`} className={`btn ghost`} onClick={() => n()}>{`Registrar salida`}</Component514><Component516 type={`button`} className={`btn ghost`} onClick={() => r()}>{`Equipo parado`}<Component515 className={`btn-sub`}>{`Inventariar`}</Component515></Component516>{o && <Component517 type={`button`} className={`btn ghost`} onClick={o}>{`Ver KPIs`}</Component517>}</Component518><Component520 className={`hero-hint`}><Component519>{`Equipo parado`}</Component519>{` = unidad que ya está en yarda sin viaje de entrada ni salida (vacío en pool, taller, retenida, drop sin ciclo…). No es un arribo: es un conteo.`}</Component520></Component521><Component526 className={`fieldset`}><Component522>{`Empresa`}</Component522><Component525 className={`seg big wrap`}><Component523 type={`button`} className={u === `todas` ? `seg-btn on-ok` : `seg-btn`} onClick={() => C(`todas`)}>{`Todas`}</Component523>{ie.map(e => <Component524 type={`button`} className={u === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => C(e.id)} key={e.id}>{e.nombre}</Component524>)}</Component525></Component526><Component531 className={`fieldset`}><Component527>{`Yarda`}</Component527><Component530 className={`seg big wrap`}><Component528 type={`button`} className={s === `todas` ? `seg-btn on-ok` : `seg-btn`} onClick={() => S(`todas`)}>{`Todas`}</Component528>{_e.map(e => <Component529 type={`button`} className={s === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => S(e.id)} key={e.id}>{e.nombre}</Component529>)}</Component530></Component531><Component541 className={`stats stats-patio`}><Component534 className={`stat`}><Component532 className={`stat-label`}>{`En patio`}</Component532><Component533 className={`stat-value`}>{f.length}</Component533></Component534><Component537 className={`stat`}><Component535 className={`stat-label`}>{`En ciclo`}</Component535><Component536 className={`stat-value`}>{p.length}</Component536></Component537><Component540 className={`stat`}><Component538 className={`stat-label`}>{`Parados`}</Component538><Component539 className={`stat-value`}>{m.length}</Component539></Component540></Component541><Component552 className={`stats`}><Component544 className={`stat`}><Component542 className={`stat-label`}>{`Entradas hoy`}</Component542><Component543 className={`stat-value`}>{_}</Component543></Component544><Component547 className={`stat`}><Component545 className={`stat-label`}>{`Salidas hoy`}</Component545><Component546 className={`stat-value`}>{v}</Component546></Component547><Component551 className={`stat`}><Component548 className={`stat-label`}>{`Alertas`}</Component548><Component549 className={`stat-value`}>{b.length || y}</Component549><Component550 className={`hint`}>{x}{` críticas`}</Component550></Component551></Component552>{b.length > 0 && <Component560 className={`panel alerts-panel`}><Component554 className={`panel-head`}><Component553>{`Alertas operativas`}</Component553></Component554><Component559 className={`alert-list`}>{b.slice(0, 6).map(e => <Component558 className={`alert-row ${e.level}`} key={e.id}><Component555 className={`unit-placa`}>{e.title}</Component555><Component556 className={`unit-meta`}>{e.detail}</Component556><Component557 className={`unit-time`}>{kn(e.when)}</Component557></Component558>)}</Component559></Component560>}<Component580 className={`panel`}><Component563 className={`panel-head`}><Component561>{`Equipos en patio`}{u === `todas` ? `` : ` · ${k(u)}`}{s === `todas` ? `` : ` · ${ye(s)}`}</Component561><Component562 type={`button`} className={`text-btn`} onClick={a}>{`Ver historial`}</Component562></Component563>{f.length === 0 ? <Component564 className={`empty`}>{`No hay equipos en patio en este filtro.`}</Component564> : <Component579 className={`unit-list`}>{f.map(({
          equipo: e,
          entrada: a,
          estado: o
        }) => <Component578 className={`unit-row`} key={e.id}><Component573 className={`unit-main`}><Component566 className={`unit-placa`}>{e.placa}{` `}<Component565 className={`badge ${o === `parado` ? `parado` : `ciclo`}`}>{o === `parado` ? `PARADO` : `EN CICLO`}</Component565></Component566><Component567 className={`unit-meta`}>{jn(e.tipo)}{` · `}{e.numeroEconomico}{` ·`}{` `}{k(a.empresaId)}{` · `}{ye(a.yardaId)}{a.selloNumero ? ` · sello ${a.selloNumero}` : ``}{o === `parado` && a.motivoParo ? ` · ${_t(a.motivoParo, a.motivoParoOtro)}` : ``}</Component567><Component572 className={`unit-actions`}><Component568 type={`button`} className={`text-btn`} onClick={() => n(e.placa)}>{`Salida`}</Component568>{o === `parado` ? <Component569 type={`button`} className={`text-btn`} onClick={() => t(e.placa)}>{`Pasar a ciclo`}</Component569> : <Component570 type={`button`} className={`text-btn`} onClick={() => r(e.placa)}>{`Pasar a parado`}</Component570>}<Component571 type={`button`} className={`text-btn`} onClick={() => i(e.placa)}>{`Baja`}</Component571></Component572></Component573><Component576 className={`unit-side`}><Component574 className={`unit-time`}>{o === `parado` ? `Desde` : `Llegó`}{` `}{kn(a.fechaHora)}</Component574><Component575 className={`pill ${a.condicionGeneral}`}>{a.condicionGeneral}</Component575></Component576>{a.fotos[0] && <Component577 className={`unit-thumb`} src={a.fotos[0]} alt={``} />}</Component578>)}</Component579>}</Component580></Component581>;
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
function Mn({
  state: e,
  onSave: t,
  onDelete: n,
  onSaveRefrigeracion: r,
  onDeleteRefrigeracion: i
}) {
  let [a, o] = (0, l.useState)(`unidades`);
  const Component582 = `h1`;
  const Component583 = `p`;
  const Component584 = `div`;
  const Component585 = `button`;
  const Component586 = `button`;
  const Component587 = `div`;
  const Component588 = `div`;
  return <Component588 className={`page`}><Component584 className={`form-head`}><Component582>{`Equipos`}</Component582><Component583>{`Catálogo de tractos/cajas y de equipos de refrigeración (Thermo).`}</Component583></Component584><Component587 className={`seg wrap`} style={{
      marginBottom: 14
    }}><Component585 type={`button`} className={a === `unidades` ? `seg-btn on-ok` : `seg-btn`} onClick={() => o(`unidades`)}>{`Unidades (camión / caja)`}</Component585><Component586 type={`button`} className={a === `refrigeracion` ? `seg-btn on-ok` : `seg-btn`} onClick={() => o(`refrigeracion`)}>{`Refrigeración`}</Component586></Component587>{a === `unidades` ? <Nn state={e} onSave={t} onDelete={n} /> : <Pn state={e} onSave={r} onDelete={i} />}</Component588>;
}
function Nn({
  state: e,
  onSave: t,
  onDelete: n
}) {
  let [r, i] = (0, l.useState)(`camion`);
  let [a, o] = (0, l.useState)(``);
  let [s, c] = (0, l.useState)(``);
  let [u, d] = (0, l.useState)(``);
  let [f, p] = (0, l.useState)(``);
  let [m, h] = (0, l.useState)(``);
  let [g, _] = (0, l.useState)(``);
  function v(e) {
    e.preventDefault();
    if (a.trim()) {
      t({
        id: ee(),
        tipo: r,
        placa: normalizePlacaMX(a),
        numeroEconomico: s.trim() || normalizePlacaMX(a),
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
  const Component589 = `span`;
  const Component590 = `option`;
  const Component591 = `option`;
  const Component592 = `option`;
  const Component593 = `option`;
  const Component594 = `select`;
  const Component595 = `label`;
  const Component596 = `span`;
  const Component597 = `input`;
  const Component598 = `label`;
  const Component599 = `span`;
  const Component600 = `input`;
  const Component601 = `label`;
  const Component602 = `span`;
  const Component603 = `input`;
  const Component604 = `label`;
  const Component605 = `span`;
  const Component606 = `input`;
  const Component607 = `label`;
  const Component608 = `span`;
  const Component609 = `input`;
  const Component610 = `label`;
  const Component611 = `div`;
  const Component612 = `span`;
  const Component613 = `input`;
  const Component614 = `label`;
  const Component615 = `button`;
  const Component616 = `form`;
  const Component617 = `p`;
  const Component618 = `p`;
  const Component619 = `p`;
  const Component620 = `div`;
  const Component621 = `button`;
  const Component622 = `li`;
  const Component623 = `ul`;
  return <l.Fragment><Component616 className={`form-panel compact`} onSubmit={v}><Component611 className={`grid-2`}><Component595 className={`field`}><Component589>{`Tipo`}</Component589><Component594 className={`input`} value={r} onChange={e => i(e.target.value)}><Component590 value={`camion`}>{`Camión`}</Component590><Component591 value={`caja`}>{`Caja / remolque`}</Component591><Component592 value={`dolly`}>{`Dolly`}</Component592><Component593 value={`otro`}>{`Otro`}</Component593></Component594></Component595><Component598 className={`field`}><Component596>{`Placa`}</Component596><Component597 className={`input`} value={a} onChange={e => o(normalizePlacaMX(e.target.value))} placeholder={`Placa sin guiones`} required={true} /><PlacaQuickOcr slotId={`placa`} label={`Tomar foto y leer placa`} onPlaca={placa => o(normalizePlacaMX(placa))} /></Component598><Component601 className={`field`}><Component599>{`No. económico`}</Component599><Component600 className={`input`} value={s} onChange={e => c(e.target.value)} /></Component601><Component604 className={`field`}><Component602>{`Marca`}</Component602><Component603 className={`input`} value={u} onChange={e => d(e.target.value)} /></Component604><Component607 className={`field`}><Component605>{`Modelo`}</Component605><Component606 className={`input`} value={f} onChange={e => p(e.target.value)} /></Component607><Component610 className={`field`}><Component608>{`Notas`}</Component608><Component609 className={`input`} value={g} onChange={e => _(e.target.value)} /></Component610></Component611><Component614 className={`field`} style={{
        marginTop: 12
      }}><Component612>{`Nombre operador/chofer asignado a este camión o unidad:`}</Component612><Component613 className={`input`} value={m} onChange={e => h(e.target.value)} placeholder={`Ej. Luis Pérez`} /></Component614><Component615 type={`submit`} className={`btn primary`}>{`Agregar equipo`}</Component615></Component616><Component623 className={`unit-list`}>{e.equipos.length === 0 && <Component617 className={`empty`}>{`Aún no hay equipos dados de alta.`}</Component617>}{e.equipos.map(e => <Component622 className={`unit-row`} key={e.id}><Component620 className={`unit-main`}><Component618 className={`unit-placa`}>{e.placa}</Component618><Component619 className={`unit-meta`}>{e.tipo}{` · `}{e.numeroEconomico}{e.marca ? ` · ${e.marca}` : ``}{e.modelo ? ` ${e.modelo}` : ``}{e.operadorAsignado ? ` · chofer ${e.operadorAsignado}` : ``}</Component619></Component620><Component621 type={`button`} className={`text-btn danger`} onClick={() => n(e.id)}>{`Eliminar`}</Component621></Component622>)}</Component623></l.Fragment>;
}
function Pn({
  state: e,
  onSave: t,
  onDelete: n
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
  const Component624 = `p`;
  const Component625 = `span`;
  const Component626 = `option`;
  const Component627 = `option`;
  const Component628 = `select`;
  const Component629 = `label`;
  const Component630 = `span`;
  const Component631 = `input`;
  const Component632 = `label`;
  const Component633 = `span`;
  const Component634 = `input`;
  const Component635 = `label`;
  const Component636 = `span`;
  const Component637 = `input`;
  const Component638 = `label`;
  const Component639 = `span`;
  const Component640 = `input`;
  const Component641 = `label`;
  const Component642 = `span`;
  const Component643 = `option`;
  const Component644 = `select`;
  const Component645 = `label`;
  const Component646 = `span`;
  const Component647 = `input`;
  const Component648 = `label`;
  const Component649 = `div`;
  const Component650 = `button`;
  const Component651 = `button`;
  const Component652 = `div`;
  const Component653 = `form`;
  const Component654 = `p`;
  const Component655 = `p`;
  const Component656 = `p`;
  const Component657 = `div`;
  const Component658 = `button`;
  const Component659 = `button`;
  const Component660 = `div`;
  const Component661 = `li`;
  const Component662 = `ul`;
  return <l.Fragment><Component653 className={`form-panel compact`} onSubmit={S}><Component624 className={`hint`} style={{
        marginTop: 0
      }}>{`Alta de cada caja / equipo de refrigeración (Thermo King u otro).`}</Component624><Component649 className={`grid-2`}><Component629 className={`field`}><Component625>{`Marca *`}</Component625><Component628 className={`input`} value={r} onChange={e => i(e.target.value)} required={true}><Component626 value={``}>{`Seleccionar…`}</Component626>{tt.map(e => <Component627 value={e} key={e}>{e}</Component627>)}</Component628></Component629><Component632 className={`field`}><Component630>{`Modelo *`}</Component630><Component631 className={`input`} value={a} onChange={e => o(e.target.value)} placeholder={`SB-210 / X-Series…`} required={true} /></Component632><Component635 className={`field`}><Component633>{`Número de activo interno *`}</Component633><Component634 className={`input`} value={s} onChange={e => c(e.target.value.toUpperCase())} placeholder={`ACT-REF-001`} required={true} /></Component635><Component638 className={`field`}><Component636>{`Económico de la caja/camión donde está montado *`}</Component636><Component637 className={`input`} value={u} onChange={e => d(e.target.value.toUpperCase())} placeholder={`R-220 / T-101`} required={true} /></Component638><Component641 className={`field`}><Component639>{`Horómetro (horas)`}</Component639><Component640 className={`input`} type={`number`} min={0} step={0.1} value={f} onChange={e => p(e.target.value)} placeholder={`12450`} /></Component641><Component645 className={`field`}><Component642>{`Estatus *`}</Component642><Component644 className={`input`} value={m} onChange={e => h(e.target.value)}>{nt.map(e => <Component643 value={e.id} key={e.id}>{e.label}</Component643>)}</Component644></Component645><Component648 className={`field full`}><Component646>{`Notas`}</Component646><Component647 className={`input`} value={g} onChange={e => _(e.target.value)} /></Component648></Component649><Component652 className={`hero-actions`} style={{
        marginTop: 12
      }}><Component650 type={`submit`} className={`btn primary`}>{v ? `Guardar cambios` : `Agregar refrigeración`}</Component650>{v && <Component651 type={`button`} className={`btn soft`} onClick={b}>{`Cancelar`}</Component651>}</Component652></Component653><Component662 className={`unit-list`}>{e.refrigeraciones.length === 0 && <Component654 className={`empty`}>{`Aún no hay equipos de refrigeración dados de alta.`}</Component654>}{e.refrigeraciones.map(e => <Component661 className={`unit-row`} key={e.id}><Component657 className={`unit-main`}><Component655 className={`unit-placa`}>{e.marca}{` `}{e.modelo}</Component655><Component656 className={`unit-meta`}>{`Activo `}{e.numeroActivo}{` · montado en `}{e.economicoMontado}{e.horometro == null ? `` : ` · ${e.horometro.toLocaleString(`es-MX`)} h`}{` · `}{rt(e.estatus)}</Component656></Component657><Component660 className={`unit-side`}><Component658 type={`button`} className={`text-btn`} onClick={() => x(e)}>{`Editar`}</Component658><Component659 type={`button`} className={`text-btn danger`} onClick={() => n(e.id)}>{`Eliminar`}</Component659></Component660></Component661>)}</Component662></l.Fragment>;
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
function Rn(e) {
  return new Date(e).toLocaleString(`es-MX`, {
    day: `2-digit`,
    month: `short`,
    year: `numeric`,
    hour: `2-digit`,
    minute: `2-digit`
  });
}
function _Component6({
  state: e
}) {
  let [t, n] = (0, l.useState)(``);
  let [r, i] = (0, l.useState)(`todos`);
  let [a, o] = (0, l.useState)(`todas`);
  let [s, c] = (0, l.useState)(`todas`);
  let [u, d] = (0, l.useState)(null);
  let f = (0, l.useMemo)(() => {
    let n = t.trim().toUpperCase();
    return e.movimientos.filter(e => r !== `todos` && e.tipo !== r || a !== `todas` && e.yardaId !== a || s !== `todas` && (e.empresaId ?? `api`) !== s ? false : !n || e.placa.includes(n) || (e.placaCamionTrasera ?? ``).includes(n) || (e.placaCaja1 ?? ``).includes(n) || (e.placaCaja2 ?? ``).includes(n) || e.numeroEconomico.toUpperCase().includes(n) || (e.chofer ?? ``).toUpperCase().includes(n) || (e.operador ?? ``).toUpperCase().includes(n) || (e.selloNumero ?? ``).toUpperCase().includes(n));
  }, [e.movimientos, t, r, a, s]);
  const Component663 = `h1`;
  const Component664 = `p`;
  const Component665 = `div`;
  const Component666 = `button`;
  const Component667 = `div`;
  const Component668 = `input`;
  const Component669 = `button`;
  const Component670 = `div`;
  const Component671 = `button`;
  const Component672 = `button`;
  const Component673 = `div`;
  const Component674 = `button`;
  const Component675 = `button`;
  const Component676 = `div`;
  const Component677 = `div`;
  const Component678 = `p`;
  const Component679 = `span`;
  const Component680 = `p`;
  const Component681 = `p`;
  const Component682 = `div`;
  const Component683 = `p`;
  const Component684 = `span`;
  const Component685 = `div`;
  const Component686 = `button`;
  const Component687 = `li`;
  const Component688 = `ul`;
  const Component689 = `h2`;
  const Component690 = `button`;
  const Component691 = `div`;
  const Component692 = `dt`;
  const Component693 = `dd`;
  const Component694 = `div`;
  const Component695 = `dt`;
  const Component696 = `dd`;
  const Component697 = `div`;
  const Component698 = `dt`;
  const Component699 = `dd`;
  const Component700 = `div`;
  const Component701 = `dt`;
  const Component702 = `dd`;
  const Component703 = `div`;
  const Component704 = `dt`;
  const Component705 = `dd`;
  const Component706 = `div`;
  const Component707 = `dt`;
  const Component708 = `dd`;
  const Component709 = `div`;
  const Component710 = `dt`;
  const Component711 = `dd`;
  const Component712 = `div`;
  const Component713 = `dt`;
  const Component714 = `dd`;
  const Component715 = `div`;
  const Component716 = `dt`;
  const Component717 = `dd`;
  const Component718 = `div`;
  const Component719 = `dt`;
  const Component720 = `dd`;
  const Component721 = `div`;
  const Component722 = `dt`;
  const Component723 = `dd`;
  const Component724 = `div`;
  const Component725 = `dt`;
  const Component726 = `dd`;
  const Component727 = `div`;
  const Component728 = `dt`;
  const Component729 = `dd`;
  const Component730 = `div`;
  const Component731 = `dt`;
  const Component732 = `dd`;
  const Component733 = `div`;
  const Component734 = `dt`;
  const Component735 = `dd`;
  const Component736 = `div`;
  const Component737 = `dt`;
  const Component738 = `dd`;
  const Component739 = `div`;
  const Component740 = `dt`;
  const Component741 = `dd`;
  const Component742 = `div`;
  const Component743 = `dt`;
  const Component744 = `dd`;
  const Component745 = `div`;
  const Component746 = `dt`;
  const Component747 = `dd`;
  const Component748 = `div`;
  const Component749 = `dt`;
  const Component750 = `dd`;
  const Component751 = `div`;
  const Component752 = `dt`;
  const Component753 = `dd`;
  const Component754 = `div`;
  const Component755 = `dt`;
  const Component756 = `dd`;
  const Component757 = `div`;
  const Component758 = `dt`;
  const Component759 = `dd`;
  const Component760 = `div`;
  const Component761 = `dt`;
  const Component762 = `dd`;
  const Component763 = `div`;
  const Component764 = `dt`;
  const Component765 = `dd`;
  const Component766 = `div`;
  const Component767 = `dt`;
  const Component768 = `dd`;
  const Component769 = `div`;
  const Component770 = `dl`;
  const Component771 = `h3`;
  const Component772 = `dt`;
  const Component773 = `dd`;
  const Component774 = `div`;
  const Component775 = `dt`;
  const Component776 = `dd`;
  const Component777 = `div`;
  const Component778 = `dt`;
  const Component779 = `dd`;
  const Component780 = `div`;
  const Component781 = `dt`;
  const Component782 = `dd`;
  const Component783 = `div`;
  const Component784 = `dt`;
  const Component785 = `dd`;
  const Component786 = `div`;
  const Component787 = `dt`;
  const Component788 = `dd`;
  const Component789 = `div`;
  const Component790 = `dt`;
  const Component791 = `dd`;
  const Component792 = `div`;
  const Component793 = `dt`;
  const Component794 = `dd`;
  const Component795 = `div`;
  const Component796 = `dt`;
  const Component797 = `dd`;
  const Component798 = `div`;
  const Component799 = `dt`;
  const Component800 = `dd`;
  const Component801 = `div`;
  const Component802 = `dt`;
  const Component803 = `dd`;
  const Component804 = `div`;
  const Component805 = `dt`;
  const Component806 = `dd`;
  const Component807 = `div`;
  const Component808 = `dt`;
  const Component809 = `dd`;
  const Component810 = `div`;
  const Component811 = `dt`;
  const Component812 = `dd`;
  const Component813 = `div`;
  const Component814 = `dt`;
  const Component815 = `dd`;
  const Component816 = `div`;
  const Component817 = `dl`;
  const Component818 = `h3`;
  const Component819 = `li`;
  const Component820 = `ul`;
  const Component821 = `h3`;
  const Component822 = `img`;
  const Component823 = `p`;
  const Component824 = `h3`;
  const Component828 = `ul`;
  const Component829 = `h3`;
  const Component830 = `img`;
  const Component831 = `figcaption`;
  const Component832 = `figure`;
  const Component833 = `div`;
  const Component834 = `aside`;
  const Component835 = `div`;
  const Component836 = `div`;
  return <Component836 className={`page`}><Component665 className={`form-head`}><Component663>{`Historial`}</Component663><Component664>{`Consulta por empresa, yarda, sello, evidencias guiadas y firma.`}</Component664></Component665><Component667 className={`hero-actions`} style={{
      marginBottom: 12
    }}><Component666 type={`button`} className={`btn soft`} disabled={f.length === 0} onClick={() => Ln(`patiocontrol-historial-${new Date().toISOString().slice(0, 10)}.csv`, Fn(f))}>{`Exportar CSV (`}{f.length}{`)`}</Component666></Component667><Component677 className={`filters`}><Component668 className={`input`} placeholder={`Buscar placa, sello, chofer…`} value={t} onChange={e => n(e.target.value)} /><Component670 className={`seg wrap`}>{[`todos`, `entrada`, `salida`, `parado`, `baja`].map(e => <Component669 type={`button`} className={r === e ? `seg-btn on-ok` : `seg-btn`} onClick={() => i(e)} key={e}>{e === `todos` ? `Todos` : e === `entrada` ? `Entradas` : e === `salida` ? `Salidas` : e === `parado` ? `Parados` : `Bajas`}</Component669>)}</Component670><Component673 className={`seg wrap`}><Component671 type={`button`} className={s === `todas` ? `seg-btn on-ok` : `seg-btn`} onClick={() => c(`todas`)}>{`Todas empresas`}</Component671>{ie.map(e => <Component672 type={`button`} className={s === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => c(e.id)} key={e.id}>{e.nombre}</Component672>)}</Component673><Component676 className={`seg wrap`}><Component674 type={`button`} className={a === `todas` ? `seg-btn on-ok` : `seg-btn`} onClick={() => o(`todas`)}>{`Todas yardas`}</Component674>{_e.map(e => <Component675 type={`button`} className={a === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => o(e.id)} key={e.id}>{e.nombre}</Component675>)}</Component676></Component677>{f.length === 0 ? <Component678 className={`empty`}>{`Sin movimientos que coincidan.`}</Component678> : <Component688 className={`history-list`}>{f.map(e => <Component687 key={e.id}><Component686 type={`button`} className={`history-row`} onClick={() => d(e)}><Component682><Component680 className={`unit-placa`}><Component679 className={`tag ${e.tipo}`}>{e.tipo}</Component679>{` `}{e.placa}</Component680><Component681 className={`unit-meta`}>{Rn(e.fechaHora)}{` · `}{k(e.empresaId)}{` ·`}{` `}{ye(e.yardaId)}{` · `}{e.numeroEconomico}{e.selloNumero ? ` · sello ${e.selloNumero}` : ``}</Component681></Component682><Component685 className={`unit-side`}><Component683 className={`unit-meta`}>{e.kilometros == null ? `—` : `${e.kilometros.toLocaleString(`es-MX`)} km`}{` · `}{e.dieselPorcentaje == null ? e.dieselLitros == null ? `—` : `${e.dieselLitros} L` : `${e.dieselPorcentaje}%`}</Component683><Component684 className={`pill ${e.condicionGeneral}`}>{e.condicionGeneral}</Component684></Component685></Component686></Component687>)}</Component688>}{u && <Component835 className={`drawer-backdrop`} onClick={() => d(null)}><Component834 className={`drawer`} onClick={e => e.stopPropagation()}><Component691 className={`panel-head`}><Component689>{u.tipo === `entrada` ? `Entrada` : u.tipo === `salida` ? `Salida` : u.tipo === `parado` ? `Parado` : `Baja`}{` `}{`· `}{u.placa}</Component689><Component690 type={`button`} className={`text-btn`} onClick={() => d(null)}>{`Cerrar`}</Component690></Component691><Component770 className={`detail-grid`}><Component694><Component692>{`Empresa`}</Component692><Component693>{k(u.empresaId)}</Component693></Component694><Component697><Component695>{`Yarda`}</Component695><Component696>{ye(u.yardaId)}</Component696></Component697><Component700><Component698>{`Fecha`}</Component698><Component699>{Rn(u.fechaHora)}</Component699></Component700><Component703><Component701>{`Económico`}</Component701><Component702>{u.numeroEconomico}</Component702></Component703><Component706><Component704>{`Placa frontal / principal`}</Component704><Component705>{u.placa}</Component705></Component706><Component709><Component707>{`Placa camión trasera`}</Component707><Component708>{u.placaCamionTrasera || `—`}</Component708></Component709><Component712><Component710>{`Placa 1ª caja`}</Component710><Component711>{u.placaCaja1 || `—`}</Component711></Component712><Component715><Component713>{`Placa 2ª caja`}</Component713><Component714>{u.placaCaja2 || `—`}</Component714></Component715><Component718><Component716>{`Sello`}</Component716><Component717>{u.selloNumero || `—`}</Component717></Component718><Component721><Component719>{`Operador`}</Component719><Component720>{u.operador}</Component720></Component721><Component724><Component722>{`Chofer`}</Component722><Component723>{u.chofer || `—`}</Component723></Component724><Component727><Component725>{`WhatsApp`}</Component725><Component726>{pt(u.whatsapp)}</Component726></Component727><Component730><Component728>{`Cliente`}</Component728><Component729>{u.cliente || `—`}</Component729></Component730><Component733><Component731>{`Origen`}</Component731><Component732>{u.origen || u.origenDestino || `—`}</Component732></Component733><Component736><Component734>{`Destino`}</Component734><Component735>{u.destino || `—`}</Component735></Component736><Component739><Component737>{`Kilómetros`}</Component737><Component738>{u.kilometros ?? `—`}</Component738></Component739><Component742><Component740>{`Diésel`}</Component740><Component741>{u.dieselPorcentaje == null ? `—` : `${u.dieselPorcentaje}%`}{u.dieselLitros == null ? `` : ` / ${u.dieselLitros} L`}</Component741></Component742><Component745><Component743>{`Condición`}</Component743><Component744>{u.condicionGeneral}</Component744></Component745><Component748><Component746>{`Firma`}</Component746><Component747>{u.firmaNombre || `—`}</Component747></Component748><Component751><Component749>{`GPS`}</Component749><Component750>{u.geoLat != null && u.geoLng != null ? `${u.geoLat.toFixed(5)}, ${u.geoLng.toFixed(5)}` : `—`}</Component750></Component751><Component754><Component752>{`Carta Porte UUID`}</Component752><Component753>{u.cumplimiento?.cartaPorteUuid || `—`}</Component753></Component754><Component757><Component755>{`RFC emisor`}</Component755><Component756>{u.cumplimiento?.cartaPorteRfcEmisor || `—`}</Component756></Component757><Component760><Component758>{`Licencia federal`}</Component758><Component759>{u.cumplimiento?.licenciaFederal || `—`}</Component759></Component760><Component763><Component761>{`Bitácora h`}</Component761><Component762>{u.cumplimiento?.bitacoraHorasServicio ?? `—`}{` serv /`}{` `}{u.cumplimiento?.bitacoraHorasDescanso ?? `—`}{` desc`}</Component762></Component763><Component766><Component764>{`Gate validado`}</Component764><Component765>{u.cumplimiento?.validadoGate ? `Sí` : `No`}</Component765></Component766><Component769><Component767>{`Sello vs entrada`}</Component767><Component768>{u.selloCoincideEntrada == null ? `—` : u.selloCoincideEntrada ? `Coincide` : `DISCREPANCIA`}</Component768></Component769></Component770>{u.llevaRefrigerada && u.refrigerada && <l.Fragment><Component771 className={`subhead`}>{`Caja refrigerada / Thermo King`}</Component771><Component817 className={`detail-grid`}><Component774><Component772>{`Marca / modelo Thermo`}</Component772><Component773>{u.refrigerada.marcaThermo || `—`}{` `}{u.refrigerada.modeloThermo || ``}</Component773></Component774><Component777><Component775>{`Activo interno`}</Component775><Component776>{u.refrigerada.numeroActivoThermo || `—`}</Component776></Component777><Component780><Component778>{`Eco. montado`}</Component778><Component779>{u.refrigerada.economicoMontadoThermo || u.refrigerada.economicoCajaRefrigerada || `—`}</Component779></Component780><Component783><Component781>{`Línea transportista`}</Component781><Component782>{u.refrigerada.lineaTransportista || `—`}</Component782></Component783><Component786><Component784>{`Set Point`}</Component784><Component785>{$e(u.refrigerada.setPoint)}</Component785></Component786><Component789><Component787>{`Temp. real`}</Component787><Component788>{u.refrigerada.temperaturaReal == null ? `—` : `${u.refrigerada.temperaturaReal} °C`}</Component788></Component789><Component792><Component790>{`Pre-enfriado`}</Component790><Component791>{u.refrigerada.preEnfriado == null ? `—` : u.refrigerada.preEnfriado ? `Sí` : `No`}</Component791></Component792><Component795><Component793>{`Diésel Thermo`}</Component793><Component794>{et(u.refrigerada.dieselThermo)}</Component794></Component795><Component798><Component796>{`Horómetro`}</Component796><Component797>{u.refrigerada.horometroThermo ?? `—`}</Component797></Component798><Component801><Component799>{`Modo`}</Component799><Component800>{u.refrigerada.modoOperacion || `—`}</Component800></Component801><Component804><Component802>{`Alarma panel`}</Component802><Component803>{u.refrigerada.codigoAlarma || `OK`}</Component803></Component804><Component807><Component805>{`Ticket lavado`}</Component805><Component806>{u.refrigerada.ticketLavado || `—`}</Component806></Component807><Component810><Component808>{`Folio pedido`}</Component808><Component809>{u.refrigerada.folioPedido || `—`}</Component809></Component810><Component813><Component811>{`Folio MVO`}</Component811><Component812>{u.refrigerada.folioMvo || `—`}</Component812></Component813><Component816><Component814>{`Termógrafo`}</Component814><Component815>{u.refrigerada.numeroTermografo || `—`}</Component815></Component816></Component817><Component818 className={`subhead`}>{`Inocuidad TIF`}</Component818><Component820 className={`mini-check`}>{u.refrigerada.inocuidad.map(e => <Component819 className={e.ok ? `ok` : `bad`} key={e.id}>{e.ok ? `Aprobado` : `Rechazado`}{` — `}{e.label}{e.nota ? `: ${e.nota}` : ``}</Component819>)}</Component820></l.Fragment>}{u.firmaUrl && <l.Fragment><Component821 className={`subhead`}>{`Firma`}</Component821><Component822 className={`firma-preview`} src={u.firmaUrl} alt={`Firma`} /></l.Fragment>}{u.observaciones && <Component823 className={`obs`}>{u.observaciones}</Component823>}<Component824 className={`subhead`}>{`Checklist`}</Component824><Component828 className={`mini-check`}>{u.checklist.map(e => {
            let t = e.fotoUrls?.length ? e.fotoUrls : e.fotoUrl ? [e.fotoUrl] : [];
            const Component825 = `img`;
            const Component826 = `div`;
            const Component827 = `li`;
            return <Component827 className={e.ok ? `ok` : `bad`} key={e.id}>{e.ok ? `OK` : `Falla`}{` — `}{e.label}{e.nota ? `: ${e.nota}` : ``}{t.length > 0 && <Component826 className={`falla-foto-grid`} style={{
                marginTop: 8
              }}>{t.map((t, n) => <Component825 className={`falla-hist-thumb`} src={t} alt={`Falla ${e.label} ${n + 1}`} key={`${e.id}-${n}`} />)}</Component826>}</Component827>;
          })}</Component828><Component829 className={`subhead`}>{`Fotos guiadas`}</Component829><Component833 className={`photo-grid labeled`}>{(u.fotosEvidencia?.length ? u.fotosEvidencia : u.fotos.map((e, t) => ({
            slotId: String(t),
            label: `Foto ${t + 1}`,
            url: e
          }))).map(e => <Component832 className={`photo-figure`} key={e.slotId}><Component830 className={`photo-full`} src={e.url} alt={e.label} /><Component831>{e.label}</Component831></Component832>)}</Component833></Component834></Component835>}</Component836>;
}
function Bn({
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
  const Component837 = `h1`;
  const Component838 = `p`;
  const Component839 = `div`;
  const Component840 = `p`;
  const Component841 = `button`;
  const Component842 = `button`;
  const Component843 = `div`;
  const Component844 = `p`;
  const Component845 = `button`;
  const Component846 = `button`;
  const Component847 = `div`;
  const Component848 = `p`;
  const Component849 = `p`;
  const Component850 = `p`;
  const Component851 = `article`;
  const Component852 = `p`;
  const Component853 = `p`;
  const Component854 = `p`;
  const Component855 = `article`;
  const Component856 = `p`;
  const Component857 = `p`;
  const Component858 = `p`;
  const Component859 = `article`;
  const Component860 = `p`;
  const Component861 = `p`;
  const Component862 = `p`;
  const Component863 = `article`;
  const Component864 = `p`;
  const Component865 = `p`;
  const Component866 = `p`;
  const Component867 = `article`;
  const Component868 = `p`;
  const Component869 = `p`;
  const Component870 = `p`;
  const Component871 = `article`;
  const Component872 = `p`;
  const Component873 = `p`;
  const Component874 = `p`;
  const Component875 = `article`;
  const Component876 = `section`;
  const Component877 = `h2`;
  const Component878 = `div`;
  const Component879 = `p`;
  const Component880 = `p`;
  const Component881 = `p`;
  const Component882 = `div`;
  const Component883 = `p`;
  const Component884 = `span`;
  const Component885 = `div`;
  const Component886 = `li`;
  const Component887 = `ul`;
  const Component888 = `section`;
  const Component889 = `div`;
  return <Component889 className={`page`}><Component839 className={`form-head`}><Component837>{`KPIs de patio`}</Component837><Component838>{`Gate dwell, daños, sellos, combustible y turnaround · filtro por empresa y yarda.`}</Component838></Component839><Component840 className={`label`} style={{
      marginBottom: 6
    }}>{`Empresa`}</Component840><Component843 className={`seg wrap yard-filter`}><Component841 type={`button`} className={r === `todas` ? `seg-btn on-ok` : `seg-btn`} onClick={() => c(`todas`)}>{`Todas`}</Component841>{ie.map(e => <Component842 type={`button`} className={r === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => c(e.id)} key={e.id}>{e.nombre}</Component842>)}</Component843><Component844 className={`label`} style={{
      margin: `12px 0 6px`
    }}>{`Yarda`}</Component844><Component847 className={`seg wrap yard-filter`}><Component845 type={`button`} className={t === `todas` ? `seg-btn on-ok` : `seg-btn`} onClick={() => s(`todas`)}>{`Todas`}</Component845>{_e.map(e => <Component846 type={`button`} className={t === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => s(e.id)} key={e.id}>{e.nombre}</Component846>)}</Component847><Component876 className={`stats kpi-grid`}><Component851 className={`stat`}><Component848 className={`stat-label`}>{`Ciclos cerrados`}</Component848><Component849 className={`stat-value`}>{a.ciclosCerrados}</Component849><Component850 className={`hint`}>{`En patio ahora: `}{a.enPatioAhora}</Component850></Component851><Component855 className={`stat`}><Component852 className={`stat-label`}>{`Gate dwell (prom.)`}</Component852><Component853 className={`stat-value`}>{En(a.dwellPromedioHoras)}</Component853><Component854 className={`hint`}>{`P95: `}{En(a.dwellP95Horas)}</Component854></Component855><Component859 className={`stat`}><Component856 className={`stat-label`}>{`Daños al arribo`}</Component856><Component857 className={`stat-value`}>{Dn(a.tasaDanosTransito)}</Component857><Component858 className={`hint`}>{`Vs despacho: `}{Dn(a.tasaDanosPatio)}</Component858></Component859><Component863 className={`stat`}><Component860 className={`stat-label`}>{`Discrepancia sellos`}</Component860><Component861 className={`stat-value`}>{Dn(a.discrepanciaSellosPct)}</Component861><Component862 className={`hint`}>{a.sellosRevisados}{` ciclos con sello`}</Component862></Component863><Component867 className={`stat`}><Component864 className={`stat-label`}>{`Fuel discrepancy`}</Component864><Component865 className={`stat-value`}>{Dn(a.fuelDiscrepancyAvgPct)}</Component865><Component866 className={`hint`}>{a.fuelAlertas}{` alertas (>8% merma)`}</Component866></Component867><Component871 className={`stat`}><Component868 className={`stat-label`}>{`Turnaround cajas`}</Component868><Component869 className={`stat-value`}>{En(a.turnaroundCajasHoras)}</Component869><Component870 className={`hint`}>{`Tiempo promedio en patio`}</Component870></Component871><Component875 className={`stat`}><Component872 className={`stat-label`}>{`Gate cumplimiento`}</Component872><Component873 className={`stat-value`}>{Dn(a.cumplimientoGatePct)}</Component873><Component874 className={`hint`}>{`Carta Porte + licencia OK`}</Component874></Component875></Component876><Component888 className={`panel`}><Component878 className={`panel-head`}><Component877>{`Últimos ciclos`}{r === `todas` ? `` : ` · ${k(r)}`}{t === `todas` ? `` : ` · ${ye(t)}`}</Component877></Component878>{o.length === 0 ? <Component879 className={`empty`}>{`Aún no hay ciclos entrada→salida para calcular KPIs.`}</Component879> : <Component887 className={`unit-list`}>{o.map(e => <Component886 className={`unit-row`} key={`${e.entrada.id}-${e.salida.id}`}><Component882 className={`unit-main`}><Component880 className={`unit-placa`}>{e.placa}</Component880><Component881 className={`unit-meta`}>{k(e.empresaId)}{` · `}{ye(e.yardaId)}{` · dwell`}{` `}{En(e.dwellHours)}{e.selloOk === false ? ` · SELLO NO COINCIDE` : ``}{e.selloOk === true ? ` · sello OK` : ``}</Component881></Component882><Component885 className={`unit-side`}><Component883 className={`unit-meta`}>{`Diésel Δ`}{` `}{e.dieselDeltaPct == null ? `—` : `${e.dieselDeltaPct > 0 ? `+` : ``}${e.dieselDeltaPct.toFixed(0)}%`}</Component883><Component884 className={`pill ${e.danoEntrada || e.danoSalida ? `mala` : `buena`}`}>{e.danoEntrada ? `daño arribo` : e.danoSalida ? `daño salida` : `sin falla`}</Component884></Component885></Component886>)}</Component887>}</Component888></Component889>;
}
function Vn({
  config: e,
  mode: t,
  user: n,
  syncing: r,
  syncError: i,
  queueCount: a = 0,
  online: o = true,
  onSaveConfig: s,
  onConnect: c,
  onDisconnect: u,
  onRefresh: d,
  onFlushQueue: f,
  onLimpiarDatos: p
}) {
  let [m, h] = (0, l.useState)(e);
  let [g, _] = (0, l.useState)(null);
  let [plateToken, setPlateToken] = (0, l.useState)(() => getPlateRecognizerToken());
  let [plateSaved, setPlateSaved] = (0, l.useState)(null);
  async function v(e) {
    e.preventDefault();
    _(null);
    s(m);
    try {
      await c(m);
      _(`Conectado a Google Workspace. Los datos se comparten en la hoja y Drive.`);
    } catch (e) {
      _(e instanceof Error ? e.message : `Error al conectar`);
    }
  }
  function savePlateToken(ev) {
    ev.preventDefault();
    setPlateRecognizerToken(plateToken);
    setPlateSaved(`Token de Plate Recognizer guardado en este dispositivo.`);
  }
  const Component890 = `h1`;
  const Component891 = `p`;
  const Component892 = `div`;
  const Component893 = `strong`;
  const Component894 = `div`;
  const Component895 = `button`;
  const Component896 = `p`;
  const Component897 = `h2`;
  const Component898 = `a`;
  const Component899 = `li`;
  const Component900 = `a`;
  const Component901 = `li`;
  const Component902 = `ul`;
  const Component903 = `p`;
  const Component904 = `section`;
  const Component905 = `legend`;
  const Component906 = `em`;
  const Component907 = `em`;
  const Component908 = `br`;
  const Component909 = `strong`;
  const Component910 = `br`;
  const Component911 = `br`;
  const Component912 = `strong`;
  const Component913 = `p`;
  const Component914 = `span`;
  const Component915 = `input`;
  const Component916 = `label`;
  const Component917 = `span`;
  const Component918 = `input`;
  const Component919 = `label`;
  const Component920 = `span`;
  const Component921 = `input`;
  const Component922 = `label`;
  const Component923 = `span`;
  const Component924 = `input`;
  const Component925 = `label`;
  const Component926 = `div`;
  const Component927 = `fieldset`;
  const Component928 = `p`;
  const Component929 = `p`;
  const Component930 = `button`;
  const Component931 = `button`;
  const Component932 = `button`;
  const Component933 = `div`;
  const Component934 = `form`;
  const Component935 = `h2`;
  const Component936 = `div`;
  const Component937 = `p`;
  const Component938 = `button`;
  const Component939 = `div`;
  const Component940 = `section`;
  const Component941 = `div`;
  return <Component941 className={`page`}><Component892 className={`form-head`}><Component890>{`Google Workspace`}</Component890><Component891>{`Entradas, salidas y fotos viven en tu Drive/Sheets compartidos. Todo el personal con acceso a la hoja ve el mismo patio.`}</Component891></Component892><Component894 className={`banner ${t === `workspace` ? `success` : `info`}`}>{t === `workspace` && n ? <l.Fragment>{`Conectado como `}<Component893>{n.name}</Component893>{` (`}{n.email}{`) · modo nube`}{o ? `` : ` · OFFLINE`}{a > 0 ? ` · ${a} en cola` : ``}</l.Fragment> : <l.Fragment>{`Modo local (solo este dispositivo). Conecta Workspace para compartir con el equipo.`}</l.Fragment>}</Component894>{a > 0 && f && <Component896 className={`banner info`}>{`Hay `}{a}{` registro(s) pendientes.`}{` `}<Component895 type={`button`} className={`text-btn`} disabled={r || !o} onClick={() => void f()}>{`Subir cola ahora`}</Component895></Component896>}<Component904 className={`panel links-panel`}><Component897>{`Archivos ya creados en tu cuenta`}</Component897><Component902 className={`link-list`}><Component899><Component898 href={wt} target={`_blank`} rel={`noreferrer`}>{`Hoja PatioControl — Patio y evidencias`}</Component898></Component899><Component901><Component900 href={I} target={`_blank`} rel={`noreferrer`}>{`Carpeta PatioControl Evidencias`}</Component900></Component901></Component902><Component903 className={`hint`}>{`Compártelos en Drive con el equipo (rol Editor), p. ej. admin1@camircapital.com o un grupo @camircapital.com.`}</Component903></Component904><Component934 className={`form-panel`} onSubmit={v}><Component927 className={`fieldset`}><Component905>{`Conexión OAuth (una sola vez)`}</Component905><Component913 className={`hint setup-steps`}>{`1) En Google Cloud Console crea un proyecto → APIs: enable `}<Component906>{`Google Sheets API`}</Component906>{` y`}{` `}<Component907>{`Google Drive API`}</Component907>{`.`}<Component908 />{`2) Credenciales → OAuth client ID → tipo `}<Component909>{`Aplicación web`}</Component909>{`.`}<Component910 />{`3) Orígenes autorizados: la URL donde corre esta app (ej. http://localhost:5173).`}<Component911 />{`4) Pega el Client ID abajo. Dominio recomendado: `}<Component912>{`camircapital.com`}</Component912>{` (solo correos de la empresa).`}</Component913><Component926 className={`grid-2`}><Component916 className={`field full`}><Component914>{`Google Client ID *`}</Component914><Component915 className={`input`} value={m.clientId} onChange={e => h({
              ...m,
              clientId: e.target.value
            })} placeholder={`123456789-abc.apps.googleusercontent.com`} required={true} /></Component916><Component919 className={`field`}><Component917>{`Dominio Workspace (opcional)`}</Component917><Component918 className={`input`} value={m.hostedDomain} onChange={e => h({
              ...m,
              hostedDomain: e.target.value
            })} placeholder={`camircapital.com`} /></Component919><Component922 className={`field`}><Component920>{`ID de la hoja`}</Component920><Component921 className={`input`} value={m.spreadsheetId} onChange={e => h({
              ...m,
              spreadsheetId: e.target.value
            })} /></Component922><Component925 className={`field full`}><Component923>{`ID carpeta Drive (fotos)`}</Component923><Component924 className={`input`} value={m.driveFolderId} onChange={e => h({
              ...m,
              driveFolderId: e.target.value
            })} /></Component925></Component926></Component927>{i && <Component928 className={`banner error`}>{i}</Component928>}{g && <Component929 className={`banner ${g.startsWith(`Conectado`) ? `success` : `error`}`}>{g}</Component929>}<Component933 className={`hero-actions`}><Component930 type={`submit`} className={`btn primary`} disabled={r}>{r ? `Conectando…` : t === `workspace` ? `Reconectar` : `Conectar con Google`}</Component930>{t === `workspace` && <l.Fragment><Component931 type={`button`} className={`btn soft`} disabled={r} onClick={() => void d()}>{`Actualizar datos`}</Component931><Component932 type={`button`} className={`btn soft`} onClick={u}>{`Usar solo local`}</Component932></l.Fragment>}</Component933></Component934><Component940 className={`panel`} style={{
      marginTop: 16
    }}><Component936 className={`panel-head`}><Component935>{`Plate Recognizer (OCR de placas)`}</Component935></Component936><Component937 className={`hint`}>{`Token de platerecognizer.com para leer placas por foto en inventariar, entrada, salida, baja y equipos. Sin guiones. Si no hay token, se usa Vision (Netlify) cuando esté configurado.`}</Component937><form className={`form-panel compact`} onSubmit={savePlateToken} style={{
        marginTop: 12,
        padding: 0,
        boxShadow: `none`,
        background: `transparent`
      }}><label className={`field full`}><span>{`API Token`}</span><input className={`input`} type={`password`} autoComplete={`off`} value={plateToken} onChange={e => {
            setPlateToken(e.target.value);
            setPlateSaved(null);
          }} placeholder={`Token · se guarda solo en este dispositivo`} /></label>{plateSaved && <p className={`banner success`} style={{
          marginTop: 10
        }}>{plateSaved}</p>}<div className={`hero-actions`} style={{
          marginTop: 12
        }}><button type={`submit`} className={`btn primary`}>{`Guardar token OCR`}</button>{plateToken ? <button type={`button`} className={`btn soft`} onClick={() => {
            setPlateToken(``);
            setPlateRecognizerToken(``);
            setPlateSaved(`Token eliminado.`);
          }}>{`Quitar token`}</button> : null}</div></form></Component940>{p && <Component940 className={`panel`} style={{
      marginTop: 16
    }}><Component936 className={`panel-head`}><Component935>{`Datos locales`}</Component935></Component936><Component937 className={`hint`}>{`Borra movimientos, equipos y refrigeraciones guardados en este dispositivo.`}</Component937><Component939 className={`hero-actions`}><Component938 type={`button`} className={`btn soft`} onClick={p}>{`Limpiar datos locales`}</Component938></Component939></Component940>}</Component941>;
}
var Hn = {
  dashboard: `Patio`,
  entrada: `Entrada`,
  salida: `Salida`,
  parado: `Equipo parado`,
  baja: `Baja`,
  historial: `Historial`,
  kpis: `KPIs`,
  equipos: `Equipos`,
  workspace: `Workspace`
};
function Un() {
  let [e, t] = (0, l.useState)(`dashboard`);
  let [n, r] = (0, l.useState)([]);
  let [i, a] = (0, l.useState)(0);
  let [o, s] = (0, l.useState)(``);
  let c = Sn();
  (0, l.useEffect)(() => {
    document.title = `PatioControl — ${Hn[e]}`;
  }, [e]);
  function u(e, n) {
    s(n?.trim().toUpperCase() ?? ``);
    a(e => e + 1);
    t(t => {
      if (t !== e) {
        r(e => [...e, t]);
      }
      return e;
    });
  }
  function d() {
    if (n.length === 0) {
      t(`dashboard`);
      return;
    }
    let e = n[n.length - 1];
    r(e => e.slice(0, -1));
    s(``);
    a(e => e + 1);
    t(e);
  }
  return <_Component7 page={e} onNavigate={e => u(e)} onBack={d} modeLabel={c.mode === `workspace` ? `Workspace` : `Local`} syncing={c.syncing} online={c.online} queueCount={c.queueCount} onFlushQueue={() => void c.flushQueue()}>{e === `dashboard` && <An state={c.state} onEntrada={e => u(`entrada`, e)} onSalida={e => u(`salida`, e)} onParado={e => u(`parado`, e)} onBaja={e => u(`baja`, e)} onHistorial={() => u(`historial`)} onKpis={() => u(`kpis`)} />}{e === `entrada` && <_Component4 tipo={`entrada`} initialPlaca={o} equipos={c.state.equipos} refrigeraciones={c.state.refrigeraciones} movimientos={c.state.movimientos} onSaveEquipo={e => void c.guardarEquipo(e)} onSubmit={async e => {
      await c.registrarMovimiento(e);
    }} onDone={() => u(`dashboard`)} key={`entrada-${i}`} />}{e === `salida` && <_Component4 tipo={`salida`} initialPlaca={o} equipos={c.state.equipos} refrigeraciones={c.state.refrigeraciones} movimientos={c.state.movimientos} onSaveEquipo={e => void c.guardarEquipo(e)} onSubmit={async e => {
      await c.registrarMovimiento(e);
    }} onDone={() => u(`dashboard`)} key={`salida-${i}`} />}{e === `parado` && <_Component5 initialPlaca={o} equipos={c.state.equipos} movimientos={c.state.movimientos} onSaveEquipo={e => void c.guardarEquipo(e)} onSubmit={async e => {
      await c.registrarMovimiento(e);
    }} onDone={() => u(`dashboard`)} key={`parado-${i}`} />}{e === `baja` && <Ne initialPlaca={o} equipos={c.state.equipos} movimientos={c.state.movimientos} onSubmit={async e => {
      await c.registrarMovimiento(e);
    }} onDone={() => u(`dashboard`)} key={`baja-${i}`} />}{e === `historial` && <_Component6 state={c.state} />}{e === `kpis` && <Bn state={c.state} />}{e === `equipos` && <Mn state={c.state} onSave={e => void c.guardarEquipo(e)} onDelete={e => void c.eliminarEquipo(e)} onSaveRefrigeracion={e => void c.guardarRefrigeracion(e)} onDeleteRefrigeracion={e => void c.eliminarRefrigeracion(e)} />}{e === `workspace` && <Vn config={c.config} mode={c.mode} user={c.user} syncing={c.syncing} syncError={c.syncError} queueCount={c.queueCount} online={c.online} onSaveConfig={c.updateConfig} onConnect={c.connectWorkspace} onDisconnect={c.disconnectWorkspace} onRefresh={c.refreshFromWorkspace} onFlushQueue={c.flushQueue} onLimpiarDatos={c.limpiarDatos} />}</_Component7>;
}

export default function App() {
  return <Un />;
}
