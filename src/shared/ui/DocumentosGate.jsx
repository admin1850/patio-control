/** Documentos de gate: carta porte, licencia federal y bitácora. */
import * as l from "react";

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

export function DocumentosGate({
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
    let i = !!r.licenciaFederal && We(r.licenciaFederal || ``) && P(r.bitacoraHorasServicio, r.bitacoraHorasDescanso);
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
  return <div className={`compliance`}><p className={`hint`}>{`Validaciones México: Licencia Federal + bitácora NOM-087. Carta Porte (CFDI) es opcional. `}{n ? `Licencia y bitácora autorizan el gate.` : ``}</p><div className={`grid-2`}><label className={`field full`}><span>{`QR / URL CFDI Carta Porte`}</span><textarea className={`input textarea`} rows={2} value={e.cartaPorteQrRaw ?? ``} onChange={e => s(e.target.value)} placeholder={`Pega URL del SAT o UUID del CFDI de traslado`} /></label></div><div className={`hero-actions`}><button type={`button`} className={`btn soft`} onClick={() => r.current?.click()}>{`Escanear QR (foto)`}</button><input ref={r} type={`file`} accept={`image/*`} capture={`environment`} hidden={true} onChange={e => {
        let t = e.target.files?.[0];
        if (t) {
          c(t);
        }
        e.target.value = ``;
      }} /></div>{i && <p className={`hint`}>{i}</p>}<div className={`grid-2`}><label className={`field`}><span>{`UUID / Folio fiscal (opcional)`}</span><input className={`input`} value={e.cartaPorteUuid ?? ``} onChange={e => o({
          cartaPorteUuid: e.target.value.toUpperCase()
        })} placeholder={`XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`} /></label><label className={`field`}><span>{`RFC emisor (opcional)`}</span><input className={`input`} value={e.cartaPorteRfcEmisor ?? ``} onChange={e => o({
          cartaPorteRfcEmisor: e.target.value.toUpperCase()
        })} placeholder={`AAA010101AAA`} /></label><label className={`field`}><span>{`RFC operador / receptor`}</span><input className={`input`} value={e.cartaPorteRfcReceptor ?? ``} onChange={e => o({
          cartaPorteRfcReceptor: e.target.value.toUpperCase()
        })} /></label><label className={`field`}><span>{`Mercancías (resumen)`}</span><input className={`input`} value={e.cartaPorteMercancias ?? ``} onChange={e => o({
          cartaPorteMercancias: e.target.value
        })} placeholder={`Lista breve / clave SAT`} /></label></div><h3 className={`subhead`}>{`Licencia Federal Digital (SCT/SICT)`}</h3><div className={`grid-2`}><label className={`field`}><span>{`No. licencia *`}</span><input className={`input`} value={e.licenciaFederal ?? ``} onChange={e => o({
          licenciaFederal: e.target.value.toUpperCase()
        })} placeholder={`Escanea o captura`} />{u === false && <span className={`field-error`}>{`Formato de licencia no válido`}</span>}</label><label className={`field`}><span>{`Titular`}</span><input className={`input`} value={e.licenciaTitular ?? ``} onChange={e => o({
          licenciaTitular: e.target.value
        })} /></label><label className={`field`}><span>{`Horas de servicio (última bitácora) *`}</span><input className={`input`} type={`number`} min={0} max={24} step={0.5} value={e.bitacoraHorasServicio ?? ``} onChange={e => o({
          bitacoraHorasServicio: e.target.value === `` ? null : Number(e.target.value),
          bitacoraUltimaCaptura: new Date().toISOString()
        })} /></label><label className={`field`}><span>{`Horas de descanso`}</span><input className={`input`} type={`number`} min={0} max={24} step={0.5} value={e.bitacoraHorasDescanso ?? ``} onChange={e => o({
          bitacoraHorasDescanso: e.target.value === `` ? null : Number(e.target.value)
        })} /></label></div>{!d && e.bitacoraHorasServicio != null && <p className={`banner error`}>{`Bitácora fuera de rango seguro (NOM-087): revisa horas de servicio / descanso antes de despachar.`}</p>}<div className={`banner ${e.validadoGate ? `success` : `info`}`}>{e.validadoGate ? `Cumplimiento gate OK — listo para autorizar movimiento.` : `Completa licencia federal + bitácora para validar el gate (Carta Porte opcional).`}</div></div>;
}
