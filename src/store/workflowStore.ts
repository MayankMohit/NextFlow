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
  type: 'image' | 'video' | 'audio'
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
// Undo/redo history
// ---------------------------------------------------------------------------

// Data keys that only mirror run/transient state. Writing them never creates
// an undo step, and undo/redo keeps the LIVE values for nodes that still
// exist — so run results, statuses and errors survive structural undos
// instead of being rewound to what they were when the snapshot was taken.
const EPHEMERAL_DATA_KEYS = ['status', 'error', 'result', 'lastOutput', 'uploading', 'connectedInputs', 'textSetAt'] as const
const EPHEMERAL_SET = new Set<string>(EPHEMERAL_DATA_KEYS)

// Rapid updates to the same node fields (typing, slider drags) collapse into
// one undo step while they stay within this window of each other.
const HISTORY_COALESCE_MS = 1200
let coalesceRef: { key: string; at: number } | null = null

// One user gesture can hit the store several times in the same tick (deleting
// a node also removes its edges; connect-on-drop adds a node then an edge;
// multi-file drop adds several nodes). Only the first push snapshots.
let pushedThisTick = false

// Set at the first position change of a drag gesture, cleared when it ends
let dragInProgress = false
let dragPushed = false

const resetHistoryRefs = () => {
  coalesceRef = null
  dragInProgress = false
  dragPushed = false
}

const cloneSnapshot = (nodes: Node[], edges: Edge[]): HistorySnapshot => ({
  nodes: JSON.parse(JSON.stringify(nodes)),
  edges: JSON.parse(JSON.stringify(edges)),
})

// ---------------------------------------------------------------------------
// Connection validation
// ---------------------------------------------------------------------------

const IMAGE_HANDLES = new Set(['image_url', 'images'])
const VIDEO_HANDLES = new Set(['video_url', 'video'])
const AUDIO_HANDLES = new Set(['audio', 'audio_url'])
const TEXT_HANDLES = new Set(['system_prompt', 'user_message', 'prompt', 'tts_text', 'timestamp', 'x_percent', 'y_percent', 'width_percent', 'height_percent', 'text_1', 'text_2', 'text_3', 'text_4'])

const SOURCE_OUTPUT_TYPE: Record<string, string> = {
  textNode: 'text',
  uploadImageNode: 'image',
  uploadVideoNode: 'video',
  uploadAudioNode: 'audio',
  cropImageNode: 'image',
  extractFrameNode: 'image',
  llmNode: 'text',
  textCombineNode: 'text',
  resizeImageNode: 'image',
  imageGenNode: 'image',
  imageEditNode: 'image',
  ttsNode: 'audio',
  transcribeNode: 'text',
  // outputNode is terminal — it has no source handle
}

export function checkIsValidConnection(connection: Connection, nodes: Node[], edges: Edge[]): boolean {
  const sourceNode = nodes.find(n => n.id === connection.source)
  if (!sourceNode) return false
  const outputType = SOURCE_OUTPUT_TYPE[sourceNode.type ?? '']
  const targetHandle = connection.targetHandle ?? ''
  if (outputType === 'image' && (TEXT_HANDLES.has(targetHandle) || VIDEO_HANDLES.has(targetHandle) || AUDIO_HANDLES.has(targetHandle))) return false
  if (outputType === 'video' && (IMAGE_HANDLES.has(targetHandle) || TEXT_HANDLES.has(targetHandle) || AUDIO_HANDLES.has(targetHandle))) return false
  if (outputType === 'text' && (IMAGE_HANDLES.has(targetHandle) || VIDEO_HANDLES.has(targetHandle) || AUDIO_HANDLES.has(targetHandle))) return false
  if (outputType === 'audio' && (IMAGE_HANDLES.has(targetHandle) || VIDEO_HANDLES.has(targetHandle) || TEXT_HANDLES.has(targetHandle))) return false
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
  const isImage = ['uploadImageNode', 'cropImageNode', 'extractFrameNode', 'resizeImageNode', 'imageGenNode', 'imageEditNode'].includes(nodeType ?? '')
  const isVideo = nodeType === 'uploadVideoNode'
  const isAudio = ['uploadAudioNode', 'ttsNode'].includes(nodeType ?? '')
  if (!isImage && !isVideo && !isAudio) return
  addAsset({
    id: `${nodeId}-${Date.now()}`,
    nodeId,
    type: isVideo ? 'video' : isAudio ? 'audio' : 'image',
    url: output,
    createdAt: new Date().toISOString(),
    meta: { model: nodeData.model as string | undefined },
  })
}

// ---------------------------------------------------------------------------
// Run helpers — passthrough nodes (text/upload) never execute on the server,
// their data is used directly.
// ---------------------------------------------------------------------------

const PASSTHROUGH = new Set(['textNode', 'uploadImageNode', 'uploadVideoNode', 'uploadAudioNode'])

// A passthrough source only satisfies downstream dependencies while its data
// still exists — deleting an uploaded asset clears imageUrl/videoUrl/audioUrl.
const passthroughReady = (node: Node): boolean => {
  if (node.type === 'textNode') return true
  if (node.type === 'uploadImageNode') return !!node.data.imageUrl
  if (node.type === 'uploadVideoNode') return !!node.data.videoUrl
  if (node.type === 'uploadAudioNode') return !!node.data.audioUrl
  return false
}

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
  /** Snapshots current nodes/edges as an undo step. Pushes with the same
      coalesceKey in quick succession merge into the first one. */
  pushHistory: (coalesceKey?: string) => void
  /** Bumped whenever state is swapped wholesale (undo/redo/import/load) so
      uncontrolled node inputs remount and re-read their defaultValue. */
  fieldsVersion: number
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
   * Start nodes (no incoming edges) chain into every downstream node whose
   * dependencies are satisfied; mid-graph nodes run alone.
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
  recordAsset: (a: { nodeId: string; type: 'image' | 'video' | 'audio'; url: string; meta?: Asset['meta'] }) => Promise<void>
  /** Removes an asset from the panel, the DB row, and Blob storage. */
  deleteAsset: (id: string) => Promise<void>
  projects: { id: string; name: string; updatedAt: string }[]
  fetchProjects: () => Promise<void>
  /** deleteAssets=false keeps the workflow's uploads/outputs (orphaned). */
  deleteProject: (id: string, deleteAssets?: boolean) => Promise<void>
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

// Materialize a history snapshot: structure and user-edited params come from
// the snapshot; run state (status/outputs/errors) stays live for nodes that
// still exist. Nodes resurrected by the restore keep their snapshotted run
// state, except a stale 'running' which can never be valid here.
function restoreSnapshot(snapshot: HistorySnapshot, currentNodes: Node[]): { nodes: Node[]; edges: Edge[] } {
  const liveById = new Map(currentNodes.map(n => [n.id, n]))
  const nodes = snapshot.nodes.map(n => {
    const live = liveById.get(n.id)
    const data = { ...n.data } as Record<string, unknown>
    if (live) {
      for (const k of EPHEMERAL_DATA_KEYS) data[k] = (live.data as Record<string, unknown>)[k]
    } else if (data.status === 'running') {
      data.status = 'idle'
    }
    return { ...n, data }
  })
  return { nodes: syncConnectedInputs(nodes, snapshot.edges), edges: snapshot.edges }
}

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
    // Deletions (Delete/Backspace) and drags are user actions — snapshot
    // before applying. A drag pushes once at its first movement so the whole
    // gesture (including multi-select drags) is a single undo step.
    const isDragging = changes.some(c => c.type === 'position' && c.dragging)
    const dragEnded = changes.some(c => c.type === 'position' && !c.dragging)
    if (changes.some(c => c.type === 'remove')) {
      get().pushHistory()
    } else if (isDragging && !dragInProgress) {
      dragInProgress = true
      const before = get().past.length
      get().pushHistory()
      dragPushed = get().past.length > before
    }
    set({ nodes: applyNodeChanges(changes, get().nodes) })
    if (dragEnded) {
      // Drag ended where it started — drop the no-op undo step
      if (dragPushed) {
        const { past, nodes } = get()
        const snap = past[past.length - 1]
        if (snap && snap.nodes.length === nodes.length) {
          const pos = new Map(snap.nodes.map(n => [n.id, n.position]))
          const unmoved = nodes.every(n => {
            const p = pos.get(n.id)
            return p !== undefined && p.x === n.position.x && p.y === n.position.y
          })
          if (unmoved) set({ past: past.slice(0, -1) })
        }
      }
      dragInProgress = false
      dragPushed = false
    }
    // Selection and dimension changes are view-only — no need to persist them
    if (changes.some(c => c.type !== 'select' && c.type !== 'dimensions')) get().scheduleAutoSave()
  },
  onEdgesChange: (changes) => {
    // Edge deletions (Delete key, cut tool) are undoable
    if (changes.some(c => c.type === 'remove')) get().pushHistory()
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
    const node = get().nodes.find(n => n.id === nodeId)
    if (!node) return
    // User edits (typing, dropdowns, sliders, uploads) are undoable; run and
    // status writes are not. Bursts on the same fields coalesce into one step.
    const edited = Object.keys(data)
      .filter(k => !EPHEMERAL_SET.has(k) && !Object.is(node.data[k], data[k]))
    if (edited.length > 0) get().pushHistory(`data:${nodeId}:${edited.sort().join(',')}`)
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

  past: [], future: [], fieldsVersion: 0,

  pushHistory: (coalesceKey) => {
    if (pushedThisTick) return
    const now = Date.now()
    if (coalesceKey && coalesceRef && coalesceRef.key === coalesceKey && now - coalesceRef.at < HISTORY_COALESCE_MS) {
      coalesceRef.at = now
      return
    }
    coalesceRef = coalesceKey ? { key: coalesceKey, at: now } : null
    pushedThisTick = true
    setTimeout(() => { pushedThisTick = false }, 0)
    const { nodes, edges, past } = get()
    set({
      past: [...past.slice(-(MAX_HISTORY - 1)), cloneSnapshot(nodes, edges)],
      future: [],
    })
  },

  undo: () => {
    const { past, nodes, edges, future, activeRun, isRunning } = get()
    // Rewinding mid-run would fight the live progress stream
    if (!past.length || activeRun || isRunning) return
    const snapshot = past[past.length - 1]
    const restored = restoreSnapshot(snapshot, nodes)
    resetHistoryRefs()
    set(s => ({
      past: past.slice(0, -1),
      future: [...future, cloneSnapshot(nodes, edges)],
      nodes: restored.nodes,
      edges: restored.edges,
      completedNodeIds: new Set(restored.nodes.filter(n => n.data.status === 'success').map(n => n.id)),
      fieldsVersion: s.fieldsVersion + 1,
    }))
    get().scheduleAutoSave()
  },

  redo: () => {
    const { future, nodes, edges, past, activeRun, isRunning } = get()
    if (!future.length || activeRun || isRunning) return
    const snapshot = future[future.length - 1]
    const restored = restoreSnapshot(snapshot, nodes)
    resetHistoryRefs()
    set(s => ({
      future: future.slice(0, -1),
      past: [...past, cloneSnapshot(nodes, edges)],
      nodes: restored.nodes,
      edges: restored.edges,
      completedNodeIds: new Set(restored.nodes.filter(n => n.data.status === 'success').map(n => n.id)),
      fieldsVersion: s.fieldsVersion + 1,
    }))
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
      // status after a fresh load, and stale errors/failures from a previous
      // session shouldn't survive a refresh as amber banners. Completed nodes
      // must still count as completed so downstream partial runs are allowed.
      const edges: Edge[] = (data.edges ?? []).map((e: Edge) => ({ ...e, type: 'default', animated: false, style: undefined }))
      const nodes: Node[] = syncConnectedInputs(
        (data.nodes ?? []).map((n: Node) => {
          const d = (n.data ?? {}) as Record<string, unknown>
          const staleStatus = d.status === 'running' || d.status === 'failed' || d.status === 'error'
          if (!staleStatus && d.error == null) return n
          return { ...n, data: { ...d, error: undefined, ...(staleStatus ? { status: 'idle' } : {}) } }
        }),
        edges,
      )
      const completedNodeIds = new Set(
        nodes
          .filter(n => (n.data as Record<string, unknown>)?.status === 'success')
          .map(n => n.id),
      )
      resetHistoryRefs()
      set(s => ({
        workflowId: data.id,
        workflowName: data.name ?? 'Untitled',
        nodes,
        edges,
        past: [], future: [],
        fieldsVersion: s.fieldsVersion + 1,
        runningNodeIds: new Set(),
        completedNodeIds,
        saveState: 'idle',
        // Assets/runs come from the DB (fetchAssets/fetchRuns) — deriving
        // assets from node data would resurrect ones the user deleted.
        assets: [],
        assetsLoaded: false,
        runs: [],
      }))
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
    const { nodes, edges, updateNodeData, completedNodeIds } = get()

    // Output nodes are display-only — when one hangs directly off the run set
    // (and its other inputs, if any, are already satisfied) it joins the run
    // automatically so the result shows even if it wasn't selected.
    const targetSet = new Set(targetNodeIds)
    const satisfied = (sourceId: string): boolean => {
      if (targetSet.has(sourceId) || completedNodeIds.has(sourceId)) return true
      const src = nodes.find(n => n.id === sourceId)
      return src ? PASSTHROUGH.has(src.type ?? '') && passthroughReady(src) : false
    }
    let grew = true
    while (grew) {
      grew = false
      for (const n of nodes) {
        if (n.type !== 'outputNode' || targetSet.has(n.id)) continue
        const incoming = edges.filter(e => e.target === n.id)
        if (incoming.length === 0) continue
        if (incoming.some(e => targetSet.has(e.source)) && incoming.every(e => satisfied(e.source))) {
          targetSet.add(n.id)
          grew = true
        }
      }
    }

    const { passthroughIds, executableIds } = splitPassthrough(nodes, [...targetSet])

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
      return srcNode ? PASSTHROUGH.has(srcNode.type ?? '') && passthroughReady(srcNode) : false
    })
  },

  // ---------------------------------------------------------------------------
  // runNode — runs the clicked node plus all downstream nodes (one run).
  // ---------------------------------------------------------------------------
  runNode: async (startNodeId: string) => {
    const { nodes, edges, updateNodeData, canNodeRun, completedNodeIds } = get()

    if (get().runningNodeIds.has(startNodeId) || get().activeRun) return

    if (!canNodeRun(startNodeId)) {
      updateNodeData(startNodeId, {
        status: 'error',
        error: 'Cannot run: upstream nodes have not completed yet.',
      })
      return
    }

    // Mid-graph nodes ("Run" button) execute alone; only start nodes
    // ("Run workflow from this node") chain into their downstream graph.
    const isStart = !edges.some(e => e.target === startNodeId)
    if (!isStart) {
      await get().startRun([startNodeId])
      return
    }

    // Expand downstream from the start node, but only admit a node once EVERY
    // one of its upstream dependencies is satisfied: part of this run, already
    // completed in a previous run, or a passthrough (data lives in node.data).
    // Reachable nodes that never qualify (they also depend on an unfinished
    // branch) are flagged instead of silently running with missing inputs.
    const isSatisfied = (sourceId: string, runSet: Set<string>) => {
      if (runSet.has(sourceId) || completedNodeIds.has(sourceId)) return true
      const src = nodes.find(n => n.id === sourceId)
      return src ? PASSTHROUGH.has(src.type ?? '') && passthroughReady(src) : false
    }

    const runSet = new Set([startNodeId])
    let grew = true
    while (grew) {
      grew = false
      for (const e of edges) {
        if (!runSet.has(e.source) || runSet.has(e.target)) continue
        const ready = edges
          .filter(p => p.target === e.target)
          .every(p => isSatisfied(p.source, runSet))
        if (ready) { runSet.add(e.target); grew = true }
      }
    }

    const blocked = reachableFrom([startNodeId], edges, nodes).filter(id => !runSet.has(id))
    for (const id of blocked) {
      updateNodeData(id, {
        status: 'error',
        error: 'Previous nodes have not completed yet.',
      })
    }

    await get().startRun(nodes.filter(n => runSet.has(n.id)).map(n => n.id))
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
          return src ? !(PASSTHROUGH.has(src.type ?? '') && passthroughReady(src)) : false
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
        type: 'image' | 'video' | 'audio'
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
      // The blob is gone — clear node previews/uploads still pointing at it,
      // and revoke those nodes' "completed" standing so downstream nodes
      // can't run against an output that no longer exists.
      if (url) {
        const clearedIds: string[] = []
        set(s => ({
          nodes: s.nodes.map(n => {
            const d = n.data as Record<string, unknown>
            if (d.lastOutput !== url && d.imageUrl !== url && d.videoUrl !== url) return n
            clearedIds.push(n.id)
            const data: Record<string, unknown> = { ...d, status: 'idle' }
            if (data.lastOutput === url) data.lastOutput = null
            if (data.imageUrl === url) data.imageUrl = null
            if (data.videoUrl === url) data.videoUrl = null
            return { ...n, data }
          }),
        }))
        if (clearedIds.length > 0) {
          set(s => {
            const next = new Set(s.completedNodeIds)
            clearedIds.forEach(nid => next.delete(nid))
            return { completedNodeIds: next }
          })
        }
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
  deleteProject: async (id, deleteAssets = true) => {
    const prev = get().projects
    set(s => ({ projects: s.projects.filter(p => p.id !== id) }))
    const res = await fetch(`/api/projects/${id}?deleteAssets=${deleteAssets}`, { method: 'DELETE' })
    if (!res.ok) { set({ projects: prev }); return }

    // Deleted the workflow that's currently open — reset to a fresh canvas
    if (get().workflowId === id) {
      if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
      resetHistoryRefs()
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
      // Importing opens a different (unsaved) document — undoing across that
      // boundary would autosave the old canvas into the new workflow id, so
      // history starts fresh instead.
      resetHistoryRefs()
      set(s => ({
        workflowName: data.name ?? 'Imported',
        nodes,
        edges: data.edges ?? [],
        workflowId: 'new',
        past: [], future: [],
        fieldsVersion: s.fieldsVersion + 1,
        runningNodeIds: new Set(),
        completedNodeIds: new Set(),
        // Different (unsaved) workflow — drop the previous one's panel state
        runs: [],
        assets: [],
        assetsLoaded: false,
      }))
      get().scheduleAutoSave()
    } catch { /**/ }
  },

  loadSampleWorkflow: () => {
    const nodes: Node[] = JSON.parse(JSON.stringify(SAMPLE_WORKFLOW.nodes))
    // New unsaved document — same reasoning as importWorkflow
    resetHistoryRefs()
    set(s => ({
      workflowName: SAMPLE_WORKFLOW.name,
      nodes,
      edges: JSON.parse(JSON.stringify(SAMPLE_WORKFLOW.edges)),
      workflowId: 'new',
      past: [], future: [],
      fieldsVersion: s.fieldsVersion + 1,
      runningNodeIds: new Set(),
      completedNodeIds: new Set(),
      runs: [],
      assets: [],
      assetsLoaded: false,
    }))
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