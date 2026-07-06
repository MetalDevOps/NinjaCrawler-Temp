import type { ProviderKey } from '../../domain/models'
import { HelpTip } from '../shared/HelpTip'
import {
  type ProviderAccountSettingsCategoryKey,
  getProviderAccountSettingsFields,
  getProviderAccountSettingsLayout,
} from './providerAccountSettings'

interface ProviderAccountSettingsPanelProps {
  provider: ProviderKey
  loading: boolean
  draft: Record<string, string>
  onFieldChange: (key: string, value: string) => void
  visibleCategories?: ProviderAccountSettingsCategoryKey[]
}

export function ProviderAccountSettingsPanel({
  provider,
  loading,
  draft,
  onFieldChange,
  visibleCategories,
}: ProviderAccountSettingsPanelProps) {
  const layout = getProviderAccountSettingsLayout(provider)
  if (!layout) {
    return (
      <section className="panel accounts-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Provider settings</p>
            <h2>Provider editor not modeled yet</h2>
          </div>
        </div>
        <div className="inline-note">
          Provider-specific settings are currently modeled for Instagram only.
        </div>
      </section>
    )
  }

  if (loading) {
    return (
      <section className="panel accounts-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Provider settings</p>
            <h2>Loading configuration</h2>
          </div>
        </div>
        <div className="inline-note">Loading provider account editor...</div>
      </section>
    )
  }

  const categories = visibleCategories
    ? layout.categories.filter((category) => visibleCategories.includes(category.key))
    : layout.categories

  return (
    <>
      {categories.map((category) => {
        const fields = getProviderAccountSettingsFields(provider, category.key)

        return (
          <section className="panel accounts-panel" key={category.key}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">{category.label}</p>
                <h2>{category.label}</h2>
              </div>
              {category.description ? <p className="accounts-panel-copy">{category.description}</p> : null}
            </div>

            <div className="form-grid accounts-settings-grid">
              {fields.map((field) => {
                const value = draft[field.key] ?? field.defaultValue
                const inputId = `provider-setting-${field.key}`
                const labelContent = (
                  <>
                    <span>{field.label}</span>
                    <HelpTip label={field.label} tooltip={field.tooltip} />
                  </>
                )

                if (field.kind === 'toggle') {
                  return (
                    <label className="field field-full accounts-setting-toggle" htmlFor={inputId} key={field.key}>
                      <div className="checkbox-row">
                        <input
                          checked={value === 'true'}
                          id={inputId}
                          onChange={(event) => onFieldChange(field.key, event.target.checked ? 'true' : 'false')}
                          type="checkbox"
                        />
                        <span className="accounts-setting-label">{labelContent}</span>
                      </div>
                      {field.description ? <small>{field.description}</small> : null}
                    </label>
                  )
                }

                if (field.kind === 'textarea') {
                  return (
                    <label className="field field-full" htmlFor={inputId} key={field.key}>
                      <span className="accounts-setting-label">{labelContent}</span>
                      <textarea
                        id={inputId}
                        onChange={(event) => onFieldChange(field.key, event.target.value)}
                        placeholder={field.placeholder}
                        rows={4}
                        value={value}
                      />
                      {field.description ? <small>{field.description}</small> : null}
                    </label>
                  )
                }

                return (
                  <label className="field" htmlFor={inputId} key={field.key}>
                    <span className="accounts-setting-label">{labelContent}</span>
                    <input
                      id={inputId}
                      onChange={(event) => onFieldChange(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      type={field.kind === 'number' ? 'number' : 'text'}
                      value={value}
                    />
                    {field.description ? <small>{field.description}</small> : null}
                  </label>
                )
              })}
            </div>
          </section>
        )
      })}
    </>
  )
}
