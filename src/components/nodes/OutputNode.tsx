"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Monitor, Play, Loader2, X, Download } from "lucide-react";
import { useState } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import { useNodeHover } from "@/hooks/usenodehover";
import { useNodeStatus } from "@/hooks/useNodeStatus";
import OutputPreview from "./shared/OutputPreview";

const NODE_COLOR = "#ec4899";

export default function OutputNode({ selected, data, id }: NodeProps) {
  const { updateNodeData, theme, runNode, saveWorkflow } = useWorkflowStore();
  const isDark = theme === "dark";
  const { hovered, onMouseEnter, onMouseLeave } = useNodeHover();
  const { isNodeRunning, isStartNode, canRun } = useNodeStatus(id);
  const [downloading, setDownloading] = useState(false);

  const handleRun = async () => {
    await saveWorkflow();
    await runNode(id);
  };

  const nodeBg = isDark ? "bg-[#1c1c1c]" : "bg-white";
  const border = selected
    ? "border-violet-500"
    : isDark
      ? "border-[#2a2a2a]"
      : "border-[#e0e0e0]";
  const hdrBorder = isDark ? "border-[#2a2a2a]" : "border-[#e8e8e8]";
  const textMain = isDark ? "text-white" : "text-[#111]";
  const hintColor = isDark ? "text-[#444]" : "text-[#ccc]";
  const resultBg = isDark
    ? "bg-[#141414] text-[#ccc] border-[#2a2a2a]"
    : "bg-[#f5f5f5] text-[#333] border-[#e0e0e0]";

  const borderColor = selected ? NODE_COLOR : isDark ? "#2a2a2a" : "#e0e0e0";

  const scrollbarStyle = `
    .outputnode-result::-webkit-scrollbar { width: 4px; }
    .outputnode-result::-webkit-scrollbar-track { background: transparent; }
    .outputnode-result::-webkit-scrollbar-thumb {
      background: ${isDark ? "#3a3a3a" : "#d0d0d0"};
      border-radius: 99px;
    }
    .outputnode-result::-webkit-scrollbar-thumb:hover {
      background: ${isDark ? "#555" : "#b0b0b0"};
    }
    .outputnode-result {
      scrollbar-width: thin;
      scrollbar-color: ${isDark ? "#3a3a3a transparent" : "#d0d0d0 transparent"};
    }
  `;

  const glowKeyframes = `
    @keyframes output-node-glow {
      0%, 100% {
        box-shadow: 0 0 0 1.5px ${NODE_COLOR}44, 0 0 14px 4px ${NODE_COLOR}28;
      }
      50% {
        box-shadow: 0 0 0 2.5px ${NODE_COLOR}bb, 0 0 30px 10px ${NODE_COLOR}50, 0 0 50px 18px ${NODE_COLOR}1e;
      }
    }
  `;

  const glowStyle: React.CSSProperties = isNodeRunning
    ? {
        borderColor: `${NODE_COLOR}aa`,
        animation: "output-node-glow 1.8s ease-in-out infinite",
      }
    : {
        borderColor,
        boxShadow: selected ? `0 0 0 1.5px ${NODE_COLOR}55` : undefined,
      };

  // What kind of output are we showing?
  const output = data.lastOutput;
  const url =
    typeof output === "string" && output.startsWith("http") ? output : null;
  const isVideo = url ? /\.(mp4|webm|mov)(\?|$)/i.test(url) : false;
  const text = typeof output === "string" && !url ? output : null;

  const download = async () => {
    if (!url || downloading) return;
    setDownloading(true);
    try {
      // Cross-origin URLs ignore the `download` attribute — go via object URL
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const ext =
        new URL(url).pathname.split(".").pop() || (isVideo ? "mp4" : "jpg");
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `output-${id}.${ext}`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  const tHandle = {
    background: `${NODE_COLOR}50`,
    width: 10,
    height: 10,
    border: `2.5px solid ${NODE_COLOR}`,
  };

  return (
    <div
      className="relative"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <style>{scrollbarStyle}</style>
      {isNodeRunning && <style>{glowKeyframes}</style>}
      {typeof data.error === "string" && (
        <div className="absolute bottom-full left-0 right-0 z-10 mb-1 flex items-start gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500 text-white text-[11px] font-medium">
          <span className="flex-1 wrap-break-word leading-snug">{data.error}</span>
          <button
            className="nodrag shrink-0 mt-px hover:opacity-70 transition-opacity"
            onClick={() => updateNodeData(id, { error: undefined })}
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Hover run button */}
      {hovered && !isNodeRunning && (
        <button
          onClick={handleRun}
          disabled={!canRun}
          title={
            canRun
              ? isStartNode
                ? "Run workflow from this node"
                : "Run this node"
              : "Upstream nodes must complete first"
          }
          className={`nodrag absolute top-0 right-full mr-1 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg border transition-all whitespace-nowrap ${
            canRun
              ? isStartNode
                ? "bg-blue-600 hover:bg-blue-500 border-blue-500 text-white cursor-pointer"
                : isDark
                  ? "bg-black hover:bg-[#1a1a1a] border-[#333] text-white cursor-pointer"
                  : "bg-white hover:bg-[#f5f5f5] border-[#d0d0d0] text-[#111] cursor-pointer"
              : isDark
                ? "bg-[#1c1c1c] border-[#2a2a2a] text-[#555] cursor-not-allowed"
                : "bg-white border-[#e0e0e0] text-[#bbb] cursor-not-allowed"
          }`}
        >
          <Play size={10} />
          {isStartNode ? "Run workflow" : "Run"}
        </button>
      )}

      {/* Running badge — hover-only */}
      {hovered && isNodeRunning && (
        <div className="absolute top-0 right-full mr-1 z-50 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium shadow-lg border bg-violet-900 border-violet-700 text-violet-300">
          <Loader2 size={9} className="animate-spin" />
          Running…
        </div>
      )}

      {/* Node body */}
      <div
        className={`w-64 ${nodeBg} border ${border} rounded-lg overflow-hidden`}
        style={glowStyle}
      >
        <div className={`flex items-center gap-2 px-3 py-2 border-b ${hdrBorder}`}>
          <Monitor size={13} style={{ color: NODE_COLOR }} />
          <span className={`text-xs font-medium ${textMain}`}>Output</span>
        </div>

        <div className="p-3 flex flex-col gap-2">
          {output == null ? (
            <p className={`text-xs ${hintColor}`}>
              Connect any node — its result shows here after a run.
            </p>
          ) : url ? (
            <OutputPreview url={url} isDark={isDark} name={`output-${id}`} />
          ) : (
            <div
              className={`outputnode-result nodrag nowheel select-text text-xs rounded p-2 border max-h-40 overflow-y-auto whitespace-pre-wrap ${resultBg}`}
            >
              {text}
            </div>
          )}

          {url && (
            <button
              onClick={download}
              disabled={downloading}
              className="nodrag flex items-center justify-center gap-1.5 py-1.5 rounded text-xs text-white transition-colors disabled:opacity-60"
              style={{ background: NODE_COLOR }}
            >
              <Download size={12} />
              {downloading ? "Downloading…" : "Download"}
            </button>
          )}
        </div>

        <Handle type="target" position={Position.Left} id="input" style={tHandle} />
      </div>
    </div>
  );
}
