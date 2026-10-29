/** Acceso con correo y clave del kardex. */
import * as l from "react";

export function LoginGate({
  onLogin,
  syncing,
  checking
}) {
  let [email, setEmail] = (0, l.useState)(``);
  let [clave, setClave] = (0, l.useState)(``);
  let [error, setError] = (0, l.useState)(null);
  async function submit(ev) {
    ev.preventDefault();
    setError(null);
    try {
      await onLogin(email, clave);
    } catch (err) {
      setError(err instanceof Error ? err.message : `No se pudo entrar`);
    }
  }
  return <div className={`page login-gate`}><header className={`login-hero`}><p className={`brand`}>{`PatioControl`}</p><h1>{`Acceso al patio`}</h1></header>{checking ? <p className={`login-status`}>{`Revisando sesión…`}</p> : <form className={`form-panel`} onSubmit={ev => void submit(ev)}><label className={`field`}><span>{`Correo electrónico *`}</span><input className={`input`} type={`email`} autoComplete={`username`} inputMode={`email`} value={email} onChange={ev => setEmail(ev.target.value)} required={true} /></label><label className={`field`}><span>{`Contraseña *`}</span><input className={`input`} type={`password`} autoComplete={`current-password`} value={clave} onChange={ev => setClave(ev.target.value)} required={true} /></label><p className={`hint`}>{`Usa el correo y la Clave de tu fila en Autorizados (kardex). No es la contraseña de Gmail.`}</p>{error && <p className={`banner error`}>{error}</p>}<button type={`submit`} className={`btn primary wide`} disabled={syncing}>{syncing ? `Entrando…` : `Entrar`}</button></form>}</div>;
}
