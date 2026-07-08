import type { NodeExecutor } from './types'
import { executeLLM } from './llm'
import { executeCropImage } from './cropImage'
import { executeExtractFrame } from './extractFrame'
import { executeOutput } from './output'
import { executeTextCombine } from './textCombine'
import { executeResizeImage } from './resizeImage'
import { executeGenerateImage } from './generateImage'
import { executeEditImage } from './editImage'
import { executeTTS } from './tts'
import { executeTranscribe } from './transcribe'

export type { ExecutorArgs, NodeExecutor } from './types'

// New executable node types register here (and only here on the server side).
export const executors: Record<string, NodeExecutor> = {
  llmNode: executeLLM,
  cropImageNode: executeCropImage,
  extractFrameNode: executeExtractFrame,
  outputNode: executeOutput,
  textCombineNode: executeTextCombine,
  resizeImageNode: executeResizeImage,
  imageGenNode: executeGenerateImage,
  imageEditNode: executeEditImage,
  ttsNode: executeTTS,
  transcribeNode: executeTranscribe,
}
