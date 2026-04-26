'use client'

import { use, useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useWorkflowStore } from '@/store/workflowStore'
import LeftSidebar from '@/components/sidebar/LeftSidebar'
import RightSidebar from '@/components/sidebar/RightSidebar'
import WorkflowCanvas from '@/components/canvas/WorkflowCanvas'
import TopBar from '@/components/toolbar/TopBar'
import BottomBar from '@/components/toolbar/BottomBar'

function WorkflowPageInner({ id }: { id: string }) {
  const { loadWorkflow, theme } = useWorkflowStore()

  useEffect(() => {
    loadWorkflow(id)
  }, [id, loadWorkflow])

  const isDark = theme === 'dark'
  const bg = isDark ? 'bg-[#0a0a0a]' : 'bg-[#f5f5f5]'

  return (
    <div className={`flex h-screen w-screen overflow-hidden ${bg}`}>
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