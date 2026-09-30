/** POST /api/preventivo/planes */
import { handler as preventivoHandler } from './preventivo.js'

export function handler(event, deps) {
  return preventivoHandler({ ...event, path: '/api/preventivo/planes' }, deps)
}
