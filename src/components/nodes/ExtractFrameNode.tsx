'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Film } from 'lucide-react'
import { useState } from 'react'

export default function ExtractFrameNode({ selected, data }: NodeProps) {
  const [timestamp, setTimestamp] = useState('0')

  const isConnected = (handle: string) =>
    (data.connectedInputs as string[] | undefined)?.includes(handle)

  return (
    <div className={`
      w-64 bg-[#1c1c1c] border rounded-lg overflow-hidden
      ${selected ? 'border-violet-500' : 'border-[#2a2a2a]'}
    `}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a2a2a]">
        <Film size={13} className="text-violet-400" />
        <span className="text-white text-xs font-medium">Extract Frame</span>
      </div>

      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[#666] text-xs w-20 shrink-0">Timestamp</span>
          <input
            type="text"
            value={timestamp}
            disabled={isConnected('timestamp')}
            onChange={(e) => setTimestamp(e.target.value)}
            placeholder="0 or 50%"
            className="flex-1 bg-[#141414] text-white text-xs rounded p-1 border border-[#2a2a2a] outline-none disabled:opacity-40 disabled:cursor-not-allowed placeholder:text-[#444]"
          />
        </div>
        <p className="text-[#444] text-xs">seconds or percentage e.g. 50%</p>
      </div>

      {/* Input Handles */}
      <Handle type="target" position={Position.Left} id="video_url"
        style={{ top: '35%', background: '#666', width: 10, height: 10, border: '2px solid #888' }} />
      <Handle type="target" position={Position.Left} id="timestamp"
        style={{ top: '65%', background: '#666', width: 10, height: 10, border: '2px solid #888' }} />

      {/* Output Handle */}
      <Handle type="source" position={Position.Right} id="output"
        style={{ background: '#7c3aed', width: 10, height: 10, border: '2px solid #a78bfa' }} />
    </div>
  )
}