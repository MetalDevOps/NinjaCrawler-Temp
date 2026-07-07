import { useEffect, type ReactNode } from 'react'

interface InternalDialogProps {
  children: ReactNode
  closeVariant?: 'icon' | 'text'
  headerDensity?: 'compact' | 'default'
  height?: 'fit' | 'full'
  subtitle?: string
  title: string
  width?: 'medium' | 'large' | 'wide'
  onClose: () => void
}

export function InternalDialog({
  children,
  closeVariant = 'text',
  headerDensity = 'default',
  height = 'full',
  onClose,
  subtitle,
  title,
  width = 'large',
}: InternalDialogProps) {
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <div className="dialog-overlay" onMouseDown={onClose}>
      <section
        aria-label={title}
        className={`dialog-shell dialog-shell-${width} dialog-shell-height-${height}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className={`dialog-header ${headerDensity === 'compact' ? 'dialog-header-compact' : ''}`}>
          <div className="dialog-title-block">
            <h2>{title}</h2>
            {subtitle ? <p className="dialog-subtitle">{subtitle}</p> : null}
          </div>
          {closeVariant === 'icon' ? (
            <button aria-label="Close" className="ghost-button dialog-close-button dialog-close-button-icon" onClick={onClose} type="button">
              <span aria-hidden>×</span>
            </button>
          ) : (
            <button className="ghost-button dialog-close-button" onClick={onClose} type="button">
              Close
            </button>
          )}
        </header>
        <div className="dialog-body">{children}</div>
      </section>
    </div>
  )
}
