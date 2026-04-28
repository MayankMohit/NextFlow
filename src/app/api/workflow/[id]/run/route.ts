import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { tasks, runs } from "@trigger.dev/sdk/v3";
import type { orchestratorTask } from "@/trigger/orchestratorTask";
import type { Node, Edge } from "@xyflow/react";
import { z } from "zod";

const PASSTHROUGH_TYPES = new Set(["textNode", "uploadImageNode", "uploadVideoNode"]);

const runSchema = z.object({
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
  scope: z.enum(["full", "partial", "single"]).default("full"),
  selectedNodeIds: z.array(z.string()).optional(),
  // Passthrough node IDs to persist as instant NodeRun records (first call only)
  passthroughNodeIds: z.array(z.string()).optional(),
  // When set, append NodeRuns to this existing WorkflowRun instead of creating a new one
  existingRunId: z.string().optional(),
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

  const { nodes, edges, scope, selectedNodeIds, passthroughNodeIds, existingRunId } =
    parsed.data as {
      nodes: Node[];
      edges: Edge[];
      scope: "full" | "partial" | "single";
      selectedNodeIds?: string[];
      passthroughNodeIds?: string[];
      existingRunId?: string;
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

  // Either reuse an existing WorkflowRun (subsequent layers) or create a new one (first call)
  let runId: string;
  if (existingRunId) {
    runId = existingRunId;
  } else {
    const newRun = await prisma.workflowRun.create({
      data: { workflowId, userId, status: "running", scope },
    });
    runId = newRun.id;

    // Passthrough NodeRun records are created only on the first call
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
            workflowRunId: runId,
            nodeId: n.id,
            nodeType: n.type ?? "unknown",
            status: "success" as const,
            inputs: Prisma.JsonNull,
            outputs: out
              ? ({ result: out } as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            error: null,
            duration: 0,
          };
        }),
      });
    }
  }

  // Trigger the orchestrator for the selected layer of nodes
  const handle = await tasks.trigger<typeof orchestratorTask>(
    "orchestrator-task",
    { nodes, edges, scope, selectedNodeIds },
  );

  // Poll until complete
  let output: Record<string, unknown> | null = null;
  let attempts = 0;
  while (attempts < 60) {
    await new Promise((r) => setTimeout(r, 2000));
    const runStatus = await runs.retrieve(handle.id);
    if (runStatus.status === "COMPLETED") {
      output = runStatus.output as Record<string, unknown>;
      break;
    }
    if (
      ["FAILED", "CRASHED", "CANCELED", "TIMED_OUT", "SYSTEM_FAILURE"].includes(
        runStatus.status,
      )
    ) {
      break;
    }
    attempts++;
  }

  if (!output) {
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "failed" },
    });
    return NextResponse.json(
      { error: "Orchestrator failed or timed out" },
      { status: 500 },
    );
  }

  const { nodeOutputs, nodeRunResults, overallStatus } = output as {
    nodeOutputs: Record<string, unknown>;
    nodeRunResults: Array<{
      nodeId: string;
      nodeType: string;
      status: "success" | "failed";
      result?: unknown;
      error?: string;
      duration: number;
    }>;
    overallStatus: string;
  };

  // Append NodeRun records for this layer to the (possibly shared) WorkflowRun
  await prisma.nodeRun.createMany({
    data: nodeRunResults.map((nr) => ({
      workflowRunId: runId,
      nodeId: nr.nodeId,
      nodeType: nr.nodeType,
      status: nr.status,
      inputs: Prisma.JsonNull,
      outputs: nr.result
        ? ({ result: nr.result } as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      error: nr.error,
      duration: nr.duration,
    })),
  });

  // Update WorkflowRun: always set latest status; increment duration so
  // multi-layer runs accumulate correctly instead of overwriting.
  const layerDuration = nodeRunResults.reduce((acc, nr) => acc + nr.duration, 0);
  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      status: overallStatus,
      duration: existingRunId
        ? { increment: layerDuration }
        : layerDuration,
    },
  });

  return NextResponse.json({
    runId,
    workflowId,
    status: overallStatus,
    nodeOutputs,
    nodeRuns: nodeRunResults,
  });
}
