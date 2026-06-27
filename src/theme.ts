const STORAGE_KEY = 'nc-theme'

export type Theme = 'light' | 'dark'

export function getStoredTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'light'
}

export function applyTheme(theme?: Theme): void {
  const t = theme ?? getStoredTheme()
  if (t === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme)
  applyTheme(theme)
}

export function toggleTheme(): Theme {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const next: Theme = isDark ? 'light' : 'dark'
  setTheme(next)
  return next
}

export function watchTheme(): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      applyTheme(event.newValue as Theme)
    }
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}
