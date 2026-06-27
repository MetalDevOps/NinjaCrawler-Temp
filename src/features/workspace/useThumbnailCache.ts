import { useEffect, useState } from 'react'
import { getPreloadProgress, subscribeToPreloadProgress } from './thumbnailCache'

export interface ThumbnailPreloadState {
  completed: number
  total: number
  done: boolean
}

export function useThumbnailPreloadProgress(): ThumbnailPreloadState {
  const [state, setState] = useState<ThumbnailPreloadState>(getPreloadProgress)

  useEffect(() => {
    return subscribeToPreloadProgress((completed, total, done) => {
      setState({ completed, total, done })
    })
  }, [])

  return state
}
