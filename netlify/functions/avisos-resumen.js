/** POST /api/avisos/resumen-diario */
import { handler as avisosHandler } from './avisos.js'

export function handler(event, deps) {
  return avisosHandler({ ...event, path: '/api/avisos/resumen-diario' }, deps)
}
