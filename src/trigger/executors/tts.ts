import type { NodeExecutor } from './types'
import { runWorkersAiAudio } from '@/lib/workersAi'
import { uploadBufferToBlob } from '@/lib/blob'

// aura-2 burns ~2727 neurons per 1k chars (10k/day budget); melotts is cheap
// but long texts still time out — cap both at a sane length.
const MAX_TTS_CHARS = 4000

export const executeTTS: NodeExecutor = async ({ node, inputs }) => {
  const data = node.data as Record<string, unknown>

  const connected = typeof inputs.tts_text === 'string' ? inputs.tts_text.trim() : ''
  const inline = typeof data.text === 'string' ? data.text.trim() : ''
  const text = connected || inline
  if (!text) throw new Error('Type some text or connect a text input')
  if (text.length > MAX_TTS_CHARS) {
    throw new Error(`The text is too long for TTS — keep it under ${MAX_TTS_CHARS} characters.`)
  }

  const useAura = data.model === 'aura-2-en'
  const { buffer, contentType } = useAura
    ? await runWorkersAiAudio('@cf/deepgram/aura-2-en', {
        text,
        speaker: typeof data.speaker === 'string' && data.speaker ? data.speaker : 'luna',
        encoding: 'mp3',
      })
    : await runWorkersAiAudio('@cf/myshell-ai/melotts', {
        prompt: text,
        lang: typeof data.lang === 'string' && data.lang ? data.lang : 'en',
      })

  // melotts ships WAV despite its MP3 docs — extension must match the real bytes
  const ext = contentType === 'audio/wav' ? 'wav' : contentType === 'audio/ogg' ? 'ogg' : 'mp3'
  return uploadBufferToBlob(buffer, `outputs/${node.id}-tts.${ext}`, contentType)
}
