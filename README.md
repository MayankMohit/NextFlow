# NextFlow

A clone of [Krea.ai](https://krea.ai)'s workflow builder, focused exclusively on LLM and media processing workflows. Built with Next.js, React Flow, Google Gemini, Trigger.dev, and Transloadit.

---

## What It Does

NextFlow is a visual workflow builder where you can drag, connect, and run AI-powered nodes on a canvas. You can chain text prompts, uploaded images, and videos into Google Gemini models, crop images, extract frames from videos — and see results appear inline on each node. Every execution is logged to a database and viewable in the run history panel.

---

## Features Completed

### ✅ Core UI / Canvas
- **React Flow canvas** with dot grid background, smooth panning/zooming, and a MiniMap in the bottom-right corner
- **Collapsible left sidebar** with search and quick-access buttons for all 6 node types — resizable by dragging the edge
- **Right sidebar** with workflow run history panel, color-coded status badges (green/red/yellow), and expandable node-level execution details
- **Top bar** with workflow name, save/load, import/export JSON, project switcher, dark/light toggle, and user avatar with sign-out
- **Animated gradient edges** (purple) connecting nodes with type-safe connection enforcement

### ✅ All 6 Node Types

| Node | Description |
|---|---|
| **Text Node** | Textarea input with an output handle for text data |
| **Upload Image Node** | File upload via Transloadit (jpg/jpeg/png/webp/gif), image preview after upload, output handle for image URL |
| **Upload Video Node** | File upload via Transloadit (mp4/mov/webm/m4v), video player preview after upload, output handle for video URL |
| **LLM Node** | Model selector dropdown (Gemini Flash/Pro), accepts system prompt, user message, and multiple image inputs via connected handles, result displayed inline on the node |
| **Crop Image Node** | Accepts image input, configurable x/y/width/height percent parameters (0–100), executes via FFmpeg on Trigger.dev, outputs cropped image URL |
| **Extract Frame Node** | Accepts video URL and timestamp (seconds or percentage), extracts a single frame as an image via FFmpeg on Trigger.dev, outputs image URL |

### ✅ Workflow Execution
- **Full workflow run** — runs all nodes in the correct dependency order
- **Single node run** — run any individual node from its own play button
- **Selected nodes run** — multi-select nodes and run only those
- **Parallel execution** — independent branches in the DAG run concurrently using Trigger.dev's parallel task triggering; nodes only wait for their direct upstream dependencies
- **DAG validation** — circular connections are blocked at the connection level; workflows must be acyclic
- **Pulsating glow effect** on nodes currently being executed to indicate active processing

### ✅ Node Connections & Type Safety
- **Type-safe connections** enforced at the canvas level — image outputs cannot connect to text/video handles, video outputs cannot connect to image/text handles, and so on
- **Single-occupancy handles** — most input handles reject a second connection (except the `images` handle on LLM nodes which accepts multiple image sources)
- **Connected input state** — when a handle has an incoming connection, the corresponding manual input field in the node UI is greyed out/disabled
- **Smart connect-on-drop modal** — dropping a connection onto empty canvas suggests compatible node types to create

### ✅ Trigger.dev Integration
Every executable node runs as a Trigger.dev cloud task — no direct API calls from the Next.js server:

| Node | Trigger.dev Task |
|---|---|
| LLM Node | `llm-task` — calls Google Gemini API with vision support |
| Crop Image Node | `crop-image-task` — FFmpeg crop operation |
| Extract Frame Node | `extract-frame-task` — FFmpeg frame extraction |
| Orchestrator | `orchestrator-task` — manages DAG execution order and parallel layers |
| Node Executor | `node-executor-task` — dispatches individual node tasks |

### ✅ Authentication (Clerk)
- Sign in / Sign up via Clerk-hosted UI with embedded components
- All workflow routes protected — unauthenticated users are redirected
- Workflows and run history scoped to the authenticated user's ID

### ✅ Database Persistence (Neon PostgreSQL + Prisma)
- Workflows save to PostgreSQL automatically on run, and manually via the Save button
- Full workflow run history persists to the database with timestamps, status, scope, and duration
- Node-level execution records stored per run — inputs, outputs, errors, and duration per node
- Projects list (all user workflows) fetched from the database and browsable from the top bar

### ✅ Workflow History Panel
- Right sidebar lists all workflow runs with timestamp, status badge, duration, and scope (Full/Partial/Single)
- Click any run to expand node-level execution details
- Shows which nodes ran successfully even when the overall workflow failed (partial runs)
- Color-coded: green = success, red = failed, yellow = running

### ✅ Workflow Features
- **Undo / Redo** for node and edge operations
- **Drag & drop nodes** from the left sidebar onto the canvas
- **Workflow save/load** to PostgreSQL
- **Export as JSON** — downloads the current workflow as a `.json` file
- **Import from JSON** — load any previously exported workflow file
- **Project switcher** — browse, open, and delete all saved workflows from the top bar dropdown
- **Load sample workflow** — one-click load of the pre-built Product Marketing Kit Generator

### ✅ Pre-Built Sample Workflow: Product Marketing Kit Generator
Demonstrates all 6 node types with parallel execution and a convergence point:

- **Branch A** — Upload Image → Crop Image → LLM Node #1 (generates product description using the cropped image + text prompts)
- **Branch B** — Upload Video → Extract Frame Node (extracts a frame from the middle of the video)
- **Convergence** — LLM Node #2 waits for both branches, then generates a marketing tweet using the product description, cropped image, and extracted video frame

Both branches run in parallel. The convergence node only fires after both are complete.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| Next.js 16 (App Router) | React framework |
| TypeScript | Type safety throughout |
| Tailwind CSS v4 | Styling |
| React Flow (`@xyflow/react`) | Visual workflow canvas |
| Zustand | Client-side state management |
| Zod | API schema validation |
| Clerk | Authentication |
| Prisma v7 | ORM for database access |
| Neon | Serverless PostgreSQL |
| Trigger.dev v4 | Background task execution |
| Google Generative AI SDK | Gemini API (LLM + vision) |
| Transloadit + Uppy | File uploads and media processing |
| FFmpeg (via Trigger.dev) | Image cropping and video frame extraction |
| Lucide React | Icons |

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/sign-in, sign-up     # Clerk auth pages
│   ├── api/
│   │   ├── projects/               # CRUD for saved workflows
│   │   ├── runs/[workflowId]/      # Fetch run history
│   │   └── workflow/[id]/
│   │       ├── route.ts            # Save/load workflow
│   │       └── run/route.ts        # Trigger workflow execution
│   └── workflow/                   # Main canvas page
├── components/
│   ├── canvas/WorkflowCanvas.tsx   # React Flow canvas
│   ├── edges/GradientEdge.tsx      # Animated purple edges
│   ├── nodes/                      # All 6 node components
│   ├── sidebar/                    # Left and right sidebars
│   └── toolbar/                    # TopBar and BottomBar
├── hooks/
│   ├── useNodeStatus.ts            # Running/idle/ready state per node
│   └── usenodehover.ts             # Hover state for node controls
├── lib/
│   ├── dagExecutor.ts              # Topological sort + input resolution
│   ├── prisma.ts                   # Prisma client (Neon adapter)
│   └── sampleWorkflow.ts           # Pre-built demo workflow
├── store/workflowStore.ts          # Zustand global state
├── trigger/
│   ├── orchestratorTask.ts         # DAG orchestration task
│   ├── nodeExecutorTask.ts         # Per-node dispatch task
│   ├── llmTask.ts                  # Gemini API task
│   ├── cropImageTask.ts            # FFmpeg crop task
│   └── extractFrameTask.ts         # FFmpeg frame extraction task
└── types/index.ts                  # Shared TypeScript types
```

---

## Getting Started Locally

### Prerequisites
- Node.js 20+
- A Neon database (free tier works)
- Clerk account
- Trigger.dev account
- Transloadit account
- Google AI Studio API key

### 1. Clone and install

```bash
git clone https://github.com/MayankMohit/NextFlow
cd NextFlow
npm install
```

### 2. Set up environment variables

Create a `.env.local` file:

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/workflow
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/workflow

# Database (Neon)
DATABASE_URL="postgresql://..."

# Trigger.dev
TRIGGER_SECRET_KEY=tr_dev_...

# Transloadit
NEXT_PUBLIC_TRANSLOADIT_KEY=...
TRANSLOADIT_SECRET=...

# Google Gemini
GEMINI_API_KEY=...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Push database schema

```bash
npx prisma generate
npx prisma migrate deploy
```

### 4. Deploy Trigger.dev tasks

```bash
npx trigger.dev@latest deploy
```

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deliverables Checklist

| Requirement | Status |
|---|---|
| Pixel-perfect Krea clone UI (exact spacing/colors) | ✅ |
| Clerk authentication with protected routes | ✅ |
| Left sidebar with 6 node buttons | ✅ |
| Right sidebar with workflow history panel | ✅ |
| Node-level execution history when clicking a run | ✅ |
| React Flow canvas with dot grid background | ✅ |
| Functional Text Node with textarea and output handle | ✅ |
| Functional Upload Image Node with Transloadit and image preview | ✅ |
| Functional Upload Video Node with Transloadit and video player | ✅ |
| Functional LLM Node with model selector, prompts, and run capability | ✅ |
| Functional Crop Image Node (FFmpeg via Trigger.dev) | ✅ |
| Functional Extract Frame from Video Node (FFmpeg via Trigger.dev) | ✅ |
| All node executions via Trigger.dev tasks | ✅ |
| Pulsating glow effect on nodes during execution | ✅ |
| Pre-built sample workflow (demonstrates all features) | ✅ |
| Node connections with animated purple edges | ✅ |
| API routes with Zod validation | ✅ |
| Google Gemini integration with vision support | ✅ |
| TypeScript throughout | ✅ |
| PostgreSQL database with Prisma ORM | ✅ |
| Workflow save/load to database | ✅ |
| Workflow history persistence to database | ✅ |
| Workflow export/import as JSON | ✅ |
| Deployed on Vercel with environment variables | ✅ |

---