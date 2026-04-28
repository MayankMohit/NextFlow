import { task } from '@trigger.dev/sdk/v3'
import { llmTask } from './llmTask'
import { cropImageTask } from './cropImageTask'
import { extractFrameTask } from './extractFrameTask'

export interface NodeExecutorPayload {
  nodeId: string
  nodeType: 'llmNode' | 'cropImageNode' | 'extractFrameNode'
  // llm
  model?: string
  systemPrompt?: string
  userMessage?: string
  imageUrls?: string[]
  // crop
  imageUrl?: string
  xPercent?: number
  yPercent?: number
  widthPercent?: number
  heightPercent?: number
  // extract frame
  videoUrl?: string
  timestamp?: string
  // shared
  transloaditKey?: string
}

export const nodeExecutorTask = task({
  id: 'node-executor-task',
  run: async (payload: NodeExecutorPayload) => {
    const { nodeId, nodeType } = payload

    if (nodeType === 'llmNode') {
      const res = await llmTask.triggerAndWait({
        nodeId,
        model: payload.model ?? 'gemini-2.0-flash',
        systemPrompt: payload.systemPrompt,
        userMessage: payload.userMessage ?? '',
        imageUrls: payload.imageUrls,
      })
      if (!res.ok) throw new Error(typeof res.error === 'string' ? res.error : 'LLM task failed')
      return { nodeId, result: res.output?.result }
      
    }

    if (nodeType === 'cropImageNode') {
      const res = await cropImageTask.triggerAndWait({
        nodeId,
        imageUrl: payload.imageUrl ?? '',
        xPercent: payload.xPercent ?? 0,
        yPercent: payload.yPercent ?? 0,
        widthPercent: payload.widthPercent ?? 100,
        heightPercent: payload.heightPercent ?? 100,
        transloaditKey: payload.transloaditKey ?? '',
      })
      if (!res.ok) throw new Error(typeof res.error === 'string' ? res.error : 'Crop task failed')
      return { nodeId, result: res.output?.result }
    }

    if (nodeType === 'extractFrameNode') {
      const res = await extractFrameTask.triggerAndWait({
        nodeId,
        videoUrl: payload.videoUrl ?? '',
        timestamp: payload.timestamp ?? '0',
        transloaditKey: payload.transloaditKey ?? '',
      })
      if (!res.ok) throw new Error(typeof res.error === 'string' ? res.error : 'Extract frame task failed')
      return { nodeId, result: res.output?.result }
    }

    throw new Error(`Unknown node type: ${nodeType}`)
  },
})
