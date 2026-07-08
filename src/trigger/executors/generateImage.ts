import type { NodeExecutor } from './types'
import { runWorkersAi } from '@/lib/workersAi'
import { uploadBufferToBlob } from '@/lib/blob'

export const executeGenerateImage: NodeExecutor = async ({ node, inputs }) => {
  const data = node.data as Record<string, unknown>
  const connected = typeof inputs.prompt === 'string' ? inputs.prompt.trim() : ''
  const inline = typeof data.prompt === 'string' ? data.prompt.trim() : ''
  const prompt = connected || inline
  if (!prompt) throw new Error('Type a prompt or connect a text input')

  const steps = typeof data.steps === 'number'
    ? Math.min(8, Math.max(1, Math.round(data.steps)))
    : 4

  const result = await runWorkersAi<{ image?: string }>(
    '@cf/black-forest-labs/flux-1-schnell',
    { prompt, steps },
  )
  if (typeof result.image !== 'string' || result.image.length === 0) {
    throw new Error('The model returned no image — try rewording the prompt')
  }

  return uploadBufferToBlob(
    Buffer.from(result.image, 'base64'),
    `outputs/${node.id}-imagegen.jpg`,
    'image/jpeg',
  )
}
