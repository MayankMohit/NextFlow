import type { NodeExecutor } from './types'
import { runWorkersAi } from '@/lib/workersAi'

// Whisper takes the audio as base64 inside a JSON body — keep the raw file
// well under the API's request ceiling.
const MAX_AUDIO_BYTES = 20 * 1024 * 1024

export const executeTranscribe: NodeExecutor = async ({ node, inputs }) => {
  const data = node.data as Record<string, unknown>

  const audioUrl = typeof inputs.audio_url === 'string' ? inputs.audio_url : ''
  if (!audioUrl) throw new Error('Connect an audio input')

  const res = await fetch(audioUrl)
  if (!res.ok) throw new Error(`Failed to fetch the audio file: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength > MAX_AUDIO_BYTES) {
    throw new Error('The audio file is too large to transcribe — keep it under ~20 MB.')
  }

  const language = typeof data.language === 'string' && data.language.trim()
    ? data.language.trim()
    : undefined

  const result = await runWorkersAi<{ text?: string }>('@cf/openai/whisper-large-v3-turbo', {
    audio: buf.toString('base64'),
    task: 'transcribe',
    ...(language ? { language } : {}),
  })
  if (typeof result.text !== 'string') {
    throw new Error('The model returned no transcription')
  }
  return result.text.trim()
}
