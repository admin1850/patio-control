/** Sheets, Drive y token de Google desde el navegador (camino legado). */
import { createMovimientoServer, isBackendUnavailable, jwtExpiresAtMs, sessionLikelyAvailable, tryCreateMovimientoViaServer, crearOrdenServidor, abrirOtPreventivo, actualizarOrdenServidor, ubicarTrasMovimiento, uploadMediaServer } from "../../lib/serverApi.js";
import { flushOutbox } from "../../lib/outbox.js";
import { gn, hn } from "../domain/patioModel.js";

var Tt = [`https://www.googleapis.com/auth/spreadsheets`, `https://www.googleapis.com/auth/drive.file`, `openid`, `email`, `profile`].join(` `);

var kt = null;

var At = 0;

export function jt() {
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

export function Nt() {
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

export function Ft(e) {
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

var cachedIdToken = null;

export function clearCachedIdToken() {
  cachedIdToken = null;
}

export function requestGoogleIdToken(clientId, hostedDomain) {
  let id = String(clientId ?? ``).trim();
  let hd = String(hostedDomain ?? ``).trim();
  // Reusar un ID token vigente permite reintentar en un solo toque si el popup de Sheets se bloqueó.
  if (cachedIdToken && cachedIdToken.clientId === id && jwtExpiresAtMs(cachedIdToken.credential) - Date.now() > 5 * 60000) {
    return Promise.resolve(cachedIdToken.credential);
  }
  return new Promise((resolve, reject) => {
    if (!id) {
      reject(Error(`Falta el Google Client ID. Configúralo en la pantalla de Workspace.`));
      return;
    }
    let settled = false;
    let timer = null;
    let finish = (err, credential) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (err) {
        try {
          window.google?.accounts?.id?.cancel();
        } catch {}
        reject(err);
      } else {
        cachedIdToken = {
          clientId: id,
          credential
        };
        resolve(credential);
      }
    };
    let bloqueado = motivo => Error(`Google no mostró el inicio de sesión${motivo ? ` (${motivo})` : ``}. Permite ventanas emergentes y cookies de accounts.google.com para este sitio, inicia sesión en Google en este navegador y vuelve a tocar Conectar.`);
    timer = setTimeout(() => finish(Error(`Se agotó el tiempo para iniciar sesión con Google (60 s). Vuelve a tocar Conectar.`)), 60000);
    Pt().then(() => {
      let gid = window.google?.accounts?.id;
      if (!gid) {
        finish(Error(`Google Identity no disponible`));
        return;
      }
      gid.initialize({
        client_id: id,
        callback: res => {
          if (res?.credential) {
            finish(null, res.credential);
          } else {
            finish(Error(`Google no devolvió el token de identidad. Vuelve a tocar Conectar.`));
          }
        },
        auto_select: false,
        ux_mode: `popup`,
        cancel_on_tap_outside: false,
        context: `signin`,
        itp_support: true,
        use_fedcm_for_prompt: true,
        ...(hd ? {
          hd
        } : {})
      });
      gid.prompt(n => {
        try {
          if (n?.isNotDisplayed?.()) {
            finish(bloqueado(n.getNotDisplayedReason?.()));
          } else if (n?.isSkippedMoment?.()) {
            finish(bloqueado(n.getSkippedReason?.()));
          } else if (n?.isDismissedMoment?.() && n.getDismissedReason?.() !== `credential_returned`) {
            finish(Error(`Cerraste el inicio de sesión de Google. Vuelve a tocar Conectar y elige tu cuenta.`));
          }
        } catch {}
      });
    }).catch(err => finish(err instanceof Error ? err : Error(`No se pudo cargar Google Identity`)));
  });
}

export async function It(e) {
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

function fotoYaPublicada(url) {
  return typeof url === `string` && (url.startsWith(`http`) || url.startsWith(`/api/media`));
}

async function zt(e, t, n, meta = {}) {
  if (sessionLikelyAvailable() && navigator.onLine) {
    try {
      let up = await uploadMediaServer({
        fileName: n,
        dataUrl: t,
        yardaId: meta.yardaId,
        movimientoId: meta.movimientoId,
        slotId: meta.slotId
      });
      if (up?.viewPath) {
        return up.viewPath;
      }
      if (up?.fileId) {
        return `/api/media?id=${up.fileId}`;
      }
    } catch (err) {
      if (!isBackendUnavailable(err)) {
        throw err;
      }
    }
  }
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

async function Bt(e, t, n, meta = {}) {
  let r = [];
  for (let i of t) {
    if (fotoYaPublicada(i.url)) {
      r.push(i);
      continue;
    }
    let name = `${n}-${i.slotId}-${Date.now()}.jpg`;
    r.push({
      ...i,
      url: await zt(e, i.url, name, {
        ...meta,
        slotId: i.slotId
      })
    });
  }
  return r;
}

export async function Vt(e, t, n) {
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
        placaCaja2: t.placaCaja2 || undefined,
        traePlacaTrasera: typeof t.traePlacaTrasera == `boolean` ? t.traePlacaTrasera : undefined,
        motivoSinPlacaTrasera: t.motivoSinPlacaTrasera || undefined
      };
    }
  } catch {}
  return {};
}

function L(e) {
  if (!e.placaCamionTrasera && !e.placaCaja1 && !e.placaCaja2 && e.traePlacaTrasera == null && !e.motivoSinPlacaTrasera) {
    return ``;
  } else {
    return JSON.stringify({
      placaCamionTrasera: e.placaCamionTrasera ?? ``,
      placaCaja1: e.placaCaja1 ?? ``,
      placaCaja2: e.placaCaja2 ?? ``,
      ...(e.traePlacaTrasera == null ? {} : {
        traePlacaTrasera: e.traePlacaTrasera
      }),
      ...(e.motivoSinPlacaTrasera ? {
        motivoSinPlacaTrasera: e.motivoSinPlacaTrasera
      } : {})
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
        selloCoincideEntrada: t.selloCoincideEntrada,
        ...(t.cumplimiento?.rapido === true ? {
          rapido: true
        } : {}),
        ...(t.cumplimiento?.motivoRapido ? {
          motivoRapido: String(t.cumplimiento.motivoRapido)
        } : {}),
        ...(t.cumplimiento?.motivoRapidoDetalle ? {
          motivoRapidoDetalle: String(t.cumplimiento.motivoRapidoDetalle)
        } : {})
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
    })(),
    ...parseMovimientoFase0Cells(e),
    ...(e[35] ? {
      viajeId: String(e[35])
    } : {})
  };
}

var MOVIMIENTOS_BASE_COLS = 30;

function parseMovimientoFase0Cells(e) {
  let motivoRaw = String(e[30] ?? ``).trim();
  let sep = motivoRaw.indexOf(`|`);
  let motivoParo = sep >= 0 ? motivoRaw.slice(0, sep).trim() : motivoRaw;
  let motivoParoOtro = sep >= 0 ? motivoRaw.slice(sep + 1).trim() : ``;
  return {
    ...(motivoParo ? {
      motivoParo
    } : {}),
    ...(motivoParoOtro ? {
      motivoParoOtro
    } : {}),
    ...(e[31] ? {
      paradoDesde: e[31]
    } : {}),
    ...(e[32] ? {
      zonaSlot: e[32]
    } : {}),
    ...(e[33] ? {
      usuarioEmail: e[33]
    } : {}),
    ...(e[34] ? {
      horaServidor: e[34]
    } : {}),
    ...(e[35] ? {
      viajeId: String(e[35])
    } : {})
  };
}

function movimientoFase0Cells(e) {
  let motivo = e.motivoParo ? e.motivoParo === `otro` && e.motivoParoOtro ? `otro|${e.motivoParoOtro}` : e.motivoParo : ``;
  return [motivo, e.paradoDesde ?? ``, e.zonaSlot ?? ``, e.usuarioEmail ?? ``, e.horaServidor ?? ``];
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
  let motivoRapido = e.motivoRapido || e.cumplimiento?.motivoRapido;
  let motivoRapidoDetalle = e.motivoRapidoDetalle || e.cumplimiento?.motivoRapidoDetalle;
  return [e.id, e.tipo, e.equipoId, e.placa, e.numeroEconomico, e.equipoTipo, e.fechaHora, e.operador, e.chofer ?? ``, Kt(e), e.kilometros, e.dieselPorcentaje, e.dieselLitros, JSON.stringify(e.checklist ?? []), (e.fotos ?? []).join(`|`), e.condicionGeneral, e.observaciones ?? ``, e.creadoEn, e.yardaId, e.selloNumero ?? ``, e.firmaNombre ?? ``, e.firmaUrl ?? ``, e.geoLat ?? ``, JSON.stringify(e.fotosEvidencia ?? []), e.geoLng ?? ``, JSON.stringify({
    ...(e.cumplimiento ?? {}),
    ...(e.rapido === true || e.cumplimiento?.rapido === true ? {
      rapido: true
    } : {}),
    ...(motivoRapido ? {
      motivoRapido: String(motivoRapido)
    } : {}),
    ...(motivoRapidoDetalle ? {
      motivoRapidoDetalle: String(motivoRapidoDetalle)
    } : {}),
    selloCoincideEntrada: e.selloCoincideEntrada ?? null
  }), L(e), e.empresaId ?? `api`, e.llevaRefrigerada && e.refrigerada ? JSON.stringify(e.refrigerada) : ``, e.whatsapp ?? ``, ...movimientoFase0Cells(e), e.viajeId ?? ``];
}

export async function $t(e) {
  return ((await (await Vt(e, `/values/Equipos!A2:I`)).json()).values ?? []).map(Ht).filter(Boolean);
}

export async function en(e) {
  let values;
  try {
    values = (await (await Vt(e, `/values/Movimientos!A2:AJ`)).json()).values ?? [];
  } catch (err) {
    if (!/exceeds grid limits|grid limits|Unable to parse range/i.test(err instanceof Error ? err.message : ``)) {
      throw err;
    }
    values = (await (await Vt(e, `/values/Movimientos!A2:AI`)).json()).values ?? [];
  }
  return values.map(Yt).filter(Boolean).sort((e, t) => new Date(t.fechaHora).getTime() - new Date(e.fechaHora).getTime());
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

export async function rn(e, t, n) {
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
  let row = Qt(t);
  let grid = err => /exceeds grid limits|grid limits/i.test(err instanceof Error ? err.message : ``);
  let appendEnd = (r, end) => Vt(e, `/values/Movimientos!A:${end}:append?valueInputOption=USER_ENTERED`, {
    method: `POST`,
    body: JSON.stringify({
      values: [r]
    })
  });
  if (String(row[35] ?? ``) !== ``) {
    try {
      await appendEnd(row, `AJ`);
      return;
    } catch (err) {
      if (!grid(err)) throw err;
      console.warn(`Movimientos sin columna AJ (viajeId). Corre npm run migrate:fase5. Se guarda sin viajeId.`);
      row = row.slice(0, 35);
    }
  }
  let hasFase0 = row.slice(MOVIMIENTOS_BASE_COLS, 35).some(c => c !== `` && c != null);
  if (!hasFase0) {
    await appendEnd(row.slice(0, MOVIMIENTOS_BASE_COLS), `AD`);
    return;
  }
  try {
    await appendEnd(row.slice(0, 35), `AI`);
  } catch (err) {
    if (!grid(err)) throw err;
    console.warn(`Movimientos sin columnas AE:AI; se guarda sin motivoParo/paradoDesde/zonaSlot/usuarioEmail/horaServidor.`);
    await appendEnd(row.slice(0, MOVIMIENTOS_BASE_COLS), `AD`);
  }
}

export async function on(e, t, n) {
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

export async function ln(e) {
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

export async function fn(e, t, n) {
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

export async function pn(e, t, n) {
  await dn(e, n.filter(e => e.id !== t));
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

async function subirFotosMovimiento(e, t) {
  let meta = {
    yardaId: t.yardaId,
    movimientoId: t.id
  };
  let n = await Bt(e, t.fotosEvidencia?.length ? t.fotosEvidencia : t.fotos.map((url, idx) => ({
    slotId: `foto-${idx}`,
    label: `Foto ${idx + 1}`,
    url
  })), `${t.yardaId}-${t.tipo}-${t.placa}`, meta);
  let r = t.firmaUrl;
  if (r && !fotoYaPublicada(r)) {
    r = await zt(e, r, `${t.yardaId}-firma-${t.placa}-${Date.now()}.png`, {
      ...meta,
      slotId: `firma`
    });
  }
  let defectos = Array.isArray(t.defectos) ? t.defectos.map(d => {
    let slot = d.slotId || `dano-${d.angulo}`;
    let fotos = n.filter(f => f.slotId === slot && fotoYaPublicada(f.url)).map(f => f.url);
    return {
      ...d,
      fotos: fotos.length ? fotos : (d.fotos || []).filter(fotoYaPublicada)
    };
  }) : t.defectos;
  return {
    ...t,
    fotosEvidencia: n,
    fotos: n.map(item => item.url),
    firmaUrl: r,
    ...(Array.isArray(defectos) ? { defectos } : {})
  };
}

export async function bn(e, t, opts = {}) {
  let prepared = await subirFotosMovimiento(e, t);
  // Con sesión de servidor no se hace append a Sheets desde el navegador.
  let sesionServidor = opts.sesionServidor != null ? Boolean(opts.sesionServidor) : sessionLikelyAvailable();
  if (sesionServidor) {
    try {
      let data = await createMovimientoServer(prepared);
      if (data?.movimiento?.id) {
        if (Array.isArray(data.avisos) && data.avisos.length) {
          data.movimiento.avisosServidor = data.avisos.join(` `);
        }
        return data.movimiento;
      }
      let err = Error(`El servidor no confirmó el movimiento.`);
      err.preparedMovimiento = prepared;
      throw err;
    } catch (err) {
      if (err && typeof err === `object` && !err.preparedMovimiento) {
        err.preparedMovimiento = prepared;
      }
      throw err;
    }
  }
  let viaServer = await tryCreateMovimientoViaServer(prepared);
  if (viaServer) {
    return viaServer;
  }
  try {
    await an(e, prepared);
  } catch (err) {
    err.preparedMovimiento = prepared;
    throw err;
  }
  return prepared;
}

export async function flushServerOutbox(cfg, onSaved) {
  if (!sessionLikelyAvailable()) {
    return {
      synced: 0,
      failed: 0,
      remaining: 0
    };
  }
  return flushOutbox({
    movimiento: async mov => {
      let ready = await subirFotosMovimiento(cfg, mov);
      let data = await createMovimientoServer(ready);
      if (!data?.movimiento?.id) {
        throw Error(`El servidor no confirmó el movimiento.`);
      }
      onSaved?.(data.movimiento);
      await ubicarTrasMovimiento({
        ...mov,
        id: data.movimiento.id || mov.id,
        equipoId: data.movimiento.equipoId || mov.equipoId,
        placa: data.movimiento.placa || mov.placa
      });
      return data.movimiento;
    },
    media: async payload => {
      const dataUrl = payload?.dataUrl;
      if (!dataUrl) throw Error(`Foto en bandeja sin datos`);
      const up = await uploadMediaServer({
        fileName: payload.fileName || `ot-${Date.now()}.jpg`,
        dataUrl,
        yardaId: payload.yardaId,
        slotId: payload.slotId || `ot`,
        movimientoId: payload.otId || ``
      });
      const url = up?.viewPath || up?.url;
      if (!url) throw Error(`Sin URL de foto`);
      if (payload.otId) {
        const patch = payload.field === `fotosDespuesJson`
          ? { fotosDespuesJson: [url], accion: `actualizar` }
          : { fotosAntesJson: [url], accion: `actualizar` };
        await actualizarOrdenServidor(payload.otId, patch);
      }
      return url;
    },
    otCreate: async payload => {
      const fotos = [];
      for (const dataUrl of payload?.fotosAntes || []) {
        if (typeof dataUrl === `string` && dataUrl.startsWith(`data:`)) {
          const up = await uploadMediaServer({
            fileName: `ot-antes-${Date.now()}.jpg`,
            dataUrl,
            yardaId: payload?.orden?.yarda,
            slotId: `ot-antes`
          });
          const url = up?.viewPath || up?.url;
          if (!url) throw Error(`Sin URL de foto OT`);
          fotos.push(url);
        } else if (dataUrl) {
          fotos.push(dataUrl);
        }
      }
      if (fotos.length < 2) throw Error(`La OT en bandeja necesita al menos 2 fotos`);
      if (payload?.preventivo && payload?.servicioId) {
        const data = await abrirOtPreventivo({
          servicioId: payload.servicioId,
          yarda: payload.orden?.yarda,
          etr: payload.orden?.etr,
          motivo: payload.orden?.motivo,
          kmEntrada: payload.orden?.kmEntrada,
          horometroEntrada: payload.orden?.horometroEntrada,
          fotosAntesJson: fotos
        });
        if (!data?.orden?.id) throw Error(`El servidor no confirmó la OT preventiva`);
        return data.orden;
      }
      const data = await crearOrdenServidor({
        ...payload.orden,
        fotosAntesJson: fotos
      });
      if (!data?.orden?.id) throw Error(`El servidor no confirmó la OT`);
      return data.orden;
    }
  });
}

export async function xn(e, t) {
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
