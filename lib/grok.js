/**
 * Cliente mínimo xAI (Grok) — Responses API.
 * Env: XAI_API_KEY | GROK_API_KEY ; opcional XAI_MODEL
 */

const XAI_URL = 'https://api.x.ai/v1/responses'
const DEFAULT_MODEL = 'grok-4-fast-non-reasoning'

export function getXaiApiKey() {
  return process.env.XAI_API_KEY || process.env.GROK_API_KEY || ''
}

export function getXaiModel() {
  return process.env.XAI_MODEL || process.env.GROK_MODEL || DEFAULT_MODEL
}

/** Extrae texto usable de /v1/responses (o chat/completions legacy). */
export function extractOutputText(payload) {
  if (!payload || typeof payload !== 'object') return ''
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim()
  }
  const parts = []
  for (const item of payload.output || []) {
    if (item?.type === 'message') {
      for (const c of item.content || []) {
        if (c?.type === 'output_text' && c.text) parts.push(c.text)
        else if (typeof c?.text === 'string') parts.push(c.text)
      }
    }
    if (typeof item?.text === 'string') parts.push(item.text)
  }
  if (parts.length) return parts.join('\n').trim()
  const choice = payload.choices?.[0]?.message?.content
  if (typeof choice === 'string') return choice.trim()
  return ''
}

/**
 * @param {{ input: any, store?: boolean, model?: string }} opts
 */
export async function callXai({ input, store = false, model } = {}) {
  const apiKey = getXaiApiKey()
  if (!apiKey) {
    const err = new Error('XAI_API_KEY no configurada')
    err.code = 'NO_KEY'
    throw err
  }
  const res = await fetch(XAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || getXaiModel(),
      store,
      input,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(json?.error?.message || json?.error || `xAI HTTP ${res.status}`)
    err.status = res.status
    err.payload = json
    throw err
  }
  return json
}
