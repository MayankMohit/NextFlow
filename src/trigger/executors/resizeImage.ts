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
  const fit = typeof data.fit === 'string' && FITS.has(data.fit)
    ? (data.fit as 'cover' | 'contain' | 'fill' | 'inside' | 'outside')
    : 'cover'

  // Optional upper file-size bound (maxSize in the unit the user picked)
  const maxSize = typeof data.maxSize === 'number' && data.maxSize > 0 ? data.maxSize : undefined
  const maxSizeUnit = data.maxSizeUnit === 'MB' ? 'MB' : 'KB'
  const maxBytes = maxSize
    ? Math.round(maxSize * (maxSizeUnit === 'MB' ? 1024 * 1024 : 1024))
    : undefined

  if (!width && !height && !maxBytes) {
    throw new Error('Set a width, height, or max file size')
  }

  const imageRes = await fetch(imageUrl)
  if (!imageRes.ok) throw new Error(`Failed to fetch source image: ${imageRes.status}`)
  const buffer = Buffer.from(await imageRes.arrayBuffer())
  const sourceWidth = (await sharp(buffer).metadata()).width ?? undefined

  // Re-encodes from the original each time so quality/scale steps don't compound
  const render = (quality: number, scale = 1) => {
    let pipeline = sharp(buffer)
    if (width || height) {
      pipeline = pipeline.resize({
        width: width ? Math.max(1, Math.round(width * scale)) : undefined,
        height: height ? Math.max(1, Math.round(height * scale)) : undefined,
        fit,
      })
    } else if (scale < 1 && sourceWidth) {
      pipeline = pipeline.resize({ width: Math.max(1, Math.round(sourceWidth * scale)) })
    }
    return pipeline.jpeg({ quality }).toBuffer()
  }

  let out = await render(90)

  if (maxBytes && out.length > maxBytes) {
    // 1. Step JPEG quality down — cheapest way to shrink
    for (const quality of [80, 70, 60, 50, 40, 30]) {
      out = await render(quality)
      if (out.length <= maxBytes) break
    }
    // 2. Still over — shrink dimensions proportionally at a sane quality
    let scale = 1
    for (let i = 0; out.length > maxBytes && i < 8; i++) {
      // Bytes scale ~linearly with pixel count; undershoot slightly (×0.9)
      scale *= Math.min(0.9, Math.max(0.5, Math.sqrt(maxBytes / out.length) * 0.9))
      out = await render(60, scale)
    }
    if (out.length > maxBytes) {
      throw new Error(`Could not compress the image under ${maxSize} ${maxSizeUnit}`)
    }
  }

  return uploadBufferToBlob(out, `outputs/${node.id}-resized.jpg`, 'image/jpeg')
}
