import type { NodeExecutor } from './types'
import { runAssembly, transloaditKey } from './transloadit'
import { copyUrlToBlob } from '@/lib/blob'

export const executeExtractFrame: NodeExecutor = async ({ node, inputs }) => {
  const data = node.data as Record<string, unknown>
  const videoUrl =
    typeof inputs.video_url === 'string' ? inputs.video_url :
    typeof data.videoUrl === 'string' ? data.videoUrl : ''
  if (!videoUrl) throw new Error('No input video connected')

  const timestamp =
    typeof inputs.timestamp === 'string' ? inputs.timestamp :
    typeof data.timestamp === 'string' ? data.timestamp : '0'

  let offset: string | number
  if (timestamp.trim().endsWith('%')) {
    // clamp to 99% max — 100% is out of range and silently ignored by Transloadit
    offset = `${Math.min(99, Math.max(0, parseFloat(timestamp)))}%`
  } else {
    // seconds as a number (decimals supported for millisecond precision e.g. 1.25 = 1250ms)
    offset = Math.max(0, parseFloat(timestamp) || 0)
  }

  // /http/import lets Transloadit pull the video itself — the old flow
  // downloaded the whole video into the task and re-uploaded it.
  const assembly = await runAssembly({
    auth: { key: transloaditKey() },
    steps: {
      imported: { robot: '/http/import', url: videoUrl },
      frame: {
        use: 'imported',
        robot: '/video/thumbs',
        // do NOT use count here — offsets and count cannot coexist
        offsets: [offset],
        format: 'jpg',
        ffmpeg_stack: 'v6.0.0',
      },
    },
  })

  const frameUrl = assembly.results?.frame?.[0]?.url
  if (!frameUrl) throw new Error('No frame URL returned')

  // Transloadit result URLs expire — copy the frame to permanent storage
  return copyUrlToBlob(frameUrl, `outputs/${node.id}-frame.jpg`)
}
