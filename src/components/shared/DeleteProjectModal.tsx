"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

/**
 * Confirmation modal for deleting a workflow/project. Rendered as a
 * full-screen overlay; the "delete assets" checkbox controls whether the
 * workflow's uploads/outputs are removed along with it.
 */
export default function DeleteProjectModal({
  projectName,
  isDark = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  projectName: string;
  isDark?: boolean;
  busy?: boolean;
  onConfirm: (deleteAssets: boolean) => void;
  onCancel: () => void;
}) {
  const [deleteAssets, setDeleteAssets] = useState(true);

  const panel = isDark
    ? "bg-[#1c1c1c] border-[#2a2a2a]"
    : "bg-white border-[#e0e0e0]";
  const title = isDark ? "text-white" : "text-[#111]";
  const body = isDark ? "text-[#aaa]" : "text-[#555]";
  const cancelBtn = isDark
    ? "bg-[#2a2a2a] hover:bg-[#333] text-white"
    : "bg-[#f0f0f0] hover:bg-[#e0e0e0] text-[#111]";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className={`w-full max-w-sm rounded-2xl border shadow-2xl p-5 ${panel}`}>
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-full bg-red-500/15 text-red-400 shrink-0">
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h3 className={`text-sm font-semibold ${title}`}>
              Delete &ldquo;{projectName}&rdquo;?
            </h3>
            <p className={`text-xs mt-1.5 leading-relaxed ${body}`}>
              This will permanently delete the workflow and its run history.
            </p>
          </div>
        </div>

        <label className={`flex items-center gap-2 mt-4 cursor-pointer select-none text-xs ${body}`}>
          <input
            type="checkbox"
            checked={deleteAssets}
            onChange={(e) => setDeleteAssets(e.target.checked)}
            disabled={busy}
            className="w-3.5 h-3.5 accent-red-500 cursor-pointer"
          />
          Delete all its assets as well (uploads &amp; outputs)
        </label>

        <p className="text-[11px] mt-3 text-red-400/90 leading-relaxed">
          Warning: this action is permanent and cannot be undone.
        </p>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            disabled={busy}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${cancelBtn}`}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(deleteAssets)}
            disabled={busy}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-medium transition-colors"
          >
            {busy && <Loader2 size={11} className="animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
