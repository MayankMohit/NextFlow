'use client'

import { getBezierPath, type EdgeProps, useStore } from '@xyflow/react'

const NODE_COLORS: Record<string, string> = {
  textNode: '#fec50b',
  uploadImageNode: '#067ef8',
  uploadVideoNode: '#067ef8',
  llmNode: '#8f29ef',
  cropImageNode: '#16A68D',
  extractFrameNode: '#16A68D',
}

const DEFAULT_COLOR = '#7c3aed'

export default function GradientEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition,
  targetPosition,
  source,
  target,
  selected,
}: EdgeProps) {
  const sourceType = useStore(s => s.nodes.find(n => n.id === source)?.type)
  const targetType = useStore(s => s.nodes.find(n => n.id === target)?.type)

  const srcColor = NODE_COLORS[sourceType ?? ''] ?? DEFAULT_COLOR
  const tgtColor = NODE_COLORS[targetType ?? ''] ?? DEFAULT_COLOR

  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  const gradientId = `grad-${id}`

  return (
    <>
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
        >
          <stop offset="0%" stopColor={srcColor} />
          <stop offset="100%" stopColor={tgtColor} />
        </linearGradient>
      </defs>
      {/* Wide transparent hit area so edges remain selectable/deletable */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        className="react-flow__edge-interaction"
      />
      <path
        d={edgePath}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={selected ? 2.5 : 2}
        strokeLinecap="round"
        opacity={selected ? 1 : 0.85}
      />
    </>
  )
}
