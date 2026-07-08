'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Music, Upload, Loader2, Play, X } from 'lucide-react'
import { useState } from 'react'
import { upload } from '@vercel/blob/client'
import { useWorkflowStore } from '@/store/workflowStore'
import { useNodeHover } from '@/hooks/usenodehover'
import { useNodeStatus } from '@/hooks/useNodeStatus'

const NODE_COLOR = '#067ef8'

export default function UploadAudioNode({ selected, data, id }: NodeProps) {
  const { updateNodeData, theme, runNode, saveWorkflow, recordAsset } = useWorkflowStore()
  const [localUploading, setLocalUploading] = useState(false)
  // data.uploading = drag-and-drop upload running in the canvas
  const uploading = localUploading || data.uploading === true
  const [uploadError, setUploadError] = useState<string | null>(null)
  const isDark = theme === 'dark'
  const { hovered, onMouseEnter, onMouseLeave } = useNodeHover()
  const { isNodeRunning, isStartNode, canRun } = useNodeStatus(id)

  const handleRun = async () => { await saveWorkflow(); await runNode(id) }

  const nodeBg     = isDark ? 'bg-[#1c1c1c]' : 'bg-white'
  const border     = selected ? 'border-[#067ef8]' : (isDark ? 'border-[#2a2a2a]' : 'border-[#e0e0e0]')
  const hdrBorder  = isDark ? 'border-[#2a2a2a]' : 'border-[#e8e8e8]'
  const textMain   = isDark ? 'text-white' : 'text-[#111]'
  const dropBorder = uploading
    ? 'border-violet-500 cursor-wait'
    : isDark ? 'border-[#2a2a2a] cursor-pointer hover:border-violet-500' : 'border-[#d0d0d0] cursor-pointer hover:border-violet-500'
  const iconColor  = isDark ? 'text-[#666]' : 'text-[#bbb]'
  const subText    = isDark ? 'text-[#444]' : 'text-[#ccc]'

  const borderColor = selected ? NODE_COLOR : isDark ? '#2a2a2a' : '#e0e0e0'

  const glowKeyframes = `
    @keyframes upload-audio-node-glow {
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
        animation: 'upload-audio-node-glow 1.8s ease-in-out infinite',
      }
    : {
        borderColor,
        boxShadow: selected ? `0 0 0 1.5px ${NODE_COLOR}55` : undefined,
      }

  const audioUrl = typeof data.audioUrl === 'string' ? data.audioUrl : null

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLocalUploading(true); setUploadError(null)
    try {
      // Direct-to-Blob upload: permanent URL, no server body-size limit
      const blob = await upload(`uploads/${file.name}`, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
      })
      updateNodeData(id, { audioUrl: blob.url })
      void recordAsset({ nodeId: id, type: 'audio', url: blob.url })
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally { setLocalUploading(false) }
  }

  return (
    <div className="relative" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
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
          <Play size={10} />{isStartNode ? 'Run workflow' : 'Run'}
        </button>
      )}

      {/* Running badge — hover-only */}
      {hovered && isNodeRunning && (
        <div className="absolute top-0 right-full mr-1 z-50 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium shadow-lg border bg-violet-900 border-violet-700 text-violet-300">
          <Loader2 size={9} className="animate-spin" />Running…
        </div>
      )}

      {/* Node body */}
      <div className={`w-64 ${nodeBg} border ${border} rounded-lg overflow-hidden`} style={glowStyle}>
        <div className={`flex items-center gap-2 px-3 py-2 border-b ${hdrBorder}`}>
          <Music size={13} style={{ color: NODE_COLOR }} />
          <span className={`text-xs font-medium ${textMain}`}>Upload Audio</span>
        </div>
        <div className="p-3">
          {audioUrl ? (
            <div className="relative flex flex-col gap-1.5">
              <audio src={audioUrl} controls className="nodrag w-full h-9" />
              <button onClick={() => updateNodeData(id, { audioUrl: null })}
                className="nodrag self-end bg-black/60 text-white text-xs px-1.5 py-0.5 rounded hover:bg-black/80">✕ Remove</button>
            </div>
          ) : (
            <label className={`flex flex-col items-center justify-center w-full h-32 border border-dashed rounded transition-colors ${dropBorder}`}>
              {uploading ? (
                <><Loader2 size={20} className="text-violet-400 animate-spin mb-1" /><span className="text-violet-400 text-xs">Uploading...</span></>
              ) : (
                <><Upload size={20} className={`${iconColor} mb-1`} /><span className={`text-xs ${iconColor}`}>Click to upload</span><span className={`text-xs mt-0.5 ${subText}`}>mp3, wav, m4a, ogg</span></>
              )}
              <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/flac,audio/webm" className="hidden" disabled={uploading} onChange={handleFileChange} />
            </label>
          )}
          {uploadError && <p className="text-red-400 text-xs mt-2">{uploadError}</p>}
        </div>
        <Handle type="source" position={Position.Right} id="output"
          style={{ background: NODE_COLOR, width: 10, height: 10, border: `2px solid ${NODE_COLOR}CC` }} />
      </div>
    </div>
  )
}
