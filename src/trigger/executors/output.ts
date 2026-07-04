import type { NodeExecutor } from './types'

// Identity executor — the Output node just displays its upstream value, but
// running it (instead of treating it as passthrough) gives it a NodeRun row
// so it shows up in history with the final result.
export const executeOutput: NodeExecutor = async ({ inputs }) => {
  const value = inputs.input
  if (value == null) throw new Error('No input connected')
  return value
}
