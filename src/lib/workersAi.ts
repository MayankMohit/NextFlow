// Cloudflare Workers AI REST helper. Server-only — imported by Trigger.dev
// executors; CLOUDFLARE_API_TOKEN must never be read from client components.

interface Envelope<T> {
  success: boolean
  errors?: { code?: number; message?: string }[]
  result: T
}

// Cloudflare error bodies embed codes/JSON — translate to a short human message.
function friendlyError(status: number, message: string, model: string): Error {
  if (status === 429 || /quota|neurons?|allocation|limit.{0,20}exceeded/i.test(message)) {
    return new Error('Daily free AI quota reached — resets at 00:00 UTC.')
  }
  // Gated models 403 with a license notice — that's not an auth problem
  if (/model agreement/i.test(message)) {
    return new Error(`${model} needs a one-time license acceptance — run it once with the prompt "agree" to unlock it on your Cloudflare account.`)
  }
  if (/output has been flagged/i.test(message)) {
    return new Error('The safety filter flagged this result — try rewording the prompt or a different image.')
  }
  if (status === 401 || status === 403) {
    return new Error('Cloudflare API token is invalid or unauthorized.')
  }
  if (status === 404) {
    return new Error(`Workers AI model "${model}" was not found.`)
  }
  const brief = message.replace(/\s+/g, ' ').trim()
  return new Error(`Workers AI error: ${brief.length > 160 ? brief.slice(0, 160) + '…' : brief || `HTTP ${status}`}`)
}

async function callWorkersAi(model: string, payload: unknown): Promise<Response> {
  const token = process.env.CLOUDFLARE_API_TOKEN
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!token || !accountId) throw new Error('CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID are not set')

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`
  const init: RequestInit = payload instanceof FormData
    ? { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: payload }
    : {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }

  // Manual retries with backoff — transient 5xx are common (melotts flakes
  // ~50% at times); quota/auth errors won't clear in a second so don't loop those.
  let res = await fetch(url, init)
  for (let attempt = 1; attempt <= 2 && res.status >= 500; attempt++) {
    await new Promise(r => setTimeout(r, 1000 * attempt))
    res = await fetch(url, init)
  }
  return res
}

function envelopeErrorMessage(json: Envelope<unknown> | null, fallback: string): string {
  return json?.errors?.map(e => e.message).filter(Boolean).join('; ') || fallback
}

/** Runs a JSON-in/JSON-out model and returns the unwrapped `result`. */
export async function runWorkersAi<T = Record<string, unknown>>(model: string, payload: unknown): Promise<T> {
  const res = await callWorkersAi(model, payload)
  const text = await res.text()
  let json: Envelope<T> | null = null
  try { json = JSON.parse(text) } catch { /* non-JSON error body — surfaced below */ }
  if (!res.ok || !json?.success) {
    throw friendlyError(res.status, envelopeErrorMessage(json, text), model)
  }
  return json.result
}

// Response headers/docs lie about audio formats (melotts says MP3, ships WAV) —
// trust the file's magic bytes instead.
function sniffAudioType(buf: Buffer, fallback: string): string {
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF') return 'audio/wav'
  if (buf.subarray(0, 3).toString('latin1') === 'ID3') return 'audio/mpeg'
  if (buf.length > 1 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'audio/mpeg'
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return 'audio/mp4'
  if (buf.subarray(0, 4).toString('latin1') === 'OggS') return 'audio/ogg'
  return fallback
}

/**
 * Runs an audio model that may answer with raw bytes OR a JSON envelope
 * carrying base64 audio (melotts is JSON base64 WAV despite its MP3 docs;
 * aura-2 is binary MP3).
 */
export async function runWorkersAiAudio(
  model: string,
  payload: unknown,
): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await callWorkersAi(model, payload)
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'

  if (!contentType.includes('application/json')) {
    if (!res.ok) throw friendlyError(res.status, await res.text(), model)
    const buffer = Buffer.from(await res.arrayBuffer())
    return { buffer, contentType: sniffAudioType(buffer, contentType) }
  }

  const text = await res.text()
  let json: Envelope<unknown> | null = null
  try { json = JSON.parse(text) } catch { /* raw text surfaced below */ }
  if (!res.ok || !json?.success) {
    throw friendlyError(res.status, envelopeErrorMessage(json, text), model)
  }
  const result = json.result as { audio?: string } | string
  const raw = typeof result === 'string' ? result : typeof result?.audio === 'string' ? result.audio : ''
  // Some builds prefix a data URI — strip it before decoding
  const b64 = raw.replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, '')
  if (!b64) throw new Error('The model returned no audio')
  const buffer = Buffer.from(b64, 'base64')
  return { buffer, contentType: sniffAudioType(buffer, 'audio/mpeg') }
}

/** Runs a model that responds with raw bytes on success (e.g. aura-2 MP3). */
export async function runWorkersAiBinary(
  model: string,
  payload: unknown,
): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await callWorkersAi(model, payload)
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
  // Errors always arrive as a JSON envelope, never as media bytes
  if (!res.ok || contentType.includes('application/json')) {
    const text = await res.text()
    let json: Envelope<unknown> | null = null
    try { json = JSON.parse(text) } catch { /* keep raw text */ }
    throw friendlyError(res.status, envelopeErrorMessage(json, text), model)
  }
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType }
}
