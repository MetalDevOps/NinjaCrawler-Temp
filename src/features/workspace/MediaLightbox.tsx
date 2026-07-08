import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'

/**
 * Lightbox de mídia compartilhado entre Profile View e Single Videos. Reproduz
 * vídeo/imagem inline (via convertFileSrc, sem passar pelo path-scope do opener)
 * com navegação anterior/próximo. Fonte única de verdade do preview.
 */
export interface MediaLightboxProps {
  fileAbsPath: string
  isVideo: boolean
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  onClose: () => void
  /** Nome exibido acima da mídia (@autor do like ou handle do perfil). */
  title?: string
  /** Faixa de áudio separada para slideshows. */
  audioAbsPath?: string
  /** Ações abaixo do preview (Open online / Reveal / etc.). */
  actions?: ReactNode
}

const VIDEO_SEEK_SECONDS = 1

function isInteractiveKeyTarget(target: EventTarget | null, root: HTMLElement | null): boolean {
  if (!(target instanceof Element)) return false
  const interactive = target.closest('button, input, textarea, select, a[href], [contenteditable="true"]')
  return Boolean(interactive && root?.contains(interactive))
}

export function MediaLightbox({
  fileAbsPath,
  isVideo,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  title,
  audioAbsPath,
  actions,
}: MediaLightboxProps) {
  const lightboxRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    lightboxRef.current?.focus()
  }, [])

  useEffect(() => {
    const seekVideo = (delta: number) => {
      const video = videoRef.current
      if (!video) return false
      const duration = video.duration
      const nextTime = video.currentTime + delta
      video.currentTime = Number.isFinite(duration)
        ? Math.min(Math.max(0, nextTime), duration)
        : Math.max(0, nextTime)
      return true
    }

    const toggleFullscreen = () => {
      const video = videoRef.current
      if (!video) return false
      if (document.fullscreenElement === video) {
        const exitFullscreen = document.exitFullscreen?.()
        void exitFullscreen?.catch(() => undefined)
      } else {
        const requestFullscreen = video.requestFullscreen?.()
        void requestFullscreen?.catch(() => undefined)
      }
      return true
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isInteractiveKeyTarget(event.target, lightboxRef.current)) return

      let handled = false
      if (event.key === 'Escape') {
        onClose()
        handled = true
      } else if (event.key === 'ArrowDown') {
        if (hasNext) onNext()
        handled = true
      } else if (event.key === 'ArrowUp') {
        if (hasPrev) onPrev()
        handled = true
      } else if (event.key === 'ArrowRight' && isVideo) {
        handled = seekVideo(VIDEO_SEEK_SECONDS)
      } else if (event.key === 'ArrowLeft' && isVideo) {
        handled = seekVideo(-VIDEO_SEEK_SECONDS)
      } else if (event.key === 'Enter' && isVideo) {
        handled = toggleFullscreen()
      }

      if (handled) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [hasNext, hasPrev, isVideo, onClose, onNext, onPrev])

  return (
    <div
      className="profile-view-lightbox"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      ref={lightboxRef}
      tabIndex={-1}
    >
      <button className="profile-view-lightbox-close" onClick={onClose} type="button" aria-label="Close">
        ✕
      </button>
      {hasPrev ? (
        <button
          className="profile-view-lightbox-nav prev"
          onClick={(event) => {
            event.stopPropagation()
            onPrev()
          }}
          type="button"
          aria-label="Previous"
        >
          ◀
        </button>
      ) : null}
      <div className="profile-view-lightbox-stage" onClick={(event) => event.stopPropagation()}>
        {title ? <div className="profile-view-lightbox-title">{title}</div> : null}
        {isVideo ? (
          // TikTok-style: o vídeo repete sozinho ao terminar.
          <video ref={videoRef} src={convertFileSrc(fileAbsPath)} controls autoPlay loop />
        ) : (
          <img src={convertFileSrc(fileAbsPath)} alt="" />
        )}
        {!isVideo && audioAbsPath ? (
          <audio src={convertFileSrc(audioAbsPath)} controls autoPlay loop />
        ) : null}
        {actions ? <div className="profile-view-lightbox-actions">{actions}</div> : null}
      </div>
      {hasNext ? (
        <button
          className="profile-view-lightbox-nav next"
          onClick={(event) => {
            event.stopPropagation()
            onNext()
          }}
          type="button"
          aria-label="Next"
        >
          ▶
        </button>
      ) : null}
    </div>
  )
}
