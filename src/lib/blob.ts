import { put } from '@vercel/blob'

/** Uploads a buffer to Vercel Blob and returns its permanent public URL. */
export async function uploadBufferToBlob(
  buffer: Buffer,
  pathname: string,
  contentType: string,
): Promise<string> {
  const blob = await put(pathname, buffer, {
    access: 'public',
    contentType,
    addRandomSuffix: true,
  })
  return blob.url
}

/**
 * Copies a remote file (e.g. a temporary Transloadit result URL) into Vercel
 * Blob so the asset survives after the source expires.
 */
export async function copyUrlToBlob(url: string, pathname: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch file for Blob copy: ${res.status}`)
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
  return uploadBufferToBlob(Buffer.from(await res.arrayBuffer()), pathname, contentType)
}
