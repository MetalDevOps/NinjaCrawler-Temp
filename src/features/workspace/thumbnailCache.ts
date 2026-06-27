import { convertFileSrc } from '@tauri-apps/api/core'
import type { SourceProfile } from '../../domain/models'

// ----- Module-level state -----

/** Map from cacheKey to blob URL */
const cache = new Map<string, string>()

/** Map from sourceId to cacheKey (for targeted invalidation) */
const sourceKeyIndex = new Map<string, string>()

/** Preload progress tracking */
let preloadTotal = 0
let preloadCompleted = 0
let preloadInProgress = false
let preloadGeneration = 0

type ProgressListener = (completed: number, total: number, done: boolean) => void
const progressListeners = new Set<ProgressListener>()

// ----- Cache key computation -----

function computeCacheKey(source: SourceProfile): string | undefined {
  const filePath = source.profileImagePath
  if (!filePath) return undefined
  const version = source.profileImageCustom
    ? 'custom'
    : (source.lastSyncedAt ?? 'none')
  return `${filePath}::${version}`
}

function toAssetUrl(filePath: string): string | undefined {
  if (typeof window === 'undefined') return undefined
  const tauriInternals = (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  if (!tauriInternals) return undefined
  try {
    return convertFileSrc(filePath)
  } catch {
    return undefined
  }
}

// ----- Public API -----

/**
 * Get either the cached blob URL or fall back to the asset protocol URL.
 * This is the primary function used during render.
 */
export function getPreviewSource(source: SourceProfile): string | undefined {
  const key = computeCacheKey(source)
  if (!key) return undefined
  return cache.get(key)
}

/**
 * Preload all thumbnails from a list of sources.
 * Fetches in controlled batches to avoid overwhelming IO.
 * Skips entries already cached. Cleans up stale entries.
 */
export async function preloadAllThumbnails(
  sources: SourceProfile[],
  batchSize = 6,
): Promise<void> {
  const generation = ++preloadGeneration

  // Clean up stale cache entries
  const currentKeys = new Set<string>()
  for (const source of sources) {
    const key = computeCacheKey(source)
    if (key) currentKeys.add(key)
  }
  for (const [key, url] of cache.entries()) {
    if (!currentKeys.has(key)) {
      URL.revokeObjectURL(url)
      cache.delete(key)
    }
  }

  // Identify sources that need loading
  const toLoad: Array<{ source: SourceProfile; key: string; assetUrl: string }> = []

  for (const source of sources) {
    const key = computeCacheKey(source)
    if (!key) continue
    if (cache.has(key)) {
      sourceKeyIndex.set(source.id, key)
      continue
    }

    const assetUrl = toAssetUrl(source.profileImagePath!)
    if (assetUrl) {
      toLoad.push({ source, key, assetUrl })
    }
  }

  if (toLoad.length === 0) {
    notifyProgress(0, 0, true)
    return
  }

  preloadTotal = toLoad.length
  preloadCompleted = 0
  preloadInProgress = true
  notifyProgress(0, preloadTotal, false)

  // Process in small batches with UI-yielding pauses between them
  for (let i = 0; i < toLoad.length; i += batchSize) {
    if (generation !== preloadGeneration) return

    // Yield to the event loop so the UI stays responsive between batches
    await new Promise<void>((resolve) => { setTimeout(resolve, 0) })

    const batch = toLoad.slice(i, i + batchSize)
    await Promise.allSettled(
      batch.map(async ({ source, key, assetUrl }) => {
        try {
          const response = await fetch(assetUrl)
          if (!response.ok) return
          const blob = await response.blob()
          const blobUrl = URL.createObjectURL(blob)

          if (generation !== preloadGeneration) {
            URL.revokeObjectURL(blobUrl)
            return
          }

          cache.set(key, blobUrl)
          sourceKeyIndex.set(source.id, key)
        } catch {
          // Silently skip failed loads
        }
      }),
    )

    preloadCompleted += batch.length
    notifyProgress(preloadCompleted, preloadTotal, preloadCompleted >= preloadTotal)
  }

  preloadInProgress = false
}

/**
 * Invalidate a single source's cached thumbnail.
 * Called after pickSourceProfileImage or resetSourceProfileImage.
 */
export function invalidateSource(sourceId: string): void {
  const oldKey = sourceKeyIndex.get(sourceId)
  if (oldKey) {
    const oldUrl = cache.get(oldKey)
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl)
      cache.delete(oldKey)
    }
    sourceKeyIndex.delete(sourceId)
  }
}

/**
 * Invalidate the entire cache. Called on app close.
 */
export function invalidateAll(): void {
  preloadGeneration++
  for (const blobUrl of cache.values()) {
    URL.revokeObjectURL(blobUrl)
  }
  cache.clear()
  sourceKeyIndex.clear()
  preloadTotal = 0
  preloadCompleted = 0
  preloadInProgress = false
}

/**
 * Get current preload progress.
 */
export function getPreloadProgress(): { completed: number; total: number; done: boolean } {
  return {
    completed: preloadCompleted,
    total: preloadTotal,
    done: !preloadInProgress,
  }
}

/**
 * Subscribe to preload progress updates.
 */
export function subscribeToPreloadProgress(listener: ProgressListener): () => void {
  progressListeners.add(listener)
  return () => { progressListeners.delete(listener) }
}

function notifyProgress(completed: number, total: number, done: boolean): void {
  for (const listener of progressListeners) {
    listener(completed, total, done)
  }
}
