'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Crop } from 'lucide-react'
import { useWorkflowStore } from '@/store/workflowStore'

export default function CropImageNode({ selected, data, id }: NodeProps) {
  const { updateNodeData } = useWorkflowStore()

  const isRunning = data.status === 'running'
  const isConnected = (handle: string) =>
    (data.connectedInputs as string[] | undefined)?.includes(handle)

  const fields = [
    { label: 'X %',      key: 'xPercent',      handle: 'x_percent',      default: 0   },
    { label: 'Y %',      key: 'yPercent',      handle: 'y_percent',      default: 0   },
    { label: 'Width %',  key: 'widthPercent',  handle: 'width_percent',  default: 100 },
    { label: 'Height %', key: 'heightPercent', handle: 'height_percent', default: 100 },
  ]

  return (
    <div className={`
      w-64 bg-[#1c1c1c] border rounded-lg overflow-hidden
      ${selected ? 'border-violet-500' : 'border-[#2a2a2a]'}
      ${isRunning ? 'animate-pulse shadow-lg shadow-violet-500/30' : ''}
    `}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a2a2a]">
        <Crop size={13} className="text-violet-400" />
        <span className="text-white text-xs font-medium">Crop Image</span>
        {isRunning && (
          <span className="ml-auto text-xs text-violet-400 animate-pulse">Running...</span>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2">
        {fields.map(({ label, key, handle, default: def }) => (
          <div key={handle} className="flex items-center gap-2">
            <span className="text-[#666] text-xs w-14 shrink-0">{label}</span>
            <input
              type="number"
              min={0}
              max={100}
              disabled={isConnected(handle)}
              defaultValue={(data[key] as number) ?? def}
              onChange={(e) => updateNodeData(id, { [key]: Number(e.target.value) })}
              className="flex-1 bg-[#141414] text-white text-xs rounded p-1 border border-[#2a2a2a] outline-none disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
        ))}
      </div>

      <Handle type="target" position={Position.Left} id="image_url"
        style={{ top: '20%', background: '#666', width: 10, height: 10, border: '2px solid #888' }} />
      <Handle type="target" position={Position.Left} id="x_percent"
        style={{ top: '38%', background: '#666', width: 10, height: 10, border: '2px solid #888' }} />
      <Handle type="target" position={Position.Left} id="y_percent"
        style={{ top: '52%', background: '#666', width: 10, height: 10, border: '2px solid #888' }} />
      <Handle type="target" position={Position.Left} id="width_percent"
        style={{ top: '66%', background: '#666', width: 10, height: 10, border: '2px solid #888' }} />
      <Handle type="target" position={Position.Left} id="height_percent"
        style={{ top: '80%', background: '#666', width: 10, height: 10, border: '2px solid #888' }} />

      <Handle type="source" position={Position.Right} id="output"
        style={{ background: '#7c3aed', width: 10, height: 10, border: '2px solid #a78bfa' }} />
    </div>
  )
}