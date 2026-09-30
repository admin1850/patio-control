/** POST /api/preventivo/ot */
import { handler as preventivoHandler } from './preventivo.js'

export function handler(event, deps) {
  return preventivoHandler({ ...event, path: '/api/preventivo/ot' }, deps)
}
