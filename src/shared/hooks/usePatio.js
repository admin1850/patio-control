/** Estado del patio, sesión y sincronización. */
import * as l from "react";
import { ApiError, getDispositivoId, apiFetch, isBackendUnavailable, eliminarEquipoServer, eliminarRefrigeracionServer, guardarEquipoServer, guardarRefrigeracionServer, listEquiposServer, listEstadoUnidadesServer, listMovimientosServer, listRefrigeracionServer, loginWithEmailClave, loginWithGoogleIdToken, logout as logoutServer, mapServerUserToAuthProfile, sessionLikelyAvailable, ubicarTrasMovimiento } from "../../lib/serverApi.js";
import { LOCAL_READONLY_BANNER, activeServerUser, assertWritable, hasServerSession, isLocalReadOnly, loadCatalogoRefresh, loadMovimientosRefresh, localReadOnlyError, movimientoWriteMode } from "../../lib/patioSync.js";
import { countPending, enqueueMovimiento, enqueueOutbox, migrateLegacyQueueToOutbox } from "../../lib/outbox.js";
import { $t, Ft, It, Nt, bn, clearCachedIdToken, en, flushServerOutbox, fn, jt, ln, on, pn, requestGoogleIdToken, rn, xn } from "../api/workspaceClient.js";
import { assertUsuarioAutorizado, loadCachedAuthProfile, saveCachedAuthProfile } from "../domain/authProfile.js";
import { _e } from "../domain/constants.js";
import { A, gn, hn } from "../domain/patioModel.js";

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
  let rapido = e.rapido === true || e.cumplimiento?.rapido === true;
  let motivoRapido = e.motivoRapido || e.cumplimiento?.motivoRapido;
  let motivoRapidoDetalle = e.motivoRapidoDetalle || e.cumplimiento?.motivoRapidoDetalle;
  return {
    ...e,
    yardaId: e.yardaId ?? `chihuahua`,
    empresaId: e.empresaId ?? `api`,
    fotosEvidencia: t,
    fotos: t.map(e => e.url),
    ...(rapido ? {
      rapido: true
    } : {}),
    ...(motivoRapido ? {
      motivoRapido: String(motivoRapido)
    } : {}),
    ...(motivoRapidoDetalle ? {
      motivoRapidoDetalle: String(motivoRapidoDetalle)
    } : {})
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

var St = `1yH8vAbXoMFvHdKEt8XMvXWDOc0R1VjVdp1Y3MtCGLp0`;

var Ct = `1Usz_zTK3kqO-Pah3seSdPpMQPMfLHDJh`;

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

async function migrarColaLegadaSiServidor() {
  let items = hn();
  if (!items.length) return { migrated: 0, ids: [] };
  let result = await migrateLegacyQueueToOutbox(() => items, enqueueOutbox);
  gn([]);
  return result;
}

function revertirEnLista(lista, id, anterior) {
  if (anterior) {
    if (!lista.some(item => item.id === id)) return [anterior, ...lista];
    return lista.map(item => item.id === id ? anterior : item);
  }
  return lista.filter(item => item.id !== id);
}

async function persistirCatalogoServidor(run, { setSyncing, setError, revert }) {
  setSyncing(true);
  setError(null);
  try {
    await run();
  } catch (err) {
    if (err instanceof ApiError && !isBackendUnavailable(err)) {
      revert();
      setError(err instanceof Error ? err.message : `No se pudo guardar en el servidor`);
    } else {
      setError(`Servidor no disponible. El cambio quedó en este dispositivo.`);
    }
  } finally {
    setSyncing(false);
  }
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

export function usePatio() {
  let [e, t] = (0, l.useState)(() => Dt());
  let [n, r] = (0, l.useState)(() => {
    let cached = loadCachedAuthProfile();
    if (cached?.email && cached?.rol) {
      return `workspace`;
    }
    return jt() && Dt().clientId ? `workspace` : `local`;
  });
  let [i, a] = (0, l.useState)(() => {
    let cached = loadCachedAuthProfile();
    return cached?.email && cached?.rol ? cached : null;
  });
  let [authReady, setAuthReady] = (0, l.useState)(false);
  let authEpoch = (0, l.useRef)(0);
  let [o, s] = (0, l.useState)(() => Ce());
  let [estadosUnidad, setEstadosUnidad] = (0, l.useState)(null);
  let [c, u] = (0, l.useState)(false);
  let [d, f] = (0, l.useState)(null);
  let [p, m] = (0, l.useState)(() => navigator.onLine);
  let [h, g] = (0, l.useState)(() => hn());
  let [ob, setOb] = (0, l.useState)(0);
  let refreshOb = (0, l.useCallback)(async () => {
    try {
      setOb(await countPending());
    } catch {
      setOb(0);
    }
  }, []);
  (0, l.useEffect)(() => {
    void refreshOb();
  }, [refreshOb, p]);
  (0, l.useEffect)(() => {
    if (!hasServerSession(activeServerUser(i, loadCachedAuthProfile()))) return;
    let cancel = false;
    (async () => {
      if (!hn().length) return;
      try {
        await migrarColaLegadaSiServidor();
        if (!cancel) g([]);
        await refreshOb();
      } catch {
        // El flush vuelve a intentar la migración.
      }
    })();
    return () => { cancel = true; };
  }, [i, refreshOb]);
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
  let _ = (0, l.useCallback)(async (cfg = e, opts = {}) => {
    let activeUser = activeServerUser(opts?.user || i, loadCachedAuthProfile());
    u(true);
    f(null);
    try {
      if (hasServerSession(activeUser)) {
        let loaded = await loadMovimientosRefresh({
          user: activeUser,
          listServer: async () => {
            let data = await listMovimientosServer(2000);
            return data?.movimientos;
          },
          // Si el API no está, Sheets sigue siendo el respaldo de la lista.
          listSheets: () => en(cfg)
        });
        // Con sesión el catálogo sale del API. Si no está, se conserva la caché (no Sheets).
        let equiposLoaded = await loadCatalogoRefresh({
          user: activeUser,
          listServer: async () => (await listEquiposServer())?.equipos,
          listSheets: () => $t(cfg)
        });
        let refriLoaded = await loadCatalogoRefresh({
          user: activeUser,
          listServer: async () => (await listRefrigeracionServer())?.refrigeraciones,
          listSheets: () => ln(cfg)
        });
        s(prev => ({
          equipos: Array.isArray(equiposLoaded.items) ? equiposLoaded.items : prev.equipos,
          refrigeraciones: Array.isArray(refriLoaded.items) ? refriLoaded.items : prev.refrigeraciones,
          movimientos: Array.isArray(loaded.movimientos) ? loaded.movimientos.map(Se) : prev.movimientos
        }));
        try {
          let data = await listEstadoUnidadesServer();
          if (Array.isArray(data?.estados)) {
            setEstadosUnidad(data.estados);
          }
        } catch {
          // Los chips también pueden leer el tablero de OT.
        }
      } else {
        let [equipos, refrigeraciones, movimientos] = await Promise.all([$t(cfg), ln(cfg), en(cfg)]);
        s({
          equipos,
          refrigeraciones,
          movimientos
        });
        r(`workspace`);
      }
    } catch (err) {
      f(err instanceof Error ? err.message : `Error al sincronizar`);
      throw err;
    } finally {
      u(false);
    }
  }, [e, i]);
  let v = (0, l.useCallback)(async () => {
    let serverSession = hasServerSession(activeServerUser(i, loadCachedAuthProfile()));
    if (!(navigator.onLine && (serverSession || n === `workspace` && e.clientId))) {
      return;
    }
    if (serverSession && hn().length) {
      try {
        await migrarColaLegadaSiServidor();
        g([]);
      } catch {
        // Se reintenta. No se vuelve a escribir en localStorage.
      }
    }
    let idb = 0;
    try {
      idb = await countPending();
    } catch {
      idb = 0;
    }
    if (idb === 0 && hn().length === 0) {
      return;
    }
    u(true);
    try {
      await flushServerOutbox(e, saved => {
        s(t => ({
          ...t,
          movimientos: t.movimientos.map(t => t.id === saved.id ? saved : t)
        }));
      });
      // localStorage solo en híbrido, sin sesión de servidor.
      if (!serverSession && hn().length !== 0) {
        let {
          remaining: t
        } = await xn(e, saved => {
          s(t => ({
            ...t,
            movimientos: t.movimientos.map(t => t.id === saved.id ? saved : t)
          }));
        });
        g(t);
      }
      await refreshOb();
    } finally {
      u(false);
    }
  }, [n, e, i, refreshOb]);
  (0, l.useEffect)(() => {
    if (p && (n === `workspace` || hasServerSession(i) || sessionLikelyAvailable())) {
      v();
    }
  }, [p, n, i, v]);
  let y = (0, l.useCallback)(async (n, opts = {}) => {
    let i = n ?? e;
    let clave = String(opts.clave ?? ``);
    if (n) {
      Ot(n);
      t(n);
    }
    u(true);
    f(null);
    try {
      if (!clave.trim()) {
        throw Error(`Escribe la clave que te asignó el admin (columna Clave del kardex).`);
      }
      let idToken = await requestGoogleIdToken(i.clientId, i.hostedDomain);
      let accessToken = await Ft(i);
      let authorized;
      try {
        let res = await loginWithGoogleIdToken({
          idToken,
          clave,
          dispositivoId: getDispositivoId()
        });
        authorized = mapServerUserToAuthProfile(res?.user);
        if (!authorized) {
          throw Error(`El servidor no devolvió el usuario. Vuelve a intentar.`);
        }
      } catch (err) {
        if (!isBackendUnavailable(err)) {
          if (err.status === 401) {
            clearCachedIdToken();
            throw Error(`El servidor no aceptó tu cuenta de Google (${err.message}). Revisa que el Client ID de Workspace sea el mismo que PATIO_GOOGLE_CLIENT_ID y vuelve a tocar Conectar.`);
          }
          if (err.status === 429) {
            throw Error(`Demasiados intentos de conexión. Espera un minuto y vuelve a intentar.`);
          }
          throw Error(err.message || `Acceso denegado por el servidor.`);
        }
        // Backend sin configurar (503) o sin Netlify Functions (vite dev): validación legada en el navegador.
        let profile = await It(accessToken);
        authorized = await assertUsuarioAutorizado(i, profile, clave);
      }
      a(authorized);
      saveCachedAuthProfile(authorized);
      if (authorized.ubicacion && authorized.ubicacion !== `todas` && _e.some(y => y.id === authorized.ubicacion)) {
        A(authorized.ubicacion);
      }
      await _(i, {
        user: authorized
      });
      r(`workspace`);
      if (hasServerSession(authorized)) {
        try {
          await migrarColaLegadaSiServidor();
          g([]);
        } catch {
          // El flush de IndexedDB sigue; la cola legada se reintenta.
        }
      } else {
        let {
          remaining: rem
        } = await xn(i);
        g(rem);
      }
      await flushServerOutbox(i, saved => {
        s(state => ({
          ...state,
          movimientos: state.movimientos.map(m => m.id === saved.id ? saved : m)
        }));
      });
      await refreshOb();
    } catch (err) {
      Nt();
      void logoutServer();
      a(null);
      saveCachedAuthProfile(null);
      r(`local`);
      f(err instanceof Error ? err.message : `No se pudo conectar`);
      throw err;
    } finally {
      u(false);
    }
  }, [e, _, refreshOb]);
  let loginConCorreo = (0, l.useCallback)(async (email, clave) => {
    authEpoch.current += 1;
    let correo = String(email ?? ``).trim().toLowerCase();
    let claveTrim = String(clave ?? ``).trim();
    if (!correo.includes(`@`) || !String(correo.split(`@`)[1] || ``).includes(`.`)) {
      throw Error(`Escribe un correo válido.`);
    }
    if (!claveTrim) {
      throw Error(`Escribe la contraseña (Clave del kardex).`);
    }
    u(true);
    f(null);
    let usoGoogle = false;
    try {
      let authorized;
      try {
        let res = await loginWithEmailClave({
          email: correo,
          clave: claveTrim,
          dispositivoId: getDispositivoId()
        });
        authorized = mapServerUserToAuthProfile(res?.user);
        if (!authorized?.email || !authorized?.rol) {
          throw Error(`El servidor no devolvió el usuario. Vuelve a intentar.`);
        }
      } catch (err) {
        if (!isBackendUnavailable(err)) {
          if (err?.status === 429) {
            throw Error(`Demasiados intentos. Espera un minuto y vuelve a intentar.`);
          }
          throw Error(err?.message || `Acceso denegado.`);
        }
        if (!String(e.clientId || ``).trim()) {
          throw Error(`No se pudo abrir la sesión en el servidor. Pide al admin que configure PATIO_SESSION_SECRET.`);
        }
        // Sin servidor: Google, y el correo tiene que ser el que se escribió.
        usoGoogle = true;
        await requestGoogleIdToken(e.clientId, e.hostedDomain);
        let accessToken = await Ft(e);
        let profile = await It(accessToken);
        let googleEmail = String(profile?.email ?? ``).trim().toLowerCase();
        if (!googleEmail || googleEmail !== correo) {
          throw Error(`El correo de Google (${googleEmail || `sin correo`}) no coincide con ${correo}.`);
        }
        authorized = await assertUsuarioAutorizado(e, profile, claveTrim);
      }
      a(authorized);
      saveCachedAuthProfile(authorized);
      if (authorized.ubicacion && authorized.ubicacion !== `todas` && _e.some(y => y.id === authorized.ubicacion)) {
        A(authorized.ubicacion);
      }
      await _(e, {
        user: authorized
      });
      r(`workspace`);
      let {
        remaining: rem
      } = await xn(e);
      g(rem);
      await flushServerOutbox(e, saved => {
        s(state => ({
          ...state,
          movimientos: state.movimientos.map(m => m.id === saved.id ? saved : m)
        }));
      });
      await refreshOb();
      setAuthReady(true);
    } catch (err) {
      if (usoGoogle) {
        Nt();
        clearCachedIdToken();
      }
      void logoutServer();
      a(null);
      saveCachedAuthProfile(null);
      r(`local`);
      let message = err instanceof Error ? err.message : `No se pudo entrar`;
      f(message);
      setAuthReady(true);
      throw err instanceof Error ? err : Error(message);
    } finally {
      u(false);
    }
  }, [e, _, refreshOb]);
  let b = (0, l.useCallback)(() => {
    authEpoch.current += 1;
    Nt();
    clearCachedIdToken();
    try {
      window.google?.accounts?.id?.disableAutoSelect();
    } catch {}
    void logoutServer();
    a(null);
    saveCachedAuthProfile(null);
    r(`local`);
    s(Ce());
  }, []);
  (0, l.useEffect)(() => {
    let alive = true;
    let epoch = authEpoch.current;
    let vigente = () => alive && epoch === authEpoch.current;
    apiFetch(`/api/auth/me`, {
      method: `GET`
    }).then(data => {
      if (!vigente()) {
        return;
      }
      let mapped = mapServerUserToAuthProfile(data?.user);
      if (!mapped) {
        let cached = loadCachedAuthProfile();
        if (cached?.sesionServidor) {
          a(null);
          saveCachedAuthProfile(null);
          r(`local`);
        } else if (cached?.email && cached?.rol) {
          a(cached);
          r(`workspace`);
        } else {
          a(null);
        }
        setAuthReady(true);
        return;
      }
      let cached = loadCachedAuthProfile();
      let profile = cached?.email === mapped.email ? {
        ...mapped,
        nombreKardex: cached.nombreKardex || mapped.nombreKardex,
        celular: mapped.celular || cached.celular,
        whatsapp: mapped.whatsapp || cached.whatsapp,
        picture: mapped.picture || cached.picture,
        autorizadoEn: cached.autorizadoEn || mapped.autorizadoEn
      } : mapped;
      a(prev => {
        if (prev?.email && profile.email && prev.email !== profile.email) {
          return prev;
        }
        return {
          ...prev,
          ...profile
        };
      });
      saveCachedAuthProfile(profile);
      r(`workspace`);
      setAuthReady(true);
      if (hasServerSession(profile)) {
        listMovimientosServer(2000).then(data => {
          if (!vigente() || !Array.isArray(data?.movimientos)) {
            return;
          }
          s(prev => ({
            ...prev,
            movimientos: data.movimientos.map(Se)
          }));
        }).catch(() => {});
        listEstadoUnidadesServer().then(data => {
          if (!vigente() || !Array.isArray(data?.estados)) {
            return;
          }
          setEstadosUnidad(data.estados);
        }).catch(() => {});
        loadCatalogoRefresh({
          user: profile,
          listServer: async () => (await listEquiposServer())?.equipos
        }).then(loaded => {
          if (!alive || !Array.isArray(loaded.items)) return;
          s(prev => ({ ...prev, equipos: loaded.items }));
        }).catch(() => {});
        loadCatalogoRefresh({
          user: profile,
          listServer: async () => (await listRefrigeracionServer())?.refrigeraciones
        }).then(loaded => {
          if (!alive || !Array.isArray(loaded.items)) return;
          s(prev => ({ ...prev, refrigeraciones: loaded.items }));
        }).catch(() => {});
      }
    }).catch(err => {
      if (!vigente()) {
        return;
      }
      let cached = loadCachedAuthProfile();
      let sinCookie = err instanceof ApiError && err.status === 401;
      if (sinCookie && cached?.sesionServidor) {
        a(null);
        saveCachedAuthProfile(null);
        r(`local`);
      } else if (cached?.email && cached?.rol) {
        a(cached);
        r(`workspace`);
      } else {
        a(null);
      }
      setAuthReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  let x = (0, l.useCallback)(e => {
    Ot(e);
    t(e);
  }, []);
  let S = (0, l.useCallback)(async t => {
    try {
      assertWritable({
        mode: n,
        user: activeServerUser(i, loadCachedAuthProfile())
      });
    } catch (err) {
      f(err instanceof Error ? err.message : LOCAL_READONLY_BANNER);
      throw err;
    }
    let actor = activeServerUser(i, loadCachedAuthProfile());
    let anterior = o.equipos.find(item => item.id === t.id) ?? null;
    s(e => we(e, t));
    if (hasServerSession(actor)) {
      await persistirCatalogoServidor(() => guardarEquipoServer(t), {
        setSyncing: u,
        setError: f,
        revert: () => s(state => {
          let next = { ...state, equipos: revertirEnLista(state.equipos, t.id, anterior) };
          M(next);
          return next;
        })
      });
      return;
    }
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
  }, [n, e, o.equipos, i]);
  let C = (0, l.useCallback)(async t => {
    try {
      assertWritable({
        mode: n,
        user: activeServerUser(i, loadCachedAuthProfile())
      });
    } catch (err) {
      f(err instanceof Error ? err.message : LOCAL_READONLY_BANNER);
      throw err;
    }
    let actorRef = activeServerUser(i, loadCachedAuthProfile());
    let anteriorRef = o.refrigeraciones.find(item => item.id === t.id) ?? null;
    s(e => N(e, t));
    if (hasServerSession(actorRef)) {
      await persistirCatalogoServidor(() => guardarRefrigeracionServer(t), {
        setSyncing: u,
        setError: f,
        revert: () => s(state => {
          let next = { ...state, refrigeraciones: revertirEnLista(state.refrigeraciones, t.id, anteriorRef) };
          M(next);
          return next;
        })
      });
      return;
    }
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
  }, [n, e, o.refrigeraciones, i]);
  let ee = (0, l.useCallback)(async t => {
    try {
      assertWritable({
        mode: n,
        user: activeServerUser(i, loadCachedAuthProfile())
      });
    } catch (err) {
      f(err instanceof Error ? err.message : LOCAL_READONLY_BANNER);
      throw err;
    }
    let actorDelRef = activeServerUser(i, loadCachedAuthProfile());
    let anteriorDelRef = o.refrigeraciones.find(item => item.id === t) ?? null;
    s(e => Te(e, t));
    if (hasServerSession(actorDelRef)) {
      await persistirCatalogoServidor(() => eliminarRefrigeracionServer(t), {
        setSyncing: u,
        setError: f,
        revert: () => s(state => {
          let next = { ...state, refrigeraciones: revertirEnLista(state.refrigeraciones, t, anteriorDelRef) };
          M(next);
          return next;
        })
      });
      return;
    }
    if (n === `workspace` && navigator.onLine) {
      u(true);
      try {
        await pn(e, t, o.refrigeraciones);
      } finally {
        u(false);
      }
    }
  }, [n, e, o.refrigeraciones, i]);
  let w = (0, l.useCallback)(async t => {
    let actor = activeServerUser(i, loadCachedAuthProfile());
    let writeMode = movimientoWriteMode({
      mode: n,
      user: actor
    });
    if (writeMode === `deny`) {
      let err = localReadOnlyError();
      f(err.message);
      throw err;
    }
    if ((actor?.email || i?.email) && !t.usuarioEmail) {
      t = {
        ...t,
        usuarioEmail: actor?.email || i.email
      };
    }
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
    if (!navigator.onLine) {
      if (writeMode === `server`) {
        try {
          await enqueueMovimiento(t, `Sin conexión`);
          await refreshOb();
          f(`Sin conexión. El movimiento quedó en la cola de este dispositivo.`);
        } catch (err) {
          f(err instanceof Error ? err.message : `Sin conexión y no se pudo guardar la cola en este dispositivo.`);
        }
        return;
      }
      g(_n(t, `Sin conexión`));
      return;
    }
    u(true);
    f(null);
    try {
      let saved = await bn(e, t, {
        sesionServidor: writeMode === `server`
      });
      s(state => ({
        ...state,
        movimientos: state.movimientos.map(m => m.id === saved.id ? saved : m)
      }));
      let avisoInventario = saved?.avisosServidor || null;
      let rId = t.refrigerada?.refrigeracionId;
      let hor = t.refrigerada?.horometroThermo;
      if (writeMode !== `server` && n === `workspace` && rId && hor != null) {
        let refri = o.refrigeraciones.find(item => item.id === rId);
        if (refri) {
          try {
            await fn(e, {
              ...refri,
              horometro: hor
            }, o.refrigeraciones);
          } catch (err) {
            // Con sesión de servidor el movimiento ya quedó en el API. El horómetro de Sheets no debe reencolarlo.
            if (writeMode !== `server`) {
              throw err;
            }
          }
        }
      }
      if (writeMode === `server`) {
        let avisoUbicacion = await ubicarTrasMovimiento({
          ...t,
          id: saved?.id || t.id,
          equipoId: saved?.equipoId || t.equipoId,
          placa: saved?.placa || t.placa
        });
        if (avisoUbicacion) {
          avisoInventario = [avisoInventario, avisoUbicacion].filter(Boolean).join(` `);
        }
      }
      return avisoInventario;
    } catch (err) {
      let message = err instanceof Error ? err.message : `Error al registrar movimiento`;
      // 400/401/403/409 ya los decidió el servidor: no encolar (un reintento no debe saltarse la regla por Sheets).
      if (err instanceof ApiError && !isBackendUnavailable(err)) {
        s(state => {
          let next = {
            ...state,
            movimientos: state.movimientos.filter(m => m.id !== t.id)
          };
          M(next);
          return next;
        });
        f(message);
        throw err;
      }
      let queued = err.preparedMovimiento || t;
      if (writeMode === `server`) {
        try {
          await enqueueMovimiento(queued, message);
          await refreshOb();
          f(`${message} · quedó en cola offline`);
        } catch {
          f(`${message} · no se pudo encolar en este dispositivo`);
        }
        return;
      }
      f(`${message} · quedó en cola offline`);
      g(_n(queued, message));
    } finally {
      u(false);
    }
  }, [n, e, o.refrigeraciones, i, refreshOb]);
  let te = (0, l.useCallback)(async t => {
    try {
      assertWritable({
        mode: n,
        user: activeServerUser(i, loadCachedAuthProfile())
      });
    } catch (err) {
      f(err instanceof Error ? err.message : LOCAL_READONLY_BANNER);
      throw err;
    }
    s(e => {
      let n = {
        ...e,
        equipos: e.equipos.filter(e => e.id !== t)
      };
      M(n);
      return n;
    });
    let actorDelEq = activeServerUser(i, loadCachedAuthProfile());
    let anteriorDelEq = o.equipos.find(item => item.id === t) ?? null;
    if (hasServerSession(actorDelEq)) {
      await persistirCatalogoServidor(() => eliminarEquipoServer(t), {
        setSyncing: u,
        setError: f,
        revert: () => s(state => {
          let next = { ...state, equipos: revertirEnLista(state.equipos, t, anteriorDelEq) };
          M(next);
          return next;
        })
      });
      return;
    }
    if (n === `workspace` && navigator.onLine) {
      u(true);
      try {
        await on(e, t, o.equipos);
      } finally {
        u(false);
      }
    }
  }, [n, e, o.equipos, i]);
  let T = (0, l.useCallback)(() => {
    try {
      assertWritable({
        mode: n,
        user: activeServerUser(i, loadCachedAuthProfile())
      });
    } catch (err) {
      f(err instanceof Error ? err.message : LOCAL_READONLY_BANNER);
      return;
    }
    let next = {
      equipos: [],
      refrigeraciones: [],
      movimientos: []
    };
    M(next);
    s(next);
  }, [n, i]);
  return {
    state: o,
    config: e,
    mode: n,
    user: i,
    authReady,
    loginConCorreo,
    estadosUnidad,
    localReadOnly: isLocalReadOnly({
      mode: n,
      user: activeServerUser(i, loadCachedAuthProfile())
    }),
    syncing: c,
    syncError: d,
    online: p,
    queueCount: h.length + ob,
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
