// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyWorkspaceSnapshot } from '../domain/workspaceSnapshot'

const desktopMocks = vi.hoisted(() => ({
  clearProviderAccountCookies: vi.fn(),
  cloneProviderAccount: vi.fn(),
  deleteProviderAccount: vi.fn(),
  deleteSchedulerSet: vi.fn(),
  deleteSourceProfile: vi.fn(),
  deleteSyncPlan: vi.fn(),
  importProviderAccountCookies: vi.fn(),
  loadProviderAccountCookies: vi.fn(),
  loadProviderAccountEditor: vi.fn(),
  loadWorkspaceSnapshot: vi.fn(),
  openSourceFolder: vi.fn(),
  pauseSyncPlan: vi.fn(),
  resumeSyncPlan: vi.fn(),
  runInstagramSavedPostsSync: vi.fn(),
  runSourceSync: vi.fn(),
  runSyncPlanNow: vi.fn(),
  saveProviderAccountCookies: vi.fn(),
  saveProviderAccountSettings: vi.fn(),
  setDesktopSilentMode: vi.fn(),
  skipSyncPlan: vi.fn(),
  upsertAppSetting: vi.fn(),
  upsertProviderAccount: vi.fn(),
  upsertSchedulerSet: vi.fn(),
  upsertSourceProfile: vi.fn(),
  upsertSyncPlan: vi.fn(),
  validateProviderAccount: vi.fn(),
}))

vi.mock('../bridge/desktop', () => desktopMocks)

describe('useAppStore', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.values(desktopMocks).forEach((mock) => {
      if ('mockReset' in mock && typeof mock.mockReset === 'function') {
        mock.mockReset()
      }
    })
    vi.resetModules()
  })

  it('persists silent mode toggles in local storage', async () => {
    const { useAppStore } = await import('./appStore')

    expect(useAppStore.getState().operatorSilentMode).toBe(false)

    await useAppStore.getState().toggleOperatorSilentMode()
    expect(useAppStore.getState().operatorSilentMode).toBe(true)
    expect(localStorage.getItem('ninjacrawler.operator.silent-mode')).toBe('true')

    await useAppStore.getState().toggleOperatorSilentMode()
    expect(useAppStore.getState().operatorSilentMode).toBe(false)
    expect(localStorage.getItem('ninjacrawler.operator.silent-mode')).toBe('false')
  })

  it('hydrates silent mode from local storage on startup', async () => {
    localStorage.setItem('ninjacrawler.operator.silent-mode', 'true')

    const { useAppStore } = await import('./appStore')

    expect(useAppStore.getState().operatorSilentMode).toBe(true)
  })

  it('routes known action targets into shell sections and ignores unknown routes', async () => {
    const { useAppStore } = await import('./appStore')

    expect(useAppStore.getState().activeSection).toBe('sources')

    useAppStore.getState().routeAction('plan:run-1')
    expect(useAppStore.getState().activeSection).toBe('scheduler')

    useAppStore.getState().setActiveSection('settings')
    useAppStore.getState().routeAction('unknown-route')
    expect(useAppStore.getState().activeSection).toBe('settings')
  })

  it('hydrates operator silent mode from desktop runtime when the backend reports it', async () => {
    desktopMocks.loadWorkspaceSnapshot.mockResolvedValueOnce({
      ...createEmptyWorkspaceSnapshot(),
      desktopRuntime: {
        closeToTray: true,
        silentMode: true,
        trayAvailable: true,
        reportedByBackend: true,
      },
    })

    const { useAppStore } = await import('./appStore')

    await useAppStore.getState().bootstrap()

    expect(useAppStore.getState().operatorSilentMode).toBe(true)
    expect(useAppStore.getState().snapshot?.desktopRuntime.closeToTray).toBe(true)
  })

  it('routes silent mode toggles through the backend when runtime state is backend-managed', async () => {
    const { useAppStore } = await import('./appStore')
    desktopMocks.setDesktopSilentMode.mockResolvedValueOnce({
      ...createEmptyWorkspaceSnapshot(),
      desktopRuntime: {
        closeToTray: true,
        silentMode: false,
        trayAvailable: true,
        reportedByBackend: true,
      },
    })

    useAppStore.setState({
      snapshot: {
        ...createEmptyWorkspaceSnapshot(),
        desktopRuntime: {
          closeToTray: true,
          silentMode: true,
          trayAvailable: true,
          reportedByBackend: true,
        },
      },
      operatorSilentMode: true,
      loading: false,
    })

    await useAppStore.getState().toggleOperatorSilentMode()

    expect(desktopMocks.setDesktopSilentMode).toHaveBeenCalledWith(false)
    expect(useAppStore.getState().snapshot?.desktopRuntime.silentMode).toBe(false)
    expect(useAppStore.getState().operatorSilentMode).toBe(false)
    expect(localStorage.getItem('ninjacrawler.operator.silent-mode')).toBeNull()
  })

  it('routes instagram saved-posts sync through the desktop bridge mutation path', async () => {
    const { useAppStore } = await import('./appStore')
    const nextSnapshot = createEmptyWorkspaceSnapshot()
    desktopMocks.runInstagramSavedPostsSync.mockResolvedValueOnce(nextSnapshot)

    await useAppStore.getState().runInstagramSavedPostsSync('account-1')

    expect(desktopMocks.runInstagramSavedPostsSync).toHaveBeenCalledWith('account-1')
    expect(useAppStore.getState().snapshot).toEqual(nextSnapshot)
  })

})
