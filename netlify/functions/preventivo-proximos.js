/** GET /api/preventivo/proximos — la ruta canónica llega aunque Netlify reescriba el path. */
import { handler as preventivoHandler } from './preventivo.js'

export function handler(event, deps) {
  return preventivoHandler({ ...event, path: '/api/preventivo/proximos' }, deps)
}
