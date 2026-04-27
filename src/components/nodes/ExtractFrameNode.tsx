'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Film } from 'lucide-react'
import { useWorkflowStore } from '@/store/workflowStore'

export default function ExtractFrameNode({ selected, data, id }: NodeProps) {
  const { updateNodeData, theme } = useWorkflowStore()
  const isDark = theme === 'dark'

  const nodeBg     = isDark ? 'bg-[#1c1c1c]' : 'bg-white'
  const border     = selected ? 'border-violet-500' : (isDark ? 'border-[#2a2a2a]' : 'border-[#e0e0e0]')
  const hdrBorder  = isDark ? 'border-[#2a2a2a]' : 'border-[#e8e8e8]'
  const textMain   = isDark ? 'text-white' : 'text-[#111]'
  const labelColor = isDark ? 'text-[#666]' : 'text-[#888]'
  const hintColor  = isDark ? 'text-[#444]' : 'text-[#ccc]'
  const inputCls   = isDark ? 'bg-[#141414] text-white border-[#2a2a2a] placeholder:text-[#444]' : 'bg-[#f5f5f5] text-[#111] border-[#e0e0e0] placeholder:text-[#ccc]'

  const isRunning = data.status === 'running'
  const isConnected = (handle: string) => (data.connectedInputs as string[] | undefined)?.includes(handle)

  return (
    <div className={`w-64 ${nodeBg} border ${border} rounded-lg overflow-hidden ${isRunning ? 'animate-pulse shadow-lg shadow-violet-500/30' : ''}`}>
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${hdrBorder}`}>
        <Film size={13} className="text-violet-400" />
        <span className={`text-xs font-medium ${textMain}`}>Extract Frame</span>
        {isRunning && <span className="ml-auto text-xs text-violet-400 animate-pulse">Running...</span>}
      </div>
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs w-20 shrink-0 ${labelColor}`}>Timestamp</span>
          <input type="text" disabled={isConnected('timestamp')}
            defaultValue={(data.timestamp as string) ?? '0'}
            onChange={e => updateNodeData(id, { timestamp: e.target.value })}
            placeholder="0 or 50%"
            className={`flex-1 text-xs rounded p-1 border outline-none disabled:opacity-40 disabled:cursor-not-allowed ${inputCls}`} />
        </div>
        <p className={`text-xs ${hintColor}`}>seconds or percentage e.g. 50%</p>
      </div>
      <Handle type="target" position={Position.Left} id="video_url"  style={{ top: '35%', background: '#666', width: 10, height: 10, border: '2px solid #888' }} />
      <Handle type="target" position={Position.Left} id="timestamp"  style={{ top: '65%', background: '#666', width: 10, height: 10, border: '2px solid #888' }} />
      <Handle type="source" position={Position.Right} id="output"    style={{ background: '#7c3aed', width: 10, height: 10, border: '2px solid #a78bfa' }} />
    </div>
  )
}
