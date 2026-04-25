export type NodeType = 
  | 'textNode'
  | 'uploadImageNode' 
  | 'uploadVideoNode'
  | 'llmNode'
  | 'cropImageNode'
  | 'extractFrameNode'

export type HandleDataType = 'text' | 'image' | 'video' | 'number'

export type NodeStatus = 'idle' | 'running' | 'success' | 'failed'

export interface BaseNodeData {
  label: string
  status: NodeStatus
  output?: unknown
  error?: string
}

export interface TextNodeData extends BaseNodeData {
  text: string
}

export interface LLMNodeData extends BaseNodeData {
  model: string
  result?: string
}

export interface CropImageNodeData extends BaseNodeData {
  imageUrl?: string
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

export interface ExtractFrameNodeData extends BaseNodeData {
  videoUrl?: string
  timestamp: string | number
}