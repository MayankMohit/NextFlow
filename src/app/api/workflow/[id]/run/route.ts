import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { tasks } from '@trigger.dev/sdk/v3'
import { topologicalSort, resolveInputs } from '@/lib/dagExecutor'
import type { Node, Edge } from '@xyflow/react'
import type { llmTask } from '@/trigger/llmTask'
import type { cropImageTask } from '@/trigger/cropImageTask'
import type { extractFrameTask } from '@/trigger/extractFrameTask'

interface NodeRunRecord {
  nodeId: string
  nodeType: string
  status: string
  inputs: unknown
  outputs: unknown
  error?: string
  duration: number
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const body = await req.json()
  const {
    nodes,
    edges,
    scope = 'full',
    selectedNodeIds,
  } = body as {
    nodes: Node[]
    edges: Edge[]
    scope: 'full' | 'partial' | 'single'
    selectedNodeIds?: string[]
  }

  // Filter nodes if partial/single run
  const targetNodes =
    scope === 'full'
      ? nodes
      : nodes.filter((n) => selectedNodeIds?.includes(n.id))

  // Resolve workflowId — create one if this is a new unsaved workflow
  let workflowId = id
  if (id === 'new') {
    const created = await prisma.workflow.create({
      data: {
        userId,
        name: 'Untitled',
        nodes: nodes as unknown as never,
        edges: edges as unknown as never,
      },
    })
    workflowId = created.id
  }

  // Create a WorkflowRun record
  const run = await prisma.workflowRun.create({
    data: {
      workflowId,
      userId,
      status: 'running',
      scope,
    },
  })

  // Execute in topological layers (nodes in the same layer run in parallel)
  const layers = topologicalSort(targetNodes, edges)
  const nodeOutputs = new Map<string, unknown>()

  // Pre-populate outputs from non-executable nodes (text, upload)
  for (const node of targetNodes) {
    if (node.type === 'textNode') {
      nodeOutputs.set(node.id, node.data.text)
    }
    if (node.type === 'uploadImageNode') {
      nodeOutputs.set(node.id, node.data.imageUrl)
    }
    if (node.type === 'uploadVideoNode') {
      nodeOutputs.set(node.id, node.data.videoUrl)
    }
  }

  let overallStatus = 'success'
  const nodeRunRecords: NodeRunRecord[] = []

  for (const layer of layers) {
    await Promise.all(
      layer.map(async (node) => {
        // Skip non-executable nodes — their outputs are already set above
        if (
          node.type === 'textNode' ||
          node.type === 'uploadImageNode' ||
          node.type === 'uploadVideoNode'
        ) {
          return
        }

        const startTime = Date.now()
        const inputs = resolveInputs(node, edges, nodeOutputs)
        let result: unknown = undefined

        try {
          if (node.type === 'llmNode') {
            // Collect all image URLs connected to the images handle
            const imageHandles = edges
              .filter(
                (e) => e.target === node.id && e.targetHandle === 'images'
              )
              .map((e) => nodeOutputs.get(e.source))
              .filter((v): v is string => typeof v === 'string')

            const taskResult = await tasks.triggerAndWait<typeof llmTask>(
              'llm-task',
              {
                nodeId: node.id,
                model:
                  typeof node.data.model === 'string'
                    ? node.data.model
                    : 'gemini-2.0-flash',
                systemPrompt:
                  typeof inputs['system_prompt'] === 'string'
                    ? inputs['system_prompt']
                    : undefined,
                userMessage:
                  typeof inputs['user_message'] === 'string'
                    ? inputs['user_message']
                    : '',
                imageUrls: imageHandles,
              }
            )

            if (!taskResult.ok) throw new Error('LLM task failed')
            result = taskResult.output?.result

          } else if (node.type === 'cropImageNode') {
            const imageUrl =
              typeof inputs['image_url'] === 'string'
                ? inputs['image_url']
                : typeof node.data.imageUrl === 'string'
                ? node.data.imageUrl
                : ''

            const xPercent =
              typeof inputs['x_percent'] === 'number'
                ? inputs['x_percent']
                : typeof node.data.xPercent === 'number'
                ? node.data.xPercent
                : 0

            const yPercent =
              typeof inputs['y_percent'] === 'number'
                ? inputs['y_percent']
                : typeof node.data.yPercent === 'number'
                ? node.data.yPercent
                : 0

            const widthPercent =
              typeof inputs['width_percent'] === 'number'
                ? inputs['width_percent']
                : typeof node.data.widthPercent === 'number'
                ? node.data.widthPercent
                : 100

            const heightPercent =
              typeof inputs['height_percent'] === 'number'
                ? inputs['height_percent']
                : typeof node.data.heightPercent === 'number'
                ? node.data.heightPercent
                : 100

            const taskResult = await tasks.triggerAndWait<typeof cropImageTask>(
              'crop-image-task',
              {
                nodeId: node.id,
                imageUrl,
                xPercent,
                yPercent,
                widthPercent,
                heightPercent,
                transloaditKey: process.env.NEXT_PUBLIC_TRANSLOADIT_KEY ?? '',
              }
            )

            if (!taskResult.ok) throw new Error('Crop image task failed')
            result = taskResult.output?.result

          } else if (node.type === 'extractFrameNode') {
            const videoUrl =
              typeof inputs['video_url'] === 'string'
                ? inputs['video_url']
                : typeof node.data.videoUrl === 'string'
                ? node.data.videoUrl
                : ''

            const timestamp =
              typeof inputs['timestamp'] === 'string'
                ? inputs['timestamp']
                : typeof node.data.timestamp === 'string'
                ? node.data.timestamp
                : '0'

            const taskResult =
              await tasks.triggerAndWait<typeof extractFrameTask>(
                'extract-frame-task',
                {
                  nodeId: node.id,
                  videoUrl,
                  timestamp,
                  transloaditKey: process.env.NEXT_PUBLIC_TRANSLOADIT_KEY ?? '',
                }
              )

            if (!taskResult.ok) throw new Error('Extract frame task failed')
            result = taskResult.output?.result
          }

          nodeOutputs.set(node.id, result)
          nodeRunRecords.push({
            nodeId: node.id,
            nodeType: node.type ?? 'unknown',
            status: 'success',
            inputs,
            outputs: { result },
            duration: (Date.now() - startTime) / 1000,
          })
        } catch (err: unknown) {
          overallStatus = 'partial'
          nodeRunRecords.push({
            nodeId: node.id,
            nodeType: node.type ?? 'unknown',
            status: 'failed',
            inputs,
            outputs: null,
            error: err instanceof Error ? err.message : 'Unknown error',
            duration: (Date.now() - startTime) / 1000,
          })
        }
      })
    )
  }

  // Persist all node run records
  await prisma.nodeRun.createMany({
    data: nodeRunRecords.map((nr) => ({
      workflowRunId: run.id,
      nodeId: nr.nodeId,
      nodeType: nr.nodeType,
      status: nr.status,
      inputs: nr.inputs as never,
      outputs: nr.outputs as never,
      error: nr.error,
      duration: nr.duration,
    })),
  })

  // Update overall run status and total duration
  const totalDuration = nodeRunRecords.reduce((acc, nr) => acc + nr.duration, 0)
  await prisma.workflowRun.update({
    where: { id: run.id },
    data: {
      status: overallStatus,
      duration: totalDuration,
    },
  })

  return NextResponse.json({
    runId: run.id,
    workflowId,
    status: overallStatus,
    nodeOutputs: Object.fromEntries(nodeOutputs),
    nodeRuns: nodeRunRecords,
  })
}