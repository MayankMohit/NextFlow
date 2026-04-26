import { task } from '@trigger.dev/sdk/v3'
import sharp from 'sharp'

interface CropPayload {
  nodeId: string
  imageUrl: string
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
  transloaditKey: string
}

export const cropImageTask = task({
  id: 'crop-image-task',
  retry: { maxAttempts: 2 },
  run: async (payload: CropPayload) => {
    const { imageUrl, xPercent, yPercent, widthPercent, heightPercent, transloaditKey } = payload

    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) throw new Error(`Failed to fetch source image: ${imageRes.status}`)
    const buffer = Buffer.from(await imageRes.arrayBuffer())

    const { width: imgW, height: imgH } = await sharp(buffer).metadata()
    if (!imgW || !imgH) throw new Error('Could not read image dimensions')

    const x = Math.round((xPercent / 100) * imgW)
    const y = Math.round((yPercent / 100) * imgH)
    const w = Math.round((widthPercent / 100) * imgW)
    const h = Math.round((heightPercent / 100) * imgH)

    // Crop with sharp, then upload result to Transloadit for hosting
    const croppedBuffer = await sharp(buffer)
      .extract({ left: x, top: y, width: w, height: h })
      .toBuffer()

    const params = JSON.stringify({
      auth: { key: transloaditKey },
      steps: {
        ':original': { robot: '/upload/handle' },
      },
    })

    const formData = new FormData()
    formData.append('params', params)
    formData.append('file', new Blob([new Uint8Array(croppedBuffer)], { type: 'image/jpeg' }), 'cropped.jpg')

    const res = await fetch('https://api2.transloadit.com/assemblies', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) throw new Error(`Transloadit upload failed: ${res.status}`)
    let assembly = await res.json()
    if (assembly.error) throw new Error(assembly.error)

    // Poll until complete
    while (assembly.ok !== 'ASSEMBLY_COMPLETED') {
      await new Promise((r) => setTimeout(r, 1500))
      const poll = await fetch(`https://api2.transloadit.com/assemblies/${assembly.assembly_id}`)
      if (!poll.ok) throw new Error(`Transloadit poll failed: ${poll.status}`)
      assembly = await poll.json()
      if (assembly.error) throw new Error(assembly.error)
      if (assembly.ok === 'ASSEMBLY_ERROR' || assembly.ok === 'REQUEST_ABORTED') {
        throw new Error(`Transloadit assembly failed: ${assembly.ok}`)
      }
    }

    const croppedUrl = assembly.uploads?.[0]?.url
    if (!croppedUrl) throw new Error('No cropped image URL returned')

    return { nodeId: payload.nodeId, result: croppedUrl }
  },
})