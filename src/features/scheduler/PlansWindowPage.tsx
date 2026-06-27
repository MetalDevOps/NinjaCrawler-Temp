import { useEffect, useMemo, useState } from 'react'
import { subscribeToDesktopRuntimeEvents, subscribeToPlansWindowIntent } from '../../bridge/desktop'
import type { PlanEditorWindowIntent } from '../../domain/models'
import { useAppStore } from '../../state/appStore'
import { SchedulerPage } from './SchedulerPage'

interface PlansWindowPageProps {
  initialIntent?: PlanEditorWindowIntent
}

function normalizeIntent(intent?: PlanEditorWindowIntent): PlanEditorWindowIntent {
  return {
    mode: intent?.mode ?? 'edit',
    planId: intent?.planId?.trim() || undefined,
    schedulerSetId: intent?.schedulerSetId?.trim() || undefined,
  }
}

function intentSignature(intent: PlanEditorWindowIntent): string {
  return [intent.mode, intent.planId ?? 'none', intent.schedulerSetId ?? 'none'].join(':')
}

export function PlansWindowPage({ initialIntent }: PlansWindowPageProps) {
  const bootstrap = useAppStore((state) => state.bootstrap)
  const refreshSnapshot = useAppStore((state) => state.refreshSnapshot)
  const snapshot = useAppStore((state) => state.snapshot)
  const loading = useAppStore((state) => state.loading)
  const error = useAppStore((state) => state.error)
  const [activeIntent, setActiveIntent] = useState<PlanEditorWindowIntent>(() => normalizeIntent(initialIntent))
  const [intentRevision, setIntentRevision] = useState(0)
  const signature = useMemo(() => intentSignature(activeIntent), [activeIntent])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    let disposed = false
    let unsubscribeRuntime: (() => void) | undefined
    let unsubscribeIntent: (() => void) | undefined

    void subscribeToDesktopRuntimeEvents({
      onSchedulerTick: () => {
        if (!disposed) {
          void refreshSnapshot().catch(() => undefined)
        }
      },
    })
      .then((teardown) => {
        if (disposed) {
          teardown()
          return
        }
        unsubscribeRuntime = teardown
      })
      .catch(() => undefined)

    void subscribeToPlansWindowIntent((incomingIntent) => {
      const nextIntent = normalizeIntent(incomingIntent)
      if (intentSignature(nextIntent) === signature) {
        return
      }
      setActiveIntent(nextIntent)
      setIntentRevision((current) => current + 1)
    })
      .then((teardown) => {
        if (disposed) {
          teardown()
          return
        }
        unsubscribeIntent = teardown
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      unsubscribeRuntime?.()
      unsubscribeIntent?.()
    }
  }, [refreshSnapshot, signature])

  if (loading && !snapshot) {
    return <div className="app-shell loading-shell">Loading plans window...</div>
  }

  if (!snapshot) {
    return <div className="app-shell loading-shell">Failed to load plans window: {error ?? 'missing snapshot'}</div>
  }

  return <SchedulerPage initialIntent={{ ...activeIntent }} key={`${intentRevision}:${signature}`} />
}
