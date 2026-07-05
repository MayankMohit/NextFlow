"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import MiniCanvas, { type MiniNode, type MiniEdge } from "@/components/shared/MiniCanvas";

export type DashboardProject = {
  id: string;
  name: string;
  updatedAt: string;
  nodes: MiniNode[];
  edges: MiniEdge[];
};

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ProjectCard({
  project,
  onDeleted,
  onRenamed,
}: {
  project: DashboardProject;
  onDeleted: (id: string) => void;
  onRenamed: (id: string, name: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const rename = async () => {
    const name = draft.trim();
    if (!name || name === project.name) { setEditing(false); setDraft(project.name); return; }
    setBusy(true);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    setEditing(false);
    if (res.ok) onRenamed(project.id, name);
    else setDraft(project.name);
  };

  const remove = async () => {
    setBusy(true);
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    setBusy(false);
    setConfirming(false);
    if (res.ok) onDeleted(project.id);
  };

  return (
    <div className="group relative rounded-2xl border border-[#2a2a2a] bg-[#141414] overflow-hidden hover:border-[#3a3a3a] transition-colors">
      <button
        onClick={() => router.push(`/workflow/${project.id}`)}
        className="block w-full text-left cursor-pointer"
      >
        <div className="h-24 overflow-hidden pointer-events-none">
          <MiniCanvas nodes={project.nodes} edges={project.edges} isDark height={96} />
        </div>
        <div className="px-3.5 py-3 border-t border-[#222]">
          {editing ? (
            <span className="block h-5" />
          ) : (
            <p className="text-white text-sm font-medium truncate">{project.name}</p>
          )}
          <p className="text-[#666] text-[11px] mt-0.5">{timeAgo(project.updatedAt)}</p>
        </div>
      </button>

      {/* Rename input overlays the title row */}
      {editing && (
        <div className="absolute left-3.5 right-3.5 bottom-[26px] flex items-center gap-1.5">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") rename();
              if (e.key === "Escape") { setEditing(false); setDraft(project.name); }
            }}
            className="flex-1 min-w-0 text-sm text-white bg-[#0e0e0e] border border-[#3a3a3a] rounded px-1.5 py-0.5 outline-none focus:border-violet-500"
          />
          <button onClick={rename} disabled={busy} className="text-green-400 hover:text-green-300">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
          <button onClick={() => { setEditing(false); setDraft(project.name); }} className="text-[#666] hover:text-white">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Hover actions */}
      {!editing && !confirming && (
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            title="Rename"
            className="p-1.5 rounded-lg bg-black/60 backdrop-blur text-[#aaa] hover:text-white transition-colors"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={() => setConfirming(true)}
            title="Delete"
            className="p-1.5 rounded-lg bg-black/60 backdrop-blur text-[#aaa] hover:text-red-400 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}

      {confirming && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/80 backdrop-blur-sm px-4">
          <p className="text-white text-xs text-center">
            Delete &ldquo;{project.name}&rdquo; and all its assets?
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={remove}
              disabled={busy}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors"
            >
              {busy && <Loader2 size={11} className="animate-spin" />}
              Delete
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-3 py-1 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectsGrid({ initialProjects }: { initialProjects: DashboardProject[] }) {
  const [projects, setProjects] = useState(initialProjects);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white text-lg font-semibold">Your workflows</h2>
        <Link
          href="/workflow/new"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1c1c1c] border border-[#2a2a2a] text-white hover:bg-[#252525] transition-colors"
        >
          <Plus size={12} />
          New workflow
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#2a2a2a] py-14 flex flex-col items-center gap-3">
          <p className="text-[#666] text-sm">No workflows yet</p>
          <Link
            href="/workflow/new?template=sample"
            className="px-4 py-2 rounded-lg bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-xs font-medium transition-colors"
          >
            Start with the sample
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onDeleted={(id) => setProjects((prev) => prev.filter((x) => x.id !== id))}
              onRenamed={(id, name) => setProjects((prev) => prev.map((x) => (x.id === id ? { ...x, name } : x)))}
            />
          ))}
        </div>
      )}
    </section>
  );
}
