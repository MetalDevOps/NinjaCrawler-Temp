// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceMediaGallery } from '../../domain/models'
import { ProfileViewPage } from './ProfileViewPage'

const bridgeMocks = vi.hoisted(() => ({
  loadSourceMediaGallery: vi.fn(),
  loadWorkspaceSnapshot: vi.fn(),
  openExternalTarget: vi.fn(),
  openMediaFile: vi.fn(),
  revealMediaInFolder: vi.fn(),
  subscribeToProfileViewSource: vi.fn(),
}))

vi.mock('../../bridge/desktop', () => bridgeMocks)
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => `asset://${path}` }))

function galleryFixture(): SourceMediaGallery {
  // 2026-05-19 ~ capturedAt
  const day = Math.floor(Date.parse('2026-05-19T12:00:00Z') / 1000)
  return {
    sourceId: 'src-1',
    provider: 'tiktok',
    handle: 'gaaby.tls',
    profileUrl: 'https://www.tiktok.com/gaaby.tls',
    posts: [
      {
        postId: '7624199329925958920',
        postUrl: 'https://www.tiktok.com/@gaaby.tls/video/7624199329925958920',
        capturedAt: day,
        mediaType: 'video',
        section: 'timeline',
        files: [
          { relativePath: 'a.mp4', absolutePath: 'S:/x/a.mp4', mediaType: 'video' },
        ],
      },
      {
        postId: '7600000000000000000',
        postUrl: 'https://www.tiktok.com/@gaaby.tls/video/7600000000000000000',
        capturedAt: day - 60,
        mediaType: 'slideshow',
        section: 'timeline',
        files: [
          { relativePath: 'b_0.jpeg', absolutePath: 'S:/x/b_0.jpeg', mediaType: 'image' },
          { relativePath: 'b_1.jpeg', absolutePath: 'S:/x/b_1.jpeg', mediaType: 'image' },
        ],
      },
    ],
  }
}

describe('ProfileViewPage', () => {
  beforeEach(() => {
    for (const mock of Object.values(bridgeMocks)) {
      mock.mockReset()
    }
    bridgeMocks.loadSourceMediaGallery.mockResolvedValue(galleryFixture())
    bridgeMocks.loadWorkspaceSnapshot.mockResolvedValue({ sources: [] })
    bridgeMocks.subscribeToProfileViewSource.mockResolvedValue(() => undefined)
    bridgeMocks.openExternalTarget.mockResolvedValue(undefined)
  })

  afterEach(() => cleanup())

  it('renders the profile header and a day section with posts', async () => {
    render(<ProfileViewPage initialSourceId="src-1" />)

    expect(await screen.findByRole('heading', { name: /gaaby\.tls/i })).toBeTruthy()
    await waitFor(() => expect(bridgeMocks.loadSourceMediaGallery).toHaveBeenCalledWith('src-1'))
    // 2 posts on the same day → one day section, slideshow badge present
    expect(screen.getByText('▣ 2')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /open preview/i }).length).toBe(2)
  })

  it('opens the original post link online', async () => {
    render(<ProfileViewPage initialSourceId="src-1" />)
    const onlineButtons = await screen.findAllByRole('button', { name: 'Online' })
    fireEvent.click(onlineButtons[0])
    await waitFor(() => {
      expect(bridgeMocks.openExternalTarget).toHaveBeenCalledWith(
        'https://www.tiktok.com/@gaaby.tls/video/7624199329925958920',
      )
    })
  })

  it('opens the lightbox when a thumbnail is clicked', async () => {
    render(<ProfileViewPage initialSourceId="src-1" />)
    const thumbs = await screen.findAllByRole('button', { name: /open preview/i })
    fireEvent.click(thumbs[0])
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /open online/i })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: /reveal in folder/i })).toBeTruthy()
  })
})
