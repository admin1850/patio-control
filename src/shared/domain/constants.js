/** Catálogos, llaves y tablas compartidas. Sin efectos al importar. */


export var ie = [{
  id: `api`,
  nombre: `API`
}, {
  id: `carbal-pia`,
  nombre: `Carbal/Pia`
}];

export var ae = `patio-control-empresa`;

export var _e = [{
  id: `chihuahua`,
  nombre: `Chihuahua`,
  estado: `Chihuahua`
}, {
  id: `calera`,
  nombre: `Calera`,
  estado: `Zacatecas`
}, {
  id: `calpulalpan`,
  nombre: `Calpulalpan`,
  estado: `Tlaxcala`
}];

export var ve = `patio-control-yarda`;

export function ye(e) {
  return _e.find(t => t.id === e)?.nombre ?? `—`;
}

export var Re = [{
  id: `dashboard`,
  label: `Patio`,
  short: `Patio`
}, {
  id: `entrada`,
  label: `Entrada`,
  short: `Entrada`
}, {
  id: `salida`,
  label: `Salida`,
  short: `Salida`
}, {
  id: `salida-rapida`,
  label: `Salida rápida`,
  short: `S.rápida`
}, {
  id: `retorno-rapido`,
  label: `Retorno rápido`,
  short: `Retorno`
}, {
  id: `mantenimiento`,
  label: `Mantenimiento`,
  short: `Taller`
}, {
  id: `inventario`,
  label: `Inventario`,
  short: `Inv`
}, {
  id: `historial`,
  label: `Historial`,
  short: `Historial`
}, {
  id: `kpis`,
  label: `KPIs`,
  short: `KPIs`
}, {
  id: `equipos`,
  label: `Equipos`,
  short: `Equipos`
}, {
  id: `workspace`,
  label: `Workspace`,
  short: `Cloud`
}];

export var qe = [{
  id: `fresco-0-2`,
  label: `Fresco 0°C a 2°C`
}, {
  id: `congelado-18-22`,
  label: `Congelado -18°C a -22°C`
}, {
  id: `otro`,
  label: `Otro (indicar en observaciones)`
}];

export var Je = [{
  id: `reserva`,
  label: `Reserva`,
  bajo: true
}, {
  id: `1/4`,
  label: `1/4`,
  bajo: true
}, {
  id: `1/2`,
  label: `1/2`,
  bajo: false
}, {
  id: `3/4`,
  label: `3/4`,
  bajo: false
}, {
  id: `lleno`,
  label: `Lleno`,
  bajo: false
}];

export var tt = [`Carrier`, `Thermoking`];

export var st = [`Llantas en buen estado`, `Luces funcionando`, `Espejos completos`, `Sin daños visibles en carrocería`, `Documentación a bordo`];

export var ct = [...st, `Nivel de aceite OK`, `Frenos responden`, `Cabina limpia / sin objetos sueltos`, `Tanque de diésel sin fugas`];

export var lt = [`Puertas cierran correctamente`, `Piso sin daños graves`, `Techo sin perforaciones`, `Sellos / candados en orden`, `Sin humedad o fuga de carga`, `Llantas en buen estado`, `Luces / reflejantes OK`];

export var ut = [`Quinta rueda / enganche OK`, `Llantas en buen estado`, `Luces funcionando`, `Sin daños estructurales`];

export var CAPTURA_TARDIA_MS = 15 * 60 * 1000;

export var F = [{
  id: `espera-carga`,
  label: `Espera de carga / pedido`
}, {
  id: `vacio-pool`,
  label: `Vacío en pool`
}, {
  id: `taller`,
  label: `Taller / fallas`
}, {
  id: `thermo`,
  label: `Thermo / frío`
}, {
  id: `documentos`,
  label: `Documentos / Carta Porte`
}, {
  id: `retencion-cliente`,
  label: `Retención de cliente`
}, {
  id: `drop-sin-ciclo`,
  label: `Drop sin ciclo cerrado`
}, {
  id: `otro`,
  label: `Otro`
}];

export var mn = `patio-control-offline-queue`;
