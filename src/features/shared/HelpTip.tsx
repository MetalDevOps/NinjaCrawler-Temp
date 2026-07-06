import { useId } from 'react'

interface HelpTipProps {
  tooltip?: string
  /** Nome curto do controle explicado; vira o aria-label do botão. */
  label?: string
}

/**
 * Botão "i" com tooltip acessível (hover e foco de teclado). Fonte única do
 * padrão de ajuda contextual — antes duplicado entre SchedulerPage (title
 * nativo, invisível para teclado) e SourceEditorSyncPanel.
 */
export function HelpTip({ tooltip, label }: HelpTipProps) {
  const tooltipId = useId()

  if (!tooltip) {
    return null
  }

  return (
    <span className="accounts-help-tooltip-shell">
      <button
        aria-describedby={tooltipId}
        aria-label={label ? `${label} help` : `More information: ${tooltip}`}
        className="accounts-help-tooltip"
        type="button"
      >
        i
      </button>
      <span className="accounts-help-tooltip-content" id={tooltipId} role="tooltip">
        {tooltip}
      </span>
    </span>
  )
}
