"use client";

import { useState, useRef, useEffect } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import {
  ChevronDown,
  Sun,
  Moon,
  Upload,
  Download,
  FolderOpen,
  Save,
  ExternalLink,
  Layers,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";

function LogoDropdown() {
  const [open, setOpen] = useState(false)
  const [showProjects, setShowProjects] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const { exportWorkflow, importWorkflow, loadSampleWorkflow, projects, fetchProjects, deleteProject, saveWorkflow, isSaving, theme } = useWorkflowStore()
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const projectsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDark = theme === 'dark'
  const btn = isDark ? 'bg-[#1c1c1c] hover:bg-[#3a3a3a] text-white' : 'bg-white hover:bg-[#f0f0f0] text-[#111]'
  const panel = isDark ? 'bg-[#1c1c1c]' : 'bg-white border-[#e0e0e0]'
  const item = isDark ? 'text-white hover:bg-[#141414]' : 'text-[#111] hover:bg-[#f0f0f0]'
  const muted = isDark ? 'text-[#666]' : 'text-[#aaa]'
  const divider = isDark ? 'bg-[#2a2a2a]' : 'bg-[#e0e0e0]'
  const chevron = isDark ? 'text-[#000000]' : 'text-[#ffffff]'

  useEffect(() => { fetchProjects() }, [fetchProjects])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setShowProjects(false); setConfirmDeleteId(null)
      }
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [open])

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { if (ev.target?.result) importWorkflow(ev.target.result as string) }
    reader.readAsText(file)
    setOpen(false)
  }

  const handleProjectsEnter = () => { if (projectsTimerRef.current) clearTimeout(projectsTimerRef.current); setShowProjects(true) }
  const handleProjectsLeave = () => { projectsTimerRef.current = setTimeout(() => setShowProjects(false), 150) }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)} className={`flex items-center gap-1.5 px-1.5 py-1 rounded-md transition-colors ${btn}`}>
        <span className="text-lg font-black">NF</span>
        <ChevronDown size={12} className={`${muted} transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={`absolute top-full -left-3 mt-4 w-65  rounded-xl shadow-xl z-50 py-3 px-2 text-sm overflow-visible ${panel}`}>
          <button onClick={() => { saveWorkflow(); setOpen(false) }} disabled={isSaving}
            className={`w-full flex items-center gap-3 px-3 py-2 transition-colors rounded-lg ${item}`}>
            <Save size={15} />{isSaving ? 'Saving...' : 'Save workflow'}
          </button>
          <button onClick={() => { exportWorkflow(); setOpen(false) }}
            className={`w-full flex items-center gap-3 px-3 py-2 transition-colors rounded-lg ${item}`}>
            <Download size={15}  />Export as JSON
          </button>
          <button onClick={() => importRef.current?.click()}
            className={`w-full flex items-center gap-3 px-3 py-2 transition-colors rounded-lg ${item}`}>
            <Upload size={15} />Import JSON
          </button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <button onClick={() => { loadSampleWorkflow(); setOpen(false) }}
            className={`w-full flex items-center gap-3 px-3 py-2 transition-colors rounded-lg ${item}`}>
            <Layers size={15} />Load Sample Workflow
          </button>

          <div className={`h-px my-1 ${divider}`} />

          <div className="relative" onMouseEnter={handleProjectsEnter} onMouseLeave={handleProjectsLeave}>
            <button className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors rounded-lg ${item}`}>
              <FolderOpen size={15} />
              <span className="flex-1 text-left">Projects</span>
              <ChevronDown size={11} className={`${chevron} -rotate-90`} />
            </button>
            {showProjects && (
              <div className={`absolute left-[calc(100%+8px)] top-0  w-65 rounded-xl shadow-xl py-2 px-2 max-h-64 overflow-y-auto z-60 ${panel}`}
                style={{ marginLeft: '4px' }} onMouseEnter={handleProjectsEnter} onMouseLeave={handleProjectsLeave}>
                <button onClick={() => { router.push('/workflow/new'); setOpen(false); setShowProjects(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-lg ${item}`}>
                  + New workflow
                </button>
                <div className={`h-px my-1 ${divider}`} />
                {projects.length === 0 ? (
                  <div className={`px-3 py-2 text-xs ${muted}`}>No projects yet</div>
                ) : projects.map(p => (
                  <div key={p.id} className="group relative">
                    {confirmDeleteId === p.id ? (
                      <div className={`flex items-center gap-1 px-3 py-2 rounded-lg ${item}`}>
                        <span className={`text-xs flex-1 ${isDark ? 'text-[#aaa]' : 'text-[#555]'}`}>Delete &ldquo;{p.name}&rdquo;?</span>
                        <button onClick={() => { deleteProject(p.id); setConfirmDeleteId(null) }}
                          className="text-xs text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-900/30 transition-colors">Yes</button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${isDark ? 'text-[#666] hover:text-white hover:bg-[#333]' : 'text-[#aaa] hover:text-[#111] hover:bg-[#e0e0e0]'}`}>No</button>
                      </div>
                    ) : (
                      <div className={`flex items-center transition-colors rounded-lg ${item}`}>
                        <button onClick={() => { router.push(`/workflow/${p.id}`); setOpen(false); setShowProjects(false) }}
                          className={`flex items-center gap-2 px-3 py-2 text-xs flex-1 min-w-0 ${isDark ? 'text-white' : 'text-[#111]'}`}>
                          <ExternalLink size={11} className={`${muted} shrink-0`} />
                          <span className="truncate text-left">{p.name}</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(p.id) }}
                          className="opacity-0 group-hover:opacity-100 px-2 py-2 text-[#555] hover:text-red-400 transition-all shrink-0">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectName() {
  const { workflowName, setWorkflowName, theme } = useWorkflowStore();
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isDark = theme === 'dark';

  const start = () => { setEditing(true); setTimeout(() => inputRef.current?.select(), 10) }
  
  const commit = () => {
    if (workflowName.trim() === '') setWorkflowName('Untitled');
    setEditing(false);
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.length > 40) return;
    const words = value.trim().split(/\s+/);
    if (words.filter(Boolean).length > 4) return;
    setWorkflowName(value);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={workflowName}
        onChange={handleChange}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
        className={`bg-transparent text-sm outline-none border-b px-1 min-w-16 max-w-80 border-gray-600
          ${isDark ? 'text-white' : 'text-[#111]'}`}
        autoFocus
      />
    )
  }

  return (
    <button
      onClick={start}
      className={`text-sm max-w-60 truncate transition-colors
        ${workflowName === 'Untitled'
          ? isDark ? 'text-[#666] hover:text-white' : 'text-[#aaa] hover:text-[#111]'
          : isDark ? 'text-white hover:text-[#ccc]' : 'text-[#111] hover:text-[#444]'
        }`}
      title="Click to rename"
    >
      {workflowName}
    </button>
  )
}

function ThemeToggle() {
  const { theme, toggleTheme } = useWorkflowStore();
  const isDark = theme === 'dark'
  return (
    <button onClick={toggleTheme}
      className={`p-2 rounded-xl border transition-colors ${isDark ? 'bg-[#1c1c1c] border-[#2a2a2a]  text-white hover:text-white' : 'bg-white border-[#e0e0e0] text-black hover:text-[#111]'}`}
      title={isDark ? 'Switch to light' : 'Switch to dark'}>
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}

function PanelToggles() {
  const { rightPanel, setRightPanel, theme } = useWorkflowStore();
  const isDark = theme === 'dark'
  const active = isDark ? 'bg-[#2a2a2a] text-white border-[#444]' : 'bg-[#e8e8e8] text-[#111] border-[#ccc]'
  const inactive = isDark ? 'bg-[#1c1c1c] text-white border-[#2a2a2a]' : 'bg-white text-black border-[#e0e0e0]'
  return (
    <div className="flex items-center gap-2">
      {(['assets', 'history'] as const).map(panel => (
        <button key={panel} onClick={() => setRightPanel(panel)}
          className={`px-2.5 py-1.5 rounded-lg text-sm transition-all border capitalize ${rightPanel === panel ? active : inactive}`}>
          {panel}
        </button>
      ))}
    </div>
  )
}

export default function TopBar() {
  const theme = useWorkflowStore(state => state.theme)
  const isDark = theme === 'dark'
  return (
    <div className="absolute top-4 left-4 z-50 w-[calc(100%-24px)] flex items-center justify-between">
      <div className={`flex items-center gap-2 border  rounded-xl px-2 py-2 ${isDark ? 'bg-[#1c1c1c] border-[#2a2a2a]' : 'bg-white border-[#e0e0e0]'} min-w-0 max-w-120`}>
        <LogoDropdown />
        <ProjectName />
      </div>
      <div className=" -mt-6 flex items-center gap-2 mr-3">
        <ThemeToggle />
        <PanelToggles />
      </div>
    </div>
  )
}