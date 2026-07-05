import { useWorkflowStore } from '@/store/workflowStore'

const PASSTHROUGH = new Set(['textNode', 'uploadImageNode', 'uploadVideoNode'])

export function useNodeStatus(id: string) {
  const edges = useWorkflowStore(state => state.edges)
  const nodes = useWorkflowStore(state => state.nodes)
  const completedNodeIds = useWorkflowStore(state => state.completedNodeIds)
  const runningNodeIds = useWorkflowStore(state => state.runningNodeIds)

  const isNodeRunning = runningNodeIds.has(id)

  const isStartNode = !edges.some(e => e.target === id)

  const canRun = (() => {
    const incoming = edges.filter(e => e.target === id)
    if (incoming.length === 0) return true
    return incoming.every(e => {
      if (completedNodeIds.has(e.source)) return true
      const src = nodes.find(n => n.id === e.source)
      if (!src || !PASSTHROUGH.has(src.type ?? '')) return false
      // A passthrough source with deleted/missing media can't feed this node
      if (src.type === 'uploadImageNode') return !!src.data.imageUrl
      if (src.type === 'uploadVideoNode') return !!src.data.videoUrl
      return true
    })
  })()

  return { isNodeRunning, isStartNode, canRun }
}
