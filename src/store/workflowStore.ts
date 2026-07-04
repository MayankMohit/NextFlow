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
  status: 'success' | 'failed' | 'running' | 'skipped'
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
const TEXT_HANDLES = new Set(['system_prompt', 'user_message', 'timestamp', 'x_percent', 'y_percent', 'width_percent', 'height_percent', 'text_1', 'text_2', 'text_3', 'text_4'])

const SOURCE_OUTPUT_TYPE: Record<string, string> = {
  textNode: 'text',
  uploadImageNode: 'image',
  uploadVideoNode: 'video',
  cropImageNode: 'image',
  extractFrameNode: 'image',
  llmNode: 'text',
  textCombineNode: 'text',
  resizeImageNode: 'image',
  // outputNode is terminal — it has no source handle
}

export function checkIsValidConnection(connection: Connection, nodes: Node[], edges: Edge[]): boolean {
  const sourceNode = nodes.find(n => n.id === connection.source)
  if (!sourceNode) return false
  const outputType = SOURCE_OUTPUT_TYPE[sourceNode.type ?? '']
  const targetHandle = connection.targetHandle ?? ''
  if (outputType === 'image' && (TEXT_HANDLES.has(targetHandle) || VIDEO_HANDLES.has(targetHandle))) return false
  if (outputType === 'video' && (IMAGE_HANDLES.has(targetHandle) || TEXT_HANDLES.has(targetHandle))) return false
  if (outputType === 'text' && (IMAGE_HANDLES.has(targetHandle) || VIDEO_HANDLES.has(targetHandle))) return false
  // Block if target handle is already occupied — except 'images' which accepts multiple sources
  if (connection.targetHandle !== 'images' &&
      edges.some(e => e.target === connection.target && e.targetHandle === connection.targetHandle)) return false
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
  const isImage = ['uploadImageNode', 'cropImageNode', 'extractFrameNode', 'resizeImageNode'].includes(nodeType ?? '')
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
// Run helpers — passthrough nodes (text/upload) never execute on the server,
// their data is used directly.
// ---------------------------------------------------------------------------

const PASSTHROUGH = new Set(['textNode', 'uploadImageNode', 'uploadVideoNode'])

function splitPassthrough(nodes: Node[], ids: string[]) {
  const passthroughIds: string[] = []
  const executableIds: string[] = []
  for (const id of ids) {
    const n = nodes.find(n => n.id === id)
    if (!n) continue
    if (PASSTHROUGH.has(n.type ?? '')) passthroughIds.push(id)
    else executableIds.push(id)
  }
  return { passthroughIds, executableIds }
}

// Scope compares executables that ran against ALL executables in the workflow
function computeScope(nodes: Node[], executableIds: string[]): 'full' | 'partial' | 'single' {
  const allExecutables = nodes.filter(n => !PASSTHROUGH.has(n.type ?? '')).map(n => n.id)
  return allExecutables.every(id => executableIds.includes(id)) ? 'full'
    : executableIds.length === 1 ? 'single'
    : 'partial'
}

// Live per-node progress streamed from the orchestrator via Trigger.dev
// Realtime metadata (mirrors NodeRunMeta in src/trigger/orchestratorTask.ts —
// kept separate so the client bundle never imports server task code).
export interface NodeRunMeta {
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped'
  output?: unknown
  error?: string
  duration?: number
}

export interface ActiveRun {
  runId: string
  triggerRunId: string
  publicAccessToken: string
  targetNodeIds: string[]
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
  scheduleAutoSave: () => void
  saveState: 'idle' | 'saving' | 'saved' | 'error'
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

  // ── Run lifecycle (single Trigger.dev run + Realtime progress) ─────────────
  /** The run currently streaming progress, or null. Only one run at a time. */
  activeRun: ActiveRun | null
  /** Marks passthrough nodes complete, POSTs once, stores the Realtime handle. */
  startRun: (targetNodeIds: string[]) => Promise<void>
  /** Applies streamed per-node statuses from the orchestrator's metadata. */
  applyRunProgress: (nodesMeta: Record<string, NodeRunMeta>) => void
  /** Ends the active run; failedMessage marks still-running nodes as failed. */
  finishRun: (failedMessage?: string) => void

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
  /** True once fetchAssets has hydrated from the DB — gates checks that
      treat a missing Asset row as "deleted". */
  assetsLoaded: boolean
  addAsset: (asset: Asset) => void
  /** Hydrates the assets panel from the Asset table (merges with local). */
  fetchAssets: () => Promise<void>
  /** Adds an asset locally AND persists it via POST /api/assets. */
  recordAsset: (a: { nodeId: string; type: 'image' | 'video'; url: string; meta?: Asset['meta'] }) => Promise<void>
  /** Removes an asset from the panel, the DB row, and Blob storage. */
  deleteAsset: (id: string) => Promise<void>
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

// connectedInputs mirrors which target handles have an incoming edge — nodes
// disable their manual fields for those handles. Derive it from the edges so
// every change (connect, edge delete, node delete, load) stays in sync and
// fields re-enable when their edge goes away.
const syncConnectedInputs = (nodes: Node[], edges: Edge[]): Node[] =>
  nodes.map(node => {
    const connected = [...new Set(
      edges
        .filter(e => e.target === node.id && e.targetHandle)
        .map(e => e.targetHandle as string),
    )]
    const current = (node.data.connectedInputs as string[] | undefined) ?? []
    if (connected.length === current.length && connected.every(h => current.includes(h))) return node
    return { ...node, data: { ...node.data, connectedInputs: connected } }
  })

// ---------------------------------------------------------------------------
// Auto-save — debounced so bursts of changes (dragging, typing) collapse into
// a single PUT once the canvas has been idle for a moment.
// ---------------------------------------------------------------------------

const AUTO_SAVE_DELAY_MS = 1500
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  nodes: [],
  edges: [],

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) })
    // Selection and dimension changes are view-only — no need to persist them
    if (changes.some(c => c.type !== 'select' && c.type !== 'dimensions')) get().scheduleAutoSave()
  },
  onEdgesChange: (changes) => {
    const edges = applyEdgeChanges(changes, get().edges)
    set({
      edges,
      ...(changes.some(c => c.type === 'remove')
        ? { nodes: syncConnectedInputs(get().nodes, edges) }
        : {}),
    })
    if (changes.some(c => c.type !== 'select')) get().scheduleAutoSave()
  },

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
    const newEdges = addEdge(newEdge, edges)
    set({ edges: newEdges, nodes: syncConnectedInputs(nodes, newEdges) })
    get().scheduleAutoSave()
  },

  addNode: (node) => { get().pushHistory(); set({ nodes: [...get().nodes, node] }); get().scheduleAutoSave() },

  updateNodeData: (nodeId, data) => {
    set({ nodes: get().nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n) })
    get().scheduleAutoSave()
  },

  deleteNode: (nodeId) => {
    get().pushHistory()
    const nodes = get().nodes.filter(n => n.id !== nodeId)
    const edges = get().edges.filter(e => e.source !== nodeId && e.target !== nodeId)
    set({ nodes: syncConnectedInputs(nodes, edges), edges })
    get().scheduleAutoSave()
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
    get().scheduleAutoSave()
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
    get().scheduleAutoSave()
  },

  workflowId: 'new', workflowName: 'Untitled', isSaving: false, isLoading: false, saveState: 'idle',

  setWorkflowName: (name) => { set({ workflowName: name }); get().scheduleAutoSave() },
  setWorkflowId: (id) => set({ workflowId: id }),

  loadWorkflow: async (id) => {
    set({ isLoading: true })
    try {
      const res = await fetch(`/api/workflow/${id}`)
      if (!res.ok) return
      const data = await res.json()
      // A save may have been interrupted mid-run — 'running' is never a valid
      // status after a fresh load, and completed nodes must count as completed
      // so downstream partial runs are allowed again.
      const edges: Edge[] = (data.edges ?? []).map((e: Edge) => ({ ...e, type: 'default', animated: false, style: undefined }))
      const nodes: Node[] = syncConnectedInputs(
        (data.nodes ?? []).map((n: Node) =>
          (n.data as Record<string, unknown>)?.status === 'running'
            ? { ...n, data: { ...n.data, status: 'idle' } }
            : n,
        ),
        edges,
      )
      const completedNodeIds = new Set(
        nodes
          .filter(n => (n.data as Record<string, unknown>)?.status === 'success')
          .map(n => n.id),
      )
      set({
        workflowId: data.id,
        workflowName: data.name ?? 'Untitled',
        nodes,
        edges,
        past: [], future: [],
        runningNodeIds: new Set(),
        completedNodeIds,
        saveState: 'idle',
        // Assets/runs come from the DB (fetchAssets/fetchRuns) — deriving
        // assets from node data would resurrect ones the user deleted.
        assets: [],
        assetsLoaded: false,
        runs: [],
      })
      if (id !== 'new') {
        get().fetchRuns()
        get().fetchAssets()
      }
    } finally { set({ isLoading: false }) }
  },

  scheduleAutoSave: () => {
    if (get().isLoading) return
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null
      void get().saveWorkflow()
    }, AUTO_SAVE_DELAY_MS)
  },

  saveWorkflow: async () => {
    const { workflowId, workflowName, nodes, edges, isSaving } = get()
    // A save is already in flight (e.g. it's still creating the workflow row
    // for id 'new') — retry after it finishes instead of double-saving.
    if (isSaving) { get().scheduleAutoSave(); return }
    // Nothing to persist on a blank unsaved canvas
    if (workflowId === 'new' && nodes.length === 0) return
    set({ isSaving: true, saveState: 'saving' })
    try {
      const res = await fetch(`/api/workflow/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workflowName, nodes, edges }),
      })
      if (!res.ok) { set({ saveState: 'error' }); return }
      const data = await res.json()
      if (workflowId === 'new') {
        set({ workflowId: data.id })
        window.history.replaceState({}, '', `/workflow/${data.id}`)
      }
      set({ saveState: 'saved' })
    } catch {
      set({ saveState: 'error' })
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
    const { nodes } = get()
    const targetIds = scope === 'full' ? nodes.map(n => n.id) : (selectedNodeIds ?? [])
    await get().startRun(targetIds)
  },

  // ── Run lifecycle ──────────────────────────────────────────────────────────
  activeRun: null,

  startRun: async (targetNodeIds: string[]) => {
    if (get().activeRun) return // one run at a time
    const { nodes, edges, updateNodeData } = get()

    const { passthroughIds, executableIds } = splitPassthrough(nodes, targetNodeIds)

    for (const id of passthroughIds) {
      updateNodeData(id, { status: 'success' })
      set(s => ({ completedNodeIds: new Set([...s.completedNodeIds, id]) }))
    }
    if (executableIds.length === 0) return

    const scope = computeScope(nodes, executableIds)

    // Instant feedback: glow the first layer until live metadata takes over
    const execNodes = nodes.filter(n => executableIds.includes(n.id))
    const firstLayer = new Set((topoLayers(execNodes, edges)[0] ?? []).map(n => n.id))
    for (const id of executableIds) {
      updateNodeData(id, { status: firstLayer.has(id) ? 'running' : 'idle', error: undefined })
    }
    set(s => ({ isRunning: true, runningNodeIds: new Set([...s.runningNodeIds, ...firstLayer]) }))

    const failAll = (message: string) => {
      for (const id of executableIds) updateNodeData(id, { status: 'failed', error: message })
      set(s => {
        const next = new Set(s.runningNodeIds)
        executableIds.forEach(id => next.delete(id))
        return { isRunning: false, runningNodeIds: next, activeRun: null }
      })
    }

    try {
      const res = await fetch(`/api/workflow/${get().workflowId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: get().nodes,
          edges,
          scope,
          targetNodeIds: executableIds,
          passthroughNodeIds: passthroughIds,
        }),
      })
      if (!res.ok) { failAll('Run failed to start'); return }
      const data = await res.json()
      if (get().workflowId === 'new' && data.workflowId) {
        set({ workflowId: data.workflowId })
        window.history.replaceState({}, '', `/workflow/${data.workflowId}`)
      }
      if (!data.triggerRunId || !data.publicAccessToken) { failAll('Run failed to start'); return }
      set({
        activeRun: {
          runId: data.runId,
          triggerRunId: data.triggerRunId,
          publicAccessToken: data.publicAccessToken,
          targetNodeIds: executableIds,
        },
      })
      // Safety net if Realtime never delivers a terminal event
      // (orchestrator maxDuration is 600s)
      const startedRunId: string = data.runId
      setTimeout(() => {
        if (get().activeRun?.runId === startedRunId) get().finishRun('Run timed out')
      }, 11 * 60 * 1000)
    } catch (err) {
      failAll(String(err))
    }
  },

  applyRunProgress: (nodesMeta) => {
    const { updateNodeData, addAsset } = get()
    const running = new Set<string>()

    for (const [nodeId, meta] of Object.entries(nodesMeta)) {
      const node = get().nodes.find(n => n.id === nodeId)
      if (!node) continue
      const current = node.data.status
      switch (meta.status) {
        case 'pending':
          if (current !== 'idle') updateNodeData(nodeId, { status: 'idle', error: undefined })
          break
        case 'running':
          running.add(nodeId)
          if (current !== 'running') updateNodeData(nodeId, { status: 'running', error: undefined })
          break
        case 'success':
          if (current !== 'success') {
            updateNodeData(nodeId, {
              status: 'success',
              result: typeof meta.output === 'string' ? meta.output : undefined,
              lastOutput: meta.output ?? null,
              error: undefined,
            })
            set(s => ({ completedNodeIds: new Set([...s.completedNodeIds, nodeId]) }))
            maybeAddAsset(nodeId, node.type, meta.output, node.data as Record<string, unknown>, addAsset)
          }
          break
        case 'failed':
          if (current !== 'failed') updateNodeData(nodeId, { status: 'failed', error: meta.error ?? 'Failed' })
          break
        case 'skipped':
          if (node.data.error !== meta.error) updateNodeData(nodeId, { status: 'idle', error: meta.error })
          break
      }
    }

    // Within the active run only the nodes the orchestrator reports as
    // running glow; nodes outside the run are left untouched.
    set(s => {
      const target = new Set(s.activeRun?.targetNodeIds ?? [])
      const next = new Set([...s.runningNodeIds].filter(id => !target.has(id)))
      running.forEach(id => next.add(id))
      return { runningNodeIds: next }
    })
  },

  finishRun: (failedMessage) => {
    const active = get().activeRun
    if (!active) return
    const { updateNodeData } = get()
    // A crash can end the run while nodes are still marked running
    for (const id of active.targetNodeIds) {
      const n = get().nodes.find(n => n.id === id)
      if (n?.data.status === 'running') {
        updateNodeData(id, { status: 'failed', error: failedMessage ?? 'Run ended unexpectedly' })
      }
    }
    set(s => {
      const next = new Set(s.runningNodeIds)
      active.targetNodeIds.forEach(id => next.delete(id))
      return { isRunning: false, runningNodeIds: next, activeRun: null }
    })
    get().fetchRuns()
    get().fetchAssets() // the orchestrator writes Asset rows for media outputs
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
    return incomingEdges.every(e => {
      if (completedNodeIds.has(e.source)) return true
      const srcNode = nodes.find(n => n.id === e.source)
      return srcNode ? PASSTHROUGH.has(srcNode.type ?? '') : false
    })
  },

  // ---------------------------------------------------------------------------
  // runNode — runs the clicked node plus all downstream nodes (one run).
  // ---------------------------------------------------------------------------
  runNode: async (startNodeId: string) => {
    const { nodes, edges, updateNodeData, canNodeRun } = get()

    if (get().runningNodeIds.has(startNodeId) || get().activeRun) return

    if (!canNodeRun(startNodeId)) {
      updateNodeData(startNodeId, {
        status: 'error',
        error: 'Cannot run: upstream nodes have not completed yet.',
      })
      return
    }

    // All nodes reachable from startNode (inclusive)
    await get().startRun(reachableFrom([startNodeId], edges, nodes))
  },

  // ---------------------------------------------------------------------------
  // runNodes — runs only the explicitly selected nodes (one run); the
  // orchestrator resolves their internal dependency order server-side.
  // ---------------------------------------------------------------------------
  runNodes: async (nodeIds: string[]) => {
    if (nodeIds.length === 0 || get().activeRun) return
    const { nodes, edges, updateNodeData } = get()

    const selectionSet = new Set(nodeIds.filter(id => nodes.find(n => n.id === id)))
    if (selectionSet.size === 0) return

    // Block nodes whose external (outside selection) executable parents haven't completed
    const blocked: string[] = []
    const toRun: string[] = []

    for (const id of selectionSet) {
      const externalUnfinished = edges
        .filter(e => e.target === id && !selectionSet.has(e.source))
        .filter(e => {
          if (get().completedNodeIds.has(e.source)) return false
          const src = nodes.find(n => n.id === e.source)
          return src ? !PASSTHROUGH.has(src.type ?? '') : false
        })
      if (externalUnfinished.length > 0) blocked.push(id)
      else toRun.push(id)
    }

    for (const id of blocked) {
      updateNodeData(id, {
        status: 'error',
        error: 'Cannot run: an upstream node outside this selection has not completed yet.',
      })
    }

    if (toRun.length > 0) await get().startRun(toRun)
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
  assetsLoaded: false,
  addAsset: (asset) => set(s =>
    s.assets.some(a => a.nodeId === asset.nodeId && a.url === asset.url)
      ? s
      : { assets: [asset, ...s.assets] },
  ),

  fetchAssets: async () => {
    const { workflowId } = get()
    if (workflowId === 'new') return
    try {
      const res = await fetch(`/api/assets?workflowId=${workflowId}`)
      if (!res.ok) return
      const rows: Array<{
        id: string
        nodeId: string | null
        type: 'image' | 'video'
        url: string
        createdAt: string
        meta?: Asset['meta'] | null
      }> = await res.json()
      set(s => {
        // DB rows are authoritative; keep local-only entries (e.g. from a
        // workflow that was never saved) that the DB doesn't know about.
        const dbUrls = new Set(rows.map(r => r.url))
        const localOnly = s.assets.filter(a => !dbUrls.has(a.url))
        const dbAssets: Asset[] = rows.map(r => ({
          id: r.id,
          nodeId: r.nodeId ?? '',
          type: r.type,
          url: r.url,
          createdAt: r.createdAt,
          meta: r.meta ?? undefined,
        }))
        return { assets: [...dbAssets, ...localOnly], assetsLoaded: true }
      })
    } catch { /**/ }
  },

  recordAsset: async ({ nodeId, type, url, meta }) => {
    get().addAsset({ id: `${nodeId}-${url}`, nodeId, type, url, createdAt: new Date().toISOString(), meta })
    try {
      // Unsaved workflow: save first so the Asset row links to a real id
      if (get().workflowId === 'new') await get().saveWorkflow()
      await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, type, nodeId, workflowId: get().workflowId, meta }),
      })
    } catch { /* panel already shows it; the DB row is best-effort here */ }
  },

  deleteAsset: async (id) => {
    const prev = get().assets
    const url = prev.find(a => a.id === id)?.url
    set(s => ({ assets: s.assets.filter(a => a.id !== id) }))
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(id)}`, { method: 'DELETE' })
      // 404 = local-only asset that was never persisted — removing it locally is enough
      if (!res.ok && res.status !== 404) { set({ assets: prev }); return }
      // The blob is gone — clear node previews/uploads still pointing at it
      if (url) {
        set({
          nodes: get().nodes.map(n => {
            const d = n.data as Record<string, unknown>
            if (d.lastOutput !== url && d.imageUrl !== url && d.videoUrl !== url) return n
            const data = { ...d }
            if (data.lastOutput === url) data.lastOutput = null
            if (data.imageUrl === url) data.imageUrl = null
            if (data.videoUrl === url) data.videoUrl = null
            return { ...n, data }
          }),
        })
        get().scheduleAutoSave()
      }
    } catch { set({ assets: prev }) }
  },

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
    if (!res.ok) { set({ projects: prev }); return }

    // Deleted the workflow that's currently open — reset to a fresh canvas
    if (get().workflowId === id) {
      if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
      set({
        workflowId: 'new',
        workflowName: 'Untitled',
        nodes: [],
        edges: [],
        past: [], future: [],
        runningNodeIds: new Set(),
        completedNodeIds: new Set(),
        runs: [],
        assets: [],
        assetsLoaded: false,
        saveState: 'idle',
        activeRun: null,
      })
      window.history.replaceState({}, '', '/workflow/new')
    }
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
      const nodes: Node[] = data.nodes ?? []
      get().pushHistory()
      set({
        workflowName: data.name ?? 'Imported',
        nodes,
        edges: data.edges ?? [],
        workflowId: 'new',
        runningNodeIds: new Set(),
        completedNodeIds: new Set(),
        // Different (unsaved) workflow — drop the previous one's panel state
        runs: [],
        assets: [],
        assetsLoaded: false,
      })
      get().scheduleAutoSave()
    } catch { /**/ }
  },

  loadSampleWorkflow: () => {
    const nodes: Node[] = JSON.parse(JSON.stringify(SAMPLE_WORKFLOW.nodes))
    get().pushHistory()
    set({
      workflowName: SAMPLE_WORKFLOW.name,
      nodes,
      edges: JSON.parse(JSON.stringify(SAMPLE_WORKFLOW.edges)),
      workflowId: 'new',
      runningNodeIds: new Set(),
      completedNodeIds: new Set(),
      runs: [],
      assets: [],
      assetsLoaded: false,
    })
    get().scheduleAutoSave()
  },
}))

// Flush a pending auto-save if the tab closes/refreshes before the debounce
// fires. keepalive lets the PUT outlive the page. Skipped for unsaved 'new'
// workflows — the redirect to the created id would be lost anyway.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (!autoSaveTimer) return
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
    const { workflowId, workflowName, nodes, edges } = useWorkflowStore.getState()
    if (workflowId === 'new') return
    fetch(`/api/workflow/${workflowId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: workflowName, nodes, edges }),
      keepalive: true,
    }).catch(() => { /* page is going away — nothing to report */ })
  })
}