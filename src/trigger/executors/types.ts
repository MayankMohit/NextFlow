import type { Node } from '@xyflow/react'

export interface ExecutorArgs {
  node: Node
  /** Resolved single-value inputs keyed by target handle (image_url, user_message, …) */
  inputs: Record<string, unknown>
  /** All upstream values connected to the multi-input 'images' handle */
  imageUrls: string[]
}

/** Returns the node's output — a URL for media nodes, plain text for LLM/text nodes. */
export type NodeExecutor = (args: ExecutorArgs) => Promise<unknown>
