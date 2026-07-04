'use client'

import { useEffect } from 'react'
import { useRealtimeRun } from '@trigger.dev/react-hooks'
import { useWorkflowStore, type NodeRunMeta } from '@/store/workflowStore'

type RunMetadata = { nodes?: Record<string, NodeRunMeta> } | undefined

/**
 * Renders nothing — subscribes to the active Trigger.dev run and pipes its
 * streamed metadata (per-node status/output) into the workflow store, which
 * drives the node glow/success/failed UI.
 */
export default function RunRealtimeBridge() {
  const activeRun = useWorkflowStore(s => s.activeRun)
  if (!activeRun) return null
  return (
    <Bridge
      // Remount per run so the subscription never carries stale state over
      key={activeRun.triggerRunId}
      triggerRunId={activeRun.triggerRunId}
      accessToken={activeRun.publicAccessToken}
    />
  )
}

function Bridge({ triggerRunId, accessToken }: { triggerRunId: string; accessToken: string }) {
  const applyRunProgress = useWorkflowStore(s => s.applyRunProgress)
  const finishRun = useWorkflowStore(s => s.finishRun)

  const { run, error } = useRealtimeRun(triggerRunId, {
    accessToken,
    onComplete: (finishedRun, err) => {
      const store = useWorkflowStore.getState()
      const nodesMeta = (finishedRun.metadata as RunMetadata)?.nodes
      if (nodesMeta) store.applyRunProgress(nodesMeta)
      const ok = !err && finishedRun.status === 'COMPLETED'
      store.finishRun(ok ? undefined : (err?.message ?? `Run ${finishedRun.status.toLowerCase()}`))
    },
  })

  useEffect(() => {
    const nodesMeta = (run?.metadata as RunMetadata)?.nodes
    if (nodesMeta) applyRunProgress(nodesMeta)
  }, [run, applyRunProgress])

  useEffect(() => {
    if (error) finishRun(error.message)
  }, [error, finishRun])

  return null
}
