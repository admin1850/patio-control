/** Cálculos y armado de datos del patio. */
import { F, Je, _e, ae, ct, ie, lt, mn, st, ut, ve } from "./constants.js";

export function re(e, t = 1280, n = 0.72) {
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

export function k(e) {
  return ie.find(t => t.id === e)?.nombre ?? `—`;
}

export function oe() {
  let e = localStorage.getItem(ae);
  if (e && ie.some(t => t.id === e)) {
    return e;
  } else {
    return `api`;
  }
}

export function se(e) {
  localStorage.setItem(ae, e);
}

export function ge(e, t) {
  return e.filter(e => e.required).every(e => !!t[e.id]);
}

export function be() {
  let e = localStorage.getItem(ve);
  if (e && _e.some(t => t.id === e)) {
    return e;
  } else {
    return `chihuahua`;
  }
}

export function A(e) {
  localStorage.setItem(ve, e);
}

export function De(e, t) {
  let n = t.trim().toUpperCase();
  return e.equipos.find(e => e.placa.toUpperCase() === n);
}

export function Oe(e, t) {
  return e.find(e => e.equipoId === t);
}

export function Qe(e) {
  if (e) {
    return Je.find(t => t.id === e)?.bajo ?? false;
  } else {
    return false;
  }
}

export function et(e) {
  return Je.find(t => t.id === e)?.label ?? `—`;
}

export function dt(e) {
  return (e === `camion` ? ct : e === `caja` ? lt : e === `dolly` ? ut : st).map((t, n) => ({
    id: `${e}-${n}`,
    label: t,
    ok: null
  }));
}

export function ft(e) {
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

export function mt() {
  let e = new Date();
  let t = e => String(e).padStart(2, `0`);
  return `${e.getFullYear()}-${t(e.getMonth() + 1)}-${t(e.getDate())}T${t(e.getHours())}:${t(e.getMinutes())}`;
}

export function ht() {
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

export function _t(e, t) {
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

export function hn() {
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

export function gn(e) {
  localStorage.setItem(mn, JSON.stringify(e));
}
/** Pasa la cola localStorage al outbox IndexedDB y la vacía. */

function Cn(e) {
  return e.condicionGeneral === `mala` || e.condicionGeneral === `regular` || e.checklist.some(e => e.ok === false);
}

export function wn(e, t, n) {
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

export function kn(e) {
  return new Date(e).toLocaleString(`es-MX`, {
    day: `2-digit`,
    month: `short`,
    hour: `2-digit`,
    minute: `2-digit`
  });
}
