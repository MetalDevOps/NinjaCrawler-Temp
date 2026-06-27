import type { AppSection } from '../../appSections'

const SECTION_ALIASES: Record<string, AppSection> = {
  account: 'accounts',
  accounts: 'accounts',
  auth: 'accounts',
  notification: 'scheduler',
  notifications: 'scheduler',
  plan: 'scheduler',
  plans: 'scheduler',
  scheduler: 'scheduler',
  schedulers: 'scheduler',
  setting: 'settings',
  settings: 'settings',
  source: 'sources',
  sources: 'sources',
  sync: 'sources',
}

function normalizeRouteToken(actionRoute?: string): string | undefined {
  if (!actionRoute) {
    return undefined
  }

  const trimmed = actionRoute.trim().toLowerCase()
  if (trimmed.length === 0) {
    return undefined
  }

  return trimmed.split(/[/?#:]/, 1)[0]
}

export function resolveAppSectionFromActionRoute(actionRoute?: string): AppSection | undefined {
  const token = normalizeRouteToken(actionRoute)
  return token ? SECTION_ALIASES[token] : undefined
}
