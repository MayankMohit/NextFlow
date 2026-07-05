'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useWorkflowStore } from '@/store/workflowStore'
import { useReactFlow, useStore } from '@xyflow/react'
import {
  Undo2, Redo2, Keyboard, Plus, Hand, Scissors,
  LayoutGrid, Maximize2, X, MousePointer2, ChevronRight, Sun, Moon, Trash2,
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
  const textMain = isDark ? 'text-white' : 'text-black'
  const textMuted = isDark ? 'text-[#888]' : 'text-[#777]'

  return createPortal(
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className={`border rounded-xl p-5 shadow-2xl overflow-y-auto w-[92vw] md:w-[40vw] ${panel}`}
        style={{ minHeight: '20vh', maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className={`text-sm font-semibold ${textMain}`}>Workflow Presets</span>
          <button onClick={onClose} className={`${isDark ? 'text-white' : 'text-black'}`}><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-2">
          {PRESETS.map(preset => (
            <div key={preset.id} className={`group flex items-center gap-3 p-3 rounded-lg border transition-all ${card}`}>
              <span className="text-2xl shrink-0">{preset.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${textMain}`}>{preset.name}</p>
                <p className={`text-sm mt-0.5 leading-relaxed ${textMuted}`}>{preset.description}</p>
              </div>
              <button onClick={() => { onLoad(preset.id); onClose() }}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-800 text-white text-sm transition-colors">
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
  const toolbar = isDark ? 'bg-[#202020] border-[#2a2a2a]' : 'bg-white border-[#e0e0e0]'
  const btn = isDark ? 'text-white hover:bg-[#2a2a2a]' : 'text-black hover:bg-[#f0f0f0]'
  const picker = isDark ? 'bg-[#1c1c1c] border-[#2a2a2a]' : 'bg-white border-[#e0e0e0]'
  const pickerItem = isDark ? 'text-white hover:bg-[#2a2a2a]' : 'text-black hover:bg-[#f0f0f0]'

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
      className={`p-3 rounded-lg transition-colors ${canvasTool === tool ? isDark ? 'bg-[#404040] text-white' : 'bg-[#e5e5e5] text-black' : btn}`}>
      {icon}
    </button>
  )

  return (
    <>
      <div className={`flex items-center gap-2 border shadow-lg rounded-xl px-0.75 py-0.75 relative ${toolbar}`}>
        <div ref={nodePickerRef} className="relative">
          <button onClick={() => setShowNodePicker(v => !v)} title="Add node"
            className={`p-3 rounded transition-colors ${btn}`}>
            <Plus size={20} />
          </button>
          {showNodePicker && (
            <div className={`absolute bottom-full mb-2 left-1/2 -translate-x-1/2 border rounded-lg py-1 w-44 shadow-xl ${picker}`}>
              {NODE_TYPES.map(({ type, label }) => (
                <button key={type} onClick={() => addNodeAtCenter(type)}
                  className={`w-full text-left px-2 py-2 text-sm transition-colors ${pickerItem}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {toolBtn('select', <MousePointer2 size={20} />, 'Draw selection')}
        {toolBtn('pan', <Hand size={20} />, 'Pan mode')}
        {toolBtn('cut', <Scissors size={20} />, 'Cut connections')}

        <button onClick={() => setShowPresets(v => !v)} title="Workflow presets"
          className={`p-3 rounded transition-colors ${btn}`}>
          <LayoutGrid size={20} />
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
  const { undo, redo, past, future, theme, toggleTheme } = useWorkflowStore()
  const { fitView, getNodes, deleteElements } = useReactFlow()
  const hasSelection = useStore(s => s.nodes.some(n => n.selected))

  const isDark = theme === 'dark'
  const btn = isDark ? 'text-white bg-[#2a2a2a] hover:bg-[#333]' : 'text-black bg-white hover:bg-[#f0f0f0]'
  const scBtn = isDark ? 'bg-[#2a2a2a] text-white' : 'bg-white text-black'

  return (
    <>
      {/* Undo/redo — bottom-left on desktop; on mobile pinned top-right,
          vertically inline with the top bar */}
      <div className="fixed top-4 right-3 md:absolute md:top-auto md:bottom-4 md:left-4 md:right-auto z-50 md:z-20 flex items-center gap-1.5 pointer-events-auto">
        <div className={`flex items-center gap-2 rounded-lg px-1.5 py-1`}>
          <button onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)"
            className={`p-2 rounded-lg shadow-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${btn}`}>
            <Undo2 size={20} />
          </button>
          <button onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Shift+Z)"
            className={`p-2 rounded-lg shadow-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${btn}`}>
            <Redo2 size={20} />
          </button>
        </div>
        <button onClick={() => setShowShortcuts(true)}
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${scBtn}`}>
          <Keyboard size={18} />
          <span className="hidden sm:block">Shortcuts</span>
        </button>
      </div>

      {/* Bottom Center — fixed so panels opening don't shift it.
          Mobile centers it; desktop keeps the original position. */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 md:translate-x-0 z-20 pointer-events-auto">
        <CanvasTools />
      </div>

      {/* Bottom Right — fit view (unchanged on desktop) */}
      <div className="absolute bottom-2 right-4 z-20 pointer-events-auto">
        <button onClick={() => fitView({ padding: 0.2, duration: 400 })} title="Fit view"
          className={`p-1.5  rounded-lg shadow-lg transition-colors ${scBtn}`}>
          <Maximize2 size={14} />
        </button>
      </div>

      {/* Mobile: delete (top) + theme toggle, right-edge tabs above fit-view */}
      <div className="md:hidden fixed right-0 bottom-16 z-40 flex flex-col gap-1.5">
        <button
          onClick={() => { const sel = getNodes().filter(n => n.selected); if (sel.length) void deleteElements({ nodes: sel }) }}
          disabled={!hasSelection}
          title={hasSelection ? 'Delete selected node(s)' : 'Select a node to delete'}
          className={`flex items-center justify-center w-9 h-12 rounded-l-xl border border-r-0 shadow-lg transition-colors disabled:cursor-not-allowed ${
            hasSelection
              ? isDark ? 'bg-[#1c1c1c] border-red-500 text-red-500' : 'bg-white border-red-500 text-red-500'
              : isDark ? 'bg-[#1c1c1c] border-[#2a2a2a] text-[#555]' : 'bg-white border-[#e0e0e0] text-[#bbb]'
          }`}>
          <Trash2 size={16} />
        </button>
        <button onClick={toggleTheme} title={isDark ? 'Switch to light' : 'Switch to dark'}
          className={`flex items-center justify-center w-9 h-12 rounded-l-xl border border-r-0 shadow-lg transition-colors ${isDark ? 'bg-[#1c1c1c] border-[#2a2a2a] text-white' : 'bg-white border-[#e0e0e0] text-[#111]'}`}>
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </>
  )
}
