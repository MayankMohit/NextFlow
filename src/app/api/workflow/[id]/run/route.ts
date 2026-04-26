import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { tasks, runs } from "@trigger.dev/sdk/v3";
import type { orchestratorTask } from "@/trigger/orchestratorTask";
import type { Node, Edge } from "@xyflow/react";
import { z } from "zod";

const runSchema = z.object({
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
  scope: z.enum(["full", "partial", "single"]).default("full"),
  selectedNodeIds: z.array(z.string()).optional(),
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

  const { nodes, edges, scope, selectedNodeIds } = parsed.data as {
    nodes: Node[];
    edges: Edge[];
    scope: "full" | "partial" | "single";
    selectedNodeIds?: string[];
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

  // Create a WorkflowRun record
  const run = await prisma.workflowRun.create({
    data: { workflowId, userId, status: "running", scope },
  });

  // Trigger the orchestrator (non-blocking)
  const handle = await tasks.trigger<typeof orchestratorTask>(
    "orchestrator-task",
    { nodes, edges, scope, selectedNodeIds },
  );

  // Poll via Trigger.dev REST API until complete
  let output: Record<string, unknown> | null = null;
  let attempts = 0;

  while (attempts < 60) {
    await new Promise((r) => setTimeout(r, 2000));
    const run = await runs.retrieve(handle.id);

    if (run.status === "COMPLETED") {
      output = run.output as Record<string, unknown>;
      break;
    }
    if (
      ["FAILED", "CRASHED", "CANCELED", "TIMED_OUT", "SYSTEM_FAILURE"].includes(
        run.status,
      )
    ) {
      break;
    }
    attempts++;
  }

  if (!output) {
    await prisma.workflowRun.update({
      where: { id: run.id },
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

  // Persist all node run records
  await prisma.nodeRun.createMany({
    data: nodeRunResults.map((nr) => ({
      workflowRunId: run.id,
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

  // Update overall run status and total duration
  const totalDuration = nodeRunResults.reduce(
    (acc, nr) => acc + nr.duration,
    0,
  );
  await prisma.workflowRun.update({
    where: { id: run.id },
    data: { status: overallStatus, duration: totalDuration },
  });

  return NextResponse.json({
    runId: run.id,
    workflowId,
    status: overallStatus,
    nodeOutputs,
    nodeRuns: nodeRunResults,
  });
}
