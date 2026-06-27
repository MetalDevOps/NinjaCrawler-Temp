// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceSnapshot } from '../../domain/models'
import { createEmptyWorkspaceSnapshot } from '../../domain/workspaceSnapshot'
import { BatchEditorWindowPage } from './BatchEditorWindowPage'

const closeWindowMock = vi.hoisted(() => vi.fn())

const bridgeMocks = vi.hoisted(() => ({
  batchUpdateSourceProfiles: vi.fn(),
  loadWorkspaceSnapshot: vi.fn(),
  subscribeToBatchEditorWindowIntent: vi.fn(),
  upsertSchedulerGroup: vi.fn(),
}))

vi.mock('../../bridge/desktop', () => bridgeMocks)
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ close: closeWindowMock }),
}))

function createSnapshot(): WorkspaceSnapshot {
  const snapshot = createEmptyWorkspaceSnapshot()
  snapshot.sources = [{
    id: 'source-1',
    provider: 'instagram',
    sourceKind: 'profile',
    handle: '@source-1',
    displayName: 'source-1',
    accountId: undefined,
    groupId: undefined,
    labels: [],
    readyForDownload: true,
    syncOptions: {},
    profileImagePath: undefined,
    profileImageCustom: false,
    remoteState: 'exists',
    isSubscription: false,
    lastSyncedAt: undefined,
  }]
  return snapshot
}

describe('BatchEditorWindowPage', () => {
  beforeEach(() => {
    bridgeMocks.batchUpdateSourceProfiles.mockReset()
    bridgeMocks.loadWorkspaceSnapshot.mockReset()
    bridgeMocks.subscribeToBatchEditorWindowIntent.mockReset()
    bridgeMocks.upsertSchedulerGroup.mockReset()
    bridgeMocks.subscribeToBatchEditorWindowIntent.mockResolvedValue(() => undefined)
    closeWindowMock.mockReset()
    closeWindowMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('auto-selects a newly created group and applies it in batch payload', async () => {
    const initialSnapshot = createSnapshot()
    const snapshotWithGroup = createSnapshot()
    snapshotWithGroup.schedulerGroups = [{
      id: 'group-1',
      name: 'New Group',
      sortIndex: 0,
      criteria: {
        regular: false,
        temporary: false,
        favorite: false,
        readyForDownload: false,
        ignoreReadyForDownload: false,
        downloadUsers: false,
        downloadSubscriptions: false,
        userExists: false,
        userSuspended: false,
        userDeleted: false,
        labelsNo: false,
        labelsIncluded: [],
        labelsExcluded: [],
        ignoreExcludedLabels: false,
        sitesIncluded: [],
        sitesExcluded: [],
        groupIdsIncluded: [],
        groupIdsExcluded: [],
        groupsOnly: false,
        daysIsDownloaded: false,
        dateInRange: true,
      },
    }]

    bridgeMocks.loadWorkspaceSnapshot.mockResolvedValue(initialSnapshot)
    bridgeMocks.upsertSchedulerGroup.mockResolvedValue(snapshotWithGroup)
    bridgeMocks.batchUpdateSourceProfiles.mockResolvedValue(snapshotWithGroup)

    const view = render(<BatchEditorWindowPage initialSourceIds={['source-1']} />)

    await screen.findByText('1 profiles selected')

    const groupSelect = view.container.querySelector('.batch-editor-group-select') as HTMLSelectElement
    fireEvent.change(groupSelect, { target: { value: '__create__' } })
    fireEvent.change(screen.getByPlaceholderText('Group name'), { target: { value: 'New Group' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(bridgeMocks.upsertSchedulerGroup).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }))

    await waitFor(() => {
      expect(bridgeMocks.batchUpdateSourceProfiles).toHaveBeenCalledTimes(1)
    })

    expect(bridgeMocks.batchUpdateSourceProfiles).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceIds: ['source-1'],
        setGroupId: 'group-1',
      }),
    )
    await waitFor(() => {
      expect(closeWindowMock).toHaveBeenCalledTimes(1)
    })
  })

  it('shows an explicit error when apply fails and keeps the window open', async () => {
    const snapshot = createSnapshot()
    bridgeMocks.loadWorkspaceSnapshot.mockResolvedValue(snapshot)
    bridgeMocks.batchUpdateSourceProfiles.mockRejectedValue(new Error('boom'))

    const view = render(<BatchEditorWindowPage initialSourceIds={['source-1']} />)

    await screen.findByText('1 profiles selected')

    const groupSelect = view.container.querySelector('.batch-editor-group-select') as HTMLSelectElement
    fireEvent.change(groupSelect, { target: { value: '__clear__' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to apply changes: boom')).toBeTruthy()
    })
    expect(closeWindowMock).not.toHaveBeenCalled()
  })
})
