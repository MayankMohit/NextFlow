import type { NodeExecutor } from './types'
import { executeLLM } from './llm'
import { executeCropImage } from './cropImage'
import { executeExtractFrame } from './extractFrame'

export type { ExecutorArgs, NodeExecutor } from './types'

// New executable node types register here (and only here on the server side).
export const executors: Record<string, NodeExecutor> = {
  llmNode: executeLLM,
  cropImageNode: executeCropImage,
  extractFrameNode: executeExtractFrame,
}
