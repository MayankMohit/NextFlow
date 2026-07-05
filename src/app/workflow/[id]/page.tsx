'use client'

import { use, useEffect, useLayoutEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useWorkflowStore } from '@/store/workflowStore'
import LeftSidebar from '@/components/sidebar/LeftSidebar'
import RightSidebar from '@/components/sidebar/RightSidebar'
import WorkflowCanvas from '@/components/canvas/WorkflowCanvas'
import RunRealtimeBridge from '@/components/canvas/RunRealtimeBridge'
import TopBar from '@/components/toolbar/TopBar'
import BottomBar from '@/components/toolbar/BottomBar'

function WorkflowPageInner({ id, template }: { id: string; template?: string }) {
  const { loadWorkflow, loadSampleWorkflow, theme, setTheme } = useWorkflowStore()

  useLayoutEffect(() => {
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null
    if (saved && saved !== theme) setTheme(saved)
  }, [])

  useEffect(() => {
    // "Try the sample" from the dashboard lands on /workflow/new?template=sample
    if (id === 'new' && template === 'sample') loadSampleWorkflow()
    else loadWorkflow(id)
  }, [id, template, loadWorkflow, loadSampleWorkflow])

  const isDark = theme === 'dark'
  const bg = isDark ? 'bg-[#0a0a0a]' : 'bg-[#f5f5f5]'

  return (
    <div suppressHydrationWarning className={`flex h-dvh w-screen overflow-hidden ${bg}`}>
      <LeftSidebar />
      <div className="relative flex-1 overflow-hidden">
        <WorkflowCanvas />
        <RunRealtimeBridge />
        <TopBar />
        <BottomBar />
      </div>
      <RightSidebar />
    </div>
  )
}

export default function WorkflowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ template?: string }>
}) {
  const { id } = use(params)
  const { template } = use(searchParams)
  return (
    <ReactFlowProvider>
      <WorkflowPageInner id={id} template={template} />
    </ReactFlowProvider>
  )
}