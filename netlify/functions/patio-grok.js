import { handlePatioGrok } from '../../lib/patioGrokHandler.js'

export async function handler(event) {
  return handlePatioGrok(event)
}
