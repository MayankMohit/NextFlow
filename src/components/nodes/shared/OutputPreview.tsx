"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Link, Check, Loader2, X } from "lucide-react";

const VIDEO_RE = /\.(mp4|webm|mov)(\?|$)/i;
const AUDIO_RE = /\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i;

interface OutputPreviewProps {
  url: string;
  isDark: boolean;
  /** Base filename for downloads (extension is taken from the URL) */
  name?: string;
  /** Max preview height in px (media keeps its own height up to this) */
  maxHeight?: number;
  /** Fixed preview height in px — use when handles/rows below the preview
      need a deterministic offset; media is letterboxed via object-contain */
  height?: number;
}

/**
 * Media result preview shared by executable nodes: image thumbnail
 * (click = fullscreen lightbox) or video player, with hover actions to
 * download the file or copy its URL.
 */
export default function OutputPreview({
  url,
  isDark,
  name = "output",
  maxHeight = 160,
  height,
}: OutputPreviewProps) {
  const mediaStyle = height ? { height } : { maxHeight };
  const isVideo = VIDEO_RE.test(url);
  const isAudio = AUDIO_RE.test(url);
  const [lightbox, setLightbox] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox]);

  const download = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    try {
      // Cross-origin URLs ignore the `download` attribute — go via object URL
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const ext =
        new URL(url).pathname.split(".").pop() ||
        (isVideo ? "mp4" : isAudio ? "mp3" : "jpg");
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${name}.${ext}`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  const copyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const border = isDark ? "border-[#2a2a2a]" : "border-[#e0e0e0]";
  const actionBtn = isDark
    ? "bg-[#2a2a2a] hover:bg-[#3a3a3a] text-[#888] hover:text-white"
    : "bg-[#e0e0e0] hover:bg-[#d0d0d0] text-[#888] hover:text-[#111]";

  return (
    <div className="relative group/preview">
      {isAudio ? (
        <audio
          src={url}
          controls
          className={`nodrag w-full rounded border ${border}`}
        />
      ) : isVideo ? (
        <video
          src={url}
          controls
          className={`nodrag w-full object-contain rounded border ${border}`}
          style={mediaStyle}
        />
      ) : (
        <img
          src={url}
          alt="result"
          onClick={() => setLightbox(true)}
          className={`nodrag w-full object-contain rounded border cursor-zoom-in ${border}`}
          style={mediaStyle}
        />
      )}

      {/* Hover actions */}
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover/preview:opacity-100 transition-opacity">
        <button
          onClick={download}
          title="Download"
          className={`nodrag p-1 rounded transition-colors ${actionBtn}`}
        >
          {downloading ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Download size={11} />
          )}
        </button>
        <button
          onClick={copyUrl}
          title="Copy URL"
          className={`nodrag p-1 rounded transition-colors ${actionBtn}`}
        >
          {copied ? (
            <Check size={11} className="text-emerald-400" />
          ) : (
            <Link size={11} />
          )}
        </button>
      </div>

      {/* Lightbox — portaled to <body>: React Flow's transformed viewport
          would otherwise re-anchor position:fixed */}
      {lightbox &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center"
            onClick={() => setLightbox(false)}
          >
            <img
              src={url}
              alt="result"
              className="max-w-[92vw] max-h-[92vh] object-contain rounded shadow-2xl"
            />
            <button
              onClick={() => setLightbox(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
