"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Brain } from "lucide-react";
import { useWorkflowStore } from "@/store/workflowStore";

const MODELS = ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-3.1-pro-preview"];

export default function LLMNode({ selected, data, id }: NodeProps) {
  const { updateNodeData, theme } = useWorkflowStore();
  const isDark = theme === 'dark'

  const nodeBg    = isDark ? 'bg-[#1c1c1c]' : 'bg-white'
  const border    = selected ? 'border-violet-500' : (isDark ? 'border-[#2a2a2a]' : 'border-[#e0e0e0]')
  const hdrBorder = isDark ? 'border-[#2a2a2a]' : 'border-[#e8e8e8]'
  const textMain  = isDark ? 'text-white' : 'text-[#111]'
  const inputBg   = isDark ? 'bg-[#141414] border-[#2a2a2a] text-white' : 'bg-[#f5f5f5] border-[#e0e0e0] text-[#111]'
  const resultBg  = isDark ? 'bg-[#141414] border-[#2a2a2a] text-white' : 'bg-[#f5f5f5] border-[#e0e0e0] text-[#111]'

  const isRunning = data.status === "running";
  const result = typeof data.result === "string" ? data.result : undefined;

  return (
    <div className={`w-72 ${nodeBg} border ${border} rounded-lg overflow-hidden ${isRunning ? "animate-pulse shadow-lg shadow-violet-500/30" : ""}`}>
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${hdrBorder}`}>
        <Brain size={13} className="text-violet-400" />
        <span className={`text-xs font-medium ${textMain}`}>LLM</span>
        {isRunning && <span className="ml-auto text-xs text-violet-400 animate-pulse">Running...</span>}
      </div>
      <div className="p-3 flex flex-col gap-2">
        <select defaultValue={(data.model as string) ?? MODELS[0]}
          onChange={e => updateNodeData(id, { model: e.target.value })}
          className={`w-full text-xs rounded p-1.5 border outline-none ${inputBg}`}>
          {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {result && (
          <div className={`border rounded p-2 text-xs max-h-32 overflow-y-auto whitespace-pre-wrap ${resultBg}`}>{result}</div>
        )}
        {typeof data.error === "string" && (
          <div className="bg-red-950/40 border border-red-800 rounded p-2 text-red-400 text-xs">{data.error}</div>
        )}
      </div>
      <Handle type="target" position={Position.Left} id="system_prompt" style={{ top: "30%", background: "#666", width: 10, height: 10, border: "2px solid #888" }} />
      <Handle type="target" position={Position.Left} id="user_message"  style={{ top: "50%", background: "#666", width: 10, height: 10, border: "2px solid #888" }} />
      <Handle type="target" position={Position.Left} id="images"        style={{ top: "70%", background: "#666", width: 10, height: 10, border: "2px solid #888" }} />
      <Handle type="source" position={Position.Right} id="output"       style={{ background: "#7c3aed", width: 10, height: 10, border: "2px solid #a78bfa" }} />
    </div>
  );
}
