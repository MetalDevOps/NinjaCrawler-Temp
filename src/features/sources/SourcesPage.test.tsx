// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProviderAccountEditor,
  SourceProfileUpsert,
  WorkspaceSnapshot,
} from '../../domain/models'
import { createEmptyWorkspaceSnapshot } from '../../domain/workspaceSnapshot'
import { SourcesPage } from './SourcesPage'

const useAppStoreMock = vi.fn()
const bridgeMocks = vi.hoisted(() => ({
  enqueueSourceDelete: vi.fn(),
}))

vi.mock('../../state/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => useAppStoreMock(selector),
}))
vi.mock('../../bridge/desktop', () => bridgeMocks)

function renderPage(snapshotOverrides: Partial<WorkspaceSnapshot> = {}) {
  const snapshot: WorkspaceSnapshot = {
    ...createEmptyWorkspaceSnapshot(),
    ...snapshotOverrides,
  }

  const store = {
    snapshot,
    pendingCommand: undefined,
    upsertSourceProfile: vi.fn<(draft: SourceProfileUpsert) => Promise<WorkspaceSnapshot>>(),
    loadProviderAccountEditor: vi.fn<(accountId: string) => Promise<ProviderAccountEditor>>(async (accountId: string) => ({
      account: snapshot.accounts.find((account) => account.id === accountId)!,
      session: null,
      settings: [],
    })),
    runSourceSync: vi.fn<(id: string) => Promise<WorkspaceSnapshot>>(),
  }

  useAppStoreMock.mockImplementation((selector: (state: typeof store) => unknown) => selector(store))
  return { store, ...render(<SourcesPage />) }
}

describe('SourcesPage', () => {
  beforeEach(() => {
    useAppStoreMock.mockReset()
    bridgeMocks.enqueueSourceDelete.mockReset()
    bridgeMocks.enqueueSourceDelete.mockResolvedValue({
      queuedCount: 1,
      runningCount: 0,
      completedCount: 0,
      failedCount: 0,
      totalCount: 1,
      queuedItems: [],
      runningItems: [],
      recentResults: [],
      updatedAt: '2026-03-14T00:00:00Z',
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps source submission disabled until an explicit account binding exists', () => {
    renderPage({
      accounts: [
        {
          id: 'account-1',
          provider: 'instagram',
          displayName: 'Instagram Main',
          authMode: 'imported_session',
          authState: 'ready',
          capabilities: ['posts'],
          lastValidatedAt: '2026-03-10T00:00:00Z',
        },
      ],
    })

    const submitButton = screen.getByRole('button', { name: /create source/i }) as HTMLButtonElement
    const handleInput = screen.getByLabelText(/handle/i) as HTMLInputElement
    const accountSelect = screen.getByLabelText(/bound account/i) as HTMLSelectElement

    expect(submitButton.disabled).toBe(true)

    fireEvent.change(handleInput, { target: { value: '@visual_lab' } })
    expect(submitButton.disabled).toBe(true)

    fireEvent.change(accountSelect, { target: { value: 'account-1' } })
    expect(submitButton.disabled).toBe(false)
  })

  it('surfaces the missing-account state when the selected provider has no accounts', () => {
    renderPage()

    const submitButton = screen.getByRole('button', { name: /create source/i }) as HTMLButtonElement

    expect(submitButton.disabled).toBe(true)
    expect(
      screen.getByText((_, element) =>
        element?.textContent === 'Create a instagram account before creating sources for this provider.',
      ),
    ).toBeTruthy()
  })

  it('surfaces manual sync controls and recent run history for the selected source', () => {
    renderPage({
      accounts: [
        {
          id: 'account-1',
          provider: 'instagram',
          displayName: 'Instagram Main',
          authMode: 'imported_session',
          authState: 'ready',
          capabilities: ['posts', 'saved_posts'],
          lastValidatedAt: '2026-03-10T00:00:00Z',
        },
      ],
      sources: [
        {
          id: 'source-1',
          provider: 'instagram',
          sourceKind: 'profile',
          handle: '@visual_lab',
          displayName: 'visual_lab',
          accountId: 'account-1',
          labels: ['priority'],
          readyForDownload: true,
          remoteState: 'exists',
          isSubscription: false,
          profileImageCustom: false,
        },
      ],
      sourceSyncRuns: [
        {
          id: 'run-1',
          sourceId: 'source-1',
          accountId: 'account-1',
          provider: 'instagram',
          tool: 'gallery-dl',
          trigger: 'manual',
          status: 'succeeded',
          summary: 'Simulated connector sync succeeded.',
          commandPreview: 'gallery-dl --simulate https://www.instagram.com/visual_lab/',
          degradedCapabilities: ['saved_posts'],
          startedAt: '2026-03-10T00:00:00Z',
          finishedAt: '2026-03-10T00:00:03Z',
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: /visual_lab/i }))

    expect(screen.getByRole('button', { name: /run source sync/i })).toBeTruthy()
    expect(screen.getByText(/simulated connector sync succeeded/i)).toBeTruthy()
    expect(screen.getByText(/saved_posts/i)).toBeTruthy()
  })

  it('routes delete confirmation to delete mode with media', async () => {
    renderPage({
      accounts: [
        {
          id: 'account-1',
          provider: 'instagram',
          displayName: 'Instagram Main',
          authMode: 'imported_session',
          authState: 'ready',
          capabilities: ['posts', 'saved_posts'],
          lastValidatedAt: '2026-03-10T00:00:00Z',
        },
      ],
      sources: [
        {
          id: 'source-1',
          provider: 'instagram',
          sourceKind: 'profile',
          handle: '@visual_lab',
          displayName: 'visual_lab',
          accountId: 'account-1',
          labels: ['priority'],
          readyForDownload: true,
          remoteState: 'exists',
          isSubscription: false,
          profileImageCustom: false,
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: /visual_lab/i }))
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    const deleteDialog = screen.getByRole('dialog', { name: /delete profile/i })
    fireEvent.click(within(deleteDialog).getByRole('button', { name: /^delete$/i }))

    await waitFor(() => {
      expect(bridgeMocks.enqueueSourceDelete).toHaveBeenCalledWith('source-1', 'with_media')
    })
  })

  it('applies account source defaults when creating a new source', async () => {
    const { store } = renderPage({
      accounts: [
        {
          id: 'account-1',
          provider: 'instagram',
          displayName: 'Instagram Main',
          authMode: 'imported_session',
          authState: 'ready',
          capabilities: ['posts', 'stories'],
          lastValidatedAt: '2026-03-10T00:00:00Z',
        },
      ],
    })

    store.upsertSourceProfile.mockResolvedValue({
      ...createEmptyWorkspaceSnapshot(),
      accounts: [
        {
          id: 'account-1',
          provider: 'instagram',
          displayName: 'Instagram Main',
          authMode: 'imported_session',
          authState: 'ready',
          capabilities: ['posts', 'stories'],
          lastValidatedAt: '2026-03-10T00:00:00Z',
        },
      ],
      sources: [
        {
          id: 'source-1',
          provider: 'instagram',
          sourceKind: 'profile',
          handle: '@stories_only',
          displayName: 'stories_only',
          accountId: 'account-1',
          labels: ['priority', 'stories'],
          readyForDownload: true,
          remoteState: 'exists',
          isSubscription: false,
          syncOptions: {
            instagram: {
              timeline: false,
              reels: false,
              stories: true,
              storiesUser: true,
              tagged: false,
            },
          },
          profileImageCustom: false,
        },
      ],
    })

    store.loadProviderAccountEditor.mockResolvedValue({
      account: {
        id: 'account-1',
        provider: 'instagram',
        displayName: 'Instagram Main',
        authMode: 'imported_session',
        authState: 'ready',
        capabilities: ['posts', 'stories'],
        lastValidatedAt: '2026-03-10T00:00:00Z',
      },
      session: null,
      settings: [
        { settingKey: 'instagram.defaults.labels', valueKind: 'string', stringValue: 'priority, stories' },
        { settingKey: 'instagram.defaults.downloadTimeline', valueKind: 'string', stringValue: 'false' },
        { settingKey: 'instagram.defaults.downloadStories', valueKind: 'string', stringValue: 'true' },
        { settingKey: 'instagram.defaults.downloadStoriesUser', valueKind: 'string', stringValue: 'true' },
      ],
    })

    fireEvent.change(screen.getByLabelText(/bound account/i), { target: { value: 'account-1' } })
    fireEvent.change(screen.getByLabelText(/handle/i), { target: { value: '@stories_only' } })

    await waitFor(() => {
      expect(screen.getByDisplayValue('priority, stories')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /create source/i }))

    await waitFor(() => {
      expect(store.upsertSourceProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['priority', 'stories'],
          syncOptions: {
            instagram: expect.objectContaining({
              timeline: false,
              stories: true,
              storiesUser: true,
            }),
          },
        }),
      )
    })
  })
})
