import ReactDOM from 'react-dom/client'
import { BatchEditorWindowPage } from './features/workspace/BatchEditorWindowPage'
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

function parseSourceIdsFromQuery(): string[] {
  const query = new URLSearchParams(window.location.search)
  const raw = query.get('ids')
  if (!raw) return []
  return raw.split(',').map((id) => decodeURIComponent(id.trim())).filter((id) => id.length > 0)
}

const container = document.getElementById('root')

if (!container) {
  throw new Error('Batch editor root element was not found.')
}

const root = ReactDOM.createRoot(container)
const initialSourceIds = parseSourceIdsFromQuery()
root.render(<BatchEditorWindowPage initialSourceIds={initialSourceIds} />)
