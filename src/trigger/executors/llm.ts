import { GoogleGenerativeAI, type Part } from '@google/generative-ai'
import type { NodeExecutor } from './types'

async function fetchImagePart(url: string): Promise<Part> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image for LLM: ${res.status}`)
  const base64 = Buffer.from(await res.arrayBuffer()).toString('base64')
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg'
  return { inlineData: { data: base64, mimeType } }
}

export const executeLLM: NodeExecutor = async ({ node, inputs, imageUrls }) => {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

  const data = node.data as Record<string, unknown>
  const modelName = typeof data.model === 'string' ? data.model : 'gemini-2.0-flash'
  const systemPrompt = typeof inputs.system_prompt === 'string' ? inputs.system_prompt : undefined
  const userMessage = typeof inputs.user_message === 'string' ? inputs.user_message : ''

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: modelName })

  const parts: Part[] = []
  if (systemPrompt) parts.push({ text: `System: ${systemPrompt}\n\n` })
  parts.push(...(await Promise.all(imageUrls.map(fetchImagePart))))
  parts.push({ text: userMessage })

  // One manual retry — transient Gemini errors (rate limits, 5xx) are common
  try {
    const result = await model.generateContent(parts)
    return result.response.text()
  } catch {
    await new Promise(r => setTimeout(r, 1000))
    const result = await model.generateContent(parts)
    return result.response.text()
  }
}
