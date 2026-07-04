"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Combine, Play, Loader2, X } from "lucide-react";
import { useWorkflowStore } from "@/store/workflowStore";
import { useNodeHover } from "@/hooks/usenodehover";
import { useNodeStatus } from "@/hooks/useNodeStatus";

const NODE_COLOR = "#f97316";

export default function TextCombineNode({ selected, data, id }: NodeProps) {
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
  const resultBg = isDark
    ? "bg-[#141414] text-[#ccc] border-[#2a2a2a]"
    : "bg-[#f5f5f5] text-[#333] border-[#e0e0e0]";

  const borderColor = selected ? NODE_COLOR : isDark ? "#2a2a2a" : "#e0e0e0";

  const scrollbarStyle = `
    .textcombine-scroll::-webkit-scrollbar { width: 4px; }
    .textcombine-scroll::-webkit-scrollbar-track { background: transparent; }
    .textcombine-scroll::-webkit-scrollbar-thumb {
      background: ${isDark ? "#3a3a3a" : "#d0d0d0"};
      border-radius: 99px;
    }
    .textcombine-scroll::-webkit-scrollbar-thumb:hover {
      background: ${isDark ? "#555" : "#b0b0b0"};
    }
    .textcombine-scroll {
      scrollbar-width: thin;
      scrollbar-color: ${isDark ? "#3a3a3a transparent" : "#d0d0d0 transparent"};
    }
  `;

  const glowKeyframes = `
    @keyframes text-combine-node-glow {
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
        animation: "text-combine-node-glow 1.8s ease-in-out infinite",
      }
    : {
        borderColor,
        boxShadow: selected ? `0 0 0 1.5px ${NODE_COLOR}55` : undefined,
      };

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

  const result = typeof data.lastOutput === "string" ? data.lastOutput : null;

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
          <Combine size={13} style={{ color: NODE_COLOR }} />
          <span className={`text-xs font-medium ${textMain}`}>Text Combine</span>
        </div>

        <div className="p-3 flex flex-col gap-1.5">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="flex items-center gap-2 h-4">
              <span className={`text-xs ${labelColor}`}>Text {n}</span>
            </div>
          ))}

          <span className={`text-xs mt-1 ${labelColor}`}>Template</span>
          <textarea
            defaultValue={(data.template as string) ?? ""}
            onChange={(e) => updateNodeData(id, { template: e.target.value })}
            placeholder={"{{1}} — {{2}}"}
            rows={4}
            className={`textcombine-scroll nodrag nowheel w-full text-xs rounded p-1.5 border outline-none resize-none ${inputCls}`}
          />
          <p className={`text-xs ${hintColor}`}>
            {"{{1}}–{{4}} insert inputs; empty = join all"}
          </p>

          {result && (
            <div className={`textcombine-scroll nodrag nowheel select-text text-xs rounded p-2 border max-h-24 overflow-y-auto whitespace-pre-wrap ${resultBg}`}>
              {result}
            </div>
          )}
        </div>

        {[1, 2, 3, 4].map((n, i) => (
          <Handle
            key={n}
            type="target"
            position={Position.Left}
            id={`text_${n}`}
            style={{ top: 55 + i * 22, ...tHandle }}
          />
        ))}
        <Handle type="source" position={Position.Right} id="output" style={sHandle} />
      </div>
    </div>
  );
}
