import { task } from '@trigger.dev/sdk/v3'

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

    const params = JSON.stringify({
      auth: { key: transloaditKey },
      steps: {
        ':original': {
          robot: '/upload/handle',
        },
        cropped: {
          use: ':original',
          robot: '/image/resize',
          crop_x: `${xPercent}p`,
          crop_y: `${yPercent}p`,
          crop_w: `${widthPercent}p`,
          crop_h: `${heightPercent}p`,
          imagemagick_stack: 'v3.0.0',
        },
      },
    })

    // Fetch the source image and re-upload via Transloadit with crop step
    const imageRes = await fetch(imageUrl)
    const imageBlob = await imageRes.blob()

    const formData = new FormData()
    formData.append('params', params)
    formData.append('file', imageBlob, 'image.jpg')

    const res = await fetch('https://api2.transloadit.com/assemblies', {
      method: 'POST',
      body: formData,
    })

    let assembly = await res.json()
    if (assembly.error) throw new Error(assembly.error)

    // Poll until complete
    while (assembly.ok !== 'ASSEMBLY_COMPLETED') {
      await new Promise((r) => setTimeout(r, 1500))
      const poll = await fetch(`https://api2.transloadit.com/assemblies/${assembly.assembly_id}`)
      assembly = await poll.json()
      if (assembly.error) throw new Error(assembly.error)
    }

    const croppedUrl = assembly.results?.cropped?.[0]?.url
    if (!croppedUrl) throw new Error('No cropped image URL returned')

    return { nodeId: payload.nodeId, result: croppedUrl }
  },
})