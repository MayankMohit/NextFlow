'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Type } from 'lucide-react'
import { useWorkflowStore } from '@/store/workflowStore'

export default function TextNode({ data, selected, id }: NodeProps) {
  const { updateNodeData } = useWorkflowStore()

  return (
    <div className={`
      w-64 bg-[#1c1c1c] border rounded-lg overflow-hidden
      ${selected ? 'border-violet-500' : 'border-[#2a2a2a]'}
    `}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a2a2a]">
        <Type size={13} className="text-violet-400" />
        <span className="text-white text-xs font-medium">Text</span>
      </div>

      <div className="p-3">
        <textarea
          rows={3}
          placeholder="Enter text..."
          defaultValue={(data.text as string) ?? ''}
          className="w-full bg-[#141414] text-white text-xs rounded p-2 outline-none resize-none placeholder:text-[#666] border border-[#2a2a2a] focus:border-violet-500 transition-colors"
          onChange={(e) => updateNodeData(id, { text: e.target.value })}
        />
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