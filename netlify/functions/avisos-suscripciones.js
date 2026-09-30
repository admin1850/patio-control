/** POST /api/avisos/suscripciones */
import { handler as avisosHandler } from './avisos.js'

export function handler(event, deps) {
  return avisosHandler({ ...event, path: '/api/avisos/suscripciones' }, deps)
}
