import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const saveSchema = z.object({
  name: z.string().optional(),
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
});

// GET — load a workflow
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // 'new' is a special route — no DB lookup needed
  if (id === "new") {
    return NextResponse.json({
      id: "new",
      name: "Untitled",
      nodes: [],
      edges: [],
    });
  }

  const workflow = await prisma.workflow.findUnique({ where: { id } });

  if (!workflow)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (workflow.userId !== userId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(workflow);
}

// PUT — save a workflow
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { name, nodes, edges } = parsed.data;

  if (id === "new") {
    // Create a new workflow
    const workflow = await prisma.workflow.create({
      data: { userId, name: name ?? "Untitled", nodes, edges },
    });
    return NextResponse.json(workflow);
  }

  // Update existing
  const existing = await prisma.workflow.findUnique({ where: { id } });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.userId !== userId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const workflow = await prisma.workflow.update({
    where: { id },
    data: { name: name ?? existing.name, nodes, edges },
  });

  return NextResponse.json(workflow);
}
