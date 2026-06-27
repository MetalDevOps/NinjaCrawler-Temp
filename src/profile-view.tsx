import ReactDOM from 'react-dom/client'
import { ProfileViewPage } from './features/workspace/ProfileViewPage'
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

function parseSourceIdFromQuery(): string | undefined {
  return new URLSearchParams(window.location.search).get('sourceId')?.trim() || undefined
}

const container = document.getElementById('root')
if (!container) {
  throw new Error('Profile view root element was not found.')
}

ReactDOM.createRoot(container).render(<ProfileViewPage initialSourceId={parseSourceIdFromQuery()} />)
