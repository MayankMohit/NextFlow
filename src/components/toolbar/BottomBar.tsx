'use client'

import { useState } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useReactFlow } from '@xyflow/react'
import { Undo2, Redo2, Keyboard, Plus, Square, Scissors, SlidersHorizontal, Maximize2, X } from 'lucide-react'

const shortcuts = [
  { keys: ['Delete', 'Backspace'], description: 'Delete selected node' },
  { keys: ['Ctrl/⌘', 'Z'], description: 'Undo' },
  { keys: ['Ctrl/⌘', 'Shift', 'Z'], description: 'Redo' },
  { keys: ['Ctrl/⌘', 'S'], description: 'Save workflow' },
  { keys: ['Scroll'], description: 'Zoom in/out' },
  { keys: ['Space', 'Drag'], description: 'Pan canvas' },
  { keys: ['Shift', 'Click'], description: 'Multi-select' },
  { keys: ['Ctrl/⌘', 'Enter'], description: 'Run workflow' },
]

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-start p-4 pb-20 pl-4" onClick={onClose}>
      <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl p-4 w-72" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-white text-xs font-medium">Keyboard Shortcuts</span>
          <button onClick={onClose} className="text-[#666] hover:text-white"><X size={13} /></button>
        </div>
        <div className="flex flex-col gap-2">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-[#888] text-xs">{s.description}</span>
              <div className="flex items-center gap-1">
                {s.keys.map(k => (
                  <kbd key={k} className="px-1.5 py-0.5 bg-[#2a2a2a] border border-[#3a3a3a] rounded text-white text-xs font-mono">{k}</kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

type CanvasTool = 'select' | 'cut'

function CanvasTools() {
  const [activeTool, setActiveTool] = useState<CanvasTool>('select')
  const [showNodePicker, setShowNodePicker] = useState(false)
  const { addNode } = useWorkflowStore()

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

  const addNodeAtCenter = (type: string) => {
    addNode({
      id: `${type}-${Date.now()}`,
      type,
      position: { x: 300 + Math.random() * 200, y: 200 + Math.random() * 200 },
      data: getInitialData(type),
    } as never)
    setShowNodePicker(false)
  }

  const nodeTypes = ['textNode', 'uploadImageNode', 'uploadVideoNode', 'llmNode', 'cropImageNode', 'extractFrameNode']

  return (
    <div className="flex items-center gap-1 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-1.5 py-1 relative">
      {/* Add node */}
      <div className="relative">
        <button
          onClick={() => setShowNodePicker(v => !v)}
          className="p-1.5 rounded text-[#888] hover:text-white hover:bg-[#2a2a2a] transition-colors"
          title="Add node"
        >
          <Plus size={14} />
        </button>
        {showNodePicker && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg py-1 w-44 shadow-xl">
            {nodeTypes.map(t => (
              <button key={t} onClick={() => addNodeAtCenter(t)}
                className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-[#2a2a2a] transition-colors capitalize">
                {t.replace('Node', '').replace(/([A-Z])/g, ' $1').trim()}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-[#2a2a2a]" />

      <button
        onClick={() => setActiveTool('select')}
        title="Selection tool"
        className={`p-1.5 rounded transition-colors ${activeTool === 'select' ? 'bg-violet-600 text-white' : 'text-[#888] hover:text-white hover:bg-[#2a2a2a]'}`}
      >
        <Square size={14} />
      </button>

      <button
        onClick={() => setActiveTool('cut')}
        title="Cut connections"
        className={`p-1.5 rounded transition-colors ${activeTool === 'cut' ? 'bg-violet-600 text-white' : 'text-[#888] hover:text-white hover:bg-[#2a2a2a]'}`}
      >
        <Scissors size={14} />
      </button>

      <div className="w-px h-4 bg-[#2a2a2a]" />

      <button title="Presets" className="p-1.5 rounded text-[#888] hover:text-white hover:bg-[#2a2a2a] transition-colors">
        <SlidersHorizontal size={14} />
      </button>
    </div>
  )
}

export default function BottomBar() {
  const [showShortcuts, setShowShortcuts] = useState(false)
  const { undo, redo, past, future } = useWorkflowStore()
  const { fitView } = useReactFlow()

  return (
    <>
      {/* Bottom Left */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 pointer-events-auto">
        <div className="flex items-center gap-1 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-1.5 py-1">
          <button
            onClick={undo}
            disabled={past.length === 0}
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded text-[#888] hover:text-white hover:bg-[#2a2a2a] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Undo2 size={14} />
          </button>
          <button
            onClick={redo}
            disabled={future.length === 0}
            title="Redo (Ctrl+Shift+Z)"
            className="p-1.5 rounded text-[#888] hover:text-white hover:bg-[#2a2a2a] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Redo2 size={14} />
          </button>
        </div>
        <button
          onClick={() => setShowShortcuts(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg text-[#888] hover:text-white hover:border-[#444] transition-colors text-xs"
        >
          <Keyboard size={13} />
          <span className="hidden sm:block">Shortcuts</span>
        </button>
      </div>

      {/* Bottom Center */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
        <CanvasTools />
      </div>

      {/* Bottom Right */}
      <div className="absolute bottom-4 right-4 z-20 pointer-events-auto">
        <button
          onClick={() => fitView({ padding: 0.2, duration: 400 })}
          title="Fit view"
          className="p-1.5 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg text-[#888] hover:text-white hover:border-[#444] transition-colors"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </>
  )
}