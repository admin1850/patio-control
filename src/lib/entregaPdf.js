/**
 * PDF de una página con sello, daños, firma y enlaces de fotos.
 * Helvetica solo acepta ASCII; lo demás se simplifica.
 */

function ascii(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/[()\\]/g, ' ')
    .trim()
}

export function lineasEntrega(mov = {}) {
  const fotos = Array.isArray(mov.fotosEvidencia)
    ? mov.fotosEvidencia.map((foto) => foto?.url || foto).filter(Boolean)
    : Array.isArray(mov.fotos) ? mov.fotos.filter(Boolean) : []
  const danos = (mov.checklist || []).filter((item) => item && item.ok === false)
  const lines = [
    'PatioControl - Entrega-recepcion',
    `Tipo: ${mov.tipo || ''}    Placa: ${mov.placa || ''}`,
    `Fecha: ${mov.fechaHora || ''}`,
    `Operador: ${mov.operador || ''}    Chofer: ${mov.chofer || ''}`,
    `Sello: ${mov.selloNumero || 'sin sello'}`,
    `Firma: ${mov.firmaNombre || 'sin nombre'}`,
    mov.firmaUrl ? `Firma URL: ${mov.firmaUrl}` : 'Firma URL: no capturada',
    danos.length ? `Danos marcados: ${danos.map((item) => item.label || item.id).join(', ')}` : 'Danos marcados: ninguno',
    `Fotos: ${fotos.length}`,
  ]
  fotos.slice(0, 12).forEach((url, i) => lines.push(`Foto ${i + 1}: ${url}`))
  return lines.map(ascii).filter(Boolean)
}

export function pdfEntregaBytes(mov) {
  const lines = lineasEntrega(mov)
  let y = 740
  const commands = ['BT', '/F1 11 Tf']
  for (const line of lines) {
    commands.push(`1 0 0 1 48 ${y} Tm (${line.slice(0, 110)}) Tj`)
    y -= 16
    if (y < 48) break
  }
  commands.push('ET')
  const stream = commands.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((obj, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n`
  body += '0000000000 65535 f \n'
  for (let i = 1; i < offsets.length; i++) body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return body
}
