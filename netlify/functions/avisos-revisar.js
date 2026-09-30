/** POST /api/avisos/revisar-etr */
import { handler as avisosHandler } from './avisos.js'

export function handler(event, deps) {
  return avisosHandler({ ...event, path: '/api/avisos/revisar-etr' }, deps)
}
