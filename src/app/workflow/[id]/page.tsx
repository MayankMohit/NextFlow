
import WorkflowCanvas from '@/components/canvas/WorkflowCanvas'
import LeftSidebar from '@/components/sidebar/LeftSidebar'

export default function WorkflowPage() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0a0a0a]">

      {/* Left Sidebar - part of flex flow, not overlay */}
      <LeftSidebar />

      {/* Main Area - shifts with sidebar */}
      <div className="relative flex-1 overflow-hidden">

        <WorkflowCanvas />

        {/* Top Right Controls */}
        <div className="absolute top-3 right-4 flex items-center gap-2 z-10">
          <button className="text-white text-sm px-2 py-1 rounded bg-[#1c1c1c] border border-[#2a2a2a]">🌙</button>
          <button className="text-white text-sm px-2 py-1 rounded bg-[#1c1c1c] border border-[#2a2a2a]">Assets</button>
          <button className="text-white text-sm px-2 py-1 rounded bg-[#1c1c1c] border border-[#2a2a2a]">History</button>
        </div>

        {/* Top Left - Logo + Project Name */}
        <div className="absolute top-3 left-4 flex items-center gap-2 z-10">
          <div className="text-white font-bold text-sm px-2 py-1 rounded bg-[#1c1c1c] border border-[#2a2a2a]">NextFlow ▾</div>
          <span className="text-[#666] text-sm hidden sm:block">Untitled</span>
        </div>

        {/* Bottom Left */}
        <div className="absolute bottom-4 left-4 flex items-center gap-2 z-10">
          <button className="text-white text-sm px-2 py-1 rounded bg-[#1c1c1c] border border-[#2a2a2a]">↩</button>
          <button className="text-white text-sm px-2 py-1 rounded bg-[#1c1c1c] border border-[#2a2a2a]">↪</button>
          <button className="text-white text-sm px-2 py-1 rounded bg-[#1c1c1c] border border-[#2a2a2a] hidden sm:block">⌨ Shortcuts</button>
        </div>

        {/* Bottom Center */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10">
          <button className="text-white text-sm px-2 py-1 rounded bg-[#1c1c1c] border border-[#2a2a2a]">+</button>
          <button className="text-white text-sm px-2 py-1 rounded bg-[#1c1c1c] border border-[#2a2a2a]">⬚</button>
          <button className="text-white text-sm px-2 py-1 rounded bg-[#1c1c1c] border border-[#2a2a2a]">✂</button>
          <button className="text-white text-sm px-2 py-1 rounded bg-[#1c1c1c] border border-[#2a2a2a]">⚙</button>
        </div>

      </div>

      {/* Right Sidebar */}
      <div className="w-72 sm:w-80 bg-[#141414] border-l border-[#2a2a2a] hidden">
        Right Sidebar
      </div>

    </div>
  )
}