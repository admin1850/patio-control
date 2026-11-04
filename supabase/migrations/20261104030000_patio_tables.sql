-- PatioControl: una tabla patio_* por pestaña del Sheet.
-- RLS activo y sin políticas. anon y authenticated no tienen privilegios.
-- La API usa solo service_role (ese rol atraviesa RLS). No se aplicó sola: hay que correrla a mano.
-- Las celdas quedan en text para conservar SI/NO, JSON y fechas tal como están en el Sheet.

create table public.patio_autorizados (
  email text primary key,
  nombre text not null default '',
  apellido text not null default '',
  celular text not null default '',
  whatsapp text not null default '',
  rol text not null default '',
  ubicacion text not null default '',
  clave text not null default '',
  activo text not null default '',
  entrada text not null default '',
  salida text not null default '',
  parado text not null default '',
  baja text not null default '',
  historial text not null default '',
  kpis text not null default '',
  equipos text not null default '',
  workspace text not null default '',
  notas text not null default '',
  clave_hash text not null default ''
);

create table public.patio_movimientos (
  id text primary key,
  tipo text not null default '',
  equipo_id text not null default '',
  placa text not null default '',
  numero_economico text not null default '',
  equipo_tipo text not null default '',
  fecha_hora text not null default '',
  operador text not null default '',
  chofer text not null default '',
  origen_destino text not null default '',
  kilometros text not null default '',
  diesel_porcentaje text not null default '',
  diesel_litros text not null default '',
  checklist_json text not null default '',
  fotos_urls text not null default '',
  condicion_general text not null default '',
  observaciones text not null default '',
  creado_en text not null default '',
  yarda_id text not null default '',
  sello_numero text not null default '',
  firma_nombre text not null default '',
  firma_url text not null default '',
  geo_lat text not null default '',
  fotos_evidencia_json text not null default '',
  geo_lng text not null default '',
  cumplimiento_json text not null default '',
  placas_extra_json text not null default '',
  empresa_id text not null default '',
  refrigerada_json text not null default '',
  whatsapp text not null default '',
  motivo_paro text not null default '',
  parado_desde text not null default '',
  zona_slot text not null default '',
  usuario_email text not null default '',
  hora_servidor text not null default '',
  viaje_id text not null default ''
);

create index patio_movimientos_equipo_id_idx on public.patio_movimientos (equipo_id);

create index patio_movimientos_placa_idx on public.patio_movimientos (placa);

create index patio_movimientos_yarda_id_idx on public.patio_movimientos (yarda_id);

create index patio_movimientos_viaje_id_idx on public.patio_movimientos (viaje_id);

create index patio_movimientos_hora_servidor_idx on public.patio_movimientos (hora_servidor);

create table public.patio_equipos (
  id text primary key,
  tipo text not null default '',
  placa text not null default '',
  numero_economico text not null default '',
  marca text not null default '',
  modelo text not null default '',
  notas text not null default '',
  creado_en text not null default '',
  operador_asignado text not null default ''
);

create index patio_equipos_placa_idx on public.patio_equipos (placa);

create table public.patio_refrigeracion (
  id text primary key,
  marca text not null default '',
  modelo text not null default '',
  numero_activo text not null default '',
  economico_montado text not null default '',
  horometro text not null default '',
  estatus text not null default '',
  notas text not null default '',
  creado_en text not null default ''
);

create index patio_refrigeracion_numero_activo_idx on public.patio_refrigeracion (numero_activo);

create index patio_refrigeracion_economico_montado_idx on public.patio_refrigeracion (economico_montado);

create table public.patio_auditoria (
  id text primary key,
  hora_servidor text not null default '',
  usuario_email text not null default '',
  rol text not null default '',
  accion text not null default '',
  entidad text not null default '',
  entidad_id text not null default '',
  antes text not null default '',
  despues text not null default '',
  dispositivo_id text not null default ''
);

create index patio_auditoria_usuario_email_idx on public.patio_auditoria (usuario_email);

create index patio_auditoria_entidad_id_idx on public.patio_auditoria (entidad_id);

create index patio_auditoria_hora_servidor_idx on public.patio_auditoria (hora_servidor);

create table public.patio_ordenes_trabajo (
  id text primary key,
  folio text not null default '',
  unidad_id text not null default '',
  unidades_relacionadas_json text not null default '',
  yarda text not null default '',
  tipo text not null default '',
  motivo text not null default '',
  prioridad text not null default '',
  taller_tipo text not null default '',
  proveedor_id text not null default '',
  ubicacion_taller text not null default '',
  responsable_email text not null default '',
  reportado_por text not null default '',
  fecha_entrada_taller text not null default '',
  etr text not null default '',
  fecha_lista text not null default '',
  fecha_liberada text not null default '',
  estatus text not null default '',
  km_entrada text not null default '',
  km_salida text not null default '',
  horometro_entrada text not null default '',
  horometro_salida text not null default '',
  costo_estimado text not null default '',
  costo_refacciones text not null default '',
  costo_mano_obra text not null default '',
  costo_externo text not null default '',
  factura text not null default '',
  refacciones_json text not null default '',
  fotos_antes_json text not null default '',
  fotos_despues_json text not null default '',
  notas text not null default '',
  movimiento_origen_id text not null default '',
  etr_original text not null default '',
  etr_movimientos_count text not null default '',
  activo text not null default ''
);

create index patio_ordenes_trabajo_unidad_id_idx on public.patio_ordenes_trabajo (unidad_id);

create index patio_ordenes_trabajo_estatus_idx on public.patio_ordenes_trabajo (estatus);

create index patio_ordenes_trabajo_folio_idx on public.patio_ordenes_trabajo (folio);

create index patio_ordenes_trabajo_yarda_idx on public.patio_ordenes_trabajo (yarda);

create table public.patio_ot_eventos (
  id text primary key,
  ot_id text not null default '',
  tipo_evento text not null default '',
  valor_anterior text not null default '',
  valor_nuevo text not null default '',
  motivo text not null default '',
  usuario_email text not null default '',
  hora_servidor text not null default '',
  rol text not null default '',
  dispositivo_id text not null default ''
);

create index patio_ot_eventos_ot_id_idx on public.patio_ot_eventos (ot_id);

create index patio_ot_eventos_hora_servidor_idx on public.patio_ot_eventos (hora_servidor);

create table public.patio_estado_unidad (
  unidad_id text primary key,
  tipo text not null default '',
  yarda text not null default '',
  zona text not null default '',
  slot text not null default '',
  ubicacion text not null default '',
  estatus_operativo text not null default '',
  estatus_carga text not null default '',
  desde text not null default '',
  ot_abierta_id text not null default '',
  actualizado_en text not null default '',
  cliente_carga text not null default '',
  folio_carga text not null default '',
  enganchada_a text not null default ''
);

create index patio_estado_unidad_yarda_idx on public.patio_estado_unidad (yarda);

create index patio_estado_unidad_estatus_operativo_idx on public.patio_estado_unidad (estatus_operativo);

create index patio_estado_unidad_ot_abierta_id_idx on public.patio_estado_unidad (ot_abierta_id);

create table public.patio_zonas_slots (
  id text primary key,
  yarda_id text not null default '',
  zona text not null default '',
  slot text not null default '',
  tipo text not null default '',
  capacidad text not null default '',
  activo text not null default ''
);

create index patio_zonas_slots_yarda_id_zona_slot_idx on public.patio_zonas_slots (yarda_id, zona, slot);

create table public.patio_conteos_fisicos (
  id text primary key,
  yarda_id text not null default '',
  zona text not null default '',
  iniciado_en text not null default '',
  cerrado_en text not null default '',
  usuario_email text not null default '',
  resumen_json text not null default '',
  activo text not null default ''
);

create index patio_conteos_fisicos_yarda_id_idx on public.patio_conteos_fisicos (yarda_id);

create table public.patio_defectos (
  id text primary key,
  movimiento_id text not null default '',
  equipo_id text not null default '',
  angulo text not null default '',
  tipo text not null default '',
  fotos_json text not null default '',
  ot_id text not null default '',
  usuario_email text not null default '',
  hora_servidor text not null default ''
);

create index patio_defectos_movimiento_id_idx on public.patio_defectos (movimiento_id);

create index patio_defectos_equipo_id_idx on public.patio_defectos (equipo_id);

create index patio_defectos_ot_id_idx on public.patio_defectos (ot_id);

create table public.patio_plan_preventivo (
  tipo_unidad text primary key,
  cada_km text not null default '',
  cada_dias text not null default '',
  cada_horas_thermo text not null default '',
  aviso_pct text not null default ''
);

create table public.patio_servicio_programado (
  id text primary key,
  unidad_id text not null default '',
  plan_id text not null default '',
  proximo_km text not null default '',
  proxima_fecha text not null default '',
  proximo_horometro text not null default '',
  estatus text not null default '',
  ot_id text not null default ''
);

create index patio_servicio_programado_unidad_id_idx on public.patio_servicio_programado (unidad_id);

create index patio_servicio_programado_estatus_idx on public.patio_servicio_programado (estatus);

create index patio_servicio_programado_ot_id_idx on public.patio_servicio_programado (ot_id);

create table public.patio_avisos_log (
  id text primary key,
  tipo text not null default '',
  yarda text not null default '',
  unidad_id text not null default '',
  canal text not null default '',
  estatus text not null default '',
  destino text not null default '',
  mensaje text not null default '',
  dedupe_key text not null default '',
  hora_servidor text not null default '',
  detalle text not null default ''
);

create index patio_avisos_log_dedupe_key_idx on public.patio_avisos_log (dedupe_key);

create index patio_avisos_log_tipo_yarda_idx on public.patio_avisos_log (tipo, yarda);

create index patio_avisos_log_unidad_id_idx on public.patio_avisos_log (unidad_id);

create table public.patio_avisos_suscripciones (
  id text primary key,
  tipo text not null default '',
  yarda text not null default '',
  canal text not null default '',
  destino text not null default '',
  activo text not null default ''
);

create index patio_avisos_suscripciones_tipo_yarda_idx on public.patio_avisos_suscripciones (tipo, yarda);

create table public.patio_llegadas_esperadas (
  id text primary key,
  viaje_id text not null default '',
  placas text not null default '',
  cajas_json text not null default '',
  dolly text not null default '',
  sello text not null default '',
  carta_porte text not null default '',
  eta text not null default '',
  yarda_id text not null default '',
  hora_servidor text not null default '',
  estatus text not null default ''
);

create index patio_llegadas_esperadas_viaje_id_idx on public.patio_llegadas_esperadas (viaje_id);

create index patio_llegadas_esperadas_estatus_idx on public.patio_llegadas_esperadas (estatus);

create index patio_llegadas_esperadas_yarda_id_idx on public.patio_llegadas_esperadas (yarda_id);

-- service role únicamente

alter table public.patio_autorizados enable row level security;
revoke all on table public.patio_autorizados from public, anon, authenticated;
grant select, insert, update, delete on table public.patio_autorizados to service_role;

alter table public.patio_movimientos enable row level security;
revoke all on table public.patio_movimientos from public, anon, authenticated;
grant select, insert, update, delete on table public.patio_movimientos to service_role;

alter table public.patio_equipos enable row level security;
revoke all on table public.patio_equipos from public, anon, authenticated;
grant select, insert, update, delete on table public.patio_equipos to service_role;

alter table public.patio_refrigeracion enable row level security;
revoke all on table public.patio_refrigeracion from public, anon, authenticated;
grant select, insert, update, delete on table public.patio_refrigeracion to service_role;

alter table public.patio_auditoria enable row level security;
revoke all on table public.patio_auditoria from public, anon, authenticated;
grant select, insert, update, delete on table public.patio_auditoria to service_role;

alter table public.patio_ordenes_trabajo enable row level security;
revoke all on table public.patio_ordenes_trabajo from public, anon, authenticated;
grant select, insert, update, delete on table public.patio_ordenes_trabajo to service_role;

alter table public.patio_ot_eventos enable row level security;
revoke all on table public.patio_ot_eventos from public, anon, authenticated;
grant select, insert, update, delete on table public.patio_ot_eventos to service_role;

alter table public.patio_estado_unidad enable row level security;
revoke all on table public.patio_estado_unidad from public, anon, authenticated;
grant select, insert, update, delete on table public.patio_estado_unidad to service_role;

alter table public.patio_zonas_slots enable row level security;
revoke all on table public.patio_zonas_slots from public, anon, authenticated;
grant select, insert, update, delete on table public.patio_zonas_slots to service_role;

alter table public.patio_conteos_fisicos enable row level security;
revoke all on table public.patio_conteos_fisicos from public, anon, authenticated;
grant select, insert, update, delete on table public.patio_conteos_fisicos to service_role;

alter table public.patio_defectos enable row level security;
revoke all on table public.patio_defectos from public, anon, authenticated;
grant select, insert, update, delete on table public.patio_defectos to service_role;

alter table public.patio_plan_preventivo enable row level security;
revoke all on table public.patio_plan_preventivo from public, anon, authenticated;
grant select, insert, update, delete on table public.patio_plan_preventivo to service_role;

alter table public.patio_servicio_programado enable row level security;
revoke all on table public.patio_servicio_programado from public, anon, authenticated;
grant select, insert, update, delete on table public.patio_servicio_programado to service_role;

alter table public.patio_avisos_log enable row level security;
revoke all on table public.patio_avisos_log from public, anon, authenticated;
grant select, insert, update, delete on table public.patio_avisos_log to service_role;

alter table public.patio_avisos_suscripciones enable row level security;
revoke all on table public.patio_avisos_suscripciones from public, anon, authenticated;
grant select, insert, update, delete on table public.patio_avisos_suscripciones to service_role;

alter table public.patio_llegadas_esperadas enable row level security;
revoke all on table public.patio_llegadas_esperadas from public, anon, authenticated;
grant select, insert, update, delete on table public.patio_llegadas_esperadas to service_role;
