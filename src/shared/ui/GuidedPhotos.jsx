/** Fotos guiadas de caseta: silueta, cámara y lectura de placa. */
import * as l from "react";
import { isPlateSlot, normalizePlacaMX, readPlacaFromDataUrl } from "../../lib/placaOcr.js";
import { re } from "../domain/patioModel.js";

export function GuidedPhotos({
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
  (0, l.useEffect)(() => {
    let w = window;
    w.__PATIO_CAPTURE_COUNT = (w.__PATIO_CAPTURE_COUNT || 0) + 1;
    w.__PATIO_CAPTURE_OPEN = true;
    return () => {
      w.__PATIO_CAPTURE_COUNT = Math.max(0, (w.__PATIO_CAPTURE_COUNT || 1) - 1);
      w.__PATIO_CAPTURE_OPEN = w.__PATIO_CAPTURE_COUNT > 0;
    };
  }, []);
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
    return <div className={`guided-photos`}><div className={`guided-progress`}><span>{d}{`/`}{f}{` obligatorias`}</span><span className={`hint`}>{u}{`/`}{e.length}{` capturadas`}</span></div><div className={`slot-chips`}>{e.map((e, n) => <button type={`button`} className={`slot-chip ${c.id === e.id ? `active` : ``} ${t[e.id] ? `done` : ``} ${e.required ? `` : `optional`}`} onClick={() => a(e.id)} key={e.id}>{n + 1}{`. `}{e.label}{e.required ? `` : ` (opc.)`}</button>)}</div><div className={`guide-stage sil-${c.silhouette}`}><div className={`sil-overlay`} aria-hidden={true}><PhotoSilhouette kind={c.silhouette} /></div>{t[c.id] ? <img className={`guide-preview`} src={t[c.id]} alt={c.label} /> : <div className={`guide-placeholder`}><p className={`guide-title`}>{c.label}</p><p className={`guide-hint`}>{c.hint}</p></div>}</div><div className={`hero-actions`}><button type={`button`} className={`btn primary`} onClick={() => r.current?.click()}>{t[c.id] ? `Retomar con cámara` : `Tomar foto (solo cámara)`}</button>{canLeer && <button type={`button`} className={`btn soft`} disabled={ocrBusy} onClick={() => void leerPlaca()}>{ocrBusy ? `Leyendo…` : `Leer placa`}</button>}{t[c.id] && <button type={`button`} className={`btn soft`} onClick={() => m(c.id)}>{`Quitar`}</button>}</div><p className={`hint`}>{`Usa la cámara del dispositivo. No uses fotos de la galería.`}{isPlateSlot(c) ? ` En placa: toma la foto y pulsa “Leer placa” (Plate Recognizer / Vision).` : ``}</p>{ocrHint && <p className={`ocr-msg hint`}>{ocrHint}</p>}<input ref={r} type={`file`} accept={`image/*`} capture={`environment`} hidden={true} onChange={e => {
        p(e.target.files?.[0]);
        e.target.value = ``;
      }} />{o && <p className={`field-error`}>{o}</p>}</div>;
  } else {
    return null;
  }
}

function PhotoSilhouette({
  kind: e
}) {
  switch (e) {
    case `front`:
      return <svg viewBox={`0 0 200 120`} className={`sil-svg`}><rect x={`40`} y={`35`} width={`120`} height={`55`} rx={`8`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><rect x={`70`} y={`45`} width={`60`} height={`28`} rx={`3`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`} /><text x={`100`} y={`110`} textAnchor={`middle`} fontSize={`11`} fill={`currentColor`}>{`FRONTAL`}</text></svg>;
    case `side`:
      return <svg viewBox={`0 0 200 120`} className={`sil-svg`}><path d={`M25 75 H155 L170 55 H95 L80 40 H40 L25 55 Z`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><circle cx={`50`} cy={`78`} r={`12`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`} /><circle cx={`140`} cy={`78`} r={`12`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`} /></svg>;
    case `dash`:
      return <svg viewBox={`0 0 200 120`} className={`sil-svg`}><rect x={`30`} y={`40`} width={`140`} height={`50`} rx={`6`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><rect x={`45`} y={`55`} width={`50`} height={`20`} rx={`2`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`} /><circle cx={`140`} cy={`65`} r={`14`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`} /><text x={`100`} y={`110`} textAnchor={`middle`} fontSize={`11`} fill={`currentColor`}>{`TABLERO`}</text></svg>;
    case `odometer`:
      return <svg viewBox={`0 0 200 120`} className={`sil-svg`}><rect x={`40`} y={`38`} width={`120`} height={`36`} rx={`4`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><text x={`100`} y={`62`} textAnchor={`middle`} fontSize={`18`} fill={`currentColor`} fontFamily={`monospace`}>{`452 180`}</text><text x={`100`} y={`100`} textAnchor={`middle`} fontSize={`11`} fill={`currentColor`}>{`ODÓMETRO · LEGIBLE`}</text></svg>;
    case `fuel`:
      return <svg viewBox={`0 0 200 120`} className={`sil-svg`}><circle cx={`100`} cy={`58`} r={`28`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><path d={`M85 70 A22 22 0 0 1 118 48`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} /><line x1={`100`} y1={`58`} x2={`118`} y2={`42`} stroke={`currentColor`} strokeWidth={`2.5`} /><text x={`100`} y={`105`} textAnchor={`middle`} fontSize={`11`} fill={`currentColor`}>{`COMBUSTIBLE`}</text></svg>;
    case `rear`:
      return <svg viewBox={`0 0 200 120`} className={`sil-svg`}><rect x={`55`} y={`25`} width={`90`} height={`70`} rx={`4`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><line x1={`100`} y1={`25`} x2={`100`} y2={`95`} stroke={`currentColor`} strokeWidth={`2`} strokeDasharray={`4 3`} /></svg>;
    case `seal`:
      return <svg viewBox={`0 0 200 120`} className={`sil-svg`}><rect x={`60`} y={`35`} width={`80`} height={`50`} rx={`4`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><text x={`100`} y={`65`} textAnchor={`middle`} fontSize={`14`} fill={`currentColor`}>{`SELLO #`}</text></svg>;
    case `interior`:
      return <svg viewBox={`0 0 200 120`} className={`sil-svg`}><polygon points={`40,90 100,30 160,90`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><line x1={`55`} y1={`90`} x2={`145`} y2={`90`} stroke={`currentColor`} strokeWidth={`2`} /></svg>;
    case `tire`:
      return <svg viewBox={`0 0 200 120`} className={`sil-svg`}><circle cx={`100`} cy={`60`} r={`35`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><circle cx={`100`} cy={`60`} r={`12`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`} /></svg>;
    case `fifth`:
      return <svg viewBox={`0 0 200 120`} className={`sil-svg`}><rect x={`70`} y={`40`} width={`60`} height={`40`} rx={`6`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><line x1={`40`} y1={`55`} x2={`70`} y2={`55`} stroke={`#c0392b`} strokeWidth={`4`} /><line x1={`40`} y1={`70`} x2={`70`} y2={`70`} stroke={`#2980b9`} strokeWidth={`4`} /></svg>;
    case `plate`:
      return <svg viewBox={`0 0 200 120`} className={`sil-svg`}><rect x={`35`} y={`40`} width={`130`} height={`42`} rx={`6`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><text x={`100`} y={`67`} textAnchor={`middle`} fontSize={`16`} fill={`currentColor`} fontFamily={`monospace`}>{`PLACA`}</text><text x={`100`} y={`105`} textAnchor={`middle`} fontSize={`11`} fill={`currentColor`}>{`ACERCAR · LEGIBLE`}</text></svg>;
    case `thermo`:
      return <svg viewBox={`0 0 200 120`} className={`sil-svg`}><rect x={`45`} y={`28`} width={`110`} height={`64`} rx={`6`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><text x={`100`} y={`52`} textAnchor={`middle`} fontSize={`12`} fill={`currentColor`}>{`SET · REAL`}</text><text x={`100`} y={`72`} textAnchor={`middle`} fontSize={`14`} fill={`currentColor`} fontFamily={`monospace`}>{`-18.0°C`}</text><text x={`100`} y={`110`} textAnchor={`middle`} fontSize={`11`} fill={`currentColor`}>{`PANEL THERMO`}</text></svg>;
    case `thermo-fuel`:
      return <svg viewBox={`0 0 200 120`} className={`sil-svg`}><rect x={`70`} y={`30`} width={`60`} height={`55`} rx={`4`} fill={`none`} stroke={`currentColor`} strokeWidth={`3`} strokeDasharray={`6 4`} /><line x1={`78`} y1={`70`} x2={`122`} y2={`70`} stroke={`currentColor`} strokeWidth={`3`} /><text x={`100`} y={`110`} textAnchor={`middle`} fontSize={`11`} fill={`currentColor`}>{`DIÉSEL THERMO`}</text></svg>;
    default:
      return null;
  }
}
