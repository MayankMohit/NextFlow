'use client'

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  SelectionMode,
  type Node,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useWorkflowStore } from '@/store/workflowStore'
import TextNode from '@/components/nodes/TextNode'
import UploadImageNode from '@/components/nodes/UploadImageNode'
import UploadVideoNode from '@/components/nodes/UploadVideoNode'
import LLMNode from '@/components/nodes/LLMNode'
import CropImageNode from '@/components/nodes/CropImageNode'
import ExtractFrameNode from '@/components/nodes/ExtractFrameNode'
import { Scissors } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

const nodeTypes = {
  textNode: TextNode,
  uploadImageNode: UploadImageNode,
  uploadVideoNode: UploadVideoNode,
  llmNode: LLMNode,
  cropImageNode: CropImageNode,
  extractFrameNode: ExtractFrameNode,
}

const getInitialData = (type: string) => {
  switch (type) {
    case 'textNode': return { label: 'Text', text: '', status: 'idle' }
    case 'uploadImageNode': return { label: 'Upload Image', imageUrl: null, status: 'idle' }
    case 'uploadVideoNode': return { label: 'Upload Video', videoUrl: null, status: 'idle' }
    case 'llmNode': return { label: 'LLM', model: 'gemini-3.1-flash-lite-preview', result: null, status: 'idle' }
    case 'cropImageNode': return { label: 'Crop Image', xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 100, status: 'idle' }
    case 'extractFrameNode': return { label: 'Extract Frame', timestamp: '0', status: 'idle' }
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
]

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

// --- Main canvas ---

export default function WorkflowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, undo, redo, saveWorkflow, runWorkflow, theme, canvasTool } = useWorkflowStore()
  const { screenToFlowPosition, getEdges, getNode, deleteElements, getViewport, setViewport } = useReactFlow()
  const isDark = theme === 'dark'

  const containerRef = useRef<HTMLDivElement>(null)

  // Add-node context modal (double-click / right-click on pane)
  const [addNodeCtx, setAddNodeCtx] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null)
  const addModalRef = useRef<HTMLDivElement>(null)

  const openAddModal = useCallback((clientX: number, clientY: number) => {
    const flow = screenToFlowPosition({ x: clientX, y: clientY })
    // Clamp so the modal (≈176px × 220px) stays inside the viewport
    const x = Math.min(clientX, window.innerWidth - 184)
    const y = Math.min(clientY, window.innerHeight - 228)
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
      if (ctrl && e.key === 'Enter') { e.preventDefault(); runWorkflow('full') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, saveWorkflow, runWorkflow])

  // Custom scroll: plain = pan vertical, shift = pan horizontal, ctrl/meta = zoom on cursor
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const { x, y, zoom } = getViewport()
      if (e.ctrlKey || e.metaKey) {
        // Zoom centred on mouse cursor
        const rect = el.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top
        // Flow-space coordinates under the mouse (invariant point)
        const pivotX = (mouseX - x) / zoom
        const pivotY = (mouseY - y) / zoom
        const newZoom = Math.max(0.1, Math.min(4, zoom * Math.exp(-e.deltaY * 0.001)))
        setViewport({ x: mouseX - pivotX * newZoom, y: mouseY - pivotY * newZoom, zoom: newZoom })
      } else if (e.shiftKey) {
        // Pan horizontal
        setViewport({ x: x - e.deltaY, y, zoom })
      } else {
        // Pan vertical
        setViewport({ x, y: y - e.deltaY, zoom })
      }
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
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/reactflow')
    if (!type) return
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addNode({ id: `${type}-${Date.now()}`, type, position, data: getInitialData(type) } as Node)
  }, [screenToFlowPosition, addNode])

  // ── Cut overlay handlers ──────────────────────────────────────────────────

  const handleCutMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const rect = containerRef.current!.getBoundingClientRect()
    const lx = e.clientX - rect.left
    const ly = e.clientY - rect.top
    isDrawing.current = true
    lastCursorLocal.current = { x: lx, y: ly }
    // Reset accumulated angle for each new stroke
    prevRawAngle.current = null
    setCutPoints([{ x: lx, y: ly }])
  }, [])

  const handleCutMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current!.getBoundingClientRect()
    const lx = e.clientX - rect.left
    const ly = e.clientY - rect.top

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

  const handleCutMouseUp = useCallback((e: React.MouseEvent) => {
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

  const rfProps = canvasTool === 'select'
    ? { selectionOnDrag: true, panOnDrag: [1, 2] as number[], selectionMode: SelectionMode.Partial, nodesDraggable: true }
    : canvasTool === 'pan'
    ? { selectionOnDrag: false, panOnDrag: true as const, nodesDraggable: false }
    : { selectionOnDrag: false, panOnDrag: false as const, nodesDraggable: false }

  return (
    <div ref={containerRef} className="w-full h-full relative" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={['Delete', 'Backspace']}
        multiSelectionKeyCode="Shift"
        style={{ background: isDark ? '#0a0a0a' : '#f5f5f5' }}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#7c3aed', strokeWidth: 2 },
        }}
        {...rfProps}
        zoomOnScroll={false}
        panOnScroll={false}
        zoomOnDoubleClick={false}
        onPaneContextMenu={(e) => { e.preventDefault(); openAddModal(e.clientX, e.clientY) }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={isDark ? '#2a2a2a' : '#c4c4c4'}
        />
        <MiniMap
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
        />
      </ReactFlow>

      {/* Add-node context modal */}
      {addNodeCtx && (
        <div
          ref={addModalRef}
          className={`fixed z-[100] border rounded-lg py-1 w-44 shadow-xl overflow-hidden ${isDark ? 'bg-[#1c1c1c] border-[#2a2a2a]' : 'bg-white border-[#e0e0e0]'}`}
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

      {/* Cut tool overlay — sits above ReactFlow, captures all mouse events */}
      {canvasTool === 'cut' && (
        <div
          className="absolute inset-0 z-10"
          style={{ cursor: 'none' }}
          onMouseDown={handleCutMouseDown}
          onMouseMove={handleCutMouseMove}
          onMouseUp={handleCutMouseUp}
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
