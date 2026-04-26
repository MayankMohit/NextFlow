"use client";

import { useState } from "react";
import {
  useWorkflowStore,
  type WorkflowRun,
  type Asset,
} from "@/store/workflowStore";
import {
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  ImageIcon,
  VideoIcon,
  Copy,
  Download,
  X,
} from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  if (status === "success")
    return (
      <span className="flex items-center gap-1 text-green-400 text-xs">
        <CheckCircle size={10} />
        success
      </span>
    );
  if (status === "failed")
    return (
      <span className="flex items-center gap-1 text-red-400 text-xs">
        <XCircle size={10} />
        failed
      </span>
    );
  if (status === "partial")
    return (
      <span className="flex items-center gap-1 text-yellow-400 text-xs">
        <Clock size={10} />
        partial
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-yellow-400 text-xs">
      <Clock size={10} />
      {status}
    </span>
  );
}

function RunCard({ run, index }: { run: WorkflowRun; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const date = new Date(run.createdAt);
  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="border border-[#2a2a2a] rounded-lg overflow-hidden bg-[#1a1a1a]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#222] transition-colors text-left"
      >
        <span className="text-[#666] text-xs font-mono">#{index + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={run.status} />
            <span className="text-[#666] text-xs capitalize">{run.scope}</span>
          </div>
          <div className="text-[#555] text-xs mt-0.5">
            {dateStr} {timeStr}
            {run.duration ? ` · ${run.duration.toFixed(1)}s` : ""}
          </div>
        </div>
        {expanded ? (
          <ChevronDown size={12} className="text-[#555] shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-[#555] shrink-0" />
        )}
      </button>

      {expanded && run.nodeRuns.length > 0 && (
        <div className="border-t border-[#2a2a2a] px-3 py-2 flex flex-col gap-1.5">
          {run.nodeRuns.map((nr) => (
            <div key={nr.id} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[#555] text-xs">├─</span>
                <span className="text-white text-xs capitalize">
                  {nr.nodeType.replace("Node", "")} ({nr.nodeId.slice(-6)})
                </span>
                <StatusBadge status={nr.status} />
                {nr.duration && (
                  <span className="text-[#555] text-xs ml-auto">
                    {nr.duration.toFixed(1)}s
                  </span>
                )}
              </div>
              {nr.outputs && (
                <div className="ml-4 flex items-start gap-1">
                  <span className="text-[#555] text-xs">└─</span>
                  <span className="text-[#888] text-xs break-all line-clamp-2">
                    {typeof nr.outputs.result === "string"
                      ? nr.outputs.result.slice(0, 80) +
                        (nr.outputs.result.length > 80 ? "..." : "")
                      : "done"}
                  </span>
                </div>
              )}
              {nr.error && (
                <div className="ml-4 flex items-start gap-1">
                  <span className="text-[#555] text-xs">└─</span>
                  <span className="text-red-400 text-xs">{nr.error}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {expanded && run.nodeRuns.length === 0 && (
        <div className="border-t border-[#2a2a2a] px-3 py-2 text-[#555] text-xs">
          No node details available
        </div>
      )}
    </div>
  );
}

function HistoryPanel() {
  const { runs, fetchRuns, isRunning } = useWorkflowStore();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#2a2a2a]">
        <span className="text-white text-xs font-medium">Run History</span>
        <button
          onClick={fetchRuns}
          className="text-[#666] text-xs hover:text-white transition-colors"
        >
          Refresh
        </button>
      </div>
      {isRunning && (
        <div className="px-3 py-2 border-b border-[#2a2a2a] flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-yellow-400 text-xs">Running...</span>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#555] text-xs gap-2">
            <Clock size={24} className="text-[#333]" />
            <span>No runs yet</span>
            <span className="text-[#444]">
              Run your workflow to see history
            </span>
          </div>
        ) : (
          runs.map((run, i) => <RunCard key={run.id} run={run} index={i} />)
        )}
      </div>
    </div>
  );
}

function AssetModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const copyUrl = () => navigator.clipboard.writeText(asset.url);
  const download = () => {
    const a = document.createElement("a");
    a.href = asset.url;
    a.download = `asset-${asset.id}.${asset.type === "video" ? "mp4" : "jpg"}`;
    a.click();
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl max-w-lg w-full p-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-white text-sm font-medium capitalize">
            {asset.type} Asset
          </span>
          <button
            onClick={onClose}
            className="text-[#666] hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        {asset.type === "image" ? (
          <img
            src={asset.url}
            alt="asset"
            className="w-full rounded-lg border border-[#2a2a2a] max-h-64 object-contain"
          />
        ) : (
          <video
            src={asset.url}
            controls
            className="w-full rounded-lg border border-[#2a2a2a] max-h-64"
          />
        )}
        <div className="grid grid-cols-2 gap-2 text-xs text-[#888]">
          {asset.meta?.model && (
            <div>
              <span className="text-[#555]">Model: </span>
              {asset.meta.model}
            </div>
          )}
          <div>
            <span className="text-[#555]">Created: </span>
            {new Date(asset.createdAt).toLocaleString()}
          </div>
          {asset.meta?.dimensions && (
            <div>
              <span className="text-[#555]">Size: </span>
              {asset.meta.dimensions}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyUrl}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#2a2a2a] hover:bg-[#333] text-white text-xs transition-colors"
          >
            <Copy size={12} /> Copy URL
          </button>
          <button
            onClick={download}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white text-xs transition-colors"
          >
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#2a2a2a]">
        <span className="text-white text-xs font-medium">Assets</span>
        <span className="text-[#555] text-xs">{assets.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#555] text-xs gap-2">
            <ImageIcon size={24} className="text-[#333]" />
            <span>No assets yet</span>
            <span className="text-[#444]">
              Generated images and videos appear here
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {assets.map((asset) => (
              <button
                key={asset.id}
                onClick={() => setSelectedAsset(asset)}
                className="relative aspect-square rounded-lg border border-[#2a2a2a] overflow-hidden hover:border-violet-500 transition-colors group bg-[#1a1a1a]"
              >
                {asset.type === "image" ? (
                  <img
                    src={asset.url}
                    alt="asset"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <VideoIcon size={24} className="text-[#555]" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <span className="text-white text-xs">View</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {selectedAsset && (
        <AssetModal
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
        />
      )}
    </div>
  );
}

export default function RightSidebar() {
  const { rightPanel } = useWorkflowStore();
  if (!rightPanel) return null;

  return (
    <div className="w-72 h-full bg-[#141414] border-l border-[#2a2a2a] flex flex-col shrink-0 overflow-hidden">
      {rightPanel === "history" ? <HistoryPanel /> : <AssetsPanel />}
    </div>
  );
}
