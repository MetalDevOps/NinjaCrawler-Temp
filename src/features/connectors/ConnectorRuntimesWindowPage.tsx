import { useEffect } from 'react'
import { subscribeToDesktopRuntimeEvents } from '../../bridge/desktop'
import { useAppStore } from '../../state/appStore'
import { ConnectorRuntimesPanel } from './ConnectorRuntimesPanel'

export function ConnectorRuntimesWindowPage() {
  const bootstrap = useAppStore((state) => state.bootstrap)
  const refreshSnapshot = useAppStore((state) => state.refreshSnapshot)
  const snapshot = useAppStore((state) => state.snapshot)
  const connectorRuntimes = snapshot?.connectorRuntimes ?? []
  const managedCount = connectorRuntimes.filter((runtime) => runtime.managementMode === 'managed').length
  const customCount = connectorRuntimes.filter((runtime) => runtime.managementMode === 'custom').length
  const updateCount = connectorRuntimes.filter((runtime) => runtime.updateAvailable).length
  const attentionCount = connectorRuntimes.filter((runtime) => runtime.status === 'error' || runtime.status === 'pending_activation').length

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined

    void subscribeToDesktopRuntimeEvents({
      onConnectorRuntimeChanged: () => {
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

        unsubscribe = teardown
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [refreshSnapshot])

  return (
    <div className="connector-runtime-window-shell">
      <header className="connector-runtime-window-header">
        <div className="connector-runtime-window-heading">
          <h1>Runtime control</h1>
        </div>
        <div className="connector-runtime-window-summary" role="list" aria-label="Connector runtime summary">
          <article className="connector-runtime-window-stat" role="listitem">
            <span>Managed</span>
            <strong>{managedCount}</strong>
          </article>
          <article className="connector-runtime-window-stat" role="listitem">
            <span>Custom</span>
            <strong>{customCount}</strong>
          </article>
          <article className="connector-runtime-window-stat" role="listitem">
            <span>Updates</span>
            <strong>{updateCount}</strong>
          </article>
          <article className="connector-runtime-window-stat" role="listitem">
            <span>Attention</span>
            <strong>{attentionCount}</strong>
          </article>
        </div>
      </header>

      {snapshot ? (
        <ConnectorRuntimesPanel />
      ) : (
        <div className="panel runtime-log-window-empty">Loading connector runtimes...</div>
      )}
    </div>
  )
}
