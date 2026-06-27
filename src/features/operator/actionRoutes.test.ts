import { describe, expect, it } from 'vitest'
import { resolveAppSectionFromActionRoute } from './actionRoutes'

describe('resolveAppSectionFromActionRoute', () => {
  it('maps simple section routes', () => {
    expect(resolveAppSectionFromActionRoute('scheduler')).toBe('scheduler')
    expect(resolveAppSectionFromActionRoute('sources')).toBe('sources')
    expect(resolveAppSectionFromActionRoute('accounts')).toBe('accounts')
  })

  it('maps aliased and nested routes', () => {
    expect(resolveAppSectionFromActionRoute('plan:run-1')).toBe('scheduler')
    expect(resolveAppSectionFromActionRoute('account/session-1')).toBe('accounts')
  })

  it('returns undefined for empty or unknown routes', () => {
    expect(resolveAppSectionFromActionRoute('')).toBeUndefined()
    expect(resolveAppSectionFromActionRoute('unknown-route')).toBeUndefined()
    expect(resolveAppSectionFromActionRoute(undefined)).toBeUndefined()
  })
})
