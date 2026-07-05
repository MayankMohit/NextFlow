import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import DashboardTopNav from "@/components/dashboard/DashboardTopNav";
import HeroBanner from "@/components/dashboard/HeroBanner";
import FeatureTiles from "@/components/dashboard/FeatureTiles";
import ProjectsGrid, { type DashboardProject } from "@/components/dashboard/ProjectsGrid";
import AssetGallery, { type DashboardAsset } from "@/components/dashboard/AssetGallery";
import MarketingHero from "@/components/dashboard/MarketingHero";
import type { MiniNode, MiniEdge } from "@/components/shared/MiniCanvas";

// Workflow nodes/edges are stored as loose Json — pull out only what the
// mini-canvas thumbnails need so the client payload stays small.
function miniNodes(json: unknown): MiniNode[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((n): n is { id: string; position: { x: number; y: number } } =>
      typeof n === "object" && n !== null &&
      typeof (n as { id?: unknown }).id === "string" &&
      typeof (n as { position?: { x?: unknown } }).position?.x === "number")
    .map((n) => ({ id: n.id, position: { x: n.position.x, y: n.position.y } }));
}

function miniEdges(json: unknown): MiniEdge[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((e): e is { id?: string; source: string; target: string } =>
      typeof e === "object" && e !== null &&
      typeof (e as { source?: unknown }).source === "string" &&
      typeof (e as { target?: unknown }).target === "string")
    .map((e) => ({ id: e.id, source: e.source, target: e.target }));
}

export default async function Home() {
  const { userId } = await auth();

  if (!userId) return <MarketingHero />;

  const [workflows, assets] = await Promise.all([
    prisma.workflow.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 24,
      select: { id: true, name: true, updatedAt: true, nodes: true, edges: true },
    }),
    prisma.asset.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: { id: true, type: true, url: true, workflowId: true, createdAt: true },
    }),
  ]);

  const projects: DashboardProject[] = workflows.map((w) => ({
    id: w.id,
    name: w.name,
    updatedAt: w.updatedAt.toISOString(),
    nodes: miniNodes(w.nodes),
    edges: miniEdges(w.edges),
  }));

  const galleryAssets: DashboardAsset[] = assets.map((a) => ({
    id: a.id,
    type: a.type,
    url: a.url,
    workflowId: a.workflowId,
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <DashboardTopNav />
      <main className="max-w-6xl mx-auto px-6 py-8 flex flex-col gap-10 pb-20">
        <HeroBanner />
        <FeatureTiles />
        <ProjectsGrid initialProjects={projects} />
        <AssetGallery assets={galleryAssets} />
      </main>
    </div>
  );
}
