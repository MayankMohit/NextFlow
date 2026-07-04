# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

# Project
Visual workflow automation platform (Krea.ai workflow builder clone). Single main route `/workflow/:id` — three-column layout: LeftSidebar | ReactFlow Canvas | RightSidebar. Clerk protects `/workflow(.*)` via `src/proxy.ts` (Next.js 16 uses `proxy.ts`, not `middleware.ts`).

**Stack:** Next.js 16 (App Router), React 19 (with React Compiler), @xyflow/react, Tailwind v4, Zustand 5, Clerk auth, PostgreSQL (Neon adapter) + Prisma 7, Trigger.dev v4, Gemini, Transloadit.

**Node types:** TextNode, UploadImageNode, UploadVideoNode (passthrough — their data is used directly, never executed as tasks), LLMNode, CropImageNode, ExtractFrameNode (executed via Trigger.dev).

# Commands
- `npm run dev` — dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npx prisma generate` — regenerate Prisma client (also runs on postinstall)
- `npx prisma migrate dev` — apply schema changes
- `npx trigger.dev@latest dev` — run Trigger.dev tasks locally (needed for node execution to work in dev)

No test framework is configured.

# Architecture

## Execution flow (spans several files — read together)
1. `src/store/workflowStore.ts` — `runWorkflow()` topologically sorts the graph client-side (`src/lib/dagExecutor.ts`), then calls `POST /api/workflow/[id]/run` **once per layer** via `runLayer()`. The first call creates a `WorkflowRun` (and instant `NodeRun` records for passthrough nodes); subsequent calls pass `existingRunId` to append `NodeRun`s to the same run.
2. `src/app/api/workflow/[id]/run/route.ts` — auth check, Zod validation, persists run records, triggers `orchestratorTask` and waits for the result.
3. `src/trigger/orchestratorTask.ts` — re-sorts the target nodes into parallel layers, resolves each node's inputs from incoming edges (`resolveInputs` maps `edge.targetHandle` → upstream output), and `batchTriggerAndWait`s `nodeExecutorTask` per layer.
4. `src/trigger/nodeExecutorTask.ts` — dispatches to `llmTask` (Gemini), `cropImageTask` / `extractFrameTask` (Transloadit FFmpeg assemblies).
5. Outputs flow back to the client, which writes them into `node.data.lastOutput` so downstream layers and partial re-runs can read prior results.

Passthrough node outputs come from `node.data` (`text`, `imageUrl`, `videoUrl`); executable node outputs come from `node.data.lastOutput`. Cycles are blocked at connect time in the store.

## Data layer
- **Prisma client is generated into `src/generated/prisma`** — import `PrismaClient` from `@/generated/prisma`, never from `@prisma/client`. Use the `prisma` singleton from `src/lib/prisma.ts` (Neon adapter). Never edit `src/generated/`.
- Schema: `prisma/schema.prisma` — `Workflow` (nodes/edges stored as Json) → `WorkflowRun` (status: success|failed|partial|running, scope: full|partial|single) → `NodeRun`.

## State
`src/store/workflowStore.ts` is the single Zustand store: nodes/edges, undo/redo history, save/load, run orchestration, run history, theme, panel state. Node components read/write via `updateNodeData`.

## Key directories
- `src/components/nodes/` — one component per node type, registered in `WorkflowCanvas.tsx`
- `src/trigger/` — Trigger.dev tasks (dir configured in `trigger.config.ts`)
- `src/app/api/` — REST routes: `workflow/[id]` (CRUD), `workflow/[id]/run`, `runs/[workflowId]` (history), `projects`

## Env vars
`DATABASE_URL`, `GEMINI_API_KEY`, `NEXT_PUBLIC_TRANSLOADIT_KEY`, Clerk keys, Trigger.dev keys.

# Styling
Dark-first: `#0a0a0a` bg, `#1c1c1c` panels, `#2a2a2a` borders. Violet accent `#7c3aed`. Nodes pulse violet glow when running (`animate-pulse shadow-violet-500/30`).

# Trigger.dev (v4)
- **MUST use `@trigger.dev/sdk`** — never `client.defineJob`
- `triggerAndWait()` / `batchTriggerAndWait()` return a `Result` object (`ok`, `output`, `error`) — not the direct task output
- **Never** wrap `triggerAndWait`, `batchTriggerAndWait`, or `wait` calls in `Promise.all` / `Promise.allSettled`

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.claude/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-getting-started`.
<!-- TRIGGER.DEV SKILLS END -->
