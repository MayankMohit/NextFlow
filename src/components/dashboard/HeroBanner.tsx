import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";

export default function HeroBanner() {
  return (
    <div className="relative overflow-hidden rounded-3xl px-5 py-10 md:px-12 md:py-16 bg-gradient-to-br from-[#4c1d95] via-[#6d28d9] to-[#a21caf]">
      {/* soft glow accents */}
      <div className="pointer-events-none absolute -top-24 -right-24 w-80 h-80 rounded-full bg-fuchsia-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 w-96 h-96 rounded-full bg-violet-400/20 blur-3xl" />

      <div className="relative max-w-2xl">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-violet-100 text-[11px] font-medium tracking-wide uppercase">
          <Sparkles size={11} />
          AI Workflow Builder
        </span>
        <h1 className="mt-4 text-3xl md:text-5xl font-bold text-white leading-tight">
          Build visual AI workflows in minutes
        </h1>
        <p className="mt-3 text-violet-200 text-sm md:text-base max-w-lg">
          Chain LLMs, image and video tools on an infinite canvas. Connect nodes,
          hit run, and watch results flow through your graph in real time.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href="/workflow/new"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-[#4c1d95] text-sm font-semibold hover:bg-violet-50 transition-colors"
          >
            <Plus size={15} />
            New workflow
          </Link>
          <Link
            href="/workflow/new?template=sample"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 border border-white/25 text-white text-sm font-medium hover:bg-white/20 transition-colors"
          >
            Try the sample
          </Link>
        </div>
      </div>
    </div>
  );
}
