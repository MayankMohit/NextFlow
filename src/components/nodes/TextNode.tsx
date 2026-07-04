'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Type, Play, Loader2, Copy, Check, X } from 'lucide-react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useNodeHover } from '@/hooks/usenodehover'
import { useNodeStatus } from '@/hooks/useNodeStatus'
import { useRef, useState, useCallback } from 'react'

const NODE_COLOR = '#fec50b'

export default function TextNode({ data, selected, id }: NodeProps) {
  const { updateNodeData, theme, runNode, saveWorkflow } = useWorkflowStore()
  const isDark = theme === 'dark'
  const { hovered, onMouseEnter, onMouseLeave } = useNodeHover()
  const { isNodeRunning, isStartNode, canRun } = useNodeStatus(id)

  const handleRun = async () => { await saveWorkflow(); await runNode(id) }

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dragState   = useRef<{ startY: number; startH: number } | null>(null)
  const [taHeight, setTaHeight] = useState(80)
  const [copied, setCopied]     = useState(false)

  const handleCopy = () => {
    const text = (data.text as string) ?? ''
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  // Drag-to-resize: vertical only, from the bottom-right grip
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragState.current = { startY: e.clientY, startH: taHeight }

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return
      const delta = ev.clientY - dragState.current.startY
      setTaHeight(Math.max(56, Math.min(480, dragState.current.startH + delta)))
    }
    const onUp = () => {
      dragState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [taHeight])

  const nodeBg    = isDark ? 'bg-[#1c1c1c]' : 'bg-white'
  const hdrBorder = isDark ? 'border-[#2a2a2a]' : 'border-[#e8e8e8]'
  const textMain  = isDark ? 'text-white' : 'text-[#111]'
  const inputBg   = isDark
    ? 'bg-[#141414] border-[#2a2a2a] text-white placeholder:text-[#444]'
    : 'bg-[#f5f5f5] border-[#e0e0e0] text-[#111] placeholder:text-[#ccc]'

  const borderColor = selected ? NODE_COLOR : isDark ? '#2a2a2a' : '#e0e0e0'

  const glowKeyframes = `
    @keyframes text-node-glow {
      0%, 100% {
        box-shadow: 0 0 0 1.5px ${NODE_COLOR}44, 0 0 14px 4px ${NODE_COLOR}28;
      }
      50% {
        box-shadow: 0 0 0 2.5px ${NODE_COLOR}bb, 0 0 30px 10px ${NODE_COLOR}50, 0 0 50px 18px ${NODE_COLOR}1e;
      }
    }
  `

  const glowStyle: React.CSSProperties = isNodeRunning
    ? {
        borderColor: `${NODE_COLOR}aa`,
        animation: 'text-node-glow 1.8s ease-in-out infinite',
      }
    : {
        borderColor,
        boxShadow: selected ? `0 0 0 1.5px ${NODE_COLOR}55` : undefined,
      }

  const scrollbarStyle = `
    .textnode-textarea::-webkit-scrollbar { width: 4px; }
    .textnode-textarea::-webkit-scrollbar-track { background: transparent; }
    .textnode-textarea::-webkit-scrollbar-thumb {
      background: ${isDark ? '#3a3a3a' : '#d0d0d0'};
      border-radius: 99px;
    }
    .textnode-textarea::-webkit-scrollbar-thumb:hover {
      background: ${isDark ? '#555' : '#b0b0b0'};
    }
    .textnode-textarea {
      scrollbar-width: thin;
      scrollbar-color: ${isDark ? '#3a3a3a transparent' : '#d0d0d0 transparent'};
    }
  `

  const gripColor = isDark ? '#444' : '#c8c8c8'

  return (
    <div className="relative" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <style>{scrollbarStyle}</style>
      {isNodeRunning && <style>{glowKeyframes}</style>}
      {typeof data.error === 'string' && (
        <div className="absolute bottom-full left-0 right-0 z-10 mb-1 flex items-start gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500 text-white text-[11px] font-medium">
          <span className="flex-1 wrap-break-word leading-snug">{data.error}</span>
          <button
            className="nodrag shrink-0 mt-px hover:opacity-70 transition-opacity"
            onClick={() => updateNodeData(id, { error: undefined })}
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Hover run button */}
      {hovered && !isNodeRunning && (
        <button
          onClick={handleRun}
          disabled={!canRun}
          title={canRun ? (isStartNode ? 'Run workflow from this node' : 'Run this node') : 'Upstream nodes must complete first'}
          className={`nodrag absolute top-0 right-full mr-1 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg border transition-all whitespace-nowrap ${
            canRun
              ? isStartNode
                ? 'bg-blue-600 hover:bg-blue-500 border-blue-500 text-white cursor-pointer'
                : isDark
                  ? 'bg-black hover:bg-[#1a1a1a] border-[#333] text-white cursor-pointer'
                  : 'bg-white hover:bg-[#f5f5f5] border-[#d0d0d0] text-[#111] cursor-pointer'
              : isDark
                ? 'bg-[#1c1c1c] border-[#2a2a2a] text-[#555] cursor-not-allowed'
                : 'bg-white border-[#e0e0e0] text-[#bbb] cursor-not-allowed'
          }`}
        >
          <Play size={9} />{isStartNode ? 'Run workflow' : 'Run'}
        </button>
      )}

      {/* Running badge */}
      {hovered && isNodeRunning && (
        <div className="absolute top-0 right-full mr-1 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium shadow-lg border bg-violet-900 border-violet-700 text-violet-300 whitespace-nowrap">
          <Loader2 size={9} className="animate-spin" />Running…
        </div>
      )}

      {/* Node body */}
      <div className={`w-64 ${nodeBg} border rounded-lg overflow-hidden`} style={glowStyle}>

        {/* Header: icon + title pinned left, copy button pinned right */}
        <div className={`flex items-center justify-between px-3 py-2 border-b ${hdrBorder}`}>
          <div className="flex items-center gap-2">
            <Type size={13} style={{ color: NODE_COLOR }} />
            <span className={`text-xs font-medium ${textMain}`}>Text</span>
          </div>

          <button
            onClick={handleCopy}
            title="Copy to clipboard"
            className={`nodrag p-1 rounded transition-colors ${
              isDark
                ? 'hover:bg-[#2a2a2a] text-[#666] hover:text-[#bbb]'
                : 'hover:bg-[#ececec] text-[#bbb] hover:text-[#555]'
            }`}
          >
            {copied
              ? <Check size={10} className="text-emerald-400" />
              : <Copy size={10} />
            }
          </button>
        </div>

        {/* Textarea with bottom-right drag grip */}
        <div className="p-3">
          <div className="relative">
            <textarea
              ref={textareaRef}
              placeholder="Enter text..."
              defaultValue={(data.text as string) ?? ''}
              className={`textnode-textarea nowheel w-full text-xs rounded p-2 outline-none resize-none border focus:border-[#fec50b] transition-colors overflow-y-auto ${inputBg}`}
              style={{ height: taHeight, lineHeight: '1.5' }}
              onChange={e => updateNodeData(id, { text: e.target.value })}
            />

            {/* Drag grip — sits over bottom-right corner of textarea */}
            <div
              onMouseDown={onResizeMouseDown}
              className="nodrag absolute bottom-1 right-1 select-none"
              style={{ cursor: 'ns-resize', lineHeight: 0, padding: 3 }}
              title="Drag to resize"
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                {/* diagonal dot-grid grip, bottom-right aligned */}
                <circle cx="8" cy="2" r="1" fill={gripColor} />
                <circle cx="8" cy="5" r="1" fill={gripColor} />
                <circle cx="5" cy="5" r="1" fill={gripColor} />
                <circle cx="8" cy="8" r="1" fill={gripColor} />
                <circle cx="5" cy="8" r="1" fill={gripColor} />
                <circle cx="2" cy="8" r="1" fill={gripColor} />
              </svg>
            </div>
          </div>
        </div>


        <Handle
          type="source"
          position={Position.Right}
          id="output"
          style={{
            background: NODE_COLOR,
            width: 10,
            height: 10,
            border: `2px solid ${NODE_COLOR}CC`,
          }}
        />
      </div>
    </div>
  )
}