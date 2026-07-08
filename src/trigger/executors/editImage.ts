import sharp from 'sharp'
import type { NodeExecutor } from './types'
import { runWorkersAi } from '@/lib/workersAi'
import { uploadBufferToBlob } from '@/lib/blob'

// flux-2-klein rejects input images larger than 512×512 — downscale to fit
const MAX_INPUT_DIM = 512

export const executeEditImage: NodeExecutor = async ({ node, inputs }) => {
  const data = node.data as Record<string, unknown>

  const imageUrl = typeof inputs.image_url === 'string' ? inputs.image_url : ''
  if (!imageUrl) throw new Error('Connect an image input')

  const connected = typeof inputs.prompt === 'string' ? inputs.prompt.trim() : ''
  const inline = typeof data.prompt === 'string' ? data.prompt.trim() : ''
  const prompt = connected || inline
  if (!prompt) throw new Error('Type an edit prompt or connect a text input')

  const imageRes = await fetch(imageUrl)
  if (!imageRes.ok) throw new Error(`Failed to fetch source image: ${imageRes.status}`)
  const source = Buffer.from(await imageRes.arrayBuffer())
  const small = await sharp(source)
    .resize(MAX_INPUT_DIM, MAX_INPUT_DIM, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer()

  // Multipart contract (verified live): prompt + input_image_0..3 file parts
  const form = new FormData()
  form.append('prompt', prompt)
  form.append('input_image_0', new Blob([new Uint8Array(small)], { type: 'image/jpeg' }), 'input.jpg')

  // The safety filter is stochastic — a benign prompt/image pair can flag on
  // one seed and pass on the next, so give flagged results one more attempt
  const runOnce = () =>
    runWorkersAi<{ image?: string }>('@cf/black-forest-labs/flux-2-klein-4b', form)
  let result: { image?: string }
  try {
    result = await runOnce()
  } catch (err) {
    if (!(err instanceof Error) || !/flagged/i.test(err.message)) throw err
    result = await runOnce()
  }
  if (typeof result.image !== 'string' || result.image.length === 0) {
    throw new Error('The model returned no image — try rewording the prompt')
  }

  return uploadBufferToBlob(
    Buffer.from(result.image, 'base64'),
    `outputs/${node.id}-imageedit.jpg`,
    'image/jpeg',
  )
}
