import { createSourceSyncOptions } from '../../domain/sourceSyncOptions'
import type { ProviderKey, SourceProfile, SourceProfileUpsert } from '../../domain/models'

export function parseCommaSeparated(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  )
}

export function createSourceDraft(provider: ProviderKey = 'instagram'): SourceProfileUpsert {
  return {
    provider,
    sourceKind: 'profile',
    handle: '',
    displayName: '',
    accountId: null,
    labels: [],
    readyForDownload: true,
    syncOptions: createSourceSyncOptions(provider),
  }
}

export function mapSourceToDraft(source: SourceProfile): SourceProfileUpsert {
  return {
    id: source.id,
    provider: source.provider,
    sourceKind: source.sourceKind,
    handle: source.handle,
    displayName: source.displayName,
    accountId: source.accountId ?? null,
    groupId: source.groupId ?? null,
    labels: [...source.labels],
    readyForDownload: source.readyForDownload,
    syncOptions: createSourceSyncOptions(source.provider, source.syncOptions),
  }
}

export function getSourceDisplayName(handle: string, displayName?: string): string {
  const trimmedDisplayName = displayName?.trim()
  if (trimmedDisplayName) {
    return trimmedDisplayName
  }

  return handle.trim().replace(/^[@/]+/, '')
}
