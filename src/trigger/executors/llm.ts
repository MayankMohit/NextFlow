import { GoogleGenerativeAI, type Part } from '@google/generative-ai'
import type { NodeExecutor } from './types'
import { runWorkersAi } from '@/lib/workersAi'

// Gemini SDK errors embed the full API JSON in the message — unreadable on a node.
// Translate to a short human message instead.
function friendlyGeminiError(err: unknown, modelName: string): Error {
  const raw = err instanceof Error ? err.message : String(err)
  if (/429|quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(raw)) {
    return new Error(`${modelName}: free-tier quota reached. Try another model or wait — limits reset daily.`)
  }
  if (/API.?key|401|403|PERMISSION_DENIED|UNAUTHENTICATED/i.test(raw)) {
    return new Error('Gemini API key is invalid or unauthorized.')
  }
  if (/404|not.?found/i.test(raw)) {
    return new Error(`Model "${modelName}" was not found or is unavailable.`)
  }
  if (/5\d\d|overloaded|UNAVAILABLE|INTERNAL/i.test(raw)) {
    return new Error(`Gemini is overloaded or unavailable right now — try again in a moment.`)
  }
  const brief = raw.replace(/\s+/g, ' ').trim()
  return new Error(`Gemini error: ${brief.length > 160 ? brief.slice(0, 160) + '…' : brief}`)
}

function isQuotaError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err)
  return /429|quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(raw)
}

// Gemini's inline request cap is 20 MB and base64 inflates ~33% — guard well below it
const MAX_INLINE_BYTES = 14 * 1024 * 1024

async function fetchMediaPart(url: string, kind: 'image' | 'video' | 'audio', fallbackMime: string): Promise<Part> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch the connected ${kind}: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength > MAX_INLINE_BYTES) {
    throw new Error(`The connected ${kind} is too large for the LLM — keep it under ~14 MB.`)
  }
  const mimeType = res.headers.get('content-type') ?? fallbackMime
  return { inlineData: { data: buf.toString('base64'), mimeType } }
}

// --- Workers AI (llama) provider ---------------------------------------------

const WORKERS_VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct'
const WORKERS_DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8-fast'

type WorkersContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

// The vision model only accepts images as data URIs inside message content
// parts (verified against /ai/models/schema — plain HTTP URLs are rejected)
async function fetchImageDataUri(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch the connected image: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength > MAX_INLINE_BYTES) {
    throw new Error('The connected image is too large for the LLM — keep it under ~14 MB.')
  }
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg'
  return `data:${mimeType};base64,${buf.toString('base64')}`
}

// One vision call per image — used when a node has several images connected,
// because the vision model rejects requests carrying more than one.
async function captionImage(dataUri: string): Promise<string> {
  const result = await runWorkersAi<{ response?: string }>(WORKERS_VISION_MODEL, {
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUri } },
        { type: 'text', text: 'Describe this image in detail in 2-3 sentences.' },
      ] satisfies WorkersContentPart[],
    }],
  })
  if (typeof result.response !== 'string') throw new Error('The model returned no text')
  return result.response
}

async function executeWorkersLLM(
  data: Record<string, unknown>,
  inputs: Record<string, unknown>,
  imageUrls: string[],
): Promise<string> {
  if (typeof inputs.video === 'string' || typeof inputs.audio === 'string') {
    throw new Error('Workers AI models accept text and images only — switch the provider to Gemini for video/audio.')
  }

  const systemPrompt = typeof inputs.system_prompt === 'string' ? inputs.system_prompt : ''
  const userMessage = typeof inputs.user_message === 'string' ? inputs.user_message : ''
  if (!userMessage.trim() && !systemPrompt.trim() && imageUrls.length === 0) {
    throw new Error('Type or connect a user message')
  }

  // Only the vision model can take images — switch automatically when one
  // is connected so the run never fails on a model mismatch.
  let model = typeof data.model === 'string' && data.model.startsWith('@cf/')
    ? data.model
    : WORKERS_DEFAULT_MODEL

  const messages: { role: string; content: string | WorkersContentPart[] }[] = []
  if (systemPrompt.trim()) messages.push({ role: 'system', content: systemPrompt })
  if (imageUrls.length === 1) {
    model = WORKERS_VISION_MODEL
    const parts: WorkersContentPart[] = [
      { type: 'image_url', image_url: { url: await fetchImageDataUri(imageUrls[0]) } },
    ]
    if (userMessage.trim()) parts.push({ type: 'text', text: userMessage })
    messages.push({ role: 'user', content: parts })
  } else if (imageUrls.length > 1) {
    // The vision model accepts exactly ONE image per request (two or more →
    // opaque 400, verified live). Caption each image separately, then answer
    // over the captions with the selected text model.
    const captions = await Promise.all(imageUrls.map(async (u, i) => {
      const caption = await captionImage(await fetchImageDataUri(u))
      return `Image ${i + 1}: ${caption.trim()}`
    }))
    messages.push({
      role: 'user',
      content: `${captions.join('\n')}\n\n${userMessage.trim() || 'Respond based on the images described above.'}`,
    })
  } else {
    messages.push({ role: 'user', content: userMessage })
  }

  // runWorkersAi already retries once on 5xx and translates quota/auth errors
  const result = await runWorkersAi<{ response?: string }>(model, { messages })
  if (typeof result.response !== 'string') throw new Error('The model returned no text')
  return result.response
}

export const executeLLM: NodeExecutor = async ({ node, inputs, imageUrls }) => {
  const data = node.data as Record<string, unknown>
  // Saved nodes from before the provider field default to Gemini
  if (data.provider === 'workers') return executeWorkersLLM(data, inputs, imageUrls)

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
  const modelName = typeof data.model === 'string' ? data.model : 'gemini-3.1-flash-lite'
  const systemPrompt = typeof inputs.system_prompt === 'string' ? inputs.system_prompt : undefined
  const userMessage = typeof inputs.user_message === 'string' ? inputs.user_message : ''
  const videoUrl = typeof inputs.video === 'string' ? inputs.video : undefined
  const audioUrl = typeof inputs.audio === 'string' ? inputs.audio : undefined

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: modelName })

  const parts: Part[] = []
  if (systemPrompt) parts.push({ text: `System: ${systemPrompt}\n\n` })
  parts.push(...(await Promise.all([
    ...imageUrls.map(u => fetchMediaPart(u, 'image', 'image/jpeg')),
    ...(videoUrl ? [fetchMediaPart(videoUrl, 'video', 'video/mp4')] : []),
    ...(audioUrl ? [fetchMediaPart(audioUrl, 'audio', 'audio/mpeg')] : []),
  ])))
  parts.push({ text: userMessage })

  // One manual retry — transient Gemini errors (5xx) are common. Quota errors
  // won't clear in a second, so fail fast on those.
  try {
    const result = await model.generateContent(parts)
    return result.response.text()
  } catch (firstErr) {
    if (isQuotaError(firstErr)) throw friendlyGeminiError(firstErr, modelName)
    await new Promise(r => setTimeout(r, 1000))
    try {
      const result = await model.generateContent(parts)
      return result.response.text()
    } catch (secondErr) {
      throw friendlyGeminiError(secondErr, modelName)
    }
  }
}
