"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Brain } from "lucide-react";
import { useWorkflowStore } from "@/store/workflowStore";

const MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];

export default function LLMNode({ selected, data, id }: NodeProps) {
  const { updateNodeData } = useWorkflowStore();

  const isRunning = data.status === "running";
  const result = typeof data.result === "string" ? data.result : undefined;

  return (
    <div
      className={`
      w-72 bg-[#1c1c1c] border rounded-lg overflow-hidden
      ${selected ? "border-violet-500" : "border-[#2a2a2a]"}
      ${isRunning ? "animate-pulse shadow-lg shadow-violet-500/30" : ""}
    `}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a2a2a]">
        <Brain size={13} className="text-violet-400" />
        <span className="text-white text-xs font-medium">LLM</span>
        {isRunning && (
          <span className="ml-auto text-xs text-violet-400 animate-pulse">
            Running...
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col gap-2">
        {/* Model selector */}
        <select
          defaultValue={(data.model as string) ?? MODELS[0]}
          onChange={(e) => updateNodeData(id, { model: e.target.value })}
          className="w-full bg-[#141414] text-white text-xs rounded p-1.5 border border-[#2a2a2a] outline-none"
        >
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {result && (
          <div className="bg-[#141414] border border-[#2a2a2a] rounded p-2 text-white text-xs max-h-32 overflow-y-auto whitespace-pre-wrap">
            {result}
          </div>
        )}

        {typeof data.error === "string" && (
          <div className="bg-red-950/40 border border-red-800 rounded p-2 text-red-400 text-xs">
            {data.error}
          </div>
        )}
      </div>

      {/* Input Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="system_prompt"
        style={{
          top: "30%",
          background: "#666",
          width: 10,
          height: 10,
          border: "2px solid #888",
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="user_message"
        style={{
          top: "50%",
          background: "#666",
          width: 10,
          height: 10,
          border: "2px solid #888",
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="images"
        style={{
          top: "70%",
          background: "#666",
          width: 10,
          height: 10,
          border: "2px solid #888",
        }}
      />

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{
          background: "#7c3aed",
          width: 10,
          height: 10,
          border: "2px solid #a78bfa",
        }}
      />
    </div>
  );
}
