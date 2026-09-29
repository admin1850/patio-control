/**
 * Brain patio — redactar observaciones de gate (entrada/salida).
 * Solo sugiere texto; NUNCA guarda el movimiento.
 */

export const PATIO_OBS_SYSTEM = `Eres redactor de observaciones de caseta/patio (PatioControl).
Español mexicano, corto, claro, sin emojis.
Escribes SOLO el texto de observaciones para el registro de gate.
No inventes placas, sellos, daños ni números que no vengan en el contexto.
Si el borrador del operador aporta hechos, intégralos.
No digas que eres una IA. No digas "según el contexto".
Máximo ~120 palabras. Párrafo(s) listos para pegar en el campo Observaciones.`

/**
 * @param {{ movement?: object, draft?: string, notes?: string }} ctx
 * @returns {{ system: string, user: string }}
 */
export function buildObservacionesPrompt(ctx = {}) {
  const movement = ctx.movement || {}
  const draft = String(ctx.draft || ctx.notes || '').trim()
  const checklistFail = Array.isArray(movement.checklist)
    ? movement.checklist.filter((i) => i && i.ok === false).map((i) => i.label || i.id)
    : []
  const compact = {
    tipo: movement.tipo || '',
    yardaId: movement.yardaId || '',
    empresaId: movement.empresaId || '',
    placa: movement.placa || '',
    placaCamionTrasera: movement.placaCamionTrasera || '',
    motivoSinPlacaTrasera: movement.motivoSinPlacaTrasera || '',
    economico: movement.numeroEconomico || '',
    chofer: movement.chofer || '',
    operador: movement.operador || '',
    cliente: movement.cliente || '',
    origen: movement.origen || '',
    destino: movement.destino || '',
    sello: movement.selloNumero || '',
    selloEntrada: movement.selloEntrada || '',
    selloCoincide: movement.selloCoincideEntrada,
    condicion: movement.condicionGeneral || '',
    km: movement.kilometros ?? null,
    dieselPct: movement.dieselPorcentaje ?? null,
    checklistFallos: checklistFail,
    llevaRefrigerada: Boolean(movement.llevaRefrigerada),
  }
  const user = [
    'Redacta observaciones de gate con este contexto JSON:',
    JSON.stringify(compact),
    draft ? `Borrador del operador (integra, no borres hechos):\n${draft}` : 'Sin borrador previo.',
    'Responde solo el texto final de observaciones.',
  ].join('\n\n')
  return { system: PATIO_OBS_SYSTEM, user }
}
