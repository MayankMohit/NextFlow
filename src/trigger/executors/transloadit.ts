interface TransloaditAssembly {
  ok?: string
  error?: string
  assembly_id?: string
  uploads?: Array<{ url?: string }>
  results?: Record<string, Array<{ url?: string }>>
}

export function transloaditKey(): string {
  const key = process.env.NEXT_PUBLIC_TRANSLOADIT_KEY
  if (!key) throw new Error('NEXT_PUBLIC_TRANSLOADIT_KEY is not set')
  return key
}

/**
 * Creates a Transloadit assembly and polls until it completes.
 * Polling backs off 500ms → 3s cap so fast assemblies finish fast
 * without hammering the API on slow ones.
 */
export async function runAssembly(
  params: Record<string, unknown>,
  file?: { blob: Blob; name: string },
): Promise<TransloaditAssembly> {
  const formData = new FormData()
  formData.append('params', JSON.stringify(params))
  if (file) formData.append('file', file.blob, file.name)

  const res = await fetch('https://api2.transloadit.com/assemblies', {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) throw new Error(`Transloadit request failed: ${res.status}`)
  let assembly: TransloaditAssembly = await res.json()
  if (assembly.error) throw new Error(assembly.error)

  let delay = 500
  let attempts = 0
  while (assembly.ok !== 'ASSEMBLY_COMPLETED') {
    if (++attempts > 40) throw new Error('Transloadit assembly timed out')
    await new Promise(r => setTimeout(r, delay))
    delay = Math.min(delay * 1.5, 3000)
    const poll = await fetch(`https://api2.transloadit.com/assemblies/${assembly.assembly_id}`)
    if (!poll.ok) throw new Error(`Transloadit poll failed: ${poll.status}`)
    assembly = await poll.json()
    if (assembly.error) throw new Error(assembly.error)
    if (assembly.ok === 'ASSEMBLY_ERROR' || assembly.ok === 'REQUEST_ABORTED') {
      throw new Error(`Transloadit assembly failed: ${assembly.ok}`)
    }
  }
  return assembly
}
