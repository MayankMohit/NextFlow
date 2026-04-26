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

    const isPercentage = timestamp.trim().endsWith('%')

    let offset: string | number

    if (isPercentage) {
      // clamp to 99% max — 100% is out of range and silently ignored by Transloadit
      const pct = Math.min(99, Math.max(0, parseFloat(timestamp)))
      offset = `${pct}%`
    } else {
      // seconds as a number (decimals supported for millisecond precision e.g. 1.25 = 1250ms)
      offset = Math.max(0, parseFloat(timestamp) || 0)
    }

    const params = JSON.stringify({
      auth: { key: transloaditKey },
      steps: {
        ':original': { robot: '/upload/handle' },
        frame: {
          use: ':original',
          robot: '/video/thumbs',
          // do NOT use count here — offsets and count cannot coexist
          offsets: [offset],
          format: 'jpg',
          ffmpeg_stack: 'v6.0.0',
        },
      },
    })

    const videoRes = await fetch(videoUrl)
    if (!videoRes.ok) throw new Error(`Failed to fetch source video: ${videoRes.status}`)
    const videoBlob = await videoRes.blob()

    const formData = new FormData()
    formData.append('params', params)
    formData.append('file', videoBlob, 'video.mp4')

    const res = await fetch('https://api2.transloadit.com/assemblies', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) throw new Error(`Transloadit upload failed: ${res.status}`)
    let assembly = await res.json()
    if (assembly.error) throw new Error(assembly.error)

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

    const frameUrl = assembly.results?.frame?.[0]?.url
    if (!frameUrl) throw new Error('No frame URL returned')

    return { nodeId: payload.nodeId, result: frameUrl }
  },
})