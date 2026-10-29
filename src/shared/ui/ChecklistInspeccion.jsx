/** Checklist de inspección (OK/falla, nota y foto). */
import * as l from "react";

function Be(e) {
  if (e.fotoUrls?.length) {
    return e.fotoUrls;
  } else if (e.fotoUrl) {
    return [e.fotoUrl];
  } else {
    return [];
  }
}

export function ChecklistInspeccion({
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
  return <div className={`checklist`}><div className={`checklist-meta`}><span>{e.length - g}{` revisados`}</span>{g > 0 && <span className={`warn`}>{g}{` pendientes`}</span>}{_ > 0 && <span className={`bad`}>{_}{` con falla`}</span>}</div><ul className={`checklist-list`}>{e.map(e => {
        let t = Be(e);
        return <li className={`checklist-row`} key={e.id}><div className={`checklist-main`}><span className={`checklist-label`}>{e.label}</span><div className={`seg`}><button type={`button`} className={e.ok === true ? `seg-btn on-ok` : `seg-btn`} onClick={() => d(e.id, true)}>{v}</button><button type={`button`} className={e.ok === false ? `seg-btn on-bad` : `seg-btn`} onClick={() => d(e.id, false)}>{y}</button></div></div>{e.ok === false && <div className={`falla-extra`}><input className={`input compact`} placeholder={`Detalle de la falla`} value={e.nota ?? ``} onChange={t => f(e.id, t.target.value)} /><div className={`falla-foto`}><p className={`falla-foto-title`}>{`Fotos de la falla `}<span className={`badge opcional`}>{`opcional`}</span>{t.length > 0 ? ` · ${t.length} adjunta${t.length === 1 ? `` : `s`}` : ` · sin límite`}</p>{t.length > 0 && <div className={`falla-foto-grid`}>{t.map((t, n) => <div className={`falla-foto-card`} key={`${e.id}-foto-${n}`}><img src={t} alt={`Falla ${e.label} ${n + 1}`} /><button type={`button`} className={`falla-foto-remove`} onClick={() => h(e.id, n)} aria-label={`Quitar foto`}>{`Quitar`}</button></div>)}</div>}<div className={`falla-foto-actions`}><button type={`button`} className={`btn primary falla-foto-btn`} onClick={() => i.current[e.id]?.click()} disabled={a === e.id}>{a === e.id ? `Procesando…` : `Tomar foto`}</button><button type={`button`} className={`btn soft falla-foto-btn`} onClick={() => r.current[e.id]?.click()} disabled={a === e.id}>{`Subir foto(s)`}</button></div><input ref={t => {
                i.current[e.id] = t;
              }} type={`file`} accept={`image/*`} capture={`environment`} hidden={true} onChange={t => {
                m(e.id, t.target.files);
                t.target.value = ``;
              }} /><input ref={t => {
                r.current[e.id] = t;
              }} type={`file`} accept={`image/*`} multiple={true} hidden={true} onChange={t => {
                m(e.id, t.target.files);
                t.target.value = ``;
              }} /></div></div>}</li>;
      })}</ul>{s && <p className={`field-error`}>{s}</p>}</div>;
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
