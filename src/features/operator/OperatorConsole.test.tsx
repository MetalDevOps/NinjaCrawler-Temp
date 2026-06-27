// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceSnapshot } from '../../domain/models'
import { createEmptyWorkspaceSnapshot } from '../../domain/workspaceSnapshot'
import { OperatorConsole } from './OperatorConsole'

const useAppStoreMock = vi.fn()

vi.mock('../../state/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => useAppStoreMock(selector),
}))

function renderConsole(snapshotOverrides: Partial<WorkspaceSnapshot> = {}, overrides: Record<string, unknown> = {}) {
  const snapshot: WorkspaceSnapshot = {
    ...createEmptyWorkspaceSnapshot(),
    ...snapshotOverrides,
  }

  const store = {
    snapshot,
    pendingCommand: undefined,
    operatorSilentMode: false,
    toggleOperatorSilentMode: vi.fn(),
    routeAction: vi.fn(),
    ...overrides,
  }

  useAppStoreMock.mockImplementation((selector: (state: typeof store) => unknown) => selector(store))
  return { store, ...render(<OperatorConsole />) }
}

describe('OperatorConsole', () => {
  beforeEach(() => {
    useAppStoreMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders runtime lanes and notification counts from the workspace snapshot', () => {
    renderConsole({
      sourceSyncRuns: [
        {
          id: 'source-run-1',
          sourceId: 'source-1',
          accountId: 'account-1',
          provider: 'instagram',
          tool: 'gallery-dl',
          trigger: 'manual',
          status: 'failed',
          summary: 'Instagram sync failed.',
          commandPreview: 'gallery-dl instagram',
          degradedCapabilities: [],
          startedAt: '2026-03-10T02:00:00Z',
          finishedAt: '2026-03-10T02:01:00Z',
        },
      ],
      syncPlanRuns: [
        {
          id: 'plan-run-1',
          planId: 'plan-1',
          schedulerSetId: 'set-1',
          trigger: 'scheduler',
          status: 'succeeded',
          summary: 'Scheduler sweep completed.',
          sourceCount: 2,
          startedAt: '2026-03-10T02:05:00Z',
          finishedAt: '2026-03-10T02:06:00Z',
        },
      ],
    }, {
      pendingCommand: 'run_source_sync',
    })

    expect(screen.getByText(/foreground operation/i)).toBeTruthy()
    expect(screen.getByText(/run source sync/i)).toBeTruthy()
    expect(screen.getByText(/recent source sync queue/i)).toBeTruthy()
    expect(screen.getAllByText(/scheduler sweep completed/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/plan runs/i)).toBeTruthy()
  })

  it('routes scheduler actions and toggles silent mode through the store', () => {
    const { store } = renderConsole()

    fireEvent.click(screen.getByRole('button', { name: /enable silent mode/i }))
    fireEvent.click(screen.getByRole('button', { name: /^open scheduler page$/i }))

    expect(store.toggleOperatorSilentMode).toHaveBeenCalledTimes(1)
    expect(store.routeAction).toHaveBeenCalledWith('scheduler')
  })
})
