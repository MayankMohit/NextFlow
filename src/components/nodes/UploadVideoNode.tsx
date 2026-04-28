'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Video, Upload, Loader2, Play, X } from 'lucide-react'
import { useState } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useNodeHover } from '@/hooks/usenodehover'
import { useNodeStatus } from '@/hooks/useNodeStatus'

const NODE_COLOR = '#067ef8'

export default function UploadVideoNode({ selected, data, id }: NodeProps) {
  const { updateNodeData, theme, runNode, saveWorkflow } = useWorkflowStore()
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const isDark = theme === 'dark'
  const { hovered, onMouseEnter, onMouseLeave } = useNodeHover()
  const { isNodeRunning, isStartNode, canRun } = useNodeStatus(id)

  const handleRun = async () => { await saveWorkflow(); await runNode(id) }

  const nodeBg     = isDark ? 'bg-[#1c1c1c]' : 'bg-white'
  const border     = selected ? 'border-violet-500' : (isDark ? 'border-[#2a2a2a]' : 'border-[#e0e0e0]')
  const hdrBorder  = isDark ? 'border-[#2a2a2a]' : 'border-[#e8e8e8]'
  const textMain   = isDark ? 'text-white' : 'text-[#111]'
  const dropBorder = uploading
    ? 'border-violet-500 cursor-wait'
    : isDark ? 'border-[#2a2a2a] cursor-pointer hover:border-violet-500' : 'border-[#d0d0d0] cursor-pointer hover:border-violet-500'
  const iconColor  = isDark ? 'text-[#666]' : 'text-[#bbb]'
  const subText    = isDark ? 'text-[#444]' : 'text-[#ccc]'

const borderColor = selected ? NODE_COLOR : isDark ? '#2a2a2a' : '#e0e0e0'

  const glowKeyframes = `
    @keyframes upload-video-node-glow {
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
        animation: 'upload-video-node-glow 1.8s ease-in-out infinite',
      }
    : {
        borderColor,
        boxShadow: selected ? `0 0 0 1.5px ${NODE_COLOR}55` : undefined,
      }

  const videoUrl = typeof data.videoUrl === 'string' ? data.videoUrl : null

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const params = JSON.stringify({ auth: { key: process.env.NEXT_PUBLIC_TRANSLOADIT_KEY }, steps: { ':original': { robot: '/upload/handle' } } })
      formData.append('params', params)
      const res = await fetch('https://api2.transloadit.com/assemblies', { method: 'POST', body: formData })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      let assembly = result
      while (assembly.ok !== 'ASSEMBLY_COMPLETED') {
        await new Promise(r => setTimeout(r, 1000))
        const poll = await fetch(`https://api2.transloadit.com/assemblies/${assembly.assembly_id}`)
        assembly = await poll.json()
        if (assembly.error) throw new Error(assembly.error)
      }
      const url = assembly.uploads?.[0]?.url
      if (!url) throw new Error('No URL returned from Transloadit')
      updateNodeData(id, { videoUrl: url })
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally { setUploading(false) }
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
          <Video size={13} style={{ color: NODE_COLOR }} />
          <span className={`text-xs font-medium ${textMain}`}>Upload Video</span>
        </div>
        <div className="p-3">
          {videoUrl ? (
            <div className="relative">
              <video src={videoUrl} controls
                className={`w-full h-32 object-cover rounded border ${isDark ? 'border-[#2a2a2a]' : 'border-[#e0e0e0]'}`} />
              <button onClick={() => updateNodeData(id, { videoUrl: null })}
                className="absolute top-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded hover:bg-black/80">✕</button>
            </div>
          ) : (
            <label className={`flex flex-col items-center justify-center w-full h-32 border border-dashed rounded transition-colors ${dropBorder}`}>
              {uploading ? (
                <><Loader2 size={20} className="text-violet-400 animate-spin mb-1" /><span className="text-violet-400 text-xs">Uploading...</span></>
              ) : (
                <><Upload size={20} className={`${iconColor} mb-1`} /><span className={`text-xs ${iconColor}`}>Click to upload</span><span className={`text-xs mt-0.5 ${subText}`}>mp4, mov, webm, m4v</span></>
              )}
              <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" className="hidden" disabled={uploading} onChange={handleFileChange} />
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
