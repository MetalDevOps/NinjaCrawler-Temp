import { DEFAULT_APP_SETTINGS, DEFAULT_PROVIDER_CATALOG } from './defaults'
import type { WorkspaceSnapshot } from './models'

export function createEmptyWorkspaceSnapshot(
  overrides?: Partial<Pick<WorkspaceSnapshot, 'workspaceRoot' | 'dbPath' | 'mediaRoot'>>,
): WorkspaceSnapshot {
  return {
    workspaceRoot: overrides?.workspaceRoot ?? '',
    dbPath: overrides?.dbPath ?? '',
    mediaRoot: overrides?.mediaRoot ?? '',
    desktopRuntime: {
      closeToTray: false,
      silentMode: false,
      trayAvailable: false,
      reportedByBackend: false,
    },
    providerCatalog: structuredClone(DEFAULT_PROVIDER_CATALOG),
    appSettings: structuredClone(DEFAULT_APP_SETTINGS),
    connectorRuntimes: [],
    accounts: [],
    accountSessions: [],
    sources: [],
    sourceSyncRuns: [],
    accountSyncRuns: [],
    schedulerSets: [],
    schedulerGroups: [],
    syncPlanRuns: [],
  }
}
