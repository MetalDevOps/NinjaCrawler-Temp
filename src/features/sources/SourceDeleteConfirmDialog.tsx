import type { SourceProfileDeleteMode } from '../../domain/models'
import { InternalDialog } from '../workspace/InternalDialog'

interface SourceDeleteConfirmDialogProps {
  sourceLabel: string
  sourceCount: number
  pending?: boolean
  syncBlockedCount?: number
  onCancel: () => void
  onConfirm: (mode: SourceProfileDeleteMode) => void | Promise<void>
}

export function SourceDeleteConfirmDialog({
  sourceLabel,
  sourceCount,
  pending = false,
  syncBlockedCount = 0,
  onCancel,
  onConfirm,
}: SourceDeleteConfirmDialogProps) {
  const actionsDisabled = pending
  const plural = sourceCount === 1 ? 'profile' : 'profiles'

  return (
    <InternalDialog
      height="fit"
      onClose={pending ? () => undefined : onCancel}
      subtitle="Choose how this profile should be removed. The delete runs in the background queue."
      title="Delete profile"
      width="medium"
    >
      <div className="source-delete-dialog">
        <p className="source-delete-dialog-copy">
          Remove {sourceCount === 1 ? <strong>{sourceLabel}</strong> : <strong>{sourceCount} {plural}</strong>}:
        </p>
        <div className="source-delete-dialog-options">
          <article className="source-delete-dialog-option">
            <div>
              <strong>Delete user only</strong>
              <p>Keep existing media records and keep files on disk.</p>
            </div>
            <button
              className="ghost-button"
              disabled={actionsDisabled}
              onClick={() => void onConfirm('user_only')}
              type="button"
            >
              Delete user only
            </button>
          </article>
          <article className="source-delete-dialog-option">
            <div>
              <strong>Delete</strong>
              <p>Remove profile, media records, source media folder, and custom profile image.</p>
            </div>
            <button
              className="danger-button"
              disabled={actionsDisabled}
              onClick={() => void onConfirm('with_media')}
              type="button"
            >
              Delete
            </button>
          </article>
        </div>
        {syncBlockedCount > 0 ? (
          <div className="inline-note source-delete-dialog-warning">
            {syncBlockedCount} selected {syncBlockedCount === 1 ? 'profile has' : 'profiles have'} sync queued or running. The delete queue will cancel sync first and wait for the queue to clear.
          </div>
        ) : null}
        <div className="inline-note source-delete-dialog-note">
          Progress stays visible in the footer and Queue Status window.
        </div>
        <div className="action-row source-delete-dialog-actions">
          <button className="ghost-button" disabled={pending} onClick={onCancel} type="button">
            Cancel
          </button>
        </div>
      </div>
    </InternalDialog>
  )
}
