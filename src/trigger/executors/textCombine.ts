import type { NodeExecutor } from './types'

// Combines up to four text inputs. With a template, {{1}}..{{4}} are replaced
// by the corresponding inputs; without one, non-empty inputs join with blank
// lines in handle order.
export const executeTextCombine: NodeExecutor = async ({ node, inputs }) => {
  const values = [1, 2, 3, 4].map(n => {
    const v = inputs[`text_${n}`]
    return typeof v === 'string' ? v : v != null ? String(v) : ''
  })

  if (values.every(v => v === '')) throw new Error('No text inputs connected')

  const template = typeof node.data.template === 'string' ? node.data.template : ''
  if (template.trim() === '') {
    return values.filter(v => v !== '').join('\n\n')
  }
  return template.replace(/\{\{\s*([1-4])\s*\}\}/g, (_, n) => values[Number(n) - 1])
}
