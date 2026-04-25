'use client'

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useWorkflowStore } from '@/store/workflowStore'
import TextNode from '@/components/nodes/TextNode'
import UploadImageNode from '../nodes/UploadImageNode'
import UploadVideoNode from '@/components/nodes/UploadVideoNode'
import LLMNode from '../nodes/LLMNode'
import CropImageNode from '../nodes/CropImageNode'
import ExtractFrameNode from '../nodes/ExtractFrameNode'

const nodeTypes = {
    textNode: TextNode,
    uploadImageNode: UploadImageNode,
    uploadVideoNode: UploadVideoNode,
    llmNode: LLMNode,
    cropImageNode: CropImageNode,
    extractFrameNode: ExtractFrameNode,
}

export default function WorkflowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } = useWorkflowStore()

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        nodeTypes={nodeTypes}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#2a2a2a"
        />
        <MiniMap
          style={{ background: '#1c1c1c' }}
          maskColor="rgba(0,0,0,0.5)"
        />
      </ReactFlow>
    </div>
  )
}