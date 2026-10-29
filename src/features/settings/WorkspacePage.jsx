/** Ajustes de Workspace, sesión y conexión. */
import * as l from "react";
import { getPlateRecognizerToken, setPlateRecognizerToken } from "../../lib/placaOcr.js";
import { normalizeRol, rolLabel, ubicacionLabel } from "../../shared/domain/authProfile.js";

var wt = `https://docs.google.com/spreadsheets/d/1yH8vAbXoMFvHdKEt8XMvXWDOc0R1VjVdp1Y3MtCGLp0/edit`;

var I = `https://drive.google.com/drive/folders/1Usz_zTK3kqO-Pah3seSdPpMQPMfLHDJh`;

var KARDEX_DRIVE_URL = `https://drive.google.com/drive/folders/13kGY4MaX6-xDGN3CO4A1-1boy7aZamMI`;

var AUTORIZADOS_SHEET_URL = `https://docs.google.com/spreadsheets/d/1yH8vAbXoMFvHdKEt8XMvXWDOc0R1VjVdp1Y3MtCGLp0/edit#gid=422516323`;

export function WorkspacePage({
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
  let [claveApp, setClaveApp] = (0, l.useState)(``);
  let [g, _] = (0, l.useState)(null);
  let [plateToken, setPlateToken] = (0, l.useState)(() => getPlateRecognizerToken());
  let [plateSaved, setPlateSaved] = (0, l.useState)(null);
  async function v(e) {
    e.preventDefault();
    _(null);
    s(m);
    try {
      await c(m, {
        clave: claveApp
      });
      setClaveApp(``);
      _(`Autorizado. Correo + clave del kardex OK · conectado a Workspace.`);
    } catch (e) {
      _(e instanceof Error ? e.message : `Error al conectar`);
    }
  }
  function savePlateToken(ev) {
    ev.preventDefault();
    setPlateRecognizerToken(plateToken);
    setPlateSaved(`Token de Plate Recognizer guardado en este dispositivo.`);
  }
  return <div className={`page`}><div className={`form-head`}><h1>{`Google Workspace`}</h1><p>{`Entrar es con correo + contraseña en la pantalla de acceso. Esta página es para admin: OAuth de Sheets y token de OCR.`}</p></div><div className={`banner ${t === `workspace` ? `success` : `info`}`}>{t === `workspace` && n ? <l.Fragment>{`Conectado como `}<strong>{n.nombreKardex || n.name}</strong>{` (`}{n.email}{`) · `}{rolLabel(n.rol)}{` · `}{ubicacionLabel(n.ubicacion)}{n.whatsapp ? ` · WA ${n.whatsapp}` : n.celular ? ` · cel ${n.celular}` : ``}{` · modo nube`}{o ? `` : ` · OFFLINE`}{a > 0 ? ` · ${a} en cola` : ``}</l.Fragment> : <l.Fragment>{`Sesión con correo del kardex. Conecta Google aquí solo si hace falta el acceso a Sheets.`}</l.Fragment>}</div>{a > 0 && f && <p className={`banner info`}>{`Hay `}{a}{` registro(s) pendientes.`}{` `}<button type={`button`} className={`text-btn`} disabled={r || !o} onClick={() => void f()}>{`Subir cola ahora`}</button></p>}<section className={`panel links-panel`}><h2>{`Kardex y archivos compartidos`}</h2><ul className={`link-list`}><li><a href={AUTORIZADOS_SHEET_URL} target={`_blank`} rel={`noreferrer`}>{`Hoja Autorizados (kardex · quién puede usar la app)`}</a></li><li><a href={KARDEX_DRIVE_URL} target={`_blank`} rel={`noreferrer`}>{`Carpeta Drive — Kardex autorizados`}</a></li><li><a href={wt} target={`_blank`} rel={`noreferrer`}>{`Hoja PatioControl — Patio y evidencias`}</a></li><li><a href={I} target={`_blank`} rel={`noreferrer`}>{`Carpeta PatioControl Evidencias`}</a></li></ul><p className={`hint`}>{`Alta: Email, Clave, Activo=SI y columnas Entrada/Salida/Parado/Baja/Historial/KPIs/Equipos/Cloud en SI o NO. Si las dejas vacías, se usa la plantilla del Rol (guardia = solo entrada/salida).`}</p></section>{normalizeRol(n?.rol) === `admin` && <section className={`panel`} data-panel={`integracion-key`} style={{
      marginTop: 16
    }}><div className={`panel-head`}><h2>{`Llave de integraciones`}</h2></div><p className={`hint`}>{`App Chofer, Frotcom y el pull diario del ERP (sys.carbalmotors.com) usan el header X-Patio-Key. El valor está en Netlify como PATIO_INTEGRATION_KEY (Site settings → Environment variables). No se muestra en esta pantalla ni se guarda en la tablet.`}</p></section>}<form className={`form-panel`} onSubmit={v}><fieldset className={`fieldset`}><legend>{`Conexión OAuth (una sola vez)`}</legend><p className={`hint setup-steps`}>{`1) En Google Cloud Console crea un proyecto → APIs: enable `}<em>{`Google Sheets API`}</em>{` y`}{` `}<em>{`Google Drive API`}</em>{`.`}<br />{`2) Credenciales → OAuth client ID → tipo `}<strong>{`Aplicación web`}</strong>{`.`}<br />{`3) Orígenes autorizados: `}<strong>{`https://patiocontrol.netlify.app`}</strong>{` (también http://localhost:5173 si pruebas en local).`}<br />{`4) Pega el Client ID abajo. Dominio recomendado: `}<strong>{`camircapital.com`}</strong>{` (solo correos de la empresa).`}</p><div className={`grid-2`}><label className={`field full`}><span>{`Google Client ID *`}</span><input className={`input`} value={m.clientId} onChange={e => h({
              ...m,
              clientId: e.target.value
            })} placeholder={`123456789-abc.apps.googleusercontent.com`} required={true} /></label><label className={`field`}><span>{`Dominio Workspace (opcional)`}</span><input className={`input`} value={m.hostedDomain} onChange={e => h({
              ...m,
              hostedDomain: e.target.value
            })} placeholder={`camircapital.com`} /></label><label className={`field`}><span>{`ID de la hoja`}</span><input className={`input`} value={m.spreadsheetId} onChange={e => h({
              ...m,
              spreadsheetId: e.target.value
            })} /></label><label className={`field full`}><span>{`ID carpeta Drive (fotos)`}</span><input className={`input`} value={m.driveFolderId} onChange={e => h({
              ...m,
              driveFolderId: e.target.value
            })} /></label><label className={`field full`}><span>{`Clave del kardex *`}</span><input className={`input`} type={`password`} autoComplete={`current-password`} value={claveApp} onChange={e => setClaveApp(e.target.value)} placeholder={`La que el admin puso en columna Clave`} required={true} /></label><p className={`hint`} style={{
              gridColumn: `1 / -1`,
              margin: 0
            }}>{`No es la contraseña de Google: es la Clave de tu fila en Autorizados. El admin la da de alta y puede cambiarla ahí.`}</p></div></fieldset>{i && <p className={`banner error`}>{i}</p>}{g && <p className={`banner ${g.startsWith(`Autorizado`) || g.startsWith(`Conectado`) ? `success` : `error`}`}>{g}</p>}<div className={`hero-actions`}><button type={`submit`} className={`btn primary`} disabled={r}>{r ? `Conectando…` : t === `workspace` ? `Reconectar` : `Conectar con Google`}</button>{t === `workspace` && <button type={`button`} className={`btn soft`} disabled={r} onClick={() => void d()}>{`Actualizar datos`}</button>}<button type={`button`} className={`btn soft`} onClick={u}>{`Cerrar sesión`}</button></div></form><section className={`panel`} style={{
      marginTop: 16
    }}><div className={`panel-head`}><h2>{`OCR de placas (opcional)`}</h2></div><p className={`hint`}>{`Si guardas aquí el token de platerecognizer.com, este dispositivo lo usa primero. Si no hay token, la placa se lee con Vision en el servidor. Sin guiones.`}</p><form className={`form-panel compact`} onSubmit={savePlateToken} style={{
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
          }}>{`Quitar token`}</button> : null}</div></form></section>{p && <section className={`panel`} style={{
      marginTop: 16
    }}><div className={`panel-head`}><h2>{`Datos locales`}</h2></div><p className={`hint`}>{`Borra movimientos, equipos y refrigeraciones guardados en este dispositivo.`}</p><div className={`hero-actions`}><button type={`button`} className={`btn soft`} onClick={p}>{`Limpiar datos locales`}</button></div></section>}</div>;
}
