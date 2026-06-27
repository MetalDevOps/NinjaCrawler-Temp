import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { enqueueSourceDelete } from '../../bridge/desktop'
import { DEFAULT_PROVIDER_CATALOG } from '../../domain/defaults'
import type {
  ProviderAccount,
  ProviderKey,
  SourceProfile,
  SourceProfileDeleteMode,
  SourceProfileUpsert,
  SourceSyncRun,
} from '../../domain/models'
import { useAppStore } from '../../state/appStore'
import { buildProviderAccountSettingsDraft, extractSourceDefaultsFromAccountSettings } from '../accounts/providerAccountSettings'
import { isBlockingSyncProblem, syncProblemBadgeLabel } from '../workspace/syncProblemBadges'
import { formatSourceHandleLabel } from '../workspace/workspaceProfiles'
import { SourceDeleteConfirmDialog } from './SourceDeleteConfirmDialog'
import {
  createSourceDraft,
  getSourceDisplayName,
  mapSourceToDraft,
  parseCommaSeparated,
} from './sourceDrafts'

const EMPTY_SOURCES: SourceProfile[] = []
const EMPTY_ACCOUNTS: ProviderAccount[] = []
const EMPTY_SOURCE_SYNC_RUNS: SourceSyncRun[] = []

export function SourcesPage() {
  const snapshot = useAppStore((state) => state.snapshot)
  const pendingCommand = useAppStore((state) => state.pendingCommand)
  const upsertSourceProfile = useAppStore((state) => state.upsertSourceProfile)
  const loadProviderAccountEditor = useAppStore((state) => state.loadProviderAccountEditor)
  const runSourceSync = useAppStore((state) => state.runSourceSync)

  const sources = snapshot?.sources ?? EMPTY_SOURCES
  const accounts = snapshot?.accounts ?? EMPTY_ACCOUNTS
  const sourceSyncRuns = snapshot?.sourceSyncRuns ?? EMPTY_SOURCE_SYNC_RUNS
  const providerCatalog = snapshot?.providerCatalog ?? DEFAULT_PROVIDER_CATALOG

  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [deleteDialogSourceId, setDeleteDialogSourceId] = useState<string | undefined>()
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [draft, setDraft] = useState<SourceProfileUpsert>(() => createSourceDraft())
  const [labelsText, setLabelsText] = useState('')
  const appliedDefaultsAccountId = useRef<string | undefined>(undefined)

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedId),
    [selectedId, sources],
  )
  const deleteDialogSource = useMemo(
    () => sources.find((source) => source.id === deleteDialogSourceId),
    [deleteDialogSourceId, sources],
  )
  const availableAccounts = useMemo(
    () => accounts.filter((account) => account.provider === draft.provider),
    [accounts, draft.provider],
  )
  const selectedSourceRuns = useMemo(
    () =>
      selectedSource
        ? sourceSyncRuns.filter((run) => run.sourceId === selectedSource.id)
        : EMPTY_SOURCE_SYNC_RUNS,
    [selectedSource, sourceSyncRuns],
  )

  function resetForm(nextProvider?: ProviderKey) {
    setSelectedId(undefined)
    appliedDefaultsAccountId.current = undefined
    setDraft(createSourceDraft(nextProvider ?? draft.provider))
    setLabelsText('')
  }

  function selectSource(source: SourceProfile) {
    appliedDefaultsAccountId.current = source.accountId ?? undefined
    const nextDraft = mapSourceToDraft(source)
    setSelectedId(source.id)
    setDraft(nextDraft)
    setLabelsText(nextDraft.labels.join(', '))
  }

  useEffect(() => {
    if (selectedId || draft.id || !draft.accountId || appliedDefaultsAccountId.current === draft.accountId) {
      return
    }

    const accountId = draft.accountId
    let disposed = false

    void loadProviderAccountEditor(accountId)
      .then((editor) => {
        if (disposed) {
          return
        }

        const accountDefaults = extractSourceDefaultsFromAccountSettings(
          editor.account.provider,
          buildProviderAccountSettingsDraft(editor.account.provider, editor.settings),
        )

        setDraft((current) => ({
          ...current,
          readyForDownload: accountDefaults.readyForDownload ?? current.readyForDownload,
          syncOptions: accountDefaults.syncOptions ?? current.syncOptions,
        }))

        if (accountDefaults.labels.length > 0) {
          setLabelsText(accountDefaults.labels.join(', '))
        }

        appliedDefaultsAccountId.current = accountId
      })
      .catch(() => undefined)

    return () => {
      disposed = true
    }
  }, [draft.accountId, draft.id, loadProviderAccountEditor, selectedId])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!draft.accountId) {
      return
    }

    const payload: SourceProfileUpsert = {
      ...draft,
      handle: draft.handle.trim(),
      displayName: getSourceDisplayName(draft.handle, draft.displayName),
      accountId: draft.accountId,
      labels: parseCommaSeparated(labelsText),
    }
    const savedSnapshot = await upsertSourceProfile(payload)

    if (payload.id) {
      const savedSource = savedSnapshot.sources.find((source) => source.id === payload.id)
      if (savedSource) {
        selectSource(savedSource)
        return
      }
    }

    resetForm(payload.provider)
  }

  function handleDelete() {
    if (!selectedSource) {
      return
    }

    setDeleteDialogSourceId(selectedSource.id)
  }

  async function handleConfirmDelete(mode: SourceProfileDeleteMode) {
    if (!deleteDialogSource || deleteSubmitting) {
      return
    }

    setDeleteSubmitting(true)
    try {
      await enqueueSourceDelete(deleteDialogSource.id, mode)
      resetForm(deleteDialogSource.provider)
      setDeleteDialogSourceId(undefined)
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : String(deleteError)
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(`Failed to queue profile delete.\n${message}`)
      }
    } finally {
      setDeleteSubmitting(false)
    }
  }

  async function handleRunSourceSync() {
    if (!selectedSource) {
      return
    }

    await runSourceSync(selectedSource.id)
  }

  const readyCount = sources.filter((source) => source.readyForDownload).length
  const invalidBindingCount = sources.filter((source) => !source.accountId).length
  const syncProblemCount = sources.filter((source) => isBlockingSyncProblem(source.syncProblemCode)).length
  const canSubmit = Boolean(draft.accountId) && draft.handle.trim().length > 0 && availableAccounts.length > 0

  return (
    <div className="sources-workspace">
      <section className="panel panel-accent source-roster-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Sources</p>
            <h2>Roster</h2>
          </div>
          <span className="pill">{sources.length} sources</span>
        </div>

        <div className="source-roster-strip stat-grid compact-grid">
          <article className="stat-card">
            <span>Ready</span>
            <strong>{readyCount}</strong>
            <small>sources marked for sync</small>
          </article>
          <article className="stat-card muted-card">
            <span>Missing account</span>
            <strong>{invalidBindingCount}</strong>
            <small>records still missing binding</small>
          </article>
          <article className="stat-card muted-card">
            <span>Sync issues</span>
            <strong>{syncProblemCount}</strong>
            <small>sources with sync blockers</small>
          </article>
          <article className="stat-card">
            <span>Provider accounts</span>
            <strong>{availableAccounts.length}</strong>
            <small>usable for {draft.provider}</small>
          </article>
        </div>

        <div className="source-directory-note inline-note">Sources require a bound account before creation.</div>

        <div className="entity-list source-roster-list">
          {sources.length > 0 ? (
            sources.map((source) => (
              <button
                key={source.id}
                className={source.id === selectedId ? 'entity-card entity-card-active' : 'entity-card'}
                onClick={() => selectSource(source)}
                type="button"
              >
                <div>
                  <strong>{formatSourceHandleLabel(source.handle)}</strong>
                  <p>
                    {source.provider} · {source.displayName}
                  </p>
                </div>
                <div className="entity-card-meta">
                  <span className={source.readyForDownload ? 'status status-ready' : 'status status-degraded'}>
                    {source.readyForDownload ? 'ready' : 'paused'}
                  </span>
                  {source.syncProblemCode ? (
                    <span className="status status-degraded" title={source.syncProblemMessage ?? source.syncProblemCode}>
                      {syncProblemBadgeLabel(source.syncProblemCode)}
                    </span>
                  ) : null}
                  <small>{source.accountId ?? 'unbound'}</small>
                </div>
              </button>
            ))
          ) : (
            <div className="empty-state">No sources yet. Create the first bound profile in the inspector lane.</div>
          )}
        </div>
      </section>

      <section className="panel source-editor-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Inspector</p>
            <h2>{selectedSource ? 'Edit source' : 'Create source'}</h2>
          </div>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span>Provider</span>
            <select
              value={draft.provider}
              onChange={(event) => {
                const nextProvider = event.target.value as ProviderKey
                setDraft((current) => ({
                  ...current,
                  provider: nextProvider,
                  sourceKind: 'profile',
                  accountId:
                    current.accountId && accounts.some((account) => account.id === current.accountId && account.provider === nextProvider)
                      ? current.accountId
                      : null,
                }))
              }}
            >
              {providerCatalog.map((descriptor) => (
                <option key={descriptor.key} value={descriptor.key}>
                  {descriptor.displayName}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Handle</span>
            <input
              value={draft.handle}
              onChange={(event) => setDraft((current) => ({ ...current, handle: event.target.value }))}
              placeholder="@visual_lab"
              required
            />
          </label>

          <label className="field">
            <span>Display name</span>
            <input
              value={draft.displayName}
              onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
              placeholder="visual_lab"
            />
          </label>

          <label className="field">
            <span>Bound account</span>
            <select
              required
              value={draft.accountId ?? ''}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  accountId: event.target.value.length > 0 ? event.target.value : null,
                }))
              }
            >
              <option disabled value="">
                Select account
              </option>
              {availableAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.displayName}
                </option>
              ))}
            </select>
            <small>Required.</small>
          </label>

          <label className="field field-full">
            <span>Labels</span>
            <input
              value={labelsText}
              onChange={(event) => setLabelsText(event.target.value)}
              placeholder="reference, priority"
            />
            <small>Comma-separated.</small>
          </label>

          <label className="checkbox-row field-full">
            <input
              checked={draft.readyForDownload}
              onChange={(event) =>
                setDraft((current) => ({ ...current, readyForDownload: event.target.checked }))
              }
              type="checkbox"
            />
            <span>Ready for download</span>
          </label>

          <div className="action-row field-full">
            <button className="primary-button" disabled={Boolean(pendingCommand) || !canSubmit} type="submit">
              {draft.id ? 'Update source' : 'Create source'}
            </button>
            <button className="ghost-button" disabled={Boolean(pendingCommand)} onClick={() => resetForm(draft.provider)} type="button">
              New source
            </button>
            <button
              className="danger-button"
              disabled={Boolean(pendingCommand) || !selectedSource}
              onClick={() => void handleDelete()}
              type="button"
            >
              Delete
            </button>
          </div>

          {availableAccounts.length === 0 ? (
            <div className="inline-note field-full">
              Create a <strong>{draft.provider}</strong> account before creating sources for this provider.
            </div>
          ) : null}
        </form>
      </section>

      <section className="panel source-runtime-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Connector lane</p>
            <h2>Manual sync and recent runs</h2>
          </div>
          {selectedSource ? (
            <button
              className="primary-button"
              disabled={Boolean(pendingCommand)}
              onClick={() => void handleRunSourceSync()}
              type="button"
            >
              Run source sync
            </button>
          ) : null}
        </div>

        {selectedSource ? (
          <div className="section-stack">
            <article className="list-row">
              <div>
                <strong>{selectedSource.handle}</strong>
                <p>{selectedSource.provider} connector preview</p>
                {selectedSource.syncProblemCode ? (
                  <p title={selectedSource.syncProblemMessage ?? selectedSource.syncProblemCode}>
                    {syncProblemBadgeLabel(selectedSource.syncProblemCode)}:{' '}
                    {selectedSource.syncProblemMessage ?? selectedSource.syncProblemCode}
                  </p>
                ) : null}
              </div>
              <div className="row-meta">
                <small>{selectedSource.accountId}</small>
                <small>{selectedSource.readyForDownload ? 'ready' : 'paused'}</small>
                {selectedSource.syncProblemAt ? <small>{selectedSource.syncProblemAt}</small> : null}
              </div>
            </article>

            <div className="panel-header">
              <div>
                <p className="eyebrow">Bound accounts</p>
                <h2>Provider availability</h2>
              </div>
            </div>

            <div className="list-stack">
              {availableAccounts.length > 0 ? (
                availableAccounts.map((account) => (
                  <article className="list-row" key={account.id}>
                    <div>
                      <strong>{account.displayName}</strong>
                      <p>{account.provider}</p>
                    </div>
                    <div className="row-meta">
                      <small>{account.authState}</small>
                      <small>{account.authMode}</small>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">No provider account is available for the selected source provider.</div>
              )}
            </div>

            <div className="panel-header">
              <div>
                <p className="eyebrow">Recent runs</p>
                <h2>Execution history</h2>
              </div>
            </div>

            {selectedSourceRuns.length > 0 ? (
              selectedSourceRuns.slice(0, 3).map((run) => (
                <article className="list-row" key={run.id}>
                  <div>
                    <strong>{run.summary}</strong>
                    <p>{run.commandPreview}</p>
                    {run.degradedCapabilities.length > 0 ? (
                      <p>{run.degradedCapabilities.join(', ')}</p>
                    ) : null}
                  </div>
                  <div className="row-meta">
                    <small>{run.status}</small>
                    <small>{run.tool}</small>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">No sync runs yet.</div>
            )}
          </div>
        ) : (
          <div className="empty-state">Select a source to inspect runs.</div>
        )}
      </section>
      {deleteDialogSource ? (
        <SourceDeleteConfirmDialog
          onCancel={() => setDeleteDialogSourceId(undefined)}
          onConfirm={(mode) => void handleConfirmDelete(mode)}
          pending={deleteSubmitting}
          sourceCount={1}
          sourceLabel={deleteDialogSource.handle}
        />
      ) : null}
    </div>
  )
}
