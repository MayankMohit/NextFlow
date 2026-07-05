import Link from "next/link";
import { Brain, Crop, Film, Scaling, Combine, Monitor } from "lucide-react";

// Mirrors the node accent colors used on the canvas.
const TILES = [
  {
    icon: Brain,
    title: "LLM",
    desc: "Prompt Gemini with text and images from upstream nodes",
    color: "#7c3aed",
  },
  {
    icon: Crop,
    title: "Crop Image",
    desc: "Cut a region by percentage, driven manually or by nodes",
    color: "#16A68D",
  },
  {
    icon: Film,
    title: "Extract Frame",
    desc: "Grab a still from any video at a timestamp or percentage",
    color: "#14b8a6",
  },
  {
    icon: Scaling,
    title: "Resize Image",
    desc: "Scale images to any size with cover or contain fit",
    color: "#0ea5e9",
  },
  {
    icon: Combine,
    title: "Text Combine",
    desc: "Merge up to four texts with a {{1}}–{{4}} template",
    color: "#f97316",
  },
  {
    icon: Monitor,
    title: "Output",
    desc: "Pin any result — text, image or video — with download",
    color: "#ec4899",
  },
];

export default function FeatureTiles() {
  return (
    <section>
      <h2 className="text-white text-lg font-semibold mb-4">Nodes</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {TILES.map(({ icon: Icon, title, desc, color }) => (
          <Link
            key={title}
            href="/workflow/new"
            className="group relative overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#141414] p-4 hover:border-transparent transition-colors"
            style={{ ["--tile" as string]: color }}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.07] group-hover:opacity-20 transition-opacity"
              style={{ background: `linear-gradient(135deg, ${color}, transparent 70%)` }}
            />
            <div
              className="relative w-9 h-9 rounded-xl flex items-center justify-center mb-3"
              style={{ background: `${color}22`, color }}
            >
              <Icon size={17} />
            </div>
            <p className="relative text-white text-sm font-medium">{title}</p>
            <p className="relative text-[#777] text-[11px] mt-1 leading-snug">{desc}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
