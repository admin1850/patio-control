/** Marco de la app: barra superior, menú y modo quiosco. */
import * as l from "react";
import GrokDudas from "./GrokDudas.jsx";
import { Re } from "../domain/constants.js";

var Pe = `patio-control-kiosk`;

function Fe() {
  return localStorage.getItem(Pe) === `1`;
}

function Ie(e) {
  localStorage.setItem(Pe, e ? `1` : `0`);
}

function InstallBanner() {
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
    return <div className={`install-banner`}><p>{`Instala PatioControl en este dispositivo para usarlo como app de caseta.`}</p><div className={`hero-actions`}><button type={`button`} className={`btn primary`} onClick={() => {
          e.prompt().then(() => {
            t(null);
          });
        }}>{`Instalar`}</button><button type={`button`} className={`btn soft`} onClick={() => {
          localStorage.setItem(`patio-hide-install`, `1`);
          r(true);
        }}>{`Ahora no`}</button></div></div>;
  }
}

export function AppShell({
  page: e,
  onNavigate: t,
  onBack: n,
  children: r,
  modeLabel: i,
  syncing: a,
  online: o = true,
  queueCount: s = 0,
  onFlushQueue: c,
  navItems: navItems = Re
}) {
  let [u, d] = (0, l.useState)(() => Fe());
  let [swBanner, setSwBanner] = (0, l.useState)(() => Boolean(window.__PATIO_SW_WAITING));
  (0, l.useEffect)(() => {
    document.documentElement.classList.toggle(`kiosk`, u);
    Ie(u);
  }, [u]);
  (0, l.useEffect)(() => {
    let on = () => setSwBanner(true);
    window.addEventListener(`patio-sw-update`, on);
    return () => window.removeEventListener(`patio-sw-update`, on);
  }, []);
  let f = e !== `dashboard` && !!n;
  return <div className={u ? `app-shell kiosk-shell` : `app-shell`}><header className={`topbar`}><div className={`brand-block`}><p className={`brand`}>{`PatioControl`}</p><p className={`brand-sub`}>{`Gate · evidencias · cumplimiento`}{i ? ` · ${i}` : ``}{a ? ` · sync…` : ``}{u ? ` · quiosco` : ``}{o ? `` : ` · OFFLINE`}</p></div><div className={`topbar-actions`}><button type={`button`} className={u ? `nav-link active` : `nav-link`} onClick={() => d(e => !e)} title={`Botones y textos más grandes para tablet de caseta`}>{u ? `Quiosco ON` : `Quiosco`}</button><nav className={`nav-desktop`} aria-label={`Principal`}>{navItems.map(n => <button type={`button`} className={e === n.id ? `nav-link active` : `nav-link`} onClick={() => t(n.id)} key={n.id}>{n.label}</button>)}</nav></div></header>{swBanner && <p className={`banner warn status-strip`} role={`status`}>{`Actualización lista — reinicia al terminar`}{` `}<button type={`button`} className={`text-btn`} onClick={() => {
    if (window.__PATIO_CAPTURE_OPEN) {
      return;
    }
    let go = window.__PATIO_SW_UPDATE;
    if (typeof go === `function`) {
      void go();
    }
  }}>{`Reiniciar`}</button></p>}{!o && <p className={`banner error status-strip`}>{`Sin conexión · los registros se guardan en este dispositivo y se suben después.`}</p>}{o && s > 0 && <p className={`banner info status-strip`}>{s}{` movimiento(s) pendientes de subir a Workspace.`}{` `}{c && <button type={`button`} className={`text-btn`} onClick={c}>{`Subir ahora`}</button>}</p>}<InstallBanner /><main className={`main`}>{r}</main>{f && <button type={`button`} className={`btn-back-fixed`} onClick={n} aria-label={`Atrás`}>{`← Atrás`}</button>}<GrokDudas page={e} /><nav className={`nav-mobile`} aria-label={`Móvil`}>{navItems.map(n => <button type={`button`} className={e === n.id ? `mob-link active` : `mob-link`} onClick={() => t(n.id)} key={n.id}>{n.short}</button>)}</nav></div>;
}
