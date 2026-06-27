import { describe, expect, it } from 'vitest'
import {
  createSourceSyncOptions,
  createTwitterSourceSyncOptions,
  DEFAULT_TWITTER_SOURCE_SYNC_OPTIONS,
  resolveTwitterSourceSyncOptions,
} from './sourceSyncOptions'

describe('twitter source sync options', () => {
  it('mirrors the SCrawler defaults', () => {
    const options = createTwitterSourceSyncOptions()
    expect(options.mediaModel).toBe(true)
    expect(options.profileModel).toBe(true)
    // Search/Likes são opcionais e vêm desligados; endpoints graphql prontos.
    expect(options.searchModel).toBe(false)
    expect(options.likesModel).toBe(false)
    expect(options.searchUseGraphqlEndpoint).toBe(true)
    expect(options.profileUseGraphqlEndpoint).toBe(true)
    expect(options.allowNonUserTweets).toBe(false)
    expect(options.downloadGifs).toBe(true)
    expect(options.gifsPrefix).toBe('GIF_')
    expect(options.useMd5Comparison).toBe(false)
    expect(options.abortOnLimit).toBe(true)
    expect(options.downloadAlreadyParsed).toBe(true)
    // TimerDisabled / TimerFirstUseTheSame
    expect(options.sleepTimerSecs).toBe(-1)
    expect(options.sleepTimerBeforeFirstSecs).toBe(-2)
    expect(options).toEqual(DEFAULT_TWITTER_SOURCE_SYNC_OPTIONS)
  })

  it('keeps provided overrides and fills the rest with defaults', () => {
    const options = createTwitterSourceSyncOptions({ mediaModel: false, sleepTimerSecs: 20, specialPath: '  F:/x  ' })
    expect(options.mediaModel).toBe(false)
    expect(options.sleepTimerSecs).toBe(20)
    // specialPath is trimmed
    expect(options.specialPath).toBe('F:/x')
    // untouched fields fall back to defaults
    expect(options.profileModel).toBe(true)
    expect(options.downloadVideos).toBe(true)
  })

  it('createSourceSyncOptions wires the twitter section for twitter sources', () => {
    const wrapped = createSourceSyncOptions('twitter')
    expect(wrapped.twitter).toBeDefined()
    expect(wrapped.instagram).toBeUndefined()
    expect(wrapped.twitter?.profileModel).toBe(true)
  })

  it('resolveTwitterSourceSyncOptions only resolves for twitter provider', () => {
    expect(resolveTwitterSourceSyncOptions('instagram', { twitter: { mediaModel: false } })).toBeUndefined()
    const resolved = resolveTwitterSourceSyncOptions('twitter', { twitter: { mediaModel: false } })
    expect(resolved?.mediaModel).toBe(false)
    expect(resolved?.profileModel).toBe(true)
  })
})
