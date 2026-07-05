"use client";

import { useState, useEffect } from "react";
import { useWorkflowStore, type WorkflowRun, type Asset } from "@/store/workflowStore";
import { CheckCircle, XCircle, Clock, ImageIcon, VideoIcon, ImageOff, Check, Copy, Download, Loader2, X, Trash2 } from "lucide-react";

function useTheme() {
  const { theme } = useWorkflowStore()
  const isDark = theme === 'dark'
  return {
    isDark,
    panel:    isDark ? 'bg-[#141414] border-[#2a2a2a]'  : 'bg-white border-[#e0e0e0]',
    surface:  isDark ? 'bg-[#1a1a1a] border-[#2a2a2a]'  : 'bg-[#f8f8f8] border-[#e0e0e0]',
    hover:    isDark ? 'hover:bg-[#222]'                 : 'hover:bg-[#f0f0f0]',
    divider:  isDark ? 'border-[#2a2a2a]'                : 'border-[#e8e8e8]',
    textMain: isDark ? 'text-white'                      : 'text-[#111]',
    textMid:  isDark ? 'text-[#888]'                     : 'text-[#777]',
    textMuted:isDark ? 'text-[#666]'                     : 'text-[#999]',
    textDim:  isDark ? 'text-[#555]'                     : 'text-[#bbb]',
    btnGhost: isDark ? 'bg-[#2a2a2a] hover:bg-[#333] text-white' : 'bg-[#f0f0f0] hover:bg-[#e4e4e4] text-[#111]',
  }
}

const NODE_LABELS: Record<string, string> = {
  textNode: 'Text Node',
  uploadImageNode: 'Upload Image',
  uploadVideoNode: 'Upload Video',
  llmNode: 'LLM Node',
  cropImageNode: 'Crop Image',
  extractFrameNode: 'Extract Frame',
  textCombineNode: 'Text Combine',
  resizeImageNode: 'Resize Image',
}

const IMAGE_URL_RE = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i
const VIDEO_URL_RE = /\.(mp4|webm|mov)(\?|$)/i

const SCOPE_LABEL: Record<string, string> = {
  full: 'Full Workflow',
  partial: 'Partial Run',
  single: 'Single Node',
}

function prettifyNodeType(type: string): string {
  return NODE_LABELS[type] ?? type.replace(/Node$/, '').replace(/([A-Z])/g, ' $1').trim()
}

function getOutputDisplay(outputs: Record<string, unknown> | undefined): string | null {
  if (!outputs) return null
  for (const val of Object.values(outputs)) {
    if (typeof val === 'string' && val.length > 0) return val
  }
  return null
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return (
    <span className="flex items-center gap-1 text-green-400 text-[10px] font-medium">
      <CheckCircle size={9} />success
    </span>
  )
  if (status === "failed") return (
    <span className="flex items-center gap-1 text-red-400 text-[10px] font-medium">
      <XCircle size={9} />failed
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-yellow-400 text-[10px] font-medium">
      <Clock size={9} />{status}
    </span>
  )
}

// One entry in the run detail tree: node title row with inline actions
// (download / copy, right-aligned) and the output/error line below. If the
// media file no longer exists (asset was deleted, so the blob is gone) the
// load error swaps in an "Asset deleted" placeholder and hides the actions.
function NodeRunEntry({ nr, isLast }: { nr: WorkflowRun['nodeRuns'][number]; isLast: boolean }) {
  const t = useTheme()
  const assets = useWorkflowStore(s => s.assets)
  const assetsLoaded = useWorkflowStore(s => s.assetsLoaded)
  const [loadFailed, setLoadFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const branchChar = isLast ? '└─' : '├─'
  const childIndent = isLast ? '   ' : '│  '
  const outputVal = getOutputDisplay(nr.outputs as Record<string, unknown> | undefined)
  const isUrl = outputVal != null && outputVal.startsWith('http')
  const isImage = isUrl && IMAGE_URL_RE.test(outputVal)
  const isVideo = isUrl && VIDEO_URL_RE.test(outputVal)
  const isMedia = isImage || isVideo
  const hasDetail = outputVal != null || !!nr.error

  // A run output we manage (outputs/uploads on our Blob store) always has an
  // Asset row — if the row is gone the user deleted it. The CDN/browser may
  // still serve the cached file for a while, so don't rely on a 404 alone.
  const isManagedBlob = isUrl && /\.blob\.vercel-storage\.com\/(outputs|uploads)\//.test(outputVal)
  const gone = loadFailed ||
    (isMedia && isManagedBlob && assetsLoaded && !assets.some(a => a.url === outputVal))

  const copy = () => {
    if (!outputVal) return
    navigator.clipboard.writeText(outputVal).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const download = async () => {
    if (!outputVal || downloading) return
    setDownloading(true)
    try {
      // The `download` attribute is ignored on cross-origin URLs (Blob store),
      // so fetch the file and download it via a local object URL instead.
      const res = await fetch(outputVal)
      if (!res.ok) throw new Error(`Download failed: ${res.status}`)
      const blob = await res.blob()
      const ext = new URL(outputVal).pathname.split('.').pop() || (isVideo ? 'mp4' : 'jpg')
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `run-output.${ext}`
      a.click()
      URL.revokeObjectURL(objectUrl)
    } catch {
      window.open(outputVal, '_blank')
    } finally { setDownloading(false) }
  }

  const actionBtn = `p-1 rounded transition-colors disabled:opacity-60 ${t.btnGhost}`

  return (
    <div>
      {/* Node row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-xs leading-none ${t.textDim}`}>{branchChar}</span>
        <span className={`text-xs font-medium ${t.textMain}`}>{prettifyNodeType(nr.nodeType)}</span>
        <span className={`text-[10px] ${t.textDim}`}>({nr.nodeId.slice(-8)})</span>
        {nr.status === 'success'
          ? <CheckCircle size={10} className="text-green-400" />
          : nr.status === 'failed'
          ? <XCircle size={10} className="text-red-400" />
          : <Clock size={10} className="text-yellow-400" />
        }
        {nr.duration != null && (
          <span className={`text-[10px] ml-0.5 ${t.textMuted}`}>
            {nr.duration === 0 ? 'instant' : `${nr.duration.toFixed(1)}s`}
          </span>
        )}
        {outputVal && !nr.error && !(isMedia && gone) && (
          <span className="ml-auto flex items-center gap-1 font-sans">
            {isMedia && (
              <button onClick={download} disabled={downloading} title="Download" className={actionBtn}>
                {downloading ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
              </button>
            )}
            <button onClick={copy} title={isMedia ? 'Copy link' : 'Copy text'} className={actionBtn}>
              {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            </button>
          </span>
        )}
      </div>

      {/* Output / error line */}
      {hasDetail && (
        <div className="flex items-start gap-1 mt-1">
          <span className={`text-xs shrink-0 ${t.textDim}`}>{childIndent}└─</span>
          {nr.error ? (
            <span className="text-red-400 text-xs break-all">Error: {nr.error}</span>
          ) : isMedia && gone ? (
            <div className={`w-full h-24 rounded-lg border border-dashed flex flex-col items-center justify-center gap-1.5 ${t.divider} ${t.textMuted}`}>
              <ImageOff size={16} className={t.textDim} />
              <span className="text-[10px] font-sans">Asset deleted</span>
            </div>
          ) : isVideo ? (
            <video
              src={outputVal!}
              controls
              onError={() => setLoadFailed(true)}
              className={`w-full max-h-44 rounded-lg border ${t.divider}`}
            />
          ) : isImage ? (
            <img
              src={outputVal!}
              alt="run output"
              onError={() => setLoadFailed(true)}
              className={`w-full max-h-44 object-contain rounded-lg border ${t.divider} ${t.isDark ? 'bg-[#0e0e0e]' : 'bg-[#fafafa]'}`}
            />
          ) : outputVal ? (
            <span className={`text-xs break-all leading-relaxed ${t.textMid}`}>
              {isUrl ? outputVal : `"${outputVal}"`}
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}

// Full-screen modal with node-level execution details
function RunDetailModal({ run, runNumber, onClose }: {
  run: WorkflowRun
  runNumber: number
  onClose: () => void
}) {
  const t = useTheme()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const date = new Date(run.createdAt)
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const scopeLabel = SCOPE_LABEL[run.scope] ?? run.scope

  // Output nodes just mirror their upstream node's result — noise in history
  const nodeRuns = run.nodeRuns.filter(nr => nr.nodeType !== 'outputNode')

  return (
    <div
      className="fixed inset-0 z-200 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.78)' }}
      onClick={onClose}
    >
      <div
        className={`border rounded-xl w-full max-w-lg flex flex-col shadow-2xl ${t.isDark ? 'bg-[#141414] border-[#2a2a2a]' : 'bg-white border-[#e0e0e0]'}`}
        style={{ maxHeight: 'min(78vh, 600px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-start justify-between gap-3 px-5 py-4 border-b shrink-0 ${t.divider}`}>
          <div className="min-w-0">
            <div className={`text-sm font-semibold ${t.textMain}`}>Run #{runNumber}</div>
            <div className={`text-xs mt-0.5 ${t.textMid}`}>
              {dateStr} &middot; {timeStr} &middot; {scopeLabel}
              {run.duration != null ? ` · ${run.duration.toFixed(1)}s` : ''}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <StatusBadge status={run.status} />
            <button
              onClick={onClose}
              className={`transition-colors ${t.isDark ? 'text-[#666] hover:text-white' : 'text-[#bbb] hover:text-[#111]'}`}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Node detail tree */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4"
          style={{ scrollbarWidth: 'thin', scrollbarColor: t.isDark ? '#2a2a2a transparent' : '#d4d4d4 transparent' }}
        >
          {nodeRuns.length === 0 ? (
            <div className={`flex items-center justify-center h-20 text-xs ${t.textMuted}`}>
              No node details available
            </div>
          ) : (
            <div className="font-mono space-y-3">
              {nodeRuns.map((nr, i) => (
                <NodeRunEntry key={nr.id} nr={nr} isLast={i === nodeRuns.length - 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RunCard({ run, runNumber }: { run: WorkflowRun; runNumber: number }) {
  const [showModal, setShowModal] = useState(false)
  const t = useTheme()

  const date = new Date(run.createdAt)
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' })

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`w-full text-left border rounded-lg overflow-hidden transition-all duration-150 group
          ${t.isDark
            ? 'bg-[#1a1a1a] border-[#2a2a2a] hover:border-violet-500/40 hover:shadow-lg hover:shadow-violet-500/5'
            : 'bg-[#f8f8f8] border-[#e0e0e0] hover:border-violet-400/50 hover:shadow-md'
          }`}
      >
        {/* Meta */}
        <div className="px-3 pt-2 pb-2.5 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-mono ${t.textDim}`}>#{runNumber}</span>
            <StatusBadge status={run.status} />
          </div>
          <div className={`flex items-center gap-1.5 text-[10px] ${t.textMuted}`}>
            <span>{SCOPE_LABEL[run.scope] ?? run.scope}</span>
            {run.duration != null && (
              <>
                <span className={t.textDim}>·</span>
                <span>{run.duration.toFixed(1)}s</span>
              </>
            )}
          </div>
          <div className={`text-[10px] ${t.textDim}`}>{dateStr} · {timeStr}</div>
        </div>
      </button>

      {showModal && (
        <RunDetailModal run={run} runNumber={runNumber} onClose={() => setShowModal(false)} />
      )}
    </>
  )
}

function HistoryPanel() {
  const { runs, fetchRuns, runningNodeIds } = useWorkflowStore()
  const isRunning = runningNodeIds.size > 0
  const t = useTheme()

  // Assign run numbers chronologically (oldest = #1), display newest first
  const chronological = [...runs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
  const runNumberMap = new Map(chronological.map((r, i) => [r.id, i + 1]))
  const displayRuns = [...chronological].reverse()

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className={`flex items-center justify-between px-3 py-2.5 border-b shrink-0 ${t.divider}`}>
        <span className={`text-xs font-medium ${t.textMain}`}>History</span>
        <button
          onClick={fetchRuns}
          className={`text-xs transition-colors ${t.isDark ? 'text-[#666] hover:text-white' : 'text-[#bbb] hover:text-[#111]'}`}
        >
          Refresh
        </button>
      </div>

      {isRunning && (
        <div className={`px-3 py-2 border-b flex items-center gap-2 shrink-0 ${t.divider}`}>
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-yellow-400 text-xs">Running…</span>
        </div>
      )}

      <div
        className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2"
        style={{  
          scrollbarWidth: 'thin',
          scrollbarColor: t.isDark ? '#2a2a2a transparent' : '#d4d4d4 transparent',
        }}
      >
        {displayRuns.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-full text-xs gap-2 ${t.textMuted}`}>
            <Clock size={24} className={t.textDim} />
            <span>No runs yet</span>
            <span className={t.textDim}>Run your workflow to see history</span>
          </div>
        ) : (
          displayRuns.map(run => (
            <RunCard key={run.id} run={run} runNumber={runNumberMap.get(run.id) ?? 1} />
          ))
        )}
      </div>
    </div>
  )
}

// ── Assets panel ──────────────────────────────────────────────────────────────

function AssetModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const t = useTheme()
  const deleteAsset = useWorkflowStore(s => s.deleteAsset)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const copyUrl = () => navigator.clipboard.writeText(asset.url)
  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    void deleteAsset(asset.id)
    onClose()
  }
  const [downloading, setDownloading] = useState(false)
  const download = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      // The `download` attribute is ignored on cross-origin URLs (Blob store),
      // so fetch the file and download it via a local object URL instead.
      const res = await fetch(asset.url)
      if (!res.ok) throw new Error(`Download failed: ${res.status}`)
      const blob = await res.blob()
      const ext = new URL(asset.url).pathname.split(".").pop() || (asset.type === "video" ? "mp4" : "jpg")
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = objectUrl
      a.download = `asset-${asset.id}.${ext}`
      a.click()
      URL.revokeObjectURL(objectUrl)
    } catch {
      window.open(asset.url, "_blank") // last resort — at least show the file
    } finally { setDownloading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`border rounded-xl max-w-lg w-full p-4 flex flex-col gap-3 ${t.surface}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium capitalize ${t.textMain}`}>{asset.type} Asset</span>
          <button onClick={onClose} className={`transition-colors ${t.textMuted}`}><X size={16} /></button>
        </div>
        {asset.type === "image"
          ? <img src={asset.url} alt="asset" className={`w-full rounded-lg border max-h-64 object-contain ${t.divider}`} />
          : <video src={asset.url} controls className={`w-full rounded-lg border max-h-64 ${t.divider}`} />
        }
        <div className={`grid grid-cols-2 gap-2 text-xs ${t.textMid}`}>
          {asset.meta?.model && <div><span className={t.textDim}>Model: </span>{asset.meta.model}</div>}
          <div><span className={t.textDim}>Created: </span>{new Date(asset.createdAt).toLocaleString()}</div>
          {asset.meta?.dimensions && <div><span className={t.textDim}>Size: </span>{asset.meta.dimensions}</div>}
        </div>
        <div className="flex gap-2">
          <button onClick={copyUrl} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs transition-colors ${t.btnGhost}`}>
            <Copy size={12} /> Copy URL
          </button>
          <button onClick={download} disabled={downloading}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-xs transition-colors">
            <Download size={12} /> {downloading ? 'Downloading…' : 'Download'}
          </button>
          <button onClick={handleDelete}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs transition-colors ${
              confirmDelete
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-red-900/30 hover:bg-red-900/50 text-red-400'
            }`}>
            <Trash2 size={12} /> {confirmDelete ? 'Confirm?' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AssetsPanel() {
  const { assets } = useWorkflowStore()
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const t = useTheme()

  return (
    <div className="flex flex-col h-full">
      <div className={`flex items-center justify-between px-3 py-2.5 border-b ${t.divider}`}>
        <span className={`text-xs font-medium ${t.textMain}`}>Assets</span>
        <span className={`text-xs ${t.textDim}`}>{assets.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {assets.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-full text-xs gap-2 ${t.textMuted}`}>
            <ImageIcon size={24} className={t.textDim} />
            <span>No assets yet</span>
            <span className={t.textDim}>Generated images and videos appear here</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {assets.map(asset => (
              <button key={asset.id} onClick={() => setSelectedAsset(asset)}
                className={`relative aspect-square rounded-lg border overflow-hidden hover:border-violet-500 transition-colors group ${t.isDark ? 'bg-[#1a1a1a] border-[#2a2a2a]' : 'bg-[#f5f5f5] border-[#e0e0e0]'}`}>
                {asset.type === "image"
                  ? <img src={asset.url} alt="asset" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><VideoIcon size={24} className={t.textDim} /></div>
                }
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <span className="text-white text-xs">View</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {selectedAsset && <AssetModal asset={selectedAsset} onClose={() => setSelectedAsset(null)} />}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function RightSidebar() {
  const { rightPanel, theme } = useWorkflowStore()
  if (!rightPanel) return null
  const isDark = theme === 'dark'

  return (
    <div className={`w-72 h-full flex flex-col shrink-0 overflow-hidden border-l ${isDark ? 'bg-[#141414] border-[#2a2a2a]' : 'bg-white border-[#e0e0e0]'}`}>
      {rightPanel === "history" ? <HistoryPanel /> : <AssetsPanel />}
    </div>
  )
}
