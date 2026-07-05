import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles, Workflow, Zap, Layers } from "lucide-react";

const POINTS = [
  {
    icon: Workflow,
    title: "Visual node canvas",
    desc: "Drag, connect and rearrange AI building blocks on an infinite canvas.",
  },
  {
    icon: Zap,
    title: "Real-time execution",
    desc: "Runs stream back live — watch every node light up as it completes.",
  },
  {
    icon: Layers,
    title: "Media pipelines",
    desc: "LLMs, image crop & resize, video frame extraction — chained together.",
  },
];

export default function MarketingHero() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="NextFlow" width={26} height={26} />
          <span className="font-semibold">NextFlow</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/sign-in" className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[#ccc] hover:text-white transition-colors">
            Sign in
          </Link>
          <Link href="/sign-up" className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-white text-black hover:bg-violet-50 transition-colors">
            Get started
          </Link>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 pt-20 pb-24 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-300 text-[11px] font-medium tracking-wide uppercase">
          <Sparkles size={11} />
          AI Workflow Builder
        </span>
        <h1 className="mt-6 text-4xl md:text-6xl font-bold leading-tight">
          Build visual AI workflows
          <br />
          <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            in minutes
          </span>
        </h1>
        <p className="mt-5 text-[#999] text-base max-w-xl mx-auto">
          Chain LLMs, image and video tools on an infinite canvas. Connect nodes,
          hit run, and watch results flow through your graph in real time.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/sign-up"
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-semibold transition-colors"
          >
            Start building
            <ArrowRight size={15} />
          </Link>
          <Link
            href="/sign-in"
            className="px-6 py-3 rounded-xl bg-[#1c1c1c] border border-[#2a2a2a] text-white text-sm font-medium hover:bg-[#252525] transition-colors"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
          {POINTS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
              <div className="w-9 h-9 rounded-xl bg-violet-500/15 text-violet-400 flex items-center justify-center mb-4">
                <Icon size={17} />
              </div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-[#777] text-xs mt-1.5 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
