import { getCurrentWindow } from '@tauri-apps/api/window'

export async function closeDesktopWindow(): Promise<void> {
  try {
    await getCurrentWindow().close()
    return
  } catch {
    // Fall back to the browser close path when the desktop bridge is unavailable.
  }

  if (typeof window !== 'undefined' && typeof window.close === 'function') {
    window.close()
  }
}
