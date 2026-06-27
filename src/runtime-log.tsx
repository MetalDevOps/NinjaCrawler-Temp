import ReactDOM from 'react-dom/client'
import { reportRuntimeLogWindowBootstrapFailure } from './bridge/desktop'
import './styles.css'
import { applyTheme, watchTheme } from './theme'

applyTheme()
watchTheme()

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.close()
  }
})

const container = document.getElementById('root')

if (!container) {
  throw new Error('Runtime log root element was not found.')
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

  try {
    void reportRuntimeLogWindowBootstrapFailure(message)
  } catch {
    // Never let telemetry failures trigger recursive bootstrap errors.
  }

  const escapedMessage = message
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

  rootContainer.innerHTML = `
    <div class="runtime-log-bootstrap-failure">
      <h1>Runtime Log Failed</h1>
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

void import('./features/workspace/RuntimeLogWindowPage')
  .then(({ RuntimeLogWindowPage }) => {
    bootstrapReady = true
    root.render(<RuntimeLogWindowPage />)
  })
  .catch((error) => {
    renderBootstrapFailure(error)
  })

window.setTimeout(() => {
  if (!bootstrapReady && !bootstrapFailureRendered) {
    renderBootstrapFailure(new Error('Runtime log bootstrap timed out while loading UI modules.'))
  }
}, 6000)
