'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Video, Upload, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'

export default function UploadVideoNode({ selected, data, id }: NodeProps) {
  const { updateNodeData, theme } = useWorkflowStore()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDark = theme === 'dark'
  const nodeBg    = isDark ? 'bg-[#1c1c1c]' : 'bg-white'
  const border    = selected ? 'border-violet-500' : (isDark ? 'border-[#2a2a2a]' : 'border-[#e0e0e0]')
  const hdrBorder = isDark ? 'border-[#2a2a2a]' : 'border-[#e8e8e8]'
  const textMain  = isDark ? 'text-white' : 'text-[#111]'
  const dropBorder = uploading ? 'border-violet-500 cursor-wait' : (isDark ? 'border-[#2a2a2a] cursor-pointer hover:border-violet-500' : 'border-[#d0d0d0] cursor-pointer hover:border-violet-500')
  const iconColor = isDark ? 'text-[#666]' : 'text-[#bbb]'
  const subText   = isDark ? 'text-[#444]' : 'text-[#ccc]'

  const videoUrl = typeof data.videoUrl === 'string' ? data.videoUrl : null

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
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
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally { setUploading(false) }
  }

  return (
    <div className={`w-64 ${nodeBg} border ${border} rounded-lg overflow-hidden`}>
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${hdrBorder}`}>
        <Video size={13} className="text-violet-400" />
        <span className={`text-xs font-medium ${textMain}`}>Upload Video</span>
      </div>
      <div className="p-3">
        {videoUrl ? (
          <div className="relative">
            <video src={videoUrl} controls className={`w-full h-32 object-cover rounded border ${isDark ? 'border-[#2a2a2a]' : 'border-[#e0e0e0]'}`} />
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
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>
      <Handle type="source" position={Position.Right} id="output"
        style={{ background: '#7c3aed', width: 10, height: 10, border: '2px solid #a78bfa' }} />
    </div>
  )
}
