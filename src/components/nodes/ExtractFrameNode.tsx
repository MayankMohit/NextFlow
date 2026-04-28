"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Film, Play, Loader2, X } from "lucide-react";
import { useWorkflowStore } from "@/store/workflowStore";
import { useNodeHover } from "@/hooks/usenodehover";
import { useNodeStatus } from "@/hooks/useNodeStatus";

const NODE_COLOR = "#16A68D";

export default function ExtractFrameNode({ selected, data, id }: NodeProps) {
  const { updateNodeData, theme, runNode, saveWorkflow } = useWorkflowStore();
  const isDark = theme === "dark";
  const { hovered, onMouseEnter, onMouseLeave } = useNodeHover();
  const { isNodeRunning, isStartNode, canRun } = useNodeStatus(id);

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
  const labelColor = isDark ? "text-[#666]" : "text-[#888]";
  const hintColor = isDark ? "text-[#444]" : "text-[#ccc]";
  const inputCls = isDark
    ? "bg-[#141414] text-white border-[#2a2a2a] placeholder:text-[#444]"
    : "bg-[#f5f5f5] text-[#111] border-[#e0e0e0] placeholder:text-[#ccc]";

  const borderColor = selected ? NODE_COLOR : isDark ? "#2a2a2a" : "#e0e0e0";

  const glowKeyframes = `
    @keyframes extract-node-glow {
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
        animation: 'extract-node-glow 1.8s ease-in-out infinite',
      }
    : {
        borderColor,
        boxShadow: selected ? `0 0 0 1.5px ${NODE_COLOR}55` : undefined,
      };

  const isConnected = (handle: string) =>
    (data.connectedInputs as string[] | undefined)?.includes(handle);

  const tHandle = {
    background: `${NODE_COLOR}50`,
    width: 10,
    height: 10,
    border: `2.5px solid ${NODE_COLOR}`,
  };
  const sHandle = {
    background: NODE_COLOR,
    width: 10,
    height: 10,
    border: `2px solid ${NODE_COLOR}CC`,
  };

  return (
    <div
      className="relative"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
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
        <div
          className={`flex items-center gap-2 px-3 py-2 border-b ${hdrBorder}`}
        >
          <Film size={13} style={{ color: NODE_COLOR }} />
          <span className={`text-xs font-medium ${textMain}`}>
            Extract Frame
          </span>
        </div>
        <div className="p-3 flex flex-col gap-2">
          {/* Video input row */}
          <div className="flex items-center gap-2">
            <span className={`text-xs w-14 shrink-0 ${labelColor}`}>Video</span>
          </div>

          {/* Timestamp input */}
          <div className="flex items-center gap-2">
            <span className={`text-xs w-14 shrink-0 ${labelColor}`}>
              Timestamp
            </span>

            <input
              type="text"
              disabled={isConnected("timestamp")}
              defaultValue={(data.timestamp as string) ?? "0"}
              onChange={(e) =>
                updateNodeData(id, { timestamp: e.target.value })
              }
              placeholder="0 or 50%"
              className={`flex-1 text-xs rounded p-1 border outline-none disabled:opacity-40 disabled:cursor-not-allowed ${inputCls}`}
            />
          </div>
          <p className={`text-xs ${hintColor}`}>
            seconds or percentage e.g. 50%
          </p>
        </div>
        <Handle
          type="target"
          position={Position.Left}
          id="video_url"
          style={{ top: "40%", ...tHandle }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="timestamp"
          style={{ top: "64%", ...tHandle }}
        />
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          style={sHandle}
        />
      </div>
    </div>
  );
}
