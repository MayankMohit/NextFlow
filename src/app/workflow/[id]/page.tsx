'use client'

import { use, useEffect, useLayoutEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useWorkflowStore } from '@/store/workflowStore'
import LeftSidebar from '@/components/sidebar/LeftSidebar'
import RightSidebar from '@/components/sidebar/RightSidebar'
import WorkflowCanvas from '@/components/canvas/WorkflowCanvas'
import TopBar from '@/components/toolbar/TopBar'
import BottomBar from '@/components/toolbar/BottomBar'

function WorkflowPageInner({ id }: { id: string }) {
  const { loadWorkflow, theme, setTheme } = useWorkflowStore()

  // Sync saved theme before first paint to avoid flash; runs client-only.
  useLayoutEffect(() => {
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null
    if (saved && saved !== theme) setTheme(saved)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadWorkflow(id)
  }, [id, loadWorkflow])

  const isDark = theme === 'dark'
  const bg = isDark ? 'bg-[#0a0a0a]' : 'bg-[#f5f5f5]'

  return (
    // suppressHydrationWarning: server always renders 'dark'; client may differ
    // after useLayoutEffect applies the saved preference. The delta is one className.
    <div suppressHydrationWarning className={`flex h-screen w-screen overflow-hidden ${bg}`}>
      <LeftSidebar />
      <div className="relative flex-1 overflow-hidden">
        <WorkflowCanvas />
        <TopBar />
        <BottomBar />
      </div>
      <RightSidebar />
    </div>
  )
}

export default function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <ReactFlowProvider>
      <WorkflowPageInner id={id} />
    </ReactFlowProvider>
  )
}