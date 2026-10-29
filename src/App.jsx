/** Enrutador de pantallas de PatioControl. */
import * as l from "react";
import { LOCAL_READONLY_BANNER, isAuthenticated } from "./lib/patioSync.js";
import Mantenimiento from "./features/taller/Mantenimiento.jsx";
import Inventario from "./features/inventario/Inventario.jsx";
import MovimientoRapidoForm from "./features/caseta/MovimientoRapido.jsx";
import { LoginGate } from "./features/auth/LoginGate.jsx";
import { BajaForm } from "./features/caseta/BajaForm.jsx";
import { DashboardPage } from "./features/caseta/DashboardPage.jsx";
import { EntradaForm } from "./features/caseta/EntradaForm.jsx";
import { HistorialPage } from "./features/caseta/HistorialPage.jsx";
import { ParadoForm } from "./features/caseta/ParadoForm.jsx";
import { SalidaCortaForm } from "./features/caseta/SalidaCortaForm.jsx";
import { KpisPage } from "./features/kpis/KpisPage.jsx";
import { EquiposPage } from "./features/settings/EquiposPage.jsx";
import { WorkspacePage } from "./features/settings/WorkspacePage.jsx";
import { puedeMovimiento, rolLabel, ubicacionLabel } from "./shared/domain/authProfile.js";
import { Re, _e, ie } from "./shared/domain/constants.js";
import { A, be, kn, oe, se } from "./shared/domain/patioModel.js";
import { usePatio } from "./shared/hooks/usePatio.js";
import { AppShell } from "./shared/ui/AppShell.jsx";

var Hn = {
  dashboard: `Patio`,
  entrada: `Entrada`,
  salida: `Salida`,
  "salida-rapida": `Salida rápida`,
  "retorno-rapido": `Retorno rápido`,
  mantenimiento: `Mantenimiento`,
  inventario: `Inventario`,
  parado: `Equipo parado`,
  baja: `Baja`,
  historial: `Historial`,
  kpis: `KPIs`,
  equipos: `Equipos`,
  workspace: `Workspace`
};

function PatioShell() {
  let [e, t] = (0, l.useState)(`dashboard`);
  let [n, r] = (0, l.useState)([]);
  let [i, a] = (0, l.useState)(0);
  let [o, s] = (0, l.useState)(``);
  let [permMsg, setPermMsg] = (0, l.useState)(null);
  let [otDraft, setOtDraft] = (0, l.useState)(null);
  let c = usePatio();
  let navItems = (0, l.useMemo)(() => Re.filter(item => puedeMovimiento(c.user, item.id)), [c.user]);
  (0, l.useEffect)(() => {
    if (!c.authReady || !isAuthenticated(c.user)) {
      document.title = `PatioControl — Acceso`;
      return;
    }
    document.title = `PatioControl — ${Hn[e] || e}`;
  }, [e, c.authReady, c.user]);
  (0, l.useEffect)(() => {
    if (e !== `dashboard` && !puedeMovimiento(c.user, e)) {
      setPermMsg(`Tu rol no tiene permiso para “${Hn[e] || e}”. Pide al admin que lo active en el kardex.`);
      t(`dashboard`);
      r([]);
    }
  }, [c.user, e]);
  function u(page, n) {
    if (!puedeMovimiento(c.user, page)) {
      setPermMsg(`Sin permiso para “${Hn[page] || page}”. El admin lo habilita en Autorizados (columnas Entrada/Salida/Parado/…).`);
      return;
    }
    setPermMsg(null);
    s(n?.trim().toUpperCase() ?? ``);
    a(e => e + 1);
    t(t => {
      if (t !== page) {
        r(e => [...e, t]);
      }
      return page;
    });
  }
  function d() {
    if (n.length === 0) {
      t(`dashboard`);
      return;
    }
    let prev = n[n.length - 1];
    r(e => e.slice(0, -1));
    s(``);
    a(e => e + 1);
    t(prev);
  }
  async function guardSubmit(tipo, payload) {
    if (!puedeMovimiento(c.user, tipo)) {
      throw Error(`Sin permiso para registrar “${tipo}”.`);
    }
    await c.registrarMovimiento(payload);
  }
  if (!c.authReady || !isAuthenticated(c.user)) {
    return <LoginGate onLogin={(email, clave) => c.loginConCorreo(email, clave)} syncing={c.syncing} checking={!c.authReady} />;
  }
  return <AppShell page={e} onNavigate={page => {
    if (page === `mantenimiento`) setOtDraft(null);
    u(page);
  }} onBack={d} modeLabel={c.user?.rol ? `${rolLabel(c.user.rol)} · ${ubicacionLabel(c.user.ubicacion)}` : `Patio`} syncing={c.syncing} online={c.online} queueCount={c.queueCount} onFlushQueue={() => void c.flushQueue()} navItems={navItems}>{permMsg && <p className={`banner warn`} style={{
      marginBottom: 12
    }}>{permMsg}</p>}{c.localReadOnly && e !== `dashboard` && e !== `equipos` && <p className={`banner warn`} style={{
      marginBottom: 12
    }}>{LOCAL_READONLY_BANNER}</p>}{e === `dashboard` && <DashboardPage state={c.state} mode={c.mode} user={c.user} estadosUnidad={c.estadosUnidad} onCloud={() => u(`workspace`)} onEntrada={e => u(`entrada`, e)} onSalida={e => u(`salida`, e)} onParado={e => u(`parado`, e)} onBaja={e => u(`baja`, e)} onHistorial={() => u(`historial`)} onKpis={() => u(`kpis`)} onMantenimiento={() => u(`mantenimiento`)} onSalidaRapida={placa => u(`salida-rapida`, placa)} onRetornoRapido={placa => u(`retorno-rapido`, placa)} />}{e === `entrada` && puedeMovimiento(c.user, `entrada`) && <EntradaForm tipo={`entrada`} user={c.user} initialPlaca={o} equipos={c.state.equipos} refrigeraciones={c.state.refrigeraciones} movimientos={c.state.movimientos} onSaveEquipo={e => void c.guardarEquipo(e)} onSubmit={async e => {
      await guardSubmit(`entrada`, e);
    }} onPromptOt={draft => {
      setOtDraft(draft);
      u(`mantenimiento`);
    }} onDone={() => u(`dashboard`)} key={`entrada-${i}`} />}{e === `salida` && puedeMovimiento(c.user, `salida`) && <SalidaCortaForm initialPlaca={o} equipos={c.state.equipos} movimientos={c.state.movimientos} user={c.user} onSubmit={async e => {
      await guardSubmit(`salida`, e);
    }} onPromptOt={draft => {
      setOtDraft(draft);
      u(`mantenimiento`);
    }} onDone={() => u(`dashboard`)} key={`salida-${i}`} />}{e === `salida-rapida` && puedeMovimiento(c.user, `salida-rapida`) && <MovimientoRapidoForm modo={`salida`} initialPlaca={o} equipos={c.state.equipos} movimientos={c.state.movimientos} estadosUnidad={c.estadosUnidad} user={c.user} empresas={ie} yardas={_e} yardaInicial={be()} empresaInicial={oe()} onRememberYarda={A} onRememberEmpresa={se} formatCuando={kn} onSubmit={async mov => {
      await guardSubmit(`salida-rapida`, mov);
    }} onDone={() => u(`dashboard`)} key={`salida-rapida-${i}`} />}{e === `retorno-rapido` && puedeMovimiento(c.user, `retorno-rapido`) && <MovimientoRapidoForm modo={`retorno`} initialPlaca={o} equipos={c.state.equipos} movimientos={c.state.movimientos} estadosUnidad={c.estadosUnidad} user={c.user} empresas={ie} yardas={_e} yardaInicial={be()} empresaInicial={oe()} onRememberYarda={A} onRememberEmpresa={se} formatCuando={kn} onSubmit={async mov => {
      await guardSubmit(`retorno-rapido`, mov);
    }} onDone={() => u(`dashboard`)} key={`retorno-rapido-${i}`} />}{e === `mantenimiento` && <Mantenimiento user={c.user} draft={otDraft} equipos={c.state.equipos} movimientos={c.state.movimientos} estadosUnidad={c.estadosUnidad} onAltaCatalogo={placa => u(`equipos`, placa)} key={`mant-${i}`} />}{e === `inventario` && <Inventario user={c.user} key={`inv-${i}`} />}{e === `parado` && puedeMovimiento(c.user, `parado`) && <ParadoForm initialPlaca={o} equipos={c.state.equipos} movimientos={c.state.movimientos} onSaveEquipo={e => void c.guardarEquipo(e)} onPromptOt={draft => {
      setOtDraft(draft);
      u(`mantenimiento`);
    }} onSubmit={async e => {
      await guardSubmit(`parado`, e);
    }} onDone={() => u(`dashboard`)} key={`parado-${i}`} />}{e === `baja` && puedeMovimiento(c.user, `baja`) && <BajaForm initialPlaca={o} equipos={c.state.equipos} movimientos={c.state.movimientos} onSubmit={async e => {
      await guardSubmit(`baja`, e);
    }} onDone={() => u(`dashboard`)} key={`baja-${i}`} />}{e === `historial` && puedeMovimiento(c.user, `historial`) && <HistorialPage state={c.state} />}{e === `kpis` && puedeMovimiento(c.user, `kpis`) && <KpisPage state={c.state} />}{e === `equipos` && puedeMovimiento(c.user, `equipos`) && <EquiposPage readOnly={c.localReadOnly} state={c.state} initialPlaca={o} onSave={e => void c.guardarEquipo(e)} onDelete={e => void c.eliminarEquipo(e)} onSaveRefrigeracion={e => void c.guardarRefrigeracion(e)} onDeleteRefrigeracion={e => void c.eliminarRefrigeracion(e)} key={`equipos-${i}`} />}{e === `workspace` && puedeMovimiento(c.user, `workspace`) && <WorkspacePage config={c.config} mode={c.mode} user={c.user} syncing={c.syncing} syncError={c.syncError} queueCount={c.queueCount} online={c.online} onSaveConfig={c.updateConfig} onConnect={c.connectWorkspace} onDisconnect={c.disconnectWorkspace} onRefresh={c.refreshFromWorkspace} onFlushQueue={c.flushQueue} onLimpiarDatos={c.limpiarDatos} />}</AppShell>;
}

export default function App() {
  return <PatioShell />;
}
