// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROVIDER_CATALOG } from '../../domain/defaults'
import type { ProviderAccount } from '../../domain/models'
import { ToolbarAddMenu } from './ToolbarAddMenu'

const ACCOUNTS: ProviderAccount[] = [
  {
    id: 'account-1',
    provider: 'instagram',
    displayName: 'Instagram Main',
    authMode: 'imported_session',
    authState: 'ready',
    capabilities: ['posts'],
    lastValidatedAt: '2026-03-10T00:00:00Z',
  },
  {
    id: 'account-2',
    provider: 'tiktok',
    displayName: 'TikTok Main',
    authMode: 'imported_session',
    authState: 'ready',
    capabilities: ['videos'],
    lastValidatedAt: '2026-03-10T00:00:00Z',
  },
]

describe('ToolbarAddMenu', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps +Add focused on profile creation only', () => {
    const onAddProfile = vi.fn()

    render(
      <ToolbarAddMenu
        accounts={ACCOUNTS}
        onAddProfile={onAddProfile}
        providerCatalog={DEFAULT_PROVIDER_CATALOG}
      />,
    )

    fireEvent.mouseEnter(screen.getByRole('button', { name: /tiktok/i }))
    fireEvent.click(screen.getByRole('button', { name: /tiktok main/i }))
    fireEvent.click(screen.getByRole('button', { name: /^add new profile$/i }))

    expect(onAddProfile).toHaveBeenCalledWith('account-2')
    expect(screen.queryByRole('button', { name: /new account/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /edit account/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /advanced settings/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /clone account/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull()
  })
})
