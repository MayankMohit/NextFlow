import { create } from 'zustand'
import {
  type Node,
  type Edge,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
} from '@xyflow/react'
import { SAMPLE_WORKFLOW } from '@/lib/sampleWorkflow'

export type RightPanelView = 'assets' | 'history' | null

export interface WorkflowRun {
  id: string
  workflowId: string
  status: 'running' | 'success' | 'failed' | 'partial'
  scope: 'full' | 'partial' | 'single'
  duration?: number
  createdAt: string
  nodeRuns: NodeRun[]
}

export interface NodeRun {
  id: string
  nodeId: string
  nodeType: string
  status: 'success' | 'failed' | 'running'
  inputs?: Record<string, unknown>
  outputs?: Record<string, unknown>
  error?: string
  duration?: number
  createdAt: string
}

export interface Asset {
  id: string
  nodeId: string
  type: 'image' | 'video'
  url: string
  createdAt: string
  meta?: {
    prompt?: string
    model?: string
    dimensions?: string
    fileSize?: string
  }
}

interface HistorySnapshot {
  nodes: Node[]
  edges: Edge[]
}

// ---------------------------------------------------------------------------
// Connection validation
// ---------------------------------------------------------------------------

const IMAGE_HANDLES = new Set(['image_url', 'images'])
const VIDEO_HANDLES = new Set(['video_url'])
const TEXT_HANDLES = new Set(['system_prompt', 'user_message', 'timestamp', 'x_percent', 'y_percent', 'width_percent', 'height_percent'])

const SOURCE_OUTPUT_TYPE: Record<string, string> = {
  textNode: 'text',
  uploadImageNode: 'image',
  uploadVideoNode: 'video',
  cropImageNode: 'image',
  extractFrameNode: 'image',
  llmNode: 'text',
}

export function checkIsValidConnection(connection: Connection, nodes: Node[], edges: Edge[]): boolean {
  const sourceNode = nodes.find(n => n.id === connection.source)
  if (!sourceNode) return false
  const outputType = SOURCE_OUTPUT_TYPE[sourceNode.type ?? '']
  const targetHandle = connection.targetHandle ?? ''
  if (outputType === 'image' && (TEXT_HANDLES.has(targetHandle) || VIDEO_HANDLES.has(targetHandle))) return false
  if (outputType === 'video' && (IMAGE_HANDLES.has(targetHandle) || TEXT_HANDLES.has(targetHandle))) return false
  if (outputType === 'text' && (IMAGE_HANDLES.has(targetHandle) || VIDEO_HANDLES.has(targetHandle))) return false
  // Block if target handle is already occupied by another edge
  if (edges.some(e => e.target === connection.target && e.targetHandle === connection.targetHandle)) return false
  return true
}

function hasCycle(edges: Edge[], newEdge: Edge): boolean {
  const graph = new Map<string, string[]>()
  for (const e of edges) {
    if (!graph.has(e.source)) graph.set(e.source, [])
    graph.get(e.source)!.push(e.target)
  }
  if (!graph.has(newEdge.source)) graph.set(newEdge.source, [])
  graph.get(newEdge.source)!.push(newEdge.target)
  const visited = new Set<string>()
  const stack = new Set<string>()
  function dfs(node: string): boolean {
    visited.add(node); stack.add(node)
    for (const nb of graph.get(node) ?? []) {
      if (!visited.has(nb) && dfs(nb)) return true
      if (stack.has(nb)) return true
    }
    stack.delete(node); return false
  }
  for (const [node] of graph) if (!visited.has(node) && dfs(node)) return true
  return false
}

// ---------------------------------------------------------------------------
// Topological sort — returns nodes grouped into parallel layers.
// Nodes in the same layer have no dependencies on each other and can run
// simultaneously.  Layer 0 runs first, then layer 1, etc.
// ---------------------------------------------------------------------------

function topoLayers(nodes: Node[], edges: Edge[]): Node[][] {
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()

  for (const n of nodes) { inDegree.set(n.id, 0); dependents.set(n.id, []) }
  for (const e of edges) {
    // Only count edges where both endpoints are in the target node set
    if (!inDegree.has(e.source) || !inDegree.has(e.target)) continue
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
    dependents.get(e.source)?.push(e.target)
  }

  const layers: Node[][] = []
  let current = nodes.filter(n => (inDegree.get(n.id) ?? 0) === 0)

  while (current.length > 0) {
    layers.push(current)
    const next: Node[] = []
    for (const n of current) {
      for (const depId of dependents.get(n.id) ?? []) {
        const deg = (inDegree.get(depId) ?? 0) - 1
        inDegree.set(depId, deg)
        if (deg === 0) {
          const depNode = nodes.find(n => n.id === depId)
          if (depNode) next.push(depNode)
        }
      }
    }
    current = next
  }

  return layers
}

// ---------------------------------------------------------------------------
// Get all downstream node IDs reachable from a set of start IDs (inclusive)
// ---------------------------------------------------------------------------

function reachableFrom(startIds: string[], edges: Edge[], allNodes: Node[]): string[] {
  const visited = new Set<string>(startIds)
  const queue = [...startIds]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const e of edges) {
      if (e.source === id && !visited.has(e.target)) {
        visited.add(e.target)
        queue.push(e.target)
      }
    }
  }
  // Preserve original node order
  return allNodes.filter(n => visited.has(n.id)).map(n => n.id)
}

// ---------------------------------------------------------------------------
// Asset helper
// ---------------------------------------------------------------------------

function maybeAddAsset(
  nodeId: string,
  nodeType: string | undefined,
  output: unknown,
  nodeData: Record<string, unknown>,
  addAsset: (a: Asset) => void,
) {
  if (typeof output !== 'string' || !output.startsWith('http')) return
  const isImage = ['uploadImageNode', 'cropImageNode', 'extractFrameNode'].includes(nodeType ?? '')
  const isVideo = nodeType === 'uploadVideoNode'
  if (!isImage && !isVideo) return
  addAsset({
    id: `${nodeId}-${Date.now()}`,
    nodeId,
    type: isVideo ? 'video' : 'image',
    url: output,
    createdAt: new Date().toISOString(),
    meta: { model: nodeData.model as string | undefined },
  })
}

// ---------------------------------------------------------------------------
// Single API call for one layer of nodes
// ---------------------------------------------------------------------------

async function runLayer(
  layerNodeIds: string[],
  allNodes: Node[],
  allEdges: Edge[],
  workflowId: string,
  scope: 'full' | 'partial' | 'single',
): Promise<{
  ok: boolean
  nodeOutputs: Record<string, unknown>
  nodeRuns: Array<{ nodeId: string; status: string; error?: string }>
  newWorkflowId?: string
}> {
  // Send the full graph but tell the server which nodes to actually execute.
  // The orchestrator already understands selectedNodeIds.
  const res = await fetch(`/api/workflow/${workflowId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nodes: allNodes,
      edges: allEdges,
      scope,
      selectedNodeIds: layerNodeIds,
    }),
  })

  if (!res.ok) {
    try {
      const err = await res.json()
      return { ok: false, nodeOutputs: {}, nodeRuns: [], newWorkflowId: undefined }
    } catch {
      return { ok: false, nodeOutputs: {}, nodeRuns: [] }
    }
  }

  const data = await res.json()
  return {
    ok: true,
    nodeOutputs: data.nodeOutputs ?? {},
    nodeRuns: data.nodeRuns ?? [],
    newWorkflowId: data.workflowId,
  }
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface WorkflowStore {
  nodes: Node[]
  edges: Edge[]
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  addNode: (node: Node) => void
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void
  deleteNode: (nodeId: string) => void
  past: HistorySnapshot[]
  future: HistorySnapshot[]
  undo: () => void
  redo: () => void
  pushHistory: () => void
  workflowId: string
  workflowName: string
  setWorkflowName: (name: string) => void
  setWorkflowId: (id: string) => void
  loadWorkflow: (id: string) => Promise<void>
  saveWorkflow: () => Promise<void>
  isSaving: boolean
  isLoading: boolean
  theme: 'dark' | 'light'
  setTheme: (t: 'dark' | 'light') => void
  toggleTheme: () => void
  rightPanel: RightPanelView
  setRightPanel: (panel: RightPanelView) => void

  // ── Global run (keyboard shortcut / full-workflow) ─────────────────────────
  isRunning: boolean
  runWorkflow: (scope?: 'full' | 'partial' | 'single', selectedNodeIds?: string[]) => Promise<void>

  // ── Per-node / group run ───────────────────────────────────────────────────
  runningNodeIds: Set<string>
  completedNodeIds: Set<string>
  getStartNodes: () => string[]
  canNodeRun: (nodeId: string) => boolean

  /**
   * runNode(nodeId)
   * Runs the given node, then automatically chains to all downstream nodes
   * in topological order — layer by layer, showing progress as it goes.
   */
  runNode: (nodeId: string) => Promise<void>

  /**
   * runNodes(nodeIds)
   * Runs only the explicitly selected nodes, but respects their internal
   * dependency order: nodes within the selection are sorted into layers and
   * each layer runs (and completes) before the next starts.
   */
  runNodes: (nodeIds: string[]) => Promise<void>

  runs: WorkflowRun[]
  fetchRuns: () => Promise<void>
  assets: Asset[]
  addAsset: (asset: Asset) => void
  projects: { id: string; name: string; updatedAt: string }[]
  fetchProjects: () => Promise<void>
  deleteProject: (id: string) => Promise<void>
  canvasTool: 'select' | 'pan' | 'cut'
  setCanvasTool: (tool: 'select' | 'pan' | 'cut') => void
  exportWorkflow: () => void
  importWorkflow: (json: string) => void
  loadSampleWorkflow: () => void
}

const MAX_HISTORY = 50

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  nodes: [],
  edges: [],

  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),

  onConnect: (connection) => {
    const { nodes, edges } = get()
    if (!checkIsValidConnection(connection, nodes, edges)) return
    const newEdge: Edge = {
      ...connection,
      id: `e-${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}`,
      type: 'default',
    }
    if (hasCycle(edges, newEdge)) return
    get().pushHistory()
    set({ edges: addEdge(newEdge, edges) })
    const targetNode = nodes.find(n => n.id === connection.target)
    if (targetNode && connection.targetHandle) {
      const existing = (targetNode.data.connectedInputs as string[] | undefined) ?? []
      get().updateNodeData(connection.target, {
        connectedInputs: [...new Set([...existing, connection.targetHandle])],
      })
    }
  },

  addNode: (node) => { get().pushHistory(); set({ nodes: [...get().nodes, node] }) },

  updateNodeData: (nodeId, data) => {
    set({ nodes: get().nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n) })
  },

  deleteNode: (nodeId) => {
    get().pushHistory()
    set({
      nodes: get().nodes.filter(n => n.id !== nodeId),
      edges: get().edges.filter(e => e.source !== nodeId && e.target !== nodeId),
    })
  },

  past: [], future: [],

  pushHistory: () => {
    const { nodes, edges, past } = get()
    set({
      past: [...past.slice(-MAX_HISTORY), {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      }],
      future: [],
    })
  },

  undo: () => {
    const { past, nodes, edges, future } = get()
    if (!past.length) return
    const snapshot = past[past.length - 1]
    set({
      past: past.slice(0, -1),
      future: [...future, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }],
      nodes: snapshot.nodes,
      edges: snapshot.edges,
    })
  },

  redo: () => {
    const { future, nodes, edges, past } = get()
    if (!future.length) return
    const snapshot = future[future.length - 1]
    set({
      future: future.slice(0, -1),
      past: [...past, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }],
      nodes: snapshot.nodes,
      edges: snapshot.edges,
    })
  },

  workflowId: 'new', workflowName: 'Untitled', isSaving: false, isLoading: false,

  setWorkflowName: (name) => set({ workflowName: name }),
  setWorkflowId: (id) => set({ workflowId: id }),

  loadWorkflow: async (id) => {
    set({ isLoading: true })
    try {
      const res = await fetch(`/api/workflow/${id}`)
      if (!res.ok) return
      const data = await res.json()
      set({
        workflowId: data.id,
        workflowName: data.name ?? 'Untitled',
        nodes: data.nodes ?? [],
        edges: (data.edges ?? []).map((e: Edge) => ({ ...e, type: 'default', animated: false, style: undefined })),
        past: [], future: [],
        runningNodeIds: new Set(),
        completedNodeIds: new Set(),
      })
      if (id !== 'new') get().fetchRuns()
    } finally { set({ isLoading: false }) }
  },

  saveWorkflow: async () => {
    const { workflowId, workflowName, nodes, edges } = get()
    set({ isSaving: true })
    try {
      const res = await fetch(`/api/workflow/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workflowName, nodes, edges }),
      })
      if (!res.ok) return
      const data = await res.json()
      if (workflowId === 'new') {
        set({ workflowId: data.id })
        window.history.replaceState({}, '', `/workflow/${data.id}`)
      }
    } finally { set({ isSaving: false }) }
  },

  theme: 'dark',
  setTheme: (t) => { localStorage.setItem('theme', t); set({ theme: t }) },
  toggleTheme: () => set(s => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    return { theme: next }
  }),

  rightPanel: null,
  setRightPanel: (panel) => set(s => ({ rightPanel: s.rightPanel === panel ? null : panel })),

  // ── Global run (Ctrl+Enter / full workflow) ────────────────────────────────
  isRunning: false,

  runWorkflow: async (scope = 'full', selectedNodeIds) => {
    const { workflowId, nodes, edges, updateNodeData, fetchRuns, addAsset } = get()
    set({ isRunning: true })
    const targetIds = scope === 'full' ? nodes.map(n => n.id) : (selectedNodeIds ?? [])
    const targetNodes = nodes.filter(n => targetIds.includes(n.id))

    set(s => ({ runningNodeIds: new Set([...s.runningNodeIds, ...targetIds]) }))
    for (const id of targetIds) updateNodeData(id, { status: 'running', error: undefined })

    try {
      const res = await fetch(`/api/workflow/${workflowId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges, scope, selectedNodeIds }),
      })
      if (!res.ok) {
        for (const id of targetIds) updateNodeData(id, { status: 'failed', error: 'Run failed' })
        return
      }
      const data = await res.json()
      if (workflowId === 'new' && data.workflowId) {
        set({ workflowId: data.workflowId })
        window.history.replaceState({}, '', `/workflow/${data.workflowId}`)
      }
      const nodeOutputs: Record<string, unknown> = data.nodeOutputs ?? {}
      const nodeRuns: Array<{ nodeId: string; status: string; error?: string }> = data.nodeRuns ?? []
      for (const nr of nodeRuns) {
        const output = nodeOutputs[nr.nodeId]
        const node = targetNodes.find(n => n.id === nr.nodeId)
        updateNodeData(nr.nodeId, {
          status: nr.status,
          result: typeof output === 'string' ? output : undefined,
          lastOutput: output ?? null,
          error: nr.error,
        })
        if (nr.status === 'success' && node) {
          maybeAddAsset(nr.nodeId, node.type, output, node.data as Record<string, unknown>, addAsset)
        }
      }
      const completed = nodeRuns.filter(r => r.status === 'success').map(r => r.nodeId)
      if (completed.length) set(s => ({ completedNodeIds: new Set([...s.completedNodeIds, ...completed]) }))
      await fetchRuns()
    } catch (err) {
      for (const id of targetIds) updateNodeData(id, { status: 'failed', error: String(err) })
    } finally {
      set(s => {
        const next = new Set(s.runningNodeIds)
        targetIds.forEach(id => next.delete(id))
        return { isRunning: false, runningNodeIds: next }
      })
    }
  },

  // ── Per-node run state ─────────────────────────────────────────────────────
  runningNodeIds: new Set<string>(),
  completedNodeIds: new Set<string>(),

  getStartNodes: () => {
    const { edges, nodes } = get()
    const hasIncoming = new Set(edges.map(e => e.target))
    return nodes.filter(n => !hasIncoming.has(n.id)).map(n => n.id)
  },

  canNodeRun: (nodeId: string) => {
    const { edges, completedNodeIds, nodes } = get()
    const incomingEdges = edges.filter(e => e.target === nodeId)
    if (incomingEdges.length === 0) return true

    // Passthrough nodes (text, upload) are always considered "completed"
    // because they don't need a server run — their data is already in node.data
    const PASSTHROUGH = new Set(['textNode', 'uploadImageNode', 'uploadVideoNode'])
    return incomingEdges.every(e => {
      if (completedNodeIds.has(e.source)) return true
      const srcNode = nodes.find(n => n.id === e.source)
      return srcNode ? PASSTHROUGH.has(srcNode.type ?? '') : false
    })
  },

  // ---------------------------------------------------------------------------
  // runNode — runs the clicked node, then chains ALL downstream nodes
  // sequentially layer by layer, updating UI after each layer completes.
  // ---------------------------------------------------------------------------
  runNode: async (startNodeId: string) => {
    const { nodes, edges, updateNodeData, fetchRuns, addAsset, canNodeRun } = get()
    let { workflowId } = get()

    // Guard: already running
    if (get().runningNodeIds.has(startNodeId)) return

    // Guard: upstream not ready
    if (!canNodeRun(startNodeId)) {
      updateNodeData(startNodeId, {
        status: 'error',
        error: 'Cannot run: upstream nodes have not completed yet.',
      })
      return
    }

    // Build the full chain: start node + all downstream nodes, sorted into layers
    const chainIds = reachableFrom([startNodeId], edges, nodes)
    const chainNodes = nodes.filter(n => chainIds.includes(n.id))
    const layers = topoLayers(chainNodes, edges)

    // Mark the entire chain as "queued" visually (idle, not running yet)
    // Only the first layer gets marked running immediately
    for (const layer of layers) {
      for (const n of layer) {
        updateNodeData(n.id, { status: 'idle', error: undefined })
      }
    }

    try {
      for (let li = 0; li < layers.length; li++) {
        const layer = layers[li]
        const layerIds = layer.map(n => n.id)

        // Skip passthrough-only layers (text/upload nodes) — just mark complete
        const PASSTHROUGH = new Set(['textNode', 'uploadImageNode', 'uploadVideoNode'])
        const executableIds = layerIds.filter(id => {
          const n = nodes.find(n => n.id === id)
          return n && !PASSTHROUGH.has(n.type ?? '')
        })
        const passthroughIds = layerIds.filter(id => !executableIds.includes(id))

        // Mark passthrough nodes as complete immediately
        for (const id of passthroughIds) {
          updateNodeData(id, { status: 'success' })
          set(s => ({ completedNodeIds: new Set([...s.completedNodeIds, id]) }))
        }

        if (executableIds.length === 0) continue

        // Mark this layer as running
        set(s => ({ runningNodeIds: new Set([...s.runningNodeIds, ...executableIds]) }))
        for (const id of executableIds) updateNodeData(id, { status: 'running', error: undefined })

        const scope = li === 0 && layers.length === 1 ? 'single' : 'partial'
        const result = await runLayer(executableIds, nodes, edges, workflowId, scope)

        // Update workflowId if it was just created
        if (result.newWorkflowId && workflowId === 'new') {
          workflowId = result.newWorkflowId
          set({ workflowId: result.newWorkflowId })
          window.history.replaceState({}, '', `/workflow/${result.newWorkflowId}`)
        }

        // Remove from running set
        set(s => {
          const next = new Set(s.runningNodeIds)
          executableIds.forEach(id => next.delete(id))
          return { runningNodeIds: next }
        })

        if (!result.ok) {
          // Mark all remaining nodes in this layer and beyond as failed
          for (const id of executableIds) {
            updateNodeData(id, { status: 'failed', error: 'Run failed' })
          }
          // Mark all subsequent layers as skipped/idle
          for (let si = li + 1; si < layers.length; si++) {
            for (const n of layers[si]) {
              updateNodeData(n.id, { status: 'idle' })
            }
          }
          return
        }

        // Apply results
        let layerHadFailure = false
        for (const nr of result.nodeRuns) {
          const output = result.nodeOutputs[nr.nodeId]
          const node = nodes.find(n => n.id === nr.nodeId)
          updateNodeData(nr.nodeId, {
            status: nr.status,
            result: typeof output === 'string' ? output : undefined,
            lastOutput: output ?? null,
            error: nr.error,
          })
          if (nr.status === 'success') {
            set(s => ({ completedNodeIds: new Set([...s.completedNodeIds, nr.nodeId]) }))
            if (node) maybeAddAsset(nr.nodeId, node.type, output, node.data as Record<string, unknown>, addAsset)
          } else {
            layerHadFailure = true
          }
        }

        // If any node in this layer failed, stop chaining
        if (layerHadFailure) {
          for (let si = li + 1; si < layers.length; si++) {
            for (const n of layers[si]) {
              updateNodeData(n.id, {
                status: 'idle',
                error: 'Skipped — a previous node failed.',
              })
            }
          }
          return
        }
      }

      await fetchRuns()
    } catch (err) {
      // Clean up any nodes still marked as running
      const currentRunning = get().runningNodeIds
      set(s => {
        const next = new Set(s.runningNodeIds)
        chainIds.forEach(id => next.delete(id))
        return { runningNodeIds: next }
      })
      for (const id of chainIds) {
        if (currentRunning.has(id)) {
          updateNodeData(id, { status: 'failed', error: `Unexpected error: ${String(err)}` })
        }
      }
    }
  },

  // ---------------------------------------------------------------------------
  // runNodes — runs a selected group of nodes in topological layer order.
  // Only nodes within the selection are executed; downstream nodes outside
  // the selection are NOT automatically chained.
  // ---------------------------------------------------------------------------
  runNodes: async (nodeIds: string[]) => {
    const { nodes, edges, updateNodeData, fetchRuns, addAsset, canNodeRun } = get()
    let { workflowId } = get()

    if (nodeIds.length === 0) return

    // Filter to only nodes that exist
    const validIds = nodeIds.filter(id => nodes.find(n => n.id === id))
    if (validIds.length === 0) return

    // Split into runnable vs blocked (a node is blocked if its upstream
    // within the selection hasn't run yet — we'll resolve this via layers,
    // so just block nodes whose upstream is entirely outside the selection
    // AND not yet completed)
    const selectionSet = new Set(validIds)
    const blocked: string[] = []
    const toRun: string[] = []

    for (const id of validIds) {
      const inEdges = edges.filter(e => e.target === id)
      const PASSTHROUGH = new Set(['textNode', 'uploadImageNode', 'uploadVideoNode'])
      const externalUnfinishedParents = inEdges.filter(e => {
        if (selectionSet.has(e.source)) return false  // handled within selection
        if (get().completedNodeIds.has(e.source)) return false
        const srcNode = nodes.find(n => n.id === e.source)
        if (srcNode && PASSTHROUGH.has(srcNode.type ?? '')) return false
        return true
      })
      if (externalUnfinishedParents.length > 0) {
        blocked.push(id)
      } else {
        toRun.push(id)
      }
    }

    for (const id of blocked) {
      updateNodeData(id, {
        status: 'error',
        error: 'Cannot run: an upstream node outside this selection has not completed yet.',
      })
    }

    if (toRun.length === 0) return

    // Skip any already running
    const alreadyRunning = toRun.filter(id => get().runningNodeIds.has(id))
    const executable = toRun.filter(id => !get().runningNodeIds.has(id))
    if (executable.length === 0) return

    // Sort the executable selection into topological layers
    const selectionNodes = nodes.filter(n => executable.includes(n.id))
    // Only consider edges between nodes in our selection for layer ordering
    const selectionEdges = edges.filter(e => selectionSet.has(e.source) && selectionSet.has(e.target))
    const layers = topoLayers(selectionNodes, selectionEdges)

    // Mark everything idle first
    for (const id of executable) updateNodeData(id, { status: 'idle', error: undefined })

    try {
      for (let li = 0; li < layers.length; li++) {
        const layer = layers[li]
        const layerIds = layer.map(n => n.id)

        const PASSTHROUGH = new Set(['textNode', 'uploadImageNode', 'uploadVideoNode'])
        const executableIds = layerIds.filter(id => {
          const n = nodes.find(n => n.id === id)
          return n && !PASSTHROUGH.has(n.type ?? '')
        })
        const passthroughIds = layerIds.filter(id => !executableIds.includes(id))

        for (const id of passthroughIds) {
          updateNodeData(id, { status: 'success' })
          set(s => ({ completedNodeIds: new Set([...s.completedNodeIds, id]) }))
        }

        if (executableIds.length === 0) continue

        set(s => ({ runningNodeIds: new Set([...s.runningNodeIds, ...executableIds]) }))
        for (const id of executableIds) updateNodeData(id, { status: 'running', error: undefined })

        const result = await runLayer(executableIds, nodes, edges, workflowId, 'partial')

        if (result.newWorkflowId && workflowId === 'new') {
          workflowId = result.newWorkflowId
          set({ workflowId: result.newWorkflowId })
          window.history.replaceState({}, '', `/workflow/${result.newWorkflowId}`)
        }

        set(s => {
          const next = new Set(s.runningNodeIds)
          executableIds.forEach(id => next.delete(id))
          return { runningNodeIds: next }
        })

        if (!result.ok) {
          for (const id of executableIds) updateNodeData(id, { status: 'failed', error: 'Run failed' })
          for (let si = li + 1; si < layers.length; si++) {
            for (const n of layers[si]) updateNodeData(n.id, { status: 'idle' })
          }
          return
        }

        let layerHadFailure = false
        for (const nr of result.nodeRuns) {
          const output = result.nodeOutputs[nr.nodeId]
          const node = nodes.find(n => n.id === nr.nodeId)
          updateNodeData(nr.nodeId, {
            status: nr.status,
            result: typeof output === 'string' ? output : undefined,
            lastOutput: output ?? null,
            error: nr.error,
          })
          if (nr.status === 'success') {
            set(s => ({ completedNodeIds: new Set([...s.completedNodeIds, nr.nodeId]) }))
            if (node) maybeAddAsset(nr.nodeId, node.type, output, node.data as Record<string, unknown>, addAsset)
          } else {
            layerHadFailure = true
          }
        }

        if (layerHadFailure) {
          for (let si = li + 1; si < layers.length; si++) {
            for (const n of layers[si]) {
              updateNodeData(n.id, { status: 'idle', error: 'Skipped — a previous node failed.' })
            }
          }
          return
        }
      }

      await fetchRuns()
    } catch (err) {
      const currentRunning = get().runningNodeIds
      set(s => {
        const next = new Set(s.runningNodeIds)
        executable.forEach(id => next.delete(id))
        return { runningNodeIds: next }
      })
      for (const id of executable) {
        if (currentRunning.has(id)) {
          updateNodeData(id, { status: 'failed', error: `Unexpected error: ${String(err)}` })
        }
      }
    }
  },

  // ── Run history ────────────────────────────────────────────────────────────
  runs: [],
  fetchRuns: async () => {
    const { workflowId } = get()
    if (workflowId === 'new') return
    try {
      const res = await fetch(`/api/runs/${workflowId}`)
      if (res.ok) set({ runs: await res.json() })
    } catch { /**/ }
  },

  assets: [],
  addAsset: (asset) => set(s => ({ assets: [asset, ...s.assets] })),

  projects: [],
  fetchProjects: async () => {
    try {
      const res = await fetch('/api/projects')
      if (res.ok) set({ projects: await res.json() })
    } catch { /**/ }
  },
  deleteProject: async (id) => {
    const prev = get().projects
    set(s => ({ projects: s.projects.filter(p => p.id !== id) }))
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    if (!res.ok) set({ projects: prev })
  },

  canvasTool: 'select',
  setCanvasTool: (tool) => set({ canvasTool: tool }),

  exportWorkflow: () => {
    const { workflowName, nodes, edges } = get()
    const blob = new Blob(
      [JSON.stringify({ name: workflowName, nodes, edges }, null, 2)],
      { type: 'application/json' },
    )
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `${workflowName.replace(/\s+/g, '_')}.json`,
    })
    a.click(); URL.revokeObjectURL(a.href)
  },

  importWorkflow: (json) => {
    try {
      const data = JSON.parse(json)
      get().pushHistory()
      set({
        workflowName: data.name ?? 'Imported',
        nodes: data.nodes ?? [],
        edges: data.edges ?? [],
        workflowId: 'new',
        runningNodeIds: new Set(),
        completedNodeIds: new Set(),
      })
    } catch { /**/ }
  },

  loadSampleWorkflow: () => {
    get().pushHistory()
    set({
      workflowName: SAMPLE_WORKFLOW.name,
      nodes: SAMPLE_WORKFLOW.nodes,
      edges: SAMPLE_WORKFLOW.edges,
      workflowId: 'new',
      runningNodeIds: new Set(),
      completedNodeIds: new Set(),
    })
  },
}))