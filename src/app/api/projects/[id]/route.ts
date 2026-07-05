import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { del } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'

// Only files we own live under uploads/ or outputs/ — demo/ blobs are shared
// by the sample workflow across all projects and must never be deleted.
const MANAGED_BLOB_RE = /\.blob\.vercel-storage\.com\/(outputs|uploads)\//

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const workflow = await prisma.workflow.findUnique({ where: { id } })
  if (!workflow) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (workflow.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const assets = await prisma.asset.findMany({
    where: { workflowId: id },
    select: { url: true },
  })

  // Asset rows would otherwise be orphaned (workflowId is SetNull on delete);
  // runs/nodeRuns cascade with the workflow.
  await prisma.$transaction([
    prisma.asset.deleteMany({ where: { workflowId: id } }),
    prisma.workflow.delete({ where: { id } }),
  ])

  const blobUrls = [...new Set(assets.map(a => a.url))].filter(u => MANAGED_BLOB_RE.test(u))
  if (blobUrls.length > 0) {
    await del(blobUrls).catch(() => { /* rows are gone; file cleanup is best-effort */ })
  }

  return NextResponse.json({ ok: true })
}
