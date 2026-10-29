/** Captura de caja refrigerada e inocuidad. */
import { Je, qe, tt } from "../domain/constants.js";
import { Qe } from "../domain/patioModel.js";
import { ChecklistInspeccion } from "./ChecklistInspeccion.jsx";

var Ye = [`API`, `Carbal/Pia`];

export function RefrigeracionForm({
  tipo: e,
  value: t,
  onChange: n,
  entradaVacia: r
}) {
  function i(e) {
    n({
      ...t,
      ...e
    });
  }
  function a(e) {
    i({
      inocuidad: e
    });
  }
  let o = e === `salida` && Qe(t.dieselThermo);
  return <div className={`refrig-block`}><fieldset className={`fieldset`}><legend>{`Equipo de refrigeración`}</legend><div className={`field`}><span className={`label`}>{`Marca *`}</span><div className={`seg big wrap`} style={{
          marginTop: 6
        }}>{tt.map(e => <button type={`button`} className={t.marcaThermo === e ? `seg-btn on-ok` : `seg-btn`} onClick={() => i({
            marcaThermo: e,
            refrigeracionId: undefined
          })} key={e}>{e}</button>)}</div></div><div className={`grid-2`} style={{
        marginTop: 12
      }}><label className={`field`}><span>{`Modelo *`}</span><input className={`input`} value={t.modeloThermo ?? ``} onChange={e => i({
            modeloThermo: e.target.value
          })} placeholder={`SB-210…`} required={true} /></label><label className={`field`}><span>{`Número de activo interno *`}</span><input className={`input`} value={t.numeroActivoThermo ?? ``} onChange={e => i({
            numeroActivoThermo: e.target.value.toUpperCase()
          })} placeholder={`ACT-REF-001`} required={true} /></label><label className={`field full`}><span>{`Económico caja/camión donde está montado *`}</span><input className={`input`} value={t.economicoMontadoThermo ?? t.economicoCajaRefrigerada ?? ``} onChange={e => {
            let t = e.target.value.toUpperCase();
            i({
              economicoMontadoThermo: t,
              economicoCajaRefrigerada: t
            });
          }} placeholder={`R-220`} required={true} /></label></div></fieldset><fieldset className={`fieldset`}><legend>{`Datos generales · caja refrigerada`}</legend><div className={`grid-2`}><label className={`field`}><span>{`Línea transportista *`}</span><select className={`input`} value={t.lineaTransportista ?? ``} onChange={e => i({
            lineaTransportista: e.target.value || undefined
          })} required={true}><option value={``}>{`Seleccionar…`}</option>{Ye.map(e => <option value={e} key={e}>{e}</option>)}</select></label><label className={`field`}><span>{`No. económico caja refrigerada *`}</span><input className={`input`} value={t.economicoCajaRefrigerada ?? ``} onChange={e => i({
            economicoCajaRefrigerada: e.target.value.toUpperCase(),
            economicoMontadoThermo: e.target.value.toUpperCase()
          })} placeholder={`Ej. RF-220`} required={true} /></label></div></fieldset><fieldset className={`fieldset`}><legend>{`Control de refrigeración / Thermo King`}</legend><div className={`grid-2`}><label className={`field`}><span>{`Temperatura Set Point *`}</span><select className={`input`} value={t.setPoint ?? ``} onChange={e => i({
            setPoint: e.target.value || undefined
          })} required={true}><option value={``}>{`Seleccionar…`}</option>{qe.map(e => <option value={e.id} key={e.id}>{e.label}</option>)}</select></label><label className={`field`}><span>{`Temperatura real en display (°C) *`}</span><input className={`input`} type={`number`} step={0.1} value={t.temperaturaReal ?? ``} onChange={e => i({
            temperaturaReal: e.target.value === `` ? null : Number(e.target.value)
          })} placeholder={`Ej. 1.5`} required={true} /></label>{e === `salida` && <label className={`check-inline field full`}><input type={`checkbox`} checked={t.preEnfriado === true} onChange={e => i({
            preEnfriado: e.target.checked
          })} />{`Pre-enfriado: ya alcanzó Set Point antes de cargar`}</label>}<label className={`field`}><span>{`Nivel diésel del Thermo *`}</span><select className={`input`} value={t.dieselThermo ?? ``} onChange={e => i({
            dieselThermo: e.target.value || undefined
          })} required={true}><option value={``}>{`Seleccionar…`}</option>{Je.map(e => <option value={e.id} key={e.id}>{e.label}</option>)}</select></label><label className={`field`}><span>{`Horómetro Thermo King *`}</span><input className={`input`} type={`number`} min={0} step={0.1} value={t.horometroThermo ?? ``} onChange={e => i({
            horometroThermo: e.target.value === `` ? null : Number(e.target.value)
          })} placeholder={`Horas`} required={true} /></label><div className={`field full`}><span className={`label`}>{`Modo de operación *`}</span><div className={`seg wrap`} style={{
            marginTop: 6
          }}>{[{
              id: `continuo`,
              label: `Continuo`
            }, {
              id: `ciclo`,
              label: `Ciclo Start-Stop`
            }].map(e => <button type={`button`} className={t.modoOperacion === e.id ? `seg-btn on-ok` : `seg-btn`} onClick={() => i({
              modoOperacion: e.id
            })} key={e.id}>{e.label}</button>)}</div></div><label className={`field full`}><span>{`Códigos de alarma en panel`}</span><input className={`input`} value={t.codigoAlarma ?? ``} onChange={e => i({
            codigoAlarma: e.target.value.toUpperCase()
          })} placeholder={`Dejar vacío si “OK” · ej. CODE 89`} /></label></div>{o && <p className={`banner error`}>{`Alerta: diésel del Thermo por debajo de 1/2 en salida. Reponer antes de despachar.`}</p>}</fieldset><fieldset className={`fieldset`}><legend>{`Checklist de inocuidad (TIF · API/Carbal)`}</legend><p className={`hint`}>{`Aprobado = OK · Rechazado = Falla`}</p><ChecklistInspeccion items={t.inocuidad} onChange={a} mode={`aprobado-rechazado`} /><label className={`field`} style={{
        marginTop: 12
      }}><span>{`Ticket de lavado grado alimenticio`}{r || e === `entrada` ? ` *` : ``}</span><input className={`input`} value={t.ticketLavado ?? ``} onChange={e => i({
          ticketLavado: e.target.value.toUpperCase()
        })} placeholder={`Folio del lavado`} /></label></fieldset><fieldset className={`fieldset`}><legend>{`Trazabilidad y seguridad documental`}</legend><div className={`grid-2`}><label className={`field`}><span>{`Folio del pedido / viaje *`}</span><input className={`input`} value={t.folioPedido ?? ``} onChange={e => i({
            folioPedido: e.target.value.toUpperCase()
          })} placeholder={`Folio viaje`} required={true} /></label><label className={`field`}><span>{`Firma o folio MVO (médico veterinario) *`}</span><input className={`input`} value={t.folioMvo ?? ``} onChange={e => i({
            folioMvo: e.target.value.toUpperCase()
          })} placeholder={`Folio MVO / liberación TIF`} required={true} /></label><label className={`field full`}><span>{`Número de termógrafo (data logger) *`}</span><input className={`input`} value={t.numeroTermografo ?? ``} onChange={e => i({
            numeroTermografo: e.target.value.toUpperCase()
          })} placeholder={`Serie USB / dispositivo`} required={true} /></label></div><p className={`hint`}>{`El marchamo / sello se captura en la sección de sello de seguridad (y en foto obligatoria).`}</p></fieldset></div>;
}
