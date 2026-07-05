'use client'

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  SelectionMode,
  type Node,
  type Edge,
  type Connection,
  type FinalConnectionState,
  useReactFlow,
  useStore,
  useStoreApi,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useWorkflowStore, checkIsValidConnection } from '@/store/workflowStore'
import TextNode from '@/components/nodes/TextNode'
import UploadImageNode from '@/components/nodes/UploadImageNode'
import UploadVideoNode from '@/components/nodes/UploadVideoNode'
import LLMNode from '@/components/nodes/LLMNode'
import CropImageNode from '@/components/nodes/CropImageNode'
import ExtractFrameNode from '@/components/nodes/ExtractFrameNode'
import OutputNode from '@/components/nodes/OutputNode'
import TextCombineNode from '@/components/nodes/TextCombineNode'
import ResizeImageNode from '@/components/nodes/ResizeImageNode'
import GradientEdge from '@/components/edges/GradientEdge'
import { Scissors, Play, Loader2, BoxSelect } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { upload } from '@vercel/blob/client'
import { shallow } from 'zustand/shallow'
import { useIsMobile } from '@/hooks/useIsMobile'

const nodeTypes = {
  textNode: TextNode,
  uploadImageNode: UploadImageNode,
  uploadVideoNode: UploadVideoNode,
  llmNode: LLMNode,
  cropImageNode: CropImageNode,
  extractFrameNode: ExtractFrameNode,
  outputNode: OutputNode,
  textCombineNode: TextCombineNode,
  resizeImageNode: ResizeImageNode,
}

const edgeTypes = {
  default: GradientEdge,
}

const getInitialData = (type: string) => {
  switch (type) {
    case 'textNode': return { label: 'Text', text: '', status: 'idle' }
    case 'uploadImageNode': return { label: 'Upload Image', imageUrl: null, status: 'idle' }
    case 'uploadVideoNode': return { label: 'Upload Video', videoUrl: null, status: 'idle' }
    case 'llmNode': return { label: 'LLM', model: 'gemini-3.1-flash-lite-preview', result: null, status: 'idle' }
    case 'cropImageNode': return { label: 'Crop Image', xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 100, status: 'idle' }
    case 'extractFrameNode': return { label: 'Extract Frame', timestamp: '0', status: 'idle' }
    case 'outputNode': return { label: 'Output', lastOutput: null, status: 'idle' }
    case 'textCombineNode': return { label: 'Text Combine', template: '', status: 'idle' }
    case 'resizeImageNode': return { label: 'Resize Image', width: 512, fit: 'cover', status: 'idle' }
    default: return { label: type, status: 'idle' }
  }
}

const NODE_TYPES_LIST = [
  { type: 'textNode', label: 'Text' },
  { type: 'uploadImageNode', label: 'Upload Image' },
  { type: 'uploadVideoNode', label: 'Upload Video' },
  { type: 'llmNode', label: 'LLM' },
  { type: 'cropImageNode', label: 'Crop Image' },
  { type: 'extractFrameNode', label: 'Extract Frame' },
  { type: 'textCombineNode', label: 'Text Combine' },
  { type: 'resizeImageNode', label: 'Resize Image' },
  { type: 'outputNode', label: 'Output' },
]

// --- Connect-on-drop smart modal ---

const SOURCE_OUTPUT_MAP: Record<string, 'image' | 'video' | 'text'> = {
  textNode: 'text',
  uploadImageNode: 'image',
  uploadVideoNode: 'video',
  cropImageNode: 'image',
  extractFrameNode: 'image',
  llmNode: 'text',
  textCombineNode: 'text',
  resizeImageNode: 'image',
}

type DropSuggestion = { nodeType: string; label: string; targetHandle?: string; sourceHandle?: string }

const OUTPUT_TO_TARGETS: Record<string, DropSuggestion[]> = {
  image: [
    { nodeType: 'llmNode', label: 'LLM', targetHandle: 'image_url' },
    { nodeType: 'cropImageNode', label: 'Crop Image', targetHandle: 'image_url' },
    { nodeType: 'resizeImageNode', label: 'Resize Image', targetHandle: 'image_url' },
    { nodeType: 'outputNode', label: 'Output', targetHandle: 'input' },
  ],
  video: [
    { nodeType: 'extractFrameNode', label: 'Extract Frame', targetHandle: 'video_url' },
    { nodeType: 'outputNode', label: 'Output', targetHandle: 'input' },
  ],
  text: [
    { nodeType: 'llmNode', label: 'LLM — Prompt', targetHandle: 'user_message' },
    { nodeType: 'llmNode', label: 'LLM — System Prompt', targetHandle: 'system_prompt' },
    { nodeType: 'textCombineNode', label: 'Text Combine', targetHandle: 'text_1' },
    { nodeType: 'outputNode', label: 'Output', targetHandle: 'input' },
    { nodeType: 'extractFrameNode', label: 'Extract Frame — Timestamp', targetHandle: 'timestamp' },
    { nodeType: 'cropImageNode', label: 'Crop Image — X%', targetHandle: 'x_percent' },
    { nodeType: 'cropImageNode', label: 'Crop Image — Y%', targetHandle: 'y_percent' },
    { nodeType: 'cropImageNode', label: 'Crop Image — Width%', targetHandle: 'width_percent' },
    { nodeType: 'cropImageNode', label: 'Crop Image — Height%', targetHandle: 'height_percent' },
  ],
}

const TEXT_SOURCES: DropSuggestion[] = [
  { nodeType: 'textNode', label: 'Text', sourceHandle: 'output' },
  { nodeType: 'llmNode', label: 'LLM', sourceHandle: 'output' },
  { nodeType: 'textCombineNode', label: 'Text Combine', sourceHandle: 'output' },
]

const HANDLE_TO_SOURCES: Record<string, DropSuggestion[]> = {
  image_url: [
    { nodeType: 'uploadImageNode', label: 'Upload Image', sourceHandle: 'output' },
    { nodeType: 'cropImageNode', label: 'Crop Image', sourceHandle: 'output' },
    { nodeType: 'extractFrameNode', label: 'Extract Frame', sourceHandle: 'output' },
    { nodeType: 'resizeImageNode', label: 'Resize Image', sourceHandle: 'output' },
  ],
  video_url: [
    { nodeType: 'uploadVideoNode', label: 'Upload Video', sourceHandle: 'output' },
  ],
  system_prompt: TEXT_SOURCES,
  user_message: TEXT_SOURCES,
  text_1: TEXT_SOURCES,
  text_2: TEXT_SOURCES,
  text_3: TEXT_SOURCES,
  text_4: TEXT_SOURCES,
  // Output node accepts anything
  input: [
    { nodeType: 'llmNode', label: 'LLM', sourceHandle: 'output' },
    { nodeType: 'textNode', label: 'Text', sourceHandle: 'output' },
    { nodeType: 'textCombineNode', label: 'Text Combine', sourceHandle: 'output' },
    { nodeType: 'uploadImageNode', label: 'Upload Image', sourceHandle: 'output' },
    { nodeType: 'cropImageNode', label: 'Crop Image', sourceHandle: 'output' },
    { nodeType: 'resizeImageNode', label: 'Resize Image', sourceHandle: 'output' },
    { nodeType: 'extractFrameNode', label: 'Extract Frame', sourceHandle: 'output' },
    { nodeType: 'uploadVideoNode', label: 'Upload Video', sourceHandle: 'output' },
  ],
  timestamp: [{ nodeType: 'textNode', label: 'Text', sourceHandle: 'output' }],
  x_percent: [{ nodeType: 'textNode', label: 'Text', sourceHandle: 'output' }],
  y_percent: [{ nodeType: 'textNode', label: 'Text', sourceHandle: 'output' }],
  width_percent: [{ nodeType: 'textNode', label: 'Text', sourceHandle: 'output' }],
  height_percent: [{ nodeType: 'textNode', label: 'Text', sourceHandle: 'output' }],
}

interface ConnectDropCtx {
  x: number; y: number; flowX: number; flowY: number
  sourceNodeId: string; sourceHandle: string | null; handleType: 'source' | 'target'
}

function ConnectDropModal({
  ctx, suggestions, isDark, onSelect, onClose,
}: {
  ctx: ConnectDropCtx
  suggestions: DropSuggestion[]
  isDark: boolean
  onSelect: (s: DropSuggestion) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) onClose()
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className={`fixed z-100 border rounded-lg py-1 w-52 shadow-xl overflow-hidden ${isDark ? 'bg-[#1c1c1c] border-[#2a2a2a]' : 'bg-white border-[#e0e0e0]'}`}
      style={{ left: ctx.x, top: ctx.y }}
    >
      <div className={`px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-wider font-medium border-b ${isDark ? 'text-[#555] border-[#2a2a2a]' : 'text-[#aaa] border-[#e8e8e8]'}`}>
        Add &amp; connect
      </div>
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${isDark ? 'text-white hover:bg-[#2a2a2a]' : 'text-[#111] hover:bg-[#f0f0f0]'}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}

// --- Cut tool geometry helpers ---

function lineSegmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1x = bx - ax, d1y = by - ay
  const d2x = dx - cx, d2y = dy - cy
  const cross = d1x * d2y - d1y * d2x
  if (Math.abs(cross) < 1e-10) return false
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / cross
  const u = ((cx - ax) * d1y - (cy - ay) * d1x) / cross
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

function sampleCubicBezier(
  p0x: number, p0y: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  p3x: number, p3y: number,
  steps = 24,
): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    const it = 1 - t
    return [
      it ** 3 * p0x + 3 * it ** 2 * t * p1x + 3 * it * t ** 2 * p2x + t ** 3 * p3x,
      it ** 3 * p0y + 3 * it ** 2 * t * p1y + 3 * it * t ** 2 * p2y + t ** 3 * p3y,
    ] as [number, number]
  })
}

// Build a smooth catmull-rom-like SVG path from collected points
function buildSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mid = {
      x: (pts[i].x + pts[i + 1].x) / 2,
      y: (pts[i].y + pts[i + 1].y) / 2,
    }
    d += ` Q ${pts[i].x} ${pts[i].y} ${mid.x} ${mid.y}`
  }
  d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`
  return d
}

// --- Group run button ---
// Positioned at the top-left corner of the bounding box of the selected
// nodes, tracking pan/zoom in real time via ReactFlow's internal store.

interface GroupRunButtonProps {
  selectedNodeIds: string[]
  isDark: boolean
}

function GroupRunButton({ selectedNodeIds, isDark }: GroupRunButtonProps) {
  const { runNodes, runningNodeIds, saveWorkflow } = useWorkflowStore()

  // Selected nodes and current viewport transform from RF's internal store.
  // transform is [panX, panY, zoom]; flow→screen: screenX = flowX*zoom + panX
  const selectedRFNodes = useStore(s => s.nodes.filter(n => n.selected), shallow)
  const [panX, panY, zoom] = useStore(s => s.transform)

  const isAnyRunning = selectedNodeIds.some(id => runningNodeIds.has(id))

  const handleRun = async () => {
    await saveWorkflow()
    await runNodes(selectedNodeIds)
  }

  if (selectedRFNodes.length === 0) return null

  // Bounding box top-left in flow space
  const minFlowX = Math.min(...selectedRFNodes.map(n => n.position.x))
  const minFlowY = Math.min(...selectedRFNodes.map(n => n.position.y))

  // Convert to container-relative screen coords
  const screenX = minFlowX * zoom + panX
  const screenY = minFlowY * zoom + panY

  // Place button 8px above the top edge; clamp so it never hides above the canvas
  const BUTTON_W = 95
  const GAP = 8
  const top = Math.max(GAP, screenY)
  const left = screenX - BUTTON_W - GAP

  return (
    <div className="absolute z-40 pointer-events-none" style={{ top, left }}>
      <button
        className={`
          pointer-events-auto flex items-center gap-1.5 px-3 py-1.5
          rounded-lg text-[12px] font-medium shadow-lg border transition-all whitespace-nowrap
          ${isAnyRunning
            ? 'bg-blue-900 border-blue-700 text-blue-300 cursor-wait'
            : 'bg-blue-600 hover:bg-blue-500 border-blue-500 text-white'
          }
        `}
        onClick={handleRun}
        disabled={isAnyRunning}
        title="Run selected nodes"
      >
        {isAnyRunning
          ? <><Loader2 size={8} className="animate-spin" />Running nodes…</>
          : <><Play size={8} />Run nodes</>
        }
      </button>
    </div>
  )
}

// --- Main canvas ---

export default function WorkflowCanvas() {
  const {
    nodes, edges, onNodesChange, onEdgesChange, onConnect,
    addNode, undo, redo, saveWorkflow, runNodes, theme, canvasTool,
  } = useWorkflowStore()

  const isValidConnection = useCallback(
    (connection: Edge | Connection) => checkIsValidConnection(connection as Connection, nodes, edges),
    [nodes, edges],
  )

  // Mobile "select all" — dispatch a select change for every node through the
  // normal onNodesChange path so the store stays in sync.
  const selectAll = useCallback(() => {
    onNodesChange(nodes.map(n => ({ id: n.id, type: 'select' as const, selected: true })))
  }, [nodes, onNodesChange])
  const { screenToFlowPosition, getEdges, getNode, deleteElements, getViewport, setViewport } = useReactFlow()
  const storeApi = useStoreApi()
  const isDark = theme === 'dark'
  const isMobile = useIsMobile()

  // Touch has no shift key, so force ReactFlow's multi-select mode on for
  // mobile: each tap then toggles a node in/out of the selection instead of
  // replacing it. RF only writes this flag from a key-press effect (never
  // fires on touch), so our value persists. Desktop keeps shift-to-multiselect.
  useEffect(() => {
    storeApi.setState({ multiSelectionActive: isMobile })
  }, [isMobile, storeApi])

  const containerRef = useRef<HTMLDivElement>(null)

  // ── Track which nodes are currently selected ───────────────────────────────
  // useStore gives us live access to ReactFlow's internal node list including
  // the `selected` flag, without needing any extra state.
  const RUNNABLE_TYPES = new Set(['cropImageNode', 'extractFrameNode', 'llmNode'])

  // shallow equality: the selector builds a fresh array every call — without
  // it, every RF store update re-renders the canvas (and can cascade into a
  // "maximum update depth exceeded" loop)
  const selectedNodeIds = useStore(
    s => s.nodes.filter(n => n.selected).map(n => n.id),
    shallow,
  )
  const hasRunnableSelected = useStore(s =>
    s.nodes.some(n => n.selected && RUNNABLE_TYPES.has(n.type ?? ''))
  )
  const showGroupRun = selectedNodeIds.length >= 2 && hasRunnableSelected

  // Keep a ref so the keyboard handler always has the latest selection
  // without needing to re-register on every selection change.
  const selectedNodeIdsRef = useRef<string[]>(selectedNodeIds)
  useEffect(() => { selectedNodeIdsRef.current = selectedNodeIds }, [selectedNodeIds])

  // Connect-on-drop modal
  const [connectDropCtx, setConnectDropCtx] = useState<ConnectDropCtx | null>(null)

  const handleConnectEnd = useCallback((event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
    const state = connectionState as { from: unknown; fromNode?: { id: string }; fromHandle?: { id: string; type: string }; toNode: unknown }
    if (!state.from || state.toNode !== null) return
    const e = event as MouseEvent
    const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setConnectDropCtx({
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 300),
      flowX: flow.x, flowY: flow.y,
      sourceNodeId: state.fromNode?.id ?? '',
      sourceHandle: state.fromHandle?.id ?? null,
      handleType: (state.fromHandle?.type ?? 'source') as 'source' | 'target',
    })
  }, [screenToFlowPosition])

  const handleConnectDropSelect = useCallback((suggestion: DropSuggestion) => {
    if (!connectDropCtx) return
    const newId = `${suggestion.nodeType}-${Date.now()}`
    const offsetX = connectDropCtx.handleType === 'source' ? 30 : -290
    addNode({
      id: newId,
      type: suggestion.nodeType,
      position: { x: connectDropCtx.flowX + offsetX, y: connectDropCtx.flowY - 20 },
      data: getInitialData(suggestion.nodeType),
    } as Node)
    if (connectDropCtx.handleType === 'source') {
      onConnect({
        source: connectDropCtx.sourceNodeId,
        sourceHandle: connectDropCtx.sourceHandle ?? 'output',
        target: newId,
        targetHandle: suggestion.targetHandle ?? null,
      })
    } else {
      onConnect({
        source: newId,
        sourceHandle: suggestion.sourceHandle ?? 'output',
        target: connectDropCtx.sourceNodeId,
        targetHandle: connectDropCtx.sourceHandle ?? null,
      })
    }
    setConnectDropCtx(null)
  }, [connectDropCtx, addNode, onConnect])

  const connectDropSuggestions: DropSuggestion[] = connectDropCtx
    ? connectDropCtx.handleType === 'source'
      ? OUTPUT_TO_TARGETS[SOURCE_OUTPUT_MAP[nodes.find(n => n.id === connectDropCtx.sourceNodeId)?.type ?? ''] ?? ''] ?? []
      : HANDLE_TO_SOURCES[connectDropCtx.sourceHandle ?? ''] ?? []
    : []

  // Add-node context modal (double-click / right-click on pane)
  const [addNodeCtx, setAddNodeCtx] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null)
  const addModalRef = useRef<HTMLDivElement>(null)

  const openAddModal = useCallback((clientX: number, clientY: number) => {
    const flow = screenToFlowPosition({ x: clientX, y: clientY })
    // Clamp so the modal (≈176px × 300px) stays inside the viewport
    const x = Math.min(clientX, window.innerWidth - 184)
    const y = Math.min(clientY, window.innerHeight - 308)
    setAddNodeCtx({ x, y, flowX: flow.x, flowY: flow.y })
  }, [screenToFlowPosition])

  const handleAddNode = useCallback((type: string) => {
    if (!addNodeCtx) return
    addNode({
      id: `${type}-${Date.now()}`,
      type,
      position: { x: addNodeCtx.flowX, y: addNodeCtx.flowY },
      data: getInitialData(type),
    } as Node)
    setAddNodeCtx(null)
  }, [addNodeCtx, addNode])

  useEffect(() => {
    if (!addNodeCtx) return
    const handler = (e: MouseEvent) => {
      if (addModalRef.current && !addModalRef.current.contains(e.target as globalThis.Node)) {
        setAddNodeCtx(null)
      }
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [addNodeCtx])

  // Native capture-phase dblclick — React's onDoubleClick never fires because
  // ReactFlow stops propagation on the pane in the bubble phase.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.react-flow__node') || target.closest('.react-flow__edge')) return
      openAddModal(e.clientX, e.clientY)
    }
    el.addEventListener('dblclick', handler, true)
    return () => el.removeEventListener('dblclick', handler, true)
  }, [openAddModal])

  // Cut tool state — all in local (container-relative) px coords
  const [cutPoints, setCutPoints] = useState<{ x: number; y: number }[]>([])
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
  const [cursorAngle, setCursorAngle] = useState(0)
  const isDrawing = useRef(false)
  const lastCursorLocal = useRef<{ x: number; y: number } | null>(null)
  // Accumulated angle avoids 180°→−180° wrapping that causes backward spin
  const accAngle = useRef(0)
  const prevRawAngle = useRef<number | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if (ctrl && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo() }
      if (ctrl && e.key === 's') { e.preventDefault(); saveWorkflow() }
      if (ctrl && e.key === 'Enter') {
        e.preventDefault()
        const ids = selectedNodeIdsRef.current
        if (ids.length > 0) void saveWorkflow().then(() => runNodes(ids))
      }

      if (ctrl && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        const el = containerRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const { x, y, zoom } = getViewport()
        const cx = rect.width / 2
        const cy = rect.height / 2
        const newZoom = Math.min(4, zoom * 1.2)
        setViewport({ x: cx - ((cx - x) / zoom) * newZoom, y: cy - ((cy - y) / zoom) * newZoom, zoom: newZoom }, { duration: 150 })
      }
      if (ctrl && e.key === '-') {
        e.preventDefault()
        const el = containerRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const { x, y, zoom } = getViewport()
        const cx = rect.width / 2
        const cy = rect.height / 2
        const newZoom = Math.max(0.1, zoom / 1.2)
        setViewport({ x: cx - ((cx - x) / zoom) * newZoom, y: cy - ((cy - y) / zoom) * newZoom, zoom: newZoom }, { duration: 150 })
      }
      if (ctrl && e.key === '0') {
        e.preventDefault()
        setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 200 })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, saveWorkflow, runNodes, getViewport, setViewport])

  // Faster pinch/ctrl+wheel zoom than React Flow's built-in (fixed slow speed,
  // no prop to tune it). Non-zoom scrolls fall through to panOnScroll.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      e.stopPropagation()
      const { x, y, zoom } = getViewport()
      const rect = el.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      // Flow-space coordinates under the mouse (invariant point)
      const pivotX = (mouseX - x) / zoom
      const pivotY = (mouseY - y) / zoom
      const newZoom = Math.max(0.1, Math.min(4, zoom * Math.exp(-e.deltaY * 0.003)))
      setViewport({ x: mouseX - pivotX * newZoom, y: mouseY - pivotY * newZoom, zoom: newZoom })
    }
    el.addEventListener('wheel', handler, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', handler, { capture: true } as EventListenerOptions)
  }, [getViewport, setViewport])

  // Reset cursor state when switching away from cut tool
  useEffect(() => {
    if (canvasTool !== 'cut') {
      isDrawing.current = false
      lastCursorLocal.current = null
      setCutPoints([])
      setCursorPos(null)
    }
  }, [canvasTool])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'
  }, [])

  // Upload a dropped file into an upload node (existing or newly created).
  // data.uploading drives the node's spinner since the upload runs out here.
  const uploadFileIntoNode = useCallback(async (nodeId: string, kind: 'image' | 'video', file: File) => {
    const { updateNodeData, recordAsset } = useWorkflowStore.getState()
    updateNodeData(nodeId, { uploading: true, error: undefined })
    try {
      const blob = await upload(`uploads/${file.name}`, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
      })
      updateNodeData(nodeId, kind === 'image'
        ? { imageUrl: blob.url, uploading: false }
        : { videoUrl: blob.url, uploading: false })
      void recordAsset({ nodeId, type: kind, url: blob.url })
    } catch (err: unknown) {
      updateNodeData(nodeId, { uploading: false, error: err instanceof Error ? err.message : 'Upload failed' })
    }
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })

    // Node-palette drag from the sidebar
    const paletteType = e.dataTransfer.getData('application/reactflow')
    if (paletteType) {
      addNode({ id: `${paletteType}-${Date.now()}`, type: paletteType, position, data: getInitialData(paletteType) } as Node)
      return
    }

    // Which node (if any) the drop landed on
    const { nodes: liveNodes, updateNodeData } = useWorkflowStore.getState()
    const targetId = (e.target as HTMLElement).closest('.react-flow__node')?.getAttribute('data-id') ?? null
    const targetNode = targetId ? liveNodes.find(n => n.id === targetId) : null

    // Image/video files dropped from the OS or another window
    const files = Array.from(e.dataTransfer.files)
      .filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (files.length > 0) {
      let usedTarget = false
      let created = 0
      for (const file of files) {
        const kind = file.type.startsWith('image/') ? 'image' as const : 'video' as const
        const wantedType = kind === 'image' ? 'uploadImageNode' : 'uploadVideoNode'
        let nodeId: string
        if (!usedTarget && targetNode?.type === wantedType) {
          // Dropped on a matching upload node — replace its media
          nodeId = targetNode.id
          usedTarget = true
        } else {
          nodeId = `${wantedType}-${Date.now()}-${created}`
          addNode({
            id: nodeId,
            type: wantedType,
            position: { x: position.x + created * 40, y: position.y + created * 40 },
            data: getInitialData(wantedType),
          } as Node)
          created++
        }
        void uploadFileIntoNode(nodeId, kind, file)
      }
      return
    }

    // Text drag (selected text, or a media URL from another tab)
    const text = e.dataTransfer.getData('text/plain').trim()
    if (!text) return
    const isImageUrl = /^https?:\/\/\S+\.(png|jpe?g|webp|gif)(\?\S*)?$/i.test(text)
    const isVideoUrl = /^https?:\/\/\S+\.(mp4|webm|mov|m4v)(\?\S*)?$/i.test(text)

    if (isImageUrl || isVideoUrl) {
      const wantedType = isImageUrl ? 'uploadImageNode' : 'uploadVideoNode'
      const dataKey = isImageUrl ? 'imageUrl' : 'videoUrl'
      if (targetNode?.type === wantedType) {
        updateNodeData(targetNode.id, { [dataKey]: text })
      } else {
        addNode({ id: `${wantedType}-${Date.now()}`, type: wantedType, position, data: { ...getInitialData(wantedType), [dataKey]: text } } as Node)
      }
      return
    }

    if (targetNode?.type === 'textNode') {
      // textSetAt remounts the uncontrolled textarea so the dropped text shows
      updateNodeData(targetNode.id, { text, textSetAt: Date.now() })
    } else {
      addNode({ id: `textNode-${Date.now()}`, type: 'textNode', position, data: { ...getInitialData('textNode'), text } } as Node)
    }
  }, [screenToFlowPosition, addNode, uploadFileIntoNode])

  // ── Cut overlay handlers ──────────────────────────────────────────────────

  // Shared by mouse and touch so the cut tool works identically on mobile
  const beginCut = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect()
    const lx = clientX - rect.left
    const ly = clientY - rect.top
    isDrawing.current = true
    lastCursorLocal.current = { x: lx, y: ly }
    // Reset accumulated angle for each new stroke
    prevRawAngle.current = null
    setCutPoints([{ x: lx, y: ly }])
  }, [])

  const handleCutMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    beginCut(e.clientX, e.clientY)
  }, [beginCut])

  const moveCut = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect()
    const lx = clientX - rect.left
    const ly = clientY - rect.top

    // Update rotation from movement direction (only when moved > 3px to reduce noise)
    if (lastCursorLocal.current) {
      const dx = lx - lastCursorLocal.current.x
      const dy = ly - lastCursorLocal.current.y
      if (dx * dx + dy * dy > 9) {
        const raw = Math.atan2(dy, dx) * (180 / Math.PI)
        if (prevRawAngle.current !== null) {
          // Add the shortest-path delta so the angle accumulates monotonically
          let delta = raw - prevRawAngle.current
          if (delta > 180) delta -= 360
          if (delta < -180) delta += 360
          accAngle.current += delta
        } else {
          accAngle.current = raw
        }
        prevRawAngle.current = raw
        lastCursorLocal.current = { x: lx, y: ly }
        setCursorAngle(accAngle.current)
      }
    }

    setCursorPos({ x: lx, y: ly })

    if (isDrawing.current) {
      setCutPoints(pts => {
        if (pts.length === 0) return pts
        const last = pts[pts.length - 1]
        const dx = lx - last.x
        const dy = ly - last.y
        // Throttle: skip point if < 4px from last to keep path clean
        if (dx * dx + dy * dy < 16) return pts
        return [...pts, { x: lx, y: ly }]
      })
    }
  }, [])

  const handleCutMouseMove = useCallback((e: React.MouseEvent) => {
    moveCut(e.clientX, e.clientY)
  }, [moveCut])

  const endCut = useCallback(() => {
    if (!isDrawing.current || cutPoints.length < 2) {
      isDrawing.current = false
      setCutPoints([])
      return
    }
    isDrawing.current = false

    const rect = containerRef.current!.getBoundingClientRect()
    // Convert each local point to flow coords for intersection math
    const flowPts = cutPoints.map(p =>
      screenToFlowPosition({ x: p.x + rect.left, y: p.y + rect.top })
    )

    const toDelete: { id: string }[] = []
    for (const edge of getEdges()) {
      const src = getNode(edge.source)
      const tgt = getNode(edge.target)
      if (!src || !tgt) continue

      const sx = src.position.x + (src.measured?.width ?? 200)
      const sy = src.position.y + (src.measured?.height ?? 80) / 2
      const tx = tgt.position.x
      const ty = tgt.position.y + (tgt.measured?.height ?? 80) / 2
      const cpDx = Math.abs(tx - sx) * 0.5
      const edgePts = sampleCubicBezier(sx, sy, sx + cpDx, sy, tx - cpDx, ty, tx, ty)

      let hit = false
      for (let pi = 0; pi < flowPts.length - 1 && !hit; pi++) {
        for (let ei = 0; ei < edgePts.length - 1; ei++) {
          if (lineSegmentsIntersect(
            flowPts[pi].x, flowPts[pi].y, flowPts[pi + 1].x, flowPts[pi + 1].y,
            edgePts[ei][0], edgePts[ei][1], edgePts[ei + 1][0], edgePts[ei + 1][1],
          )) { hit = true; break }
        }
      }
      if (hit) toDelete.push({ id: edge.id })
    }

    if (toDelete.length > 0) deleteElements({ edges: toDelete })
    setCutPoints([])
  }, [cutPoints, screenToFlowPosition, getEdges, getNode, deleteElements])

  // ── ReactFlow mode props ──────────────────────────────────────────────────

  const desktopRfProps = canvasTool === 'select'
    ? { selectionOnDrag: true, panOnDrag: [1, 2] as number[], selectionMode: SelectionMode.Partial, nodesDraggable: true }
    : canvasTool === 'pan'
    ? { selectionOnDrag: false, panOnDrag: true as const, nodesDraggable: false }
    : { selectionOnDrag: false, panOnDrag: false as const, nodesDraggable: false }

  // Mobile: one-finger pan, pinch zoom (zoomOnPinch is already on), drag
  // nodes in select mode. Desktop props above are untouched.
  const rfProps = isMobile
    ? canvasTool === 'cut'
      ? { selectionOnDrag: false, panOnDrag: false as const, nodesDraggable: false }
      : { selectionOnDrag: false, panOnDrag: true as const, nodesDraggable: canvasTool === 'select' }
    : desktopRfProps

  return (
    <div ref={containerRef} className="w-full h-full relative" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={handleConnectEnd}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        deleteKeyCode={['Delete', 'Backspace']}
        multiSelectionKeyCode="Shift"
        style={{ background: isDark ? '#0a0a0a' : '#f5f5f5' }}
        defaultEdgeOptions={{ type: 'default' }}
        {...rfProps}
        // Figma-style trackpad: two-finger swipe pans, pinch (ctrl+wheel) zooms
        zoomOnScroll={false}
        panOnScroll
        panOnScrollSpeed={0.8}
        zoomOnPinch
        zoomOnDoubleClick={false}
        onPaneContextMenu={(e) => { e.preventDefault(); openAddModal(e.clientX, e.clientY) }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={isDark ? '#2a2a2a' : '#c4c4c4'}
        />
        {!isMobile && <MiniMap
          position="bottom-right"
          style={{
            background: isDark ? '#1c1c1c' : '#e5e5e5',
            border: `1px solid ${isDark ? '#2a2a2a' : '#d4d4d4'}`,
            borderRadius: 8,
            marginBottom: 56,
            marginRight: 4,
          }}
          maskColor={isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)'}
          nodeColor={isDark ? '#3a3a3a' : '#bbb'}
        />}
      </ReactFlow>

      {/* Group run button — appears whenever 2+ nodes are selected */}
      {showGroupRun && (
        <GroupRunButton
          selectedNodeIds={selectedNodeIds}
          isDark={isDark}
        />
      )}

      {/* Mobile: "select all" tab on the left wall, shown while a node is selected */}
      {selectedNodeIds.length > 0 && (
        <button
          onClick={selectAll}
          title="Select all nodes"
          className={`md:hidden fixed left-0 top-24 z-40 flex items-center gap-1.5 h-10 pl-2.5 pr-3 rounded-r-xl border border-l-0 shadow-lg transition-colors ${isDark ? 'bg-[#1c1c1c] border-[#2a2a2a] text-white' : 'bg-white border-[#e0e0e0] text-[#111]'}`}
        >
          <BoxSelect size={15} />
          <span className="text-xs font-medium">Select all</span>
        </button>
      )}


      {/* Add-node context modal */}
      {addNodeCtx && (
        <div
          ref={addModalRef}
          className={`fixed z-100 border rounded-lg py-1 w-44 shadow-xl overflow-hidden ${isDark ? 'bg-[#1c1c1c] border-[#2a2a2a]' : 'bg-white border-[#e0e0e0]'}`}
          style={{ left: addNodeCtx.x, top: addNodeCtx.y }}
        >
          <div className={`px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-wider font-medium border-b ${isDark ? 'text-[#555] border-[#2a2a2a]' : 'text-[#aaa] border-[#e8e8e8]'}`}>
            Add node
          </div>
          {NODE_TYPES_LIST.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => handleAddNode(type)}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${isDark ? 'text-white hover:bg-[#2a2a2a]' : 'text-[#111] hover:bg-[#f0f0f0]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Connect-on-drop modal */}
      {connectDropCtx && connectDropSuggestions.length > 0 && (
        <ConnectDropModal
          ctx={connectDropCtx}
          suggestions={connectDropSuggestions}
          isDark={isDark}
          onSelect={handleConnectDropSelect}
          onClose={() => setConnectDropCtx(null)}
        />
      )}

      {/* Cut tool overlay — sits above ReactFlow, captures all mouse events */}
      {canvasTool === 'cut' && (
        <div
          className="absolute inset-0 z-10"
          style={{ cursor: 'none', touchAction: 'none' }}
          onMouseDown={handleCutMouseDown}
          onMouseMove={handleCutMouseMove}
          onMouseUp={endCut}
          onTouchStart={(e) => { const t = e.touches[0]; if (t) beginCut(t.clientX, t.clientY) }}
          onTouchMove={(e) => { const t = e.touches[0]; if (t) moveCut(t.clientX, t.clientY) }}
          onTouchEnd={endCut}
          onMouseLeave={() => {
            isDrawing.current = false
            lastCursorLocal.current = null
            prevRawAngle.current = null
            setCutPoints([])
            setCursorPos(null)
          }}
        >
          {/* Smooth cut path drawn while dragging */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {cutPoints.length > 1 && (
              <path
                d={buildSmoothPath(cutPoints)}
                fill="none"
                stroke="#ef4444"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="6 3"
              />
            )}
          </svg>

          {/* Scissors cursor — outer div tracks position instantly, inner rotates smoothly */}
          {cursorPos && (
            <div
              className="absolute pointer-events-none select-none"
              style={{ left: cursorPos.x, top: cursorPos.y, transform: 'translate(-50%, -50%)' }}
            >
              <div
                style={{
                  // Lucide Scissors tips point upper-right (~−45°), +45° corrects so tips lead
                  transform: `rotate(${cursorAngle + 45}deg)`,
                  transition: 'transform 80ms ease-out',
                }}
              >
                <Scissors
                  size={22}
                  className="text-white"
                  style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.9)) drop-shadow(0 0 2px rgba(239,68,68,0.6))' }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}