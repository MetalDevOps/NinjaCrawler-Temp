// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaLightbox } from './MediaLightbox'

vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => `asset://${path}` }))

function renderVideoLightbox(overrides: Partial<Parameters<typeof MediaLightbox>[0]> = {}) {
  const props = {
    fileAbsPath: 'S:/clip.mp4',
    isVideo: true,
    hasPrev: true,
    hasNext: true,
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  const result = render(<MediaLightbox {...props} />)
  const video = result.container.querySelector('video')
  if (!video) throw new Error('expected lightbox video')
  return { ...result, props, video }
}

function setVideoDuration(video: HTMLVideoElement, duration: number) {
  Object.defineProperty(video, 'duration', { configurable: true, value: duration })
}

describe('MediaLightbox', () => {
  afterEach(() => cleanup())

  it('uses vertical arrows to move through visible media', () => {
    const { props } = renderVideoLightbox()

    fireEvent.keyDown(document, { key: 'ArrowDown' })
    fireEvent.keyDown(document, { key: 'ArrowUp' })

    expect(props.onNext).toHaveBeenCalledTimes(1)
    expect(props.onPrev).toHaveBeenCalledTimes(1)
  })

  it('focuses the dialog on mount so shortcuts work after opening from a button', async () => {
    render(<button type="button">Open preview</button>)
    screen.getByRole('button', { name: 'Open preview' }).focus()
    const { props } = renderVideoLightbox()
    const dialog = screen.getByRole('dialog')

    await waitFor(() => expect(document.activeElement).toBe(dialog))
    fireEvent.keyDown(dialog, { key: 'ArrowDown' })

    expect(props.onNext).toHaveBeenCalledTimes(1)
  })

  it('seeks short videos by one second with horizontal arrows and clamps to duration', () => {
    const { video } = renderVideoLightbox()
    setVideoDuration(video, 10)

    video.currentTime = 5
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(video.currentTime).toBe(6)

    video.currentTime = 9.75
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(video.currentTime).toBe(10)

    video.currentTime = 0.25
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(video.currentTime).toBe(0)
  })

  it('toggles fullscreen for the active video with Enter', () => {
    const { video } = renderVideoLightbox()
    const requestFullscreen = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(video, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })

    fireEvent.keyDown(document, { key: 'Enter' })

    expect(requestFullscreen).toHaveBeenCalledTimes(1)
  })

  it('closes with Escape', () => {
    const { props } = renderVideoLightbox()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores player shortcuts from interactive controls', () => {
    const { props } = renderVideoLightbox({
      actions: <button type="button">Keep focus</button>,
    })
    const button = screen.getByRole('button', { name: 'Keep focus' })

    fireEvent.keyDown(button, { key: 'ArrowDown' })

    expect(props.onNext).not.toHaveBeenCalled()
  })
})
