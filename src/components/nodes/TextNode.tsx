'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Type } from 'lucide-react'
import { useWorkflowStore } from '@/store/workflowStore'

export default function TextNode({ data, selected, id }: NodeProps) {
  const { updateNodeData, theme } = useWorkflowStore()
  const isDark = theme === 'dark'

  const nodeBg   = isDark ? 'bg-[#1c1c1c]' : 'bg-white'
  const border   = selected ? 'border-violet-500' : (isDark ? 'border-[#2a2a2a]' : 'border-[#e0e0e0]')
  const hdrBorder = isDark ? 'border-[#2a2a2a]' : 'border-[#e8e8e8]'
  const textMain  = isDark ? 'text-white' : 'text-[#111]'
  const inputBg   = isDark ? 'bg-[#141414] border-[#2a2a2a] text-white placeholder:text-[#555]' : 'bg-[#f5f5f5] border-[#e0e0e0] text-[#111] placeholder:text-[#bbb]'

  return (
    <div className={`w-64 ${nodeBg} border ${border} rounded-lg overflow-hidden`}>
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${hdrBorder}`}>
        <Type size={13} className="text-violet-400" />
        <span className={`text-xs font-medium ${textMain}`}>Text</span>
      </div>
      <div className="p-3">
        <textarea rows={3} placeholder="Enter text..."
          defaultValue={(data.text as string) ?? ''}
          className={`w-full text-xs rounded p-2 outline-none resize-none border focus:border-violet-500 transition-colors ${inputBg}`}
          onChange={e => updateNodeData(id, { text: e.target.value })} />
      </div>
      <Handle type="source" position={Position.Right} id="output"
        style={{ background: '#7c3aed', width: 10, height: 10, border: '2px solid #a78bfa' }} />
    </div>
  )
}
