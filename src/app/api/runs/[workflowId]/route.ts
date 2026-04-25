import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { workflowId } = await params

  const runs = await prisma.workflowRun.findMany({
    where: { workflowId, userId },
    include: { nodeRuns: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json(runs)
}