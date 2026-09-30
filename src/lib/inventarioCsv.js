function csvCelda(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

/** CSV del inventario filtrado. Separador coma, comillas si hace falta. */
export function inventarioCsv(unidades) {
  const headers = ['placa', 'unidad', 'tipo', 'yarda', 'zona', 'slot', 'ubicacion', 'estatus', 'carga', 'cliente', 'folio', 'enganchada']
  const lines = [headers.join(',')]
  for (const item of unidades || []) {
    lines.push(
      [item.placa, item.unidadId, item.tipo, item.yarda, item.zona, item.slot, item.ubicacion, item.estatusOperativo, item.estatusCarga, item.clienteCarga, item.folioCarga, item.enganchadaA]
        .map(csvCelda)
        .join(','),
    )
  }
  return lines.join('\n')
}
