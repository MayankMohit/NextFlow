import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// GET /api/assets?workflowId=...&limit=50 — list the user's assets
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workflowId = req.nextUrl.searchParams.get("workflowId") ?? undefined;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 100, 200);

  const assets = await prisma.asset.findMany({
    where: { userId, ...(workflowId ? { workflowId } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json(assets);
}

const createSchema = z.object({
  url: z.string().url(),
  type: z.enum(["image", "video"]),
  workflowId: z.string().optional(),
  nodeId: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

// POST /api/assets — record an uploaded/generated asset
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { url, type, workflowId, nodeId, meta } = parsed.data;

  // Same URL recorded twice (e.g. re-save after refresh) → return the original
  const existing = await prisma.asset.findFirst({ where: { userId, url } });
  if (existing) return NextResponse.json(existing);

  // Unsaved workflows send 'new' or an id that doesn't exist yet — store null
  let validWorkflowId: string | null = null;
  if (workflowId && workflowId !== "new") {
    const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
    if (wf && wf.userId === userId) validWorkflowId = workflowId;
  }

  const asset = await prisma.asset.create({
    data: {
      userId,
      workflowId: validWorkflowId,
      nodeId,
      type,
      url,
      meta: meta as never,
    },
  });

  return NextResponse.json(asset);
}
