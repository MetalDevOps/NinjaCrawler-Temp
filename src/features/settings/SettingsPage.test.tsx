// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceSnapshot } from '../../domain/models'
import { createEmptyWorkspaceSnapshot } from '../../domain/workspaceSnapshot'
import { SettingsPage } from './SettingsPage'

const useAppStoreMock = vi.fn()

vi.mock('../../state/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => useAppStoreMock(selector),
}))

function renderPage(snapshotOverrides: Partial<WorkspaceSnapshot> = {}) {
  const snapshot: WorkspaceSnapshot = {
    ...createEmptyWorkspaceSnapshot(),
    ...snapshotOverrides,
  }

  const store = {
    snapshot,
    pendingCommand: undefined,
    upsertAppSetting: vi.fn(),
  }

  useAppStoreMock.mockImplementation((selector: (state: typeof store) => unknown) => selector(store))
  return { store, ...render(<SettingsPage />) }
}

describe('SettingsPage', () => {
  beforeEach(() => {
    useAppStoreMock.mockReset()
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    cleanup()
  })

  it('uses category navigation and filters internal settings', () => {
    renderPage({
      appSettings: [
        {
          key: 'runtime.scheduler.launch_at',
          value: '2026-03-12T00:00:00Z',
          category: 'general',
          description: 'Internal timestamp.',
          mutable: true,
        },
        {
          key: 'policy.desktop.close_to_tray',
          value: 'true',
          category: 'policy',
          description: 'Close to tray instead of exiting.',
          mutable: true,
        },
      ],
    })

    const generalTab = screen.getByRole('tab', { name: /general/i })
    const policyTab = screen.getByRole('tab', { name: /policy/i })

    expect(screen.queryByText(/connector runtimes/i)).toBeNull()
    expect(generalTab.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel', { name: /general/i })).not.toBeNull()

    // runtime.* settings are filtered out
    expect(screen.queryByDisplayValue('2026-03-12T00:00:00Z')).toBeNull()

    fireEvent.click(policyTab)

    expect(policyTab.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel', { name: /policy/i })).not.toBeNull()
    // Boolean setting renders as checkbox toggle, not text input
    expect(screen.getByRole('checkbox', { name: 'policy.desktop.close_to_tray' })).not.toBeNull()
  })

  it('saves enum settings immediately on select change', () => {
    const { store } = renderPage({
      appSettings: [
        {
          key: 'policy.notifications.default',
          value: 'summary',
          category: 'policy',
          description: 'Default post-run notification mode for scheduler plans.',
          mutable: true,
        },
      ],
    })

    fireEvent.click(screen.getByRole('tab', { name: /policy/i }))

    fireEvent.change(screen.getByLabelText('policy.notifications.default'), {
      target: { value: 'detailed' },
    })

    expect(store.upsertAppSetting).toHaveBeenCalledWith({
      key: 'policy.notifications.default',
      value: 'detailed',
      category: 'policy',
      description: 'Default post-run notification mode for scheduler plans.',
      mutable: true,
    })
  })

  it('toggles dark mode from the theme card in General', () => {
    renderPage()

    const toggle = screen.getByRole('checkbox', { name: 'appearance.theme' })
    fireEvent.click(toggle)

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('nc-theme')).toBe('dark')
  })
})
