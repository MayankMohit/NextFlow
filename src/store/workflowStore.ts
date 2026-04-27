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

function isValidConnection(connection: Connection, nodes: Node[]): boolean {
  const sourceNode = nodes.find(n => n.id === connection.source)
  if (!sourceNode) return false
  const outputType = SOURCE_OUTPUT_TYPE[sourceNode.type ?? '']
  const targetHandle = connection.targetHandle ?? ''
  if (outputType === 'image' && (TEXT_HANDLES.has(targetHandle) || VIDEO_HANDLES.has(targetHandle))) return false
  if (outputType === 'video' && (IMAGE_HANDLES.has(targetHandle) || TEXT_HANDLES.has(targetHandle))) return false
  if (outputType === 'text' && (IMAGE_HANDLES.has(targetHandle) || VIDEO_HANDLES.has(targetHandle))) return false
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
  isRunning: boolean
  runWorkflow: (scope?: 'full' | 'partial' | 'single', selectedNodeIds?: string[]) => Promise<void>
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
    if (!isValidConnection(connection, nodes)) return
    const newEdge: Edge = {
      ...connection,
      id: `e-${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}`,
      animated: true,
      style: { stroke: '#7c3aed', strokeWidth: 2 },
    }
    if (hasCycle(edges, newEdge)) return
    get().pushHistory()
    set({ edges: addEdge(newEdge, edges) })
    const targetNode = nodes.find(n => n.id === connection.target)
    if (targetNode && connection.targetHandle) {
      const existing = (targetNode.data.connectedInputs as string[] | undefined) ?? []
      get().updateNodeData(connection.target, {
        connectedInputs: [...new Set([...existing, connection.targetHandle])]
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
      past: [...past.slice(-MAX_HISTORY), { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }],
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
      set({ workflowId: data.id, workflowName: data.name ?? 'Untitled', nodes: data.nodes ?? [], edges: data.edges ?? [], past: [], future: [] })
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
      if (workflowId === 'new') { set({ workflowId: data.id }); window.history.replaceState({}, '', `/workflow/${data.id}`) }
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

  isRunning: false,

  runWorkflow: async (scope = 'full', selectedNodeIds) => {
    const { workflowId, nodes, edges, updateNodeData, fetchRuns } = get()
    set({ isRunning: true })
    const targetIds = scope === 'full' ? nodes.map(n => n.id) : (selectedNodeIds ?? [])
    for (const id of targetIds) updateNodeData(id, { status: 'running' })
    try {
      const res = await fetch(`/api/workflow/${workflowId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges, scope, selectedNodeIds }),
      })
      if (!res.ok) { for (const id of targetIds) updateNodeData(id, { status: 'failed', error: 'Run failed' }); return }
      const data = await res.json()
      if (workflowId === 'new' && data.workflowId) { set({ workflowId: data.workflowId }); window.history.replaceState({}, '', `/workflow/${data.workflowId}`) }
      const nodeOutputs: Record<string, unknown> = data.nodeOutputs ?? {}
      const nodeRuns: Array<{ nodeId: string; status: string; error?: string }> = data.nodeRuns ?? []
      for (const nr of nodeRuns) {
        const output = nodeOutputs[nr.nodeId]
        updateNodeData(nr.nodeId, { status: nr.status, result: typeof output === 'string' ? output : undefined, error: nr.error })
        const node = nodes.find(n => n.id === nr.nodeId)
        if (node && typeof output === 'string' && output.startsWith('http')) {
          const isImage = ['uploadImageNode', 'cropImageNode', 'extractFrameNode'].includes(node.type ?? '')
          const isVideo = node.type === 'uploadVideoNode'
          if (isImage || isVideo) get().addAsset({ id: `${nr.nodeId}-${Date.now()}`, nodeId: nr.nodeId, type: isVideo ? 'video' : 'image', url: output, createdAt: new Date().toISOString(), meta: { model: node.data.model as string | undefined } })
        }
      }
      await fetchRuns()
    } catch (err) {
      for (const id of targetIds) updateNodeData(id, { status: 'failed', error: String(err) })
    } finally { set({ isRunning: false }) }
  },

  runs: [],
  fetchRuns: async () => {
    const { workflowId } = get()
    if (workflowId === 'new') return
    try { const res = await fetch(`/api/runs/${workflowId}`); if (res.ok) set({ runs: await res.json() }) } catch { /**/ }
  },

  assets: [],
  addAsset: (asset) => set(s => ({ assets: [asset, ...s.assets] })),

  projects: [],
  fetchProjects: async () => {
    try { const res = await fetch('/api/projects'); if (res.ok) set({ projects: await res.json() }) } catch { /**/ }
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
    const blob = new Blob([JSON.stringify({ name: workflowName, nodes, edges }, null, 2)], { type: 'application/json' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${workflowName.replace(/\s+/g, '_')}.json` })
    a.click(); URL.revokeObjectURL(a.href)
  },

  importWorkflow: (json) => {
    try {
      const data = JSON.parse(json)
      get().pushHistory()
      set({ workflowName: data.name ?? 'Imported', nodes: data.nodes ?? [], edges: data.edges ?? [], workflowId: 'new' })
    } catch { /**/ }
  },

  loadSampleWorkflow: () => {
    get().pushHistory()
    set({ workflowName: SAMPLE_WORKFLOW.name, nodes: SAMPLE_WORKFLOW.nodes, edges: SAMPLE_WORKFLOW.edges, workflowId: 'new' })
  },
}))