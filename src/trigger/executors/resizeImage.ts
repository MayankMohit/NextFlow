import sharp from 'sharp'
import type { NodeExecutor } from './types'
import { uploadBufferToBlob } from '@/lib/blob'

const FITS = new Set(['cover', 'contain', 'fill', 'inside', 'outside'])

export const executeResizeImage: NodeExecutor = async ({ node, inputs }) => {
  const data = node.data as Record<string, unknown>
  const imageUrl =
    typeof inputs.image_url === 'string' ? inputs.image_url :
    typeof data.imageUrl === 'string' ? data.imageUrl : ''
  if (!imageUrl) throw new Error('No input image connected')

  const width = typeof data.width === 'number' && data.width > 0 ? Math.round(data.width) : undefined
  const height = typeof data.height === 'number' && data.height > 0 ? Math.round(data.height) : undefined
  if (!width && !height) throw new Error('Set a width or height to resize to')
  const fit = typeof data.fit === 'string' && FITS.has(data.fit)
    ? (data.fit as 'cover' | 'contain' | 'fill' | 'inside' | 'outside')
    : 'cover'

  const imageRes = await fetch(imageUrl)
  if (!imageRes.ok) throw new Error(`Failed to fetch source image: ${imageRes.status}`)
  const buffer = Buffer.from(await imageRes.arrayBuffer())

  const resizedBuffer = await sharp(buffer)
    .resize({ width, height, fit })
    .jpeg({ quality: 90 })
    .toBuffer()

  return uploadBufferToBlob(resizedBuffer, `outputs/${node.id}-resized.jpg`, 'image/jpeg')
}
