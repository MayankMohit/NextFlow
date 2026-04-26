import { task } from '@trigger.dev/sdk/v3'
import { llmTask } from './llmTask'
import { cropImageTask } from './cropImageTask'
import { extractFrameTask } from './extractFrameTask'
import { topologicalSort, resolveInputs } from '@/lib/dagExecutor'
import type { Node, Edge } from '@xyflow/react'

interface OrchestratorPayload {
  nodes: Node[]
  edges: Edge[]
  scope: 'full' | 'partial' | 'single'
  selectedNodeIds?: string[]
}

export interface NodeRunResult {
  nodeId: string
  nodeType: string
  status: 'success' | 'failed'
  result?: unknown
  error?: string
  duration: number
}

export const orchestratorTask = task({
  id: 'orchestrator-task',
  maxDuration: 300,
  run: async (payload: OrchestratorPayload) => {
    const { nodes, edges, scope, selectedNodeIds } = payload

    const targetNodes = scope === 'full'
      ? nodes
      : nodes.filter((n) => selectedNodeIds?.includes(n.id))

    const layers = topologicalSort(targetNodes, edges)
    const nodeOutputs = new Map<string, unknown>()
    const nodeRunResults: NodeRunResult[] = []

    // Pre-populate non-executable nodes
    for (const node of targetNodes) {
      if (node.type === 'textNode') nodeOutputs.set(node.id, node.data.text)
      if (node.type === 'uploadImageNode') nodeOutputs.set(node.id, node.data.imageUrl)
      if (node.type === 'uploadVideoNode') nodeOutputs.set(node.id, node.data.videoUrl)
    }

    for (const layer of layers) {
      await Promise.all(layer.map(async (node) => {
        if (['textNode', 'uploadImageNode', 'uploadVideoNode'].includes(node.type!)) return

        const startTime = Date.now()
        const inputs = resolveInputs(node, edges, nodeOutputs)
        let result: unknown

        try {
          if (node.type === 'llmNode') {
            const imageHandles = edges
              .filter((e) => e.target === node.id && e.targetHandle === 'images')
              .map((e) => nodeOutputs.get(e.source))
              .filter((v): v is string => typeof v === 'string')

            const taskResult = await llmTask.triggerAndWait({
              nodeId: node.id,
              model: typeof node.data.model === 'string' ? node.data.model : 'gemini-2.0-flash',
              systemPrompt: typeof inputs['system_prompt'] === 'string' ? inputs['system_prompt'] : undefined,
              userMessage: typeof inputs['user_message'] === 'string' ? inputs['user_message'] : '',
              imageUrls: imageHandles,
            })
            if (!taskResult.ok) throw new Error('LLM task failed')
            result = taskResult.output?.result

          } else if (node.type === 'cropImageNode') {
            const taskResult = await cropImageTask.triggerAndWait({
              nodeId: node.id,
              imageUrl: (typeof inputs['image_url'] === 'string' ? inputs['image_url'] : typeof node.data.imageUrl === 'string' ? node.data.imageUrl : ''),
              xPercent: (typeof inputs['x_percent'] === 'number' ? inputs['x_percent'] : typeof node.data.xPercent === 'number' ? node.data.xPercent : 0),
              yPercent: (typeof inputs['y_percent'] === 'number' ? inputs['y_percent'] : typeof node.data.yPercent === 'number' ? node.data.yPercent : 0),
              widthPercent: (typeof inputs['width_percent'] === 'number' ? inputs['width_percent'] : typeof node.data.widthPercent === 'number' ? node.data.widthPercent : 100),
              heightPercent: (typeof inputs['height_percent'] === 'number' ? inputs['height_percent'] : typeof node.data.heightPercent === 'number' ? node.data.heightPercent : 100),
              transloaditKey: process.env.NEXT_PUBLIC_TRANSLOADIT_KEY ?? '',
            })
            if (!taskResult.ok) throw new Error('Crop task failed')
            result = taskResult.output?.result

          } else if (node.type === 'extractFrameNode') {
            const taskResult = await extractFrameTask.triggerAndWait({
              nodeId: node.id,
              videoUrl: (typeof inputs['video_url'] === 'string' ? inputs['video_url'] : typeof node.data.videoUrl === 'string' ? node.data.videoUrl : ''),
              timestamp: (typeof inputs['timestamp'] === 'string' ? inputs['timestamp'] : typeof node.data.timestamp === 'string' ? node.data.timestamp : '0'),
              transloaditKey: process.env.NEXT_PUBLIC_TRANSLOADIT_KEY ?? '',
            })
            if (!taskResult.ok) throw new Error('Extract frame task failed')
            result = taskResult.output?.result
          }

          nodeOutputs.set(node.id, result)
          nodeRunResults.push({
            nodeId: node.id,
            nodeType: node.type ?? 'unknown',
            status: 'success',
            result,
            duration: (Date.now() - startTime) / 1000,
          })

        } catch (err: unknown) {
          nodeRunResults.push({
            nodeId: node.id,
            nodeType: node.type ?? 'unknown',
            status: 'failed',
            error: err instanceof Error ? err.message : 'Unknown error',
            duration: (Date.now() - startTime) / 1000,
          })
        }
      }))
    }

    return {
      nodeOutputs: Object.fromEntries(nodeOutputs),
      nodeRunResults,
      overallStatus: nodeRunResults.some(r => r.status === 'failed') ? 'partial' : 'success',
    }
  },
})