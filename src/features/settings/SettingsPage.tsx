import { useMemo, useState } from 'react'
import type { AppSetting } from '../../domain/models'
import { useAppStore } from '../../state/appStore'
import { getStoredTheme, toggleTheme, type Theme } from '../../theme'

const CATEGORY_ORDER = ['general', 'policy', 'storage'] as const

const CATEGORY_TITLES: Record<string, string> = {
  general: 'General',
  policy: 'Policy',
  storage: 'Storage',
}

const ENUM_OPTIONS: Record<string, string[]> = {
  'policy.notifications.default': ['summary', 'detailed'],
  'naming.instagram.media_file_pattern_mode': [
    'preset_new_default',
    'preset_legacy_url_basename',
    'custom',
  ],
}

interface SettingsCategoryEntry {
  key: string
  title: string
  settings: AppSetting[]
}

function humanizeCategory(category: string): string {
  return category
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function isBooleanSetting(value: string): boolean {
  return value === 'true' || value === 'false'
}

export function SettingsPage() {
  const snapshot = useAppStore((state) => state.snapshot)
  const pendingCommand = useAppStore((state) => state.pendingCommand)
  const upsertAppSetting = useAppStore((state) => state.upsertAppSetting)
  const [draftValues, setDraftValues] = useState<Record<string, string>>({})
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)
  const settingsByCategory = useMemo<SettingsCategoryEntry[]>(() => {
    const grouped = new Map<string, AppSetting[]>()

    for (const setting of snapshot?.appSettings ?? []) {
      if (setting.key.startsWith('tool.') && setting.key.endsWith('.path')) {
        continue
      }

      if (setting.key.startsWith('instagram.sync.')) {
        continue
      }

      if (setting.key.startsWith('runtime.')) {
        continue
      }

      const current = grouped.get(setting.category) ?? []
      grouped.set(setting.category, [...current, setting].sort((left, right) => left.key.localeCompare(right.key)))
    }

    const entries = Array.from(grouped.entries()).map(([category, settings]) => ({
      key: category,
      title: CATEGORY_TITLES[category] ?? humanizeCategory(category),
      settings,
    }))

    const hasGeneral = entries.some((entry) => entry.key === 'general')

    if (!hasGeneral) {
      entries.push({ key: 'general', title: 'General', settings: [] })
    }

    return entries.sort((left, right) => {
      const leftIndex = CATEGORY_ORDER.indexOf(left.key as (typeof CATEGORY_ORDER)[number])
      const rightIndex = CATEGORY_ORDER.indexOf(right.key as (typeof CATEGORY_ORDER)[number])

      if (leftIndex === -1 && rightIndex === -1) {
        return left.title.localeCompare(right.title)
      }

      if (leftIndex === -1) {
        return 1
      }

      if (rightIndex === -1) {
        return -1
      }

      return leftIndex - rightIndex
    })
  }, [snapshot])
  const [requestedCategory, setRequestedCategory] = useState<string>('')

  const activeCategoryEntry = useMemo(
    () => settingsByCategory.find((category) => category.key === requestedCategory) ?? settingsByCategory[0],
    [requestedCategory, settingsByCategory],
  )

  async function handleSave(key: string, explicitValue?: string) {
    const setting = snapshot?.appSettings.find((entry) => entry.key === key)

    if (!setting) {
      return
    }

    await upsertAppSetting({
      key,
      value: explicitValue ?? draftValues[key] ?? setting.value,
      category: setting.category,
      description: setting.description,
      mutable: setting.mutable,
    })
  }

  if (!snapshot) {
    return null
  }

  return (
    <div className="settings-shell">
      <section className="settings-page-frame">
        <div className="settings-tab-bar" role="tablist" aria-label="Settings categories">
          {settingsByCategory.map((category) => {
            const isActive = category.key === activeCategoryEntry?.key
            return (
              <button
                aria-controls={`settings-category-panel-${category.key}`}
                aria-selected={isActive}
                className={isActive ? 'settings-tab settings-tab-active' : 'settings-tab'}
                id={`settings-category-tab-${category.key}`}
                key={category.key}
                onClick={() => setRequestedCategory(category.key)}
                role="tab"
                type="button"
              >
                <span>{category.title}</span>
              </button>
            )
          })}
        </div>

        <section
          aria-labelledby={activeCategoryEntry ? `settings-category-tab-${activeCategoryEntry.key}` : undefined}
          className="panel panel-accent settings-tab-panel"
          id={activeCategoryEntry ? `settings-category-panel-${activeCategoryEntry.key}` : undefined}
          role={activeCategoryEntry ? 'tabpanel' : undefined}
        >
          {activeCategoryEntry ? (
            <div className="settings-entry-list">
              {activeCategoryEntry.key === 'general' ? (
                <article className="settings-entry-card">
                  <label className="settings-toggle-row">
                    <span className="settings-key-chip">appearance.theme</span>
                    <input
                      type="checkbox"
                      className="settings-toggle"
                      checked={theme === 'dark'}
                      onChange={() => setThemeState(toggleTheme())}
                    />
                  </label>
                </article>
              ) : null}

              {activeCategoryEntry.settings.map((setting) => {
                const currentValue = draftValues[setting.key] ?? setting.value
                const isDirty = currentValue !== setting.value
                const enumOptions = ENUM_OPTIONS[setting.key]

                if (enumOptions) {
                  return (
                    <article className="settings-entry-card" data-locked={!setting.mutable || undefined} key={setting.key}>
                      <div className="settings-select-row">
                        <span className="settings-key-chip">{setting.key}</span>
                        <select
                          aria-label={setting.key}
                          className="settings-select"
                          disabled={!setting.mutable || Boolean(pendingCommand)}
                          value={currentValue}
                          onChange={(event) => {
                            setDraftValues((current) => ({ ...current, [setting.key]: event.target.value }))
                            void handleSave(setting.key, event.target.value)
                          }}
                        >
                          {enumOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                    </article>
                  )
                }

                if (isBooleanSetting(setting.value)) {
                  return (
                    <article className="settings-entry-card" data-locked={!setting.mutable || undefined} key={setting.key}>
                      <label className="settings-toggle-row">
                        <span className="settings-key-chip">{setting.key}</span>
                        <input
                          type="checkbox"
                          className="settings-toggle"
                          checked={currentValue === 'true'}
                          disabled={!setting.mutable || Boolean(pendingCommand)}
                          onChange={() => {
                            const next = currentValue === 'true' ? 'false' : 'true'
                            setDraftValues((current) => ({ ...current, [setting.key]: next }))
                            void handleSave(setting.key, next)
                          }}
                        />
                      </label>
                    </article>
                  )
                }

                return (
                  <article className="settings-entry-card" data-locked={!setting.mutable || undefined} key={setting.key}>
                    <span className="settings-key-chip">{setting.key}</span>
                    <div className="setting-input-row settings-entry-input-row">
                      <input
                        aria-label={setting.key}
                        disabled={!setting.mutable}
                        value={currentValue}
                        onChange={(event) =>
                          setDraftValues((current) => ({
                            ...current,
                            [setting.key]: event.target.value,
                          }))
                        }
                      />
                      <button
                        className="primary-button"
                        disabled={Boolean(pendingCommand) || !setting.mutable || !isDirty}
                        onClick={() => void handleSave(setting.key)}
                        type="button"
                      >
                        Save
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="empty-state">No workspace settings are available.</div>
          )}
        </section>
      </section>
    </div>
  )
}
