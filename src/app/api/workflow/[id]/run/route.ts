import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { orchestratorTask } from "@/trigger/orchestratorTask";
import type { Node, Edge } from "@xyflow/react";
import { z } from "zod";

const PASSTHROUGH_TYPES = new Set(["textNode", "uploadImageNode", "uploadVideoNode"]);

const runSchema = z.object({
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
  scope: z.enum(["full", "partial", "single"]).default("full"),
  // Executable node ids this run should execute (empty/omitted = all)
  targetNodeIds: z.array(z.string()).optional(),
  // Passthrough node IDs to persist as instant NodeRun records
  passthroughNodeIds: z.array(z.string()).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const parsed = runSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { nodes, edges, scope, targetNodeIds, passthroughNodeIds } =
    parsed.data as {
      nodes: Node[];
      edges: Edge[];
      scope: "full" | "partial" | "single";
      targetNodeIds?: string[];
      passthroughNodeIds?: string[];
    };

  // Resolve workflowId — create one if this is a new unsaved workflow
  let workflowId = id;
  if (id === "new") {
    const created = await prisma.workflow.create({
      data: {
        userId,
        name: "Untitled",
        nodes: nodes as unknown as never,
        edges: edges as unknown as never,
      },
    });
    workflowId = created.id;
  }

  const run = await prisma.workflowRun.create({
    data: { workflowId, userId, status: "running", scope },
  });

  // Passthrough nodes (text/upload) don't execute — record them instantly
  const passthroughNodes = (
    passthroughNodeIds
      ? nodes.filter((n: Node) => passthroughNodeIds.includes(n.id))
      : scope === "full"
      ? nodes.filter((n: Node) => PASSTHROUGH_TYPES.has(n.type ?? ""))
      : []
  ) as Node[];

  if (passthroughNodes.length > 0) {
    await prisma.nodeRun.createMany({
      data: passthroughNodes.map((n: Node) => {
        const data = (n.data ?? {}) as Record<string, unknown>;
        let out: string | null = null;
        if (n.type === "textNode") out = (data.text as string) || null;
        else if (n.type === "uploadImageNode") out = (data.imageUrl as string) || null;
        else if (n.type === "uploadVideoNode") out = (data.videoUrl as string) || null;
        return {
          workflowRunId: run.id,
          nodeId: n.id,
          nodeType: n.type ?? "unknown",
          status: "success" as const,
          inputs: undefined,
          outputs: out ? { result: out } : undefined,
          error: null,
          duration: 0,
        };
      }),
    });
  }

  // Fire the orchestrator and return immediately — the client subscribes to
  // live per-node progress via Trigger.dev Realtime; the task itself writes
  // NodeRun rows and the final WorkflowRun status.
  const handle = await tasks.trigger<typeof orchestratorTask>("orchestrator-task", {
    workflowRunId: run.id,
    workflowId,
    userId,
    nodes,
    edges,
    targetNodeIds,
  });

  return NextResponse.json({
    runId: run.id,
    workflowId,
    triggerRunId: handle.id,
    publicAccessToken: handle.publicAccessToken,
  });
}
