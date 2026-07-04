import { task, metadata } from '@trigger.dev/sdk/v3'
import { prisma } from '@/lib/prisma'
import { topologicalSort, resolveInputs } from '@/lib/dagExecutor'
import { executors } from './executors'
import type { Node, Edge } from '@xyflow/react'

export interface OrchestratorPayload {
  workflowRunId: string
  workflowId: string
  userId: string
  nodes: Node[]
  edges: Edge[]
  /** Executable node ids to run this time; omit/empty = all executable nodes */
  targetNodeIds?: string[]
}

export type NodeRunStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'

export interface NodeRunMeta {
  status: NodeRunStatus
  output?: unknown
  error?: string
  duration?: number
}

const PASSTHROUGH_TYPES = ['textNode', 'uploadImageNode', 'uploadVideoNode']
const SKIPPED_ERROR = 'Skipped — a previous node failed.'

// Node types whose successful output is a media URL worth saving as an Asset
const MEDIA_OUTPUT_TYPES: Record<string, 'image' | 'video'> = {
  cropImageNode: 'image',
  extractFrameNode: 'image',
}

export const orchestratorTask = task({
  id: 'orchestrator-task',
  maxDuration: 600,
  // Retrying would re-run the whole graph (and re-bill LLM calls) — failures
  // are already reported per-node.
  retry: { maxAttempts: 1 },
  run: async (payload: OrchestratorPayload) => {
    const { workflowRunId, workflowId, userId, nodes, edges, targetNodeIds } = payload
    const startedAt = Date.now()

    const targetNodes = (
      targetNodeIds?.length ? nodes.filter(n => targetNodeIds.includes(n.id)) : nodes
    ).filter(n => !PASSTHROUGH_TYPES.includes(n.type ?? ''))

    // Seed outputs from the full graph so upstream data is available when
    // running a subset. Passthrough nodes read from node.data directly;
    // executed nodes carry their previous result in lastOutput.
    const nodeOutputs = new Map<string, unknown>()
    for (const node of nodes) {
      if (node.type === 'textNode') {
        if (node.data.text != null) nodeOutputs.set(node.id, node.data.text)
      } else if (node.type === 'uploadImageNode') {
        if (node.data.imageUrl != null) nodeOutputs.set(node.id, node.data.imageUrl)
      } else if (node.type === 'uploadVideoNode') {
        if (node.data.videoUrl != null) nodeOutputs.set(node.id, node.data.videoUrl)
      } else if (node.data.lastOutput != null) {
        nodeOutputs.set(node.id, node.data.lastOutput)
      }
    }

    // Live per-node status — streamed to the client via Realtime metadata
    const nodesMeta: Record<string, NodeRunMeta> = {}
    for (const n of targetNodes) nodesMeta[n.id] = { status: 'pending' }
    const publish = () => metadata.set('nodes', { ...nodesMeta } as never)
    publish()

    const failedOrSkipped = new Set<string>()

    try {
      for (const layer of topologicalSort(targetNodes, edges)) {
        // A node whose direct upstream failed/was skipped can never succeed —
        // layers arrive in topo order so this propagates transitively.
        const runnable: Node[] = []
        for (const node of layer) {
          if (edges.some(e => e.target === node.id && failedOrSkipped.has(e.source))) {
            failedOrSkipped.add(node.id)
            nodesMeta[node.id] = { status: 'skipped', error: SKIPPED_ERROR }
          } else {
            runnable.push(node)
            nodesMeta[node.id] = { status: 'running' }
          }
        }
        publish()
        if (runnable.length === 0) continue

        const layerStart = Date.now()
        const results = await Promise.allSettled(
          runnable.map(node => {
            const executor = executors[node.type ?? '']
            if (!executor) throw new Error(`No executor for node type: ${node.type}`)
            const inputs = resolveInputs(node, edges, nodeOutputs)
            const imageUrls = edges
              .filter(e => e.target === node.id && e.targetHandle === 'images')
              .map(e => nodeOutputs.get(e.source))
              .filter((v): v is string => typeof v === 'string')
            return executor({ node, inputs, imageUrls })
          }),
        )

        const duration = (Date.now() - layerStart) / 1000
        results.forEach((res, i) => {
          const node = runnable[i]
          if (res.status === 'fulfilled') {
            nodeOutputs.set(node.id, res.value)
            nodesMeta[node.id] = { status: 'success', output: res.value, duration }
          } else {
            failedOrSkipped.add(node.id)
            const reason = res.reason instanceof Error ? res.reason.message : String(res.reason)
            nodesMeta[node.id] = { status: 'failed', error: reason, duration }
          }
        })
        publish()
      }

      const statuses = Object.values(nodesMeta).map(m => m.status)
      const overallStatus =
        statuses.every(s => s === 'success') ? 'success' :
        statuses.some(s => s === 'success') ? 'partial' : 'failed'

      await prisma.nodeRun.createMany({
        data: targetNodes.map(n => {
          const meta = nodesMeta[n.id]
          return {
            workflowRunId,
            nodeId: n.id,
            nodeType: n.type ?? 'unknown',
            status: meta.status,
            outputs: meta.output != null ? { result: meta.output as never } : undefined,
            error: meta.error ?? null,
            duration: meta.duration ?? 0,
          }
        }),
      })
      // Persist media outputs as Assets (permanent Blob URLs)
      const assetRows = targetNodes.flatMap(n => {
        const meta = nodesMeta[n.id]
        const assetType = MEDIA_OUTPUT_TYPES[n.type ?? '']
        if (!assetType || meta.status !== 'success' || typeof meta.output !== 'string') return []
        return [{
          userId,
          workflowId,
          nodeId: n.id,
          type: assetType,
          url: meta.output,
          meta: { source: 'run', nodeType: n.type ?? 'unknown' },
        }]
      })
      if (assetRows.length > 0) {
        await prisma.asset.createMany({ data: assetRows })
      }

      await prisma.workflowRun.update({
        where: { id: workflowRunId },
        data: { status: overallStatus, duration: (Date.now() - startedAt) / 1000 },
      })

      // The completion event can outrun the last streamed metadata update, so
      // flush it AND return the final per-node state — the client treats the
      // output as authoritative when the run finishes.
      await metadata.flush()
      return { nodeOutputs: Object.fromEntries(nodeOutputs), nodesMeta, overallStatus }
    } catch (err) {
      // Unexpected crash (not a per-node failure) — don't leave the run 'running'
      await prisma.workflowRun
        .update({ where: { id: workflowRunId }, data: { status: 'failed' } })
        .catch(() => { /* best effort */ })
      throw err
    }
  },
})
