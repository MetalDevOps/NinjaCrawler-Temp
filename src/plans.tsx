import ReactDOM from 'react-dom/client'
import type { PlanEditorWindowIntent } from './domain/models'
import { PlansWindowPage } from './features/scheduler/PlansWindowPage'
import { applyTheme, watchTheme } from './theme'
import { closeDesktopWindow } from './utils/closeDesktopWindow'
import './styles.css'

applyTheme()
watchTheme()

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    void closeDesktopWindow()
  }
})

function parseInitialIntentFromQuery(): PlanEditorWindowIntent {
  const query = new URLSearchParams(window.location.search)
  const mode = query.get('mode')
  return {
    mode: mode === 'new' || mode === 'clone' || mode === 'edit' ? mode : 'edit',
    planId: query.get('planId')?.trim() || undefined,
    schedulerSetId: query.get('schedulerSetId')?.trim() || undefined,
  }
}

const container = document.getElementById('root')

if (!container) {
  throw new Error('Plans window root element was not found.')
}

const rootContainer = container
const root = ReactDOM.createRoot(rootContainer)
let bootstrapFailureRendered = false
let bootstrapReady = false

function renderBootstrapFailure(error: unknown) {
  if (bootstrapFailureRendered) {
    return
  }

  bootstrapFailureRendered = true
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const escapedMessage = message
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

  rootContainer.innerHTML = `
    <div class="runtime-log-bootstrap-failure">
      <h1>Plans Window Failed</h1>
      <pre>${escapedMessage}</pre>
    </div>
  `
}

window.addEventListener('error', (event) => {
  event.preventDefault()
  renderBootstrapFailure(event.error ?? event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault()
  renderBootstrapFailure(event.reason)
})

try {
  const initialIntent = parseInitialIntentFromQuery()
  bootstrapReady = true
  root.render(<PlansWindowPage initialIntent={initialIntent} />)
} catch (error) {
  renderBootstrapFailure(error)
}

window.setTimeout(() => {
  if (!bootstrapReady && !bootstrapFailureRendered) {
    renderBootstrapFailure(new Error('Plans window bootstrap timed out while loading UI modules.'))
  }
}, 6000)
