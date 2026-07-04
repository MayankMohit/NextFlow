import sharp from 'sharp'
import type { NodeExecutor } from './types'
import { runAssembly, transloaditKey } from './transloadit'

function asNumber(...candidates: unknown[]): number | undefined {
  for (const c of candidates) if (typeof c === 'number' && !Number.isNaN(c)) return c
  return undefined
}

export const executeCropImage: NodeExecutor = async ({ node, inputs }) => {
  const data = node.data as Record<string, unknown>
  const imageUrl =
    typeof inputs.image_url === 'string' ? inputs.image_url :
    typeof data.imageUrl === 'string' ? data.imageUrl : ''
  if (!imageUrl) throw new Error('No input image connected')

  const xPercent = asNumber(inputs.x_percent, data.xPercent) ?? 0
  const yPercent = asNumber(inputs.y_percent, data.yPercent) ?? 0
  const widthPercent = asNumber(inputs.width_percent, data.widthPercent) ?? 100
  const heightPercent = asNumber(inputs.height_percent, data.heightPercent) ?? 100

  const imageRes = await fetch(imageUrl)
  if (!imageRes.ok) throw new Error(`Failed to fetch source image: ${imageRes.status}`)
  const buffer = Buffer.from(await imageRes.arrayBuffer())

  const { width: imgW, height: imgH } = await sharp(buffer).metadata()
  if (!imgW || !imgH) throw new Error('Could not read image dimensions')

  const croppedBuffer = await sharp(buffer)
    .extract({
      left: Math.round((xPercent / 100) * imgW),
      top: Math.round((yPercent / 100) * imgH),
      width: Math.round((widthPercent / 100) * imgW),
      height: Math.round((heightPercent / 100) * imgH),
    })
    .toBuffer()

  // Transloadit only hosts the result here — swapped for Vercel Blob in the
  // persistence step, which removes this round-trip entirely.
  const assembly = await runAssembly(
    {
      auth: { key: transloaditKey() },
      steps: { ':original': { robot: '/upload/handle' } },
    },
    { blob: new Blob([new Uint8Array(croppedBuffer)], { type: 'image/jpeg' }), name: 'cropped.jpg' },
  )

  const croppedUrl = assembly.uploads?.[0]?.url
  if (!croppedUrl) throw new Error('No cropped image URL returned')
  return croppedUrl
}
