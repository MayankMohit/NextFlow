import { task } from '@trigger.dev/sdk/v3'
import { nodeExecutorTask, type NodeExecutorPayload } from './nodeExecutorTask'
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

const PASSTHROUGH_TYPES = ['textNode', 'uploadImageNode', 'uploadVideoNode']

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

    // Initialize outputs from the full graph so upstream data is available
    // when running a subset of nodes. Passthrough nodes read from node.data
    // directly; non-passthrough nodes use lastOutput (set by the client after
    // each layer completes) so crop/extract-frame results carry forward.
    for (const node of nodes) {
      if (node.type === 'textNode') nodeOutputs.set(node.id, node.data.text)
      else if (node.type === 'uploadImageNode') nodeOutputs.set(node.id, node.data.imageUrl)
      else if (node.type === 'uploadVideoNode') nodeOutputs.set(node.id, node.data.videoUrl)
      else if (node.data.lastOutput != null) nodeOutputs.set(node.id, node.data.lastOutput)
    }

    for (const layer of layers) {
      const executableNodes = layer.filter(n => !PASSTHROUGH_TYPES.includes(n.type!))
      if (executableNodes.length === 0) continue

      const startTime = Date.now()

      const batchPayloads = executableNodes.map(node => {
        const inputs = resolveInputs(node, edges, nodeOutputs)

        if (node.type === 'llmNode') {
          const imageUrls = edges
            .filter(e => e.target === node.id && e.targetHandle === 'images')
            .map(e => nodeOutputs.get(e.source))
            .filter((v): v is string => typeof v === 'string')

          return {
            payload: {
              nodeId: node.id,
              nodeType: 'llmNode',
              model: typeof node.data.model === 'string' ? node.data.model : 'gemini-2.0-flash',
              systemPrompt: typeof inputs['system_prompt'] === 'string' ? inputs['system_prompt'] : undefined,
              userMessage: typeof inputs['user_message'] === 'string' ? inputs['user_message'] : '',
              imageUrls,
            } satisfies NodeExecutorPayload,
          }
        }

        if (node.type === 'cropImageNode') {
          return {
            payload: {
              nodeId: node.id,
              nodeType: 'cropImageNode',
              imageUrl: typeof inputs['image_url'] === 'string' ? inputs['image_url'] : typeof node.data.imageUrl === 'string' ? node.data.imageUrl : '',
              xPercent: typeof inputs['x_percent'] === 'number' ? inputs['x_percent'] : typeof node.data.xPercent === 'number' ? node.data.xPercent : 0,
              yPercent: typeof inputs['y_percent'] === 'number' ? inputs['y_percent'] : typeof node.data.yPercent === 'number' ? node.data.yPercent : 0,
              widthPercent: typeof inputs['width_percent'] === 'number' ? inputs['width_percent'] : typeof node.data.widthPercent === 'number' ? node.data.widthPercent : 100,
              heightPercent: typeof inputs['height_percent'] === 'number' ? inputs['height_percent'] : typeof node.data.heightPercent === 'number' ? node.data.heightPercent : 100,
              transloaditKey: process.env.NEXT_PUBLIC_TRANSLOADIT_KEY ?? '',
            } satisfies NodeExecutorPayload,
          }
        }

        // extractFrameNode
        return {
          payload: {
            nodeId: node.id,
            nodeType: 'extractFrameNode',
            videoUrl: typeof inputs['video_url'] === 'string' ? inputs['video_url'] : typeof node.data.videoUrl === 'string' ? node.data.videoUrl : '',
            timestamp: typeof inputs['timestamp'] === 'string' ? inputs['timestamp'] : typeof node.data.timestamp === 'string' ? node.data.timestamp : '0',
            transloaditKey: process.env.NEXT_PUBLIC_TRANSLOADIT_KEY ?? '',
          } satisfies NodeExecutorPayload,
        }
      })

      const { runs } = await nodeExecutorTask.batchTriggerAndWait(batchPayloads)

      for (let i = 0; i < runs.length; i++) {
        const run = runs[i]
        const node = executableNodes[i]
        const duration = (Date.now() - startTime) / 1000

        if (run.ok) {
          nodeOutputs.set(node.id, run.output?.result)
          nodeRunResults.push({
            nodeId: node.id,
            nodeType: node.type ?? 'unknown',
            status: 'success',
            result: run.output?.result,
            duration,
          })
        } else {
          nodeRunResults.push({
            nodeId: node.id,
            nodeType: node.type ?? 'unknown',
            status: 'failed',
            error: typeof run.error === 'string' ? run.error : 'Task failed',
            duration,
          })
        }
      }
    }

    return {
      nodeOutputs: Object.fromEntries(nodeOutputs),
      nodeRunResults,
      overallStatus: nodeRunResults.some(r => r.status === 'failed') ? 'partial' : 'success',
    }
  },
})
