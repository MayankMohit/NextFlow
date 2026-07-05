"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Download,
  ExternalLink,
  Loader2,
  Film,
  Maximize2,
  Link2,
  Check,
  Trash2,
  X,
} from "lucide-react";

export type DashboardAsset = {
  id: string;
  type: string; // image | video
  url: string;
  workflowId: string | null;
  createdAt: string;
};

async function downloadAsset(asset: DashboardAsset) {
  try {
    const res = await fetch(asset.url);
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = asset.url.split("/").pop()?.split("?")[0] || `asset-${asset.id}`;
    a.click();
    URL.revokeObjectURL(objUrl);
  } catch {
    window.open(asset.url, "_blank");
  }
}

/** Icon button used in the tile hover bar and the lightbox action bar. */
function ActionButton({
  title,
  onClick,
  danger = false,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg bg-black/60 backdrop-blur transition-colors ${
        danger ? "text-[#ccc] hover:text-red-400" : "text-[#ccc] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function CopyLinkButton({ url, size = 12 }: { url: string; size?: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <ActionButton
      title={copied ? "Copied!" : "Copy link"}
      onClick={() => {
        navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check size={size} className="text-green-400" /> : <Link2 size={size} />}
    </ActionButton>
  );
}

function DownloadButton({ asset, size = 12 }: { asset: DashboardAsset; size?: number }) {
  const [downloading, setDownloading] = useState(false);
  return (
    <ActionButton
      title="Download"
      onClick={async () => {
        setDownloading(true);
        await downloadAsset(asset);
        setDownloading(false);
      }}
    >
      {downloading ? <Loader2 size={size} className="animate-spin" /> : <Download size={size} />}
    </ActionButton>
  );
}

function AssetCard({
  asset,
  onOpen,
  onDelete,
  deleting,
}: {
  asset: DashboardAsset;
  onOpen: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (failed) return null;

  return (
    <div
      className={`group relative aspect-square rounded-xl overflow-hidden border border-[#2a2a2a] bg-[#141414] ${
        loaded ? "" : "animate-pulse"
      }`}
    >
      {/* Media fills the square uniformly */}
      <button onClick={onOpen} className="block w-full h-full cursor-zoom-in" title="Open asset">
        {asset.type === "video" ? (
          <video
            ref={(el) => { if (el && el.readyState >= 1) setLoaded(true); }}
            src={asset.url}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
            onLoadedMetadata={() => setLoaded(true)}
            onError={() => setFailed(true)}
            onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
          />
        ) : (
          /* Blob URLs are remote and unconfigured for next/image — plain img keeps it simple */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={(el) => { if (el?.complete && el.naturalWidth > 0) setLoaded(true); }}
            src={asset.url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        )}
      </button>

      {asset.type === "video" && loaded && (
        <span className="absolute top-2 left-2 p-1 rounded-md bg-black/60 text-white/80 pointer-events-none">
          <Film size={11} />
        </span>
      )}

      {/* Hover action bar */}
      {!confirming && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 p-2 bg-linear-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionButton title="Open asset" onClick={onOpen}>
            <Maximize2 size={12} />
          </ActionButton>
          {asset.workflowId && (
            <Link
              href={`/workflow/${asset.workflowId}`}
              title="Open workflow"
              className="p-1.5 rounded-lg bg-black/60 backdrop-blur text-[#ccc] hover:text-white transition-colors"
            >
              <ExternalLink size={12} />
            </Link>
          )}
          <DownloadButton asset={asset} />
          <CopyLinkButton url={asset.url} />
          <ActionButton title="Delete asset" danger onClick={() => setConfirming(true)}>
            <Trash2 size={12} />
          </ActionButton>
        </div>
      )}

      {/* Delete confirmation overlay */}
      {confirming && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/80 backdrop-blur-sm px-3">
          <p className="text-white text-xs text-center">Delete this asset permanently?</p>
          <div className="flex items-center gap-2">
            <button
              onClick={onDelete}
              disabled={deleting}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-medium transition-colors"
            >
              {deleting && <Loader2 size={11} className="animate-spin" />}
              Delete
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-3 py-1 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Full-screen viewer with download / copy / open-workflow / delete. */
function Lightbox({
  asset,
  onClose,
  onDelete,
  deleting,
}: {
  asset: DashboardAsset;
  onClose: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <button
        onClick={onClose}
        title="Close"
        className="absolute top-4 right-4 p-2 rounded-lg bg-black/60 text-[#ccc] hover:text-white transition-colors"
      >
        <X size={16} />
      </button>

      {asset.type === "video" ? (
        <video
          src={asset.url}
          controls
          autoPlay
          muted
          playsInline
          className="max-w-[92vw] max-h-[78vh] rounded-xl border border-[#2a2a2a]"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.url}
          alt=""
          className="max-w-[92vw] max-h-[78vh] object-contain rounded-xl border border-[#2a2a2a]"
        />
      )}

      <div className="flex items-center gap-2 mt-4">
        {confirming ? (
          <>
            <span className="text-white text-xs mr-1">Delete this asset permanently?</span>
            <button
              onClick={onDelete}
              disabled={deleting}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-medium transition-colors"
            >
              {deleting && <Loader2 size={11} className="animate-spin" />}
              Delete
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-3 py-1.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white text-xs transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            {asset.workflowId && (
              <Link
                href={`/workflow/${asset.workflowId}`}
                title="Open workflow"
                className="p-2 rounded-lg bg-black/60 text-[#ccc] hover:text-white transition-colors"
              >
                <ExternalLink size={15} />
              </Link>
            )}
            <DownloadButton asset={asset} size={15} />
            <CopyLinkButton url={asset.url} size={15} />
            <ActionButton title="Delete asset" danger onClick={() => setConfirming(true)}>
              <Trash2 size={15} />
            </ActionButton>
          </>
        )}
      </div>
    </div>
  );
}

export default function AssetGallery({ assets }: { assets: DashboardAsset[] }) {
  // Local deletions filter the server-provided list so router.refresh()
  // (e.g. after a workflow delete) still flows fresh data through.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<DashboardAsset | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const visible = assets.filter((a) => !removedIds.has(a.id));

  const deleteAsset = async (asset: DashboardAsset) => {
    setDeletingId(asset.id);
    const res = await fetch(`/api/assets/${encodeURIComponent(asset.id)}`, { method: "DELETE" });
    setDeletingId(null);
    // 404 = row already gone; hiding it locally is enough
    if (res.ok || res.status === 404) {
      setRemovedIds((prev) => new Set(prev).add(asset.id));
      setViewing((v) => (v?.id === asset.id ? null : v));
    }
  };

  if (visible.length === 0) return null;

  return (
    <section>
      <h2 className="text-white text-lg font-semibold mb-4">Recent creations</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {visible.map((a) => (
          <AssetCard
            key={a.id}
            asset={a}
            onOpen={() => setViewing(a)}
            onDelete={() => deleteAsset(a)}
            deleting={deletingId === a.id}
          />
        ))}
      </div>

      {viewing && (
        <Lightbox
          asset={viewing}
          onClose={() => setViewing(null)}
          onDelete={() => deleteAsset(viewing)}
          deleting={deletingId === viewing.id}
        />
      )}
    </section>
  );
}
