'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useWorkflowStore } from '@/store/workflowStore'
import { useReactFlow } from '@xyflow/react'
import {
  Undo2, Redo2, Keyboard, Plus, Hand, Scissors,
  LayoutGrid, Maximize2, X, MousePointer2, ChevronRight,
} from 'lucide-react'

const shortcuts = [
  { keys: ['Delete', 'Backspace'], description: 'Delete selected node' },
  { keys: ['Ctrl/⌘', 'Z'], description: 'Undo' },
  { keys: ['Ctrl/⌘', 'Shift', 'Z'], description: 'Redo' },
  { keys: ['Ctrl/⌘', 'S'], description: 'Save workflow' },
  { keys: ['Scroll'], description: 'Pan up / down' },
  { keys: ['Shift', 'Scroll'], description: 'Pan left / right' },
  { keys: ['Ctrl/⌘', 'Scroll'], description: 'Zoom in / out' },
  { keys: ['Ctrl/⌘', 'Enter'], description: 'Run workflow' },
]

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const { theme } = useWorkflowStore()
  const isDark = theme === 'dark'
  const panel = isDark ? 'bg-[#1c1c1c] border-[#2a2a2a]' : 'bg-white border-[#e0e0e0]'
  const textMain = isDark ? 'text-white' : 'text-[#111]'
  const textMuted = isDark ? 'text-[#888]' : 'text-[#777]'
  const kbd = isDark ? 'bg-[#2a2a2a] border-[#3a3a3a] text-white' : 'bg-[#f0f0f0] border-[#d0d0d0] text-[#333]'

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-200 flex items-end justify-start p-4 pb-20 pl-4" onClick={onClose}>
      <div className={`border rounded-xl p-4 w-72 ${panel}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className={`text-xs font-medium ${textMain}`}>Keyboard Shortcuts</span>
          <button onClick={onClose} className={`${textMuted} hover:${textMain}`}><X size={13} /></button>
        </div>
        <div className="flex flex-col gap-2">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className={`text-xs ${textMuted}`}>{s.description}</span>
              <div className="flex items-center gap-1">
                {s.keys.map(k => (
                  <kbd key={k} className={`px-1.5 py-0.5 border rounded text-xs font-mono ${kbd}`}>{k}</kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const PRESETS = [
  { id: 'product-marketing', name: 'Product Marketing', description: 'A workflow demonstrating all 6 node types, parallel execution and convergence point.', icon: '🛍️' },
]

function PresetsModal({ onClose, onLoad }: { onClose: () => void; onLoad: (id: string) => void }) {
  const { theme } = useWorkflowStore()
  const isDark = theme === 'dark'
  const panel = isDark ? 'bg-[#1c1c1c] border-[#2a2a2a]' : 'bg-white border-[#e0e0e0]'
  const card = isDark ? 'bg-[#141414] border-[#2a2a2a] hover:bg-[#000000]' : 'bg-[#f8f8f8] border-[#e0e0e0] hover:bg-[#f0f0f0]'
  const textMain = isDark ? 'text-white' : 'text-[#111]'
  const textMuted = isDark ? 'text-[#666]' : 'text-[#888]'

  return createPortal(
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className={`border rounded-xl p-5 shadow-2xl overflow-y-auto ${panel}`}
        style={{ width: '40vw', minHeight: '20vh', maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className={`text-sm font-semibold ${textMain}`}>Workflow Presets</span>
          <button onClick={onClose} className={textMuted}><X size={13} /></button>
        </div>
        <div className="flex flex-col gap-2">
          {PRESETS.map(preset => (
            <div key={preset.id} className={`group flex items-center gap-3 p-3 rounded-lg border transition-all ${card}`}>
              <span className="text-2xl shrink-0">{preset.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${textMain}`}>{preset.name}</p>
                <p className={`text-xs mt-0.5 leading-relaxed ${textMuted}`}>{preset.description}</p>
              </div>
              <button onClick={() => { onLoad(preset.id); onClose() }}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black-600 text-white text-xs transition-colors">
                Load<ChevronRight size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const NODE_TYPES = [
  { type: 'textNode', label: 'Text' },
  { type: 'uploadImageNode', label: 'Upload Image' },
  { type: 'uploadVideoNode', label: 'Upload Video' },
  { type: 'llmNode', label: 'LLM' },
  { type: 'cropImageNode', label: 'Crop Image' },
  { type: 'extractFrameNode', label: 'Extract Frame' },
]

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

function CanvasTools() {
  const [showNodePicker, setShowNodePicker] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const { addNode, canvasTool, setCanvasTool, loadSampleWorkflow, theme } = useWorkflowStore()
  const nodePickerRef = useRef<HTMLDivElement>(null)

  const isDark = theme === 'dark'
  const toolbar = isDark ? 'bg-[#1c1c1c] border-[#2a2a2a]' : 'bg-white border-[#e0e0e0]'
  const btn = isDark ? 'text-[#888] hover:text-white hover:bg-[#2a2a2a]' : 'text-[#888] hover:text-[#111] hover:bg-[#f0f0f0]'
  const picker = isDark ? 'bg-[#1c1c1c] border-[#2a2a2a]' : 'bg-white border-[#e0e0e0]'
  const pickerItem = isDark ? 'text-white hover:bg-[#2a2a2a]' : 'text-[#111] hover:bg-[#f0f0f0]'
  const divider = isDark ? 'bg-[#2a2a2a]' : 'bg-[#e0e0e0]'

  useEffect(() => {
    if (!showNodePicker) return
    const handler = (e: MouseEvent) => {
      if (nodePickerRef.current && !nodePickerRef.current.contains(e.target as Node)) {
        setShowNodePicker(false)
      }
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [showNodePicker])

  const addNodeAtCenter = (type: string) => {
    addNode({
      id: `${type}-${Date.now()}`,
      type,
      position: { x: 300 + Math.random() * 200, y: 200 + Math.random() * 200 },
      data: getInitialData(type),
    } as never)
    setShowNodePicker(false)
  }

  const toolBtn = (tool: 'select' | 'pan' | 'cut', icon: React.ReactNode, title: string) => (
    <button onClick={() => setCanvasTool(tool)} title={title}
      className={`p-1.5 rounded transition-colors ${canvasTool === tool ? 'bg-violet-600 text-white' : btn}`}>
      {icon}
    </button>
  )

  return (
    <>
      <div className={`flex items-center gap-1 border rounded-lg px-1.5 py-1 relative ${toolbar}`}>
        <div ref={nodePickerRef} className="relative">
          <button onClick={() => setShowNodePicker(v => !v)} title="Add node"
            className={`p-1.5 rounded transition-colors ${btn}`}>
            <Plus size={14} />
          </button>
          {showNodePicker && (
            <div className={`absolute bottom-full mb-2 left-1/2 -translate-x-1/2 border rounded-lg py-1 w-44 shadow-xl ${picker}`}>
              {NODE_TYPES.map(({ type, label }) => (
                <button key={type} onClick={() => addNodeAtCenter(type)}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${pickerItem}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={`w-px h-4 ${divider}`} />
        {toolBtn('select', <MousePointer2 size={14} />, 'Draw selection')}
        {toolBtn('pan', <Hand size={14} />, 'Pan mode')}
        {toolBtn('cut', <Scissors size={14} />, 'Cut connections')}
        <div className={`w-px h-4 ${divider}`} />

        <button onClick={() => setShowPresets(v => !v)} title="Workflow presets"
          className={`p-1.5 rounded transition-colors ${btn}`}>
          <LayoutGrid size={14} />
        </button>
      </div>

      {showPresets && (
        <PresetsModal
          onClose={() => setShowPresets(false)}
          onLoad={(id) => { if (id === 'product-marketing') loadSampleWorkflow() }}
        />
      )}
    </>
  )
}

export default function BottomBar() {
  const [showShortcuts, setShowShortcuts] = useState(false)
  const { undo, redo, past, future, theme } = useWorkflowStore()
  const { fitView } = useReactFlow()

  const isDark = theme === 'dark'
  const panel = isDark ? 'bg-[#1c1c1c] border-[#2a2a2a]' : 'bg-white border-[#e0e0e0]'
  const btn = isDark ? 'text-[#888] hover:text-white hover:bg-[#2a2a2a]' : 'text-[#888] hover:text-[#111] hover:bg-[#f0f0f0]'
  const scBtn = isDark ? 'bg-[#1c1c1c] border-[#2a2a2a] hover:border-[#444] text-[#888] hover:text-white' : 'bg-white border-[#e0e0e0] hover:border-[#bbb] text-[#888] hover:text-[#111]'

  return (
    <>
      {/* Bottom Left */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 pointer-events-auto">
        <div className={`flex items-center gap-1 border rounded-lg px-1.5 py-1 ${panel}`}>
          <button onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)"
            className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${btn}`}>
            <Undo2 size={14} />
          </button>
          <button onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Shift+Z)"
            className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${btn}`}>
            <Redo2 size={14} />
          </button>
        </div>
        <button onClick={() => setShowShortcuts(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-xs transition-colors ${scBtn}`}>
          <Keyboard size={13} />
          <span className="hidden sm:block">Shortcuts</span>
        </button>
      </div>

      {/* Bottom Center — fixed so panels opening don't shift it */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
        <CanvasTools />
      </div>

      {/* Bottom Right */}
      <div className="absolute bottom-4 right-4 z-20 pointer-events-auto">
        <button onClick={() => fitView({ padding: 0.2, duration: 400 })} title="Fit view"
          className={`p-1.5 border rounded-lg transition-colors ${scBtn}`}>
          <Maximize2 size={14} />
        </button>
      </div>

      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </>
  )
}
