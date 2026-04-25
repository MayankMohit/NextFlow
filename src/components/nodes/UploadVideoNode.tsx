'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Video, Upload } from 'lucide-react'
import { useState } from 'react'

export default function UploadVideoNode({ selected }: NodeProps) {
  const [preview, setPreview] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
  }

  return (
    <div className={`
      w-64 bg-[#1c1c1c] border rounded-lg overflow-hidden
      ${selected ? 'border-violet-500' : 'border-[#2a2a2a]'}
    `}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a2a2a]">
        <Video size={13} className="text-violet-400" />
        <span className="text-white text-xs font-medium">Upload Video</span>
      </div>

      <div className="p-3">
        {preview ? (
          <div className="relative">
            <video
              src={preview}
              controls
              className="w-full h-32 object-cover rounded border border-[#2a2a2a]"
            />
            <button
              onClick={() => setPreview(null)}
              className="absolute top-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded"
            >
              ✕
            </button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center w-full h-32 border border-dashed border-[#2a2a2a] rounded cursor-pointer hover:border-violet-500 transition-colors">
            <Upload size={20} className="text-[#666] mb-1" />
            <span className="text-[#666] text-xs">Click to upload</span>
            <span className="text-[#444] text-xs mt-0.5">mp4, mov, webm, m4v</span>
            <input
              type="file"
              accept="video/mp4,video/mov,video/webm,video/m4v"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{ background: '#7c3aed', width: 10, height: 10, border: '2px solid #a78bfa' }}
      />
    </div>
  )
}