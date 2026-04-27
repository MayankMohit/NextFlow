import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

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

  await prisma.workflow.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
