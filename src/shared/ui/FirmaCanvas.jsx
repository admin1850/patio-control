/** Firma en pantalla para entrada y salida. */
import * as l from "react";

export function FirmaCanvas({
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
  return <div className={`signature-pad`}><label className={`field`}><span>{`Nombre de quien firma *`}</span><input className={`input`} value={n} onChange={e => r(e.target.value)} placeholder={`Operador / chofer`} /></label><p className={`hint`}>{`Firma aceptando el estado mecánico registrado`}{s ? ` · capturada` : ``}</p><canvas ref={i} className={`sign-canvas`} onPointerDown={d} onPointerMove={f} onPointerUp={p} onPointerLeave={p} /><button type={`button`} className={`text-btn`} onClick={m}>{`Borrar firma`}</button></div>;
}
