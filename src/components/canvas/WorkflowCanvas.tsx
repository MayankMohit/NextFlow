'use client'

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  type Node,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useWorkflowStore } from '@/store/workflowStore'
import TextNode from '@/components/nodes/TextNode'
import UploadImageNode from '@/components/nodes/UploadImageNode'
import UploadVideoNode from '@/components/nodes/UploadVideoNode'
import LLMNode from '@/components/nodes/LLMNode'
import CropImageNode from '@/components/nodes/CropImageNode'
import ExtractFrameNode from '@/components/nodes/ExtractFrameNode'
import { useCallback, useEffect } from 'react'

const nodeTypes = {
  textNode: TextNode,
  uploadImageNode: UploadImageNode,
  uploadVideoNode: UploadVideoNode,
  llmNode: LLMNode,
  cropImageNode: CropImageNode,
  extractFrameNode: ExtractFrameNode,
}

const getInitialData = (type: string) => {
  switch (type) {
    case 'textNode': return { label: 'Text', text: '', status: 'idle' }
    case 'uploadImageNode': return { label: 'Upload Image', imageUrl: null, status: 'idle' }
    case 'uploadVideoNode': return { label: 'Upload Video', videoUrl: null, status: 'idle' }
    case 'llmNode': return { label: 'LLM', model: 'gemini-3.1-flash-lite-preview', result: null, status: 'idle' }
    case 'cropImageNode': return { label: 'Crop Image', xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 100, status: 'idle' }
    case 'extractFrameNode': return { label: 'Extract Frame', timestamp: '0', status: 'idle' }
    default: return { label: type, status: 'idle' }
  }
}

export default function WorkflowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, undo, redo, saveWorkflow, runWorkflow, theme } = useWorkflowStore()
  const { screenToFlowPosition } = useReactFlow()
  const isDark = theme === 'dark'

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if (ctrl && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo() }
      if (ctrl && e.key === 's') { e.preventDefault(); saveWorkflow() }
      if (ctrl && e.key === 'Enter') { e.preventDefault(); runWorkflow('full') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, saveWorkflow, runWorkflow])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/reactflow')
    if (!type) return
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addNode({ id: `${type}-${Date.now()}`, type, position, data: getInitialData(type) } as Node)
  }, [screenToFlowPosition, addNode])

  return (
    <div className="w-full h-full" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={['Delete', 'Backspace']}
        multiSelectionKeyCode="Shift"
        style={{ background: isDark ? '#0a0a0a' : '#f5f5f5' }}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#7c3aed', strokeWidth: 2 },
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={isDark ? '#2a2a2a' : '#c4c4c4'}
        />
        <MiniMap
          position="bottom-right"
          style={{
            background: isDark ? '#1c1c1c' : '#e5e5e5',
            border: `1px solid ${isDark ? '#2a2a2a' : '#d4d4d4'}`,
            borderRadius: 8,
            marginBottom: 56,
            marginRight: 4,
          }}
          maskColor={isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)'}
          nodeColor={isDark ? '#3a3a3a' : '#bbb'}
        />
      </ReactFlow>
    </div>
  )
}