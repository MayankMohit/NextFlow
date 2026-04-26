"use client";

import { useState, useRef, useEffect } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import {
  ChevronDown,
  Sun,
  Moon,
  Play,
  Loader2,
  Upload,
  Download,
  FolderOpen,
  Save,
  ExternalLink,
  Layers,
} from "lucide-react";
import { useRouter } from "next/navigation";

function LogoDropdown() {
  const [open, setOpen] = useState(false)
  const [showProjects, setShowProjects] = useState(false)
  const { exportWorkflow, importWorkflow, loadSampleWorkflow, projects, fetchProjects, saveWorkflow, isSaving } = useWorkflowStore()
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const projectsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) fetchProjects()
  }, [open, fetchProjects])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setShowProjects(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { if (ev.target?.result) importWorkflow(ev.target.result as string) }
    reader.readAsText(file)
    setOpen(false)
  }

  const handleProjectsEnter = () => {
    if (projectsTimerRef.current) clearTimeout(projectsTimerRef.current)
    setShowProjects(true)
  }

  const handleProjectsLeave = () => {
    projectsTimerRef.current = setTimeout(() => setShowProjects(false), 150)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1c1c1c] border border-[#2a2a2a] hover:border-[#444] transition-colors"
      >
        <div className="w-4 h-4 rounded bg-violet-600 shrink-0" />
        <span className="text-white text-xs font-semibold">NextFlow</span>
        <ChevronDown size={12} className={`text-[#666] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg shadow-xl z-50 py-1 overflow-visible">
          <button
            onClick={() => { saveWorkflow(); setOpen(false) }}
            disabled={isSaving}
            className="w-full flex items-center gap-2 px-3 py-2 text-white text-xs hover:bg-[#2a2a2a] transition-colors"
          >
            <Save size={13} className="text-[#666]" />
            {isSaving ? 'Saving...' : 'Save workflow'}
          </button>
          <button
            onClick={() => { exportWorkflow(); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-white text-xs hover:bg-[#2a2a2a] transition-colors"
          >
            <Download size={13} className="text-[#666]" />
            Export as JSON
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="w-full flex items-center gap-2 px-3 py-2 text-white text-xs hover:bg-[#2a2a2a] transition-colors"
          >
            <Upload size={13} className="text-[#666]" />
            Import JSON
          </button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <button
            onClick={() => { loadSampleWorkflow(); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-violet-400 text-xs hover:bg-[#2a2a2a] transition-colors"
          >
            <Layers size={13} />
            Load Sample Workflow
          </button>

          <div className="h-px bg-[#2a2a2a] my-1" />

          {/* Projects submenu */}
          <div
            className="relative"
            onMouseEnter={handleProjectsEnter}
            onMouseLeave={handleProjectsLeave}
          >
            <button className="w-full flex items-center gap-2 px-3 py-2 text-white text-xs hover:bg-[#2a2a2a] transition-colors">
              <FolderOpen size={13} className="text-[#666]" />
              <span className="flex-1 text-left">Projects</span>
              <ChevronDown size={11} className="text-[#555] -rotate-90" />
            </button>

            {showProjects && (
              <div
                className="absolute left-full top-0 w-56 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg shadow-xl py-1 max-h-64 overflow-y-auto z-60"
                style={{ marginLeft: '4px' }}
                onMouseEnter={handleProjectsEnter}
                onMouseLeave={handleProjectsLeave}
              >
                <button
                  onClick={() => { router.push('/workflow/new'); setOpen(false); setShowProjects(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-violet-400 text-xs hover:bg-[#2a2a2a] transition-colors"
                >
                  + New workflow
                </button>
                <div className="h-px bg-[#2a2a2a] my-1" />
                {projects.length === 0 ? (
                  <div className="px-3 py-2 text-[#555] text-xs">No projects yet</div>
                ) : (
                  projects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { router.push(`/workflow/${p.id}`); setOpen(false); setShowProjects(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-white text-xs hover:bg-[#2a2a2a] transition-colors"
                    >
                      <ExternalLink size={11} className="text-[#555] shrink-0" />
                      <span className="truncate flex-1 text-left">{p.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectName() {
  const { workflowName, setWorkflowName } = useWorkflowStore();
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => {
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 10);
  };
  const commit = () => setEditing(false);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={workflowName}
        onChange={(e) => setWorkflowName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className="bg-transparent text-white text-xs border-b border-violet-500 outline-none px-1 min-w-16 max-w-40"
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={start}
      className="text-[#888] text-xs hover:text-white transition-colors max-w-40 truncate"
      title="Click to rename"
    >
      {workflowName}
    </button>
  );
}

function RunButton() {
  const { isRunning, runWorkflow, saveWorkflow } = useWorkflowStore();

  const handleRun = async () => {
    await saveWorkflow();
    await runWorkflow("full");
  };

  return (
    <button
      onClick={handleRun}
      disabled={isRunning}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
        ${
          isRunning
            ? "bg-violet-800 text-violet-300 cursor-wait"
            : "bg-violet-600 hover:bg-violet-500 text-white"
        }`}
    >
      {isRunning ? (
        <>
          <Loader2 size={12} className="animate-spin" />
          Running...
        </>
      ) : (
        <>
          <Play size={12} />
          Run
        </>
      )}
    </button>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useWorkflowStore();
  return (
    <button
      onClick={toggleTheme}
      className="p-1.5 rounded-lg bg-[#1c1c1c] border border-[#2a2a2a] hover:border-[#444] transition-colors text-[#888] hover:text-white"
      title={theme === "dark" ? "Switch to light" : "Switch to dark"}
    >
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}

function PanelToggles() {
  const { rightPanel, setRightPanel } = useWorkflowStore();
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setRightPanel("assets")}
        className={`px-2.5 py-1.5 rounded-lg text-xs transition-all border
          ${
            rightPanel === "assets"
              ? "bg-[#2a2a2a] text-white border-[#444]"
              : "bg-[#1c1c1c] text-[#888] border-[#2a2a2a] hover:text-white hover:border-[#444]"
          }`}
      >
        Assets
      </button>
      <button
        onClick={() => setRightPanel("history")}
        className={`px-2.5 py-1.5 rounded-lg text-xs transition-all border
          ${
            rightPanel === "history"
              ? "bg-[#2a2a2a] text-white border-[#444]"
              : "bg-[#1c1c1c] text-[#888] border-[#2a2a2a] hover:text-white hover:border-[#444]"
          }`}
      >
        History
      </button>
    </div>
  );
}

export default function TopBar() {
  return (
    <div className="absolute top-3 left-3 z-50 w-[calc(100%-24px)] flex items-center justify-between">
      <div className="flex items-center gap-2">
        <LogoDropdown />
        <ProjectName />
        <RunButton />
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <PanelToggles />
      </div>
    </div>
  );
}
