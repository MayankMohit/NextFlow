"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Loader2, Film } from "lucide-react";

export type DashboardAsset = {
  id: string;
  type: string; // image | video
  url: string;
  workflowId: string | null;
  createdAt: string;
};

function AssetCard({ asset }: { asset: DashboardAsset }) {
  const [downloading, setDownloading] = useState(false);
  const [failed, setFailed] = useState(false);

  const download = async () => {
    setDownloading(true);
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
    } finally {
      setDownloading(false);
    }
  };

  if (failed) return null;

  return (
    <div className="group relative mb-3 break-inside-avoid rounded-xl overflow-hidden border border-[#2a2a2a] bg-[#141414]">
      {asset.type === "video" ? (
        <>
          <video
            src={asset.url}
            muted
            playsInline
            preload="metadata"
            className="w-full block"
            onError={() => setFailed(true)}
            onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
          />
          <span className="absolute top-2 left-2 p-1 rounded-md bg-black/60 text-white/80">
            <Film size={11} />
          </span>
        </>
      ) : (
        /* Blob URLs are remote and unconfigured for next/image — plain img keeps it simple */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.url}
          alt=""
          loading="lazy"
          className="w-full block"
          onError={() => setFailed(true)}
        />
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        {asset.workflowId && (
          <Link
            href={`/workflow/${asset.workflowId}`}
            title="Open workflow"
            className="p-1.5 rounded-lg bg-black/60 backdrop-blur text-[#ccc] hover:text-white transition-colors"
          >
            <ExternalLink size={12} />
          </Link>
        )}
        <button
          onClick={download}
          disabled={downloading}
          title="Download"
          className="p-1.5 rounded-lg bg-black/60 backdrop-blur text-[#ccc] hover:text-white transition-colors"
        >
          {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
        </button>
      </div>
    </div>
  );
}

export default function AssetGallery({ assets }: { assets: DashboardAsset[] }) {
  if (assets.length === 0) return null;

  return (
    <section>
      <h2 className="text-white text-lg font-semibold mb-4">Recent creations</h2>
      <div className="columns-2 md:columns-3 lg:columns-4 gap-3">
        {assets.map((a) => (
          <AssetCard key={a.id} asset={a} />
        ))}
      </div>
    </section>
  );
}
