import { task } from '@trigger.dev/sdk/v3'
import { GoogleGenerativeAI } from '@google/generative-ai'

interface LLMPayload {
  nodeId: string
  model: string
  systemPrompt?: string
  userMessage: string
  imageUrls?: string[]
}

export const llmTask = task({
  id: 'llm-task',
  retry: { maxAttempts: 2 },
  run: async (payload: LLMPayload) => {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: payload.model })

    const parts: any[] = []

    if (payload.systemPrompt) {
      parts.push({ text: `System: ${payload.systemPrompt}\n\n` })
    }

    if (payload.imageUrls && payload.imageUrls.length > 0) {
      for (const url of payload.imageUrls) {
        const imageRes = await fetch(url)
        if (!imageRes.ok) throw new Error(`Failed to fetch image for LLM: ${imageRes.status}`)
        const arrayBuffer = await imageRes.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')
        const mimeType = imageRes.headers.get('content-type') ?? 'image/jpeg'
        parts.push({ inlineData: { data: base64, mimeType } })
      }
    }

    // Add user message
    parts.push({ text: payload.userMessage })

    const result = await model.generateContent(parts)
    const text = result.response.text()

    return { nodeId: payload.nodeId, result: text }
  },
})