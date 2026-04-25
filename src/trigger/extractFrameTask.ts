import { task } from '@trigger.dev/sdk/v3'

interface ExtractFramePayload {
  nodeId: string
  videoUrl: string
  timestamp: string
  transloaditKey: string
}

export const extractFrameTask = task({
  id: 'extract-frame-task',
  retry: { maxAttempts: 2 },
  run: async (payload: ExtractFramePayload) => {
    const { videoUrl, timestamp, transloaditKey } = payload

    // Handle percentage vs seconds
    const offsetSeconds = timestamp.endsWith('%')
      ? null
      : parseFloat(timestamp) || 0

    const ffmpegStack: Record<string, any> = {
      use: ':original',
      robot: '/video/thumbs',
      count: 1,
      format: 'jpg',
      imagemagick_stack: 'v3.0.0',
    }

    if (offsetSeconds !== null) {
      ffmpegStack.offset_seconds = offsetSeconds
    } else {
      // percentage — e.g. "50%" → position: 0.5
      ffmpegStack.position = parseFloat(timestamp) / 100
    }

    const params = JSON.stringify({
      auth: { key: transloaditKey },
      steps: {
        ':original': { robot: '/upload/handle' },
        frame: ffmpegStack,
      },
    })

    const videoRes = await fetch(videoUrl)
    const videoBlob = await videoRes.blob()

    const formData = new FormData()
    formData.append('params', params)
    formData.append('file', videoBlob, 'video.mp4')

    const res = await fetch('https://api2.transloadit.com/assemblies', {
      method: 'POST',
      body: formData,
    })

    let assembly = await res.json()
    if (assembly.error) throw new Error(assembly.error)

    while (assembly.ok !== 'ASSEMBLY_COMPLETED') {
      await new Promise((r) => setTimeout(r, 1500))
      const poll = await fetch(`https://api2.transloadit.com/assemblies/${assembly.assembly_id}`)
      assembly = await poll.json()
      if (assembly.error) throw new Error(assembly.error)
    }

    const frameUrl = assembly.results?.frame?.[0]?.url
    if (!frameUrl) throw new Error('No frame URL returned')

    return { nodeId: payload.nodeId, result: frameUrl }
  },
})