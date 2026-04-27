"use client";

import { useState } from "react";
import { useWorkflowStore, type WorkflowRun, type Asset } from "@/store/workflowStore";
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, ImageIcon, VideoIcon, Copy, Download, X } from "lucide-react";

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

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle size={10} />success</span>;
  if (status === "failed")  return <span className="flex items-center gap-1 text-red-400 text-xs"><XCircle size={10} />failed</span>;
  return <span className="flex items-center gap-1 text-yellow-400 text-xs"><Clock size={10} />{status}</span>;
}

function RunCard({ run, index }: { run: WorkflowRun; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const t = useTheme()
  const date = new Date(run.createdAt);
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <div className={`border rounded-lg overflow-hidden ${t.surface}`}>
      <button onClick={() => setExpanded(v => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 transition-colors text-left ${t.hover}`}>
        <span className={`text-xs font-mono ${t.textMuted}`}>#{index + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={run.status} />
            <span className={`text-xs capitalize ${t.textMuted}`}>{run.scope}</span>
          </div>
          <div className={`text-xs mt-0.5 ${t.textDim}`}>
            {dateStr} {timeStr}{run.duration ? ` · ${run.duration.toFixed(1)}s` : ""}
          </div>
        </div>
        {expanded ? <ChevronDown size={12} className={t.textDim} /> : <ChevronRight size={12} className={t.textDim} />}
      </button>

      {expanded && run.nodeRuns.length > 0 && (
        <div className={`border-t px-3 py-2 flex flex-col gap-1.5 ${t.divider}`}>
          {run.nodeRuns.map(nr => (
            <div key={nr.id} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className={`text-xs ${t.textDim}`}>├─</span>
                <span className={`text-xs capitalize ${t.textMain}`}>{nr.nodeType.replace("Node", "")} ({nr.nodeId.slice(-6)})</span>
                <StatusBadge status={nr.status} />
                {nr.duration && <span className={`text-xs ml-auto ${t.textDim}`}>{nr.duration.toFixed(1)}s</span>}
              </div>
              {nr.outputs && (
                <div className="ml-4 flex items-start gap-1">
                  <span className={`text-xs ${t.textDim}`}>└─</span>
                  <span className={`text-xs break-all line-clamp-2 ${t.textMid}`}>
                    {typeof nr.outputs.result === "string" ? nr.outputs.result.slice(0, 80) + (nr.outputs.result.length > 80 ? "..." : "") : "done"}
                  </span>
                </div>
              )}
              {nr.error && (
                <div className="ml-4 flex items-start gap-1">
                  <span className={`text-xs ${t.textDim}`}>└─</span>
                  <span className="text-red-400 text-xs">{nr.error}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {expanded && run.nodeRuns.length === 0 && (
        <div className={`border-t px-3 py-2 text-xs ${t.divider} ${t.textDim}`}>No node details available</div>
      )}
    </div>
  );
}

function HistoryPanel() {
  const { runs, fetchRuns, isRunning } = useWorkflowStore();
  const t = useTheme()

  return (
    <div className="flex flex-col h-full">
      <div className={`flex items-center justify-between px-3 py-2.5 border-b ${t.divider}`}>
        <span className={`text-xs font-medium ${t.textMain}`}>Run History</span>
        <button onClick={fetchRuns} className={`text-xs transition-colors ${t.textMuted} hover:${t.isDark ? 'text-white' : 'text-[#111]'}`}>Refresh</button>
      </div>
      {isRunning && (
        <div className={`px-3 py-2 border-b flex items-center gap-2 ${t.divider}`}>
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-yellow-400 text-xs">Running...</span>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {runs.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-full text-xs gap-2 ${t.textMuted}`}>
            <Clock size={24} className={t.textDim} />
            <span>No runs yet</span>
            <span className={t.textDim}>Run your workflow to see history</span>
          </div>
        ) : (
          runs.map((run, i) => <RunCard key={run.id} run={run} index={i} />)
        )}
      </div>
    </div>
  );
}

function AssetModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const t = useTheme()
  const copyUrl = () => navigator.clipboard.writeText(asset.url);
  const download = () => {
    const a = document.createElement("a");
    a.href = asset.url;
    a.download = `asset-${asset.id}.${asset.type === "video" ? "mp4" : "jpg"}`;
    a.click();
  };

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
          <button onClick={download} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white text-xs transition-colors">
            <Download size={12} /> Download
          </button>
        </div>
      </div>
    </div>
  );
}

function AssetsPanel() {
  const { assets } = useWorkflowStore();
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
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
  );
}

export default function RightSidebar() {
  const { rightPanel, theme } = useWorkflowStore();
  if (!rightPanel) return null;
  const isDark = theme === 'dark'

  return (
    <div className={`w-72 h-full flex flex-col shrink-0 overflow-hidden border-l ${isDark ? 'bg-[#141414] border-[#2a2a2a]' : 'bg-white border-[#e0e0e0]'}`}>
      {rightPanel === "history" ? <HistoryPanel /> : <AssetsPanel />}
    </div>
  );
}
