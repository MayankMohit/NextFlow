'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Image, Upload } from 'lucide-react'
import { useState } from 'react'

export default function UploadImageNode({ selected }: NodeProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    // Transloadit upload will go here later
  }

  return (
    <div className={`
      w-64 bg-[#1c1c1c] border rounded-lg overflow-hidden
      ${selected ? 'border-violet-500' : 'border-[#2a2a2a]'}
    `}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a2a2a]">
        <Image size={13} className="text-violet-400" />
        <span className="text-white text-xs font-medium">Upload Image</span>
      </div>

      {/* Body */}
      <div className="p-3">
        {preview ? (
          <div className="relative">
            <img
              src={preview}
              alt="preview"
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
            <span className="text-[#444] text-xs mt-0.5">jpg, png, webp, gif</span>
            <input
              type="file"
              accept="image/jpg,image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        )}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{ background: '#7c3aed', width: 10, height: 10, border: '2px solid #a78bfa' }}
      />
    </div>
  )
}