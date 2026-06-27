import { useMemo, useState } from 'react'
import type { ProviderAccount, ProviderDescriptor, ProviderKey } from '../../domain/models'

interface ToolbarAddMenuProps {
  providerCatalog: ProviderDescriptor[]
  accounts: ProviderAccount[]
  onAddProfile: (accountId: string) => void
}

export function ToolbarAddMenu({
  providerCatalog,
  accounts,
  onAddProfile,
}: ToolbarAddMenuProps) {
  const [requestedProvider, setRequestedProvider] = useState<ProviderKey>(providerCatalog[0]?.key ?? 'instagram')
  const [requestedAccountId, setRequestedAccountId] = useState<string>()
  const selectedProvider = providerCatalog.some((provider) => provider.key === requestedProvider)
    ? requestedProvider
    : (providerCatalog[0]?.key ?? 'instagram')

  const providerAccounts = useMemo(
    () => accounts.filter((account) => account.provider === selectedProvider),
    [accounts, selectedProvider],
  )
  const selectedAccountId = providerAccounts.some((account) => account.id === requestedAccountId)
    ? requestedAccountId
    : providerAccounts[0]?.id
  const selectedAccount = providerAccounts.find((account) => account.id === selectedAccountId)

  return (
    <div className="toolbar-add-menu" data-menu-root>
      <div className="toolbar-add-column">
        <div className="toolbar-add-column-header">
          <span>Providers</span>
        </div>
        <div className="toolbar-add-provider-list">
          {providerCatalog.map((provider) => (
            <button
              className={provider.key === selectedProvider ? 'toolbar-add-provider toolbar-add-provider-active' : 'toolbar-add-provider'}
              key={provider.key}
              onClick={() => {
                setRequestedProvider(provider.key)
                setRequestedAccountId(undefined)
              }}
              onMouseEnter={() => {
                setRequestedProvider(provider.key)
                setRequestedAccountId(undefined)
              }}
              type="button"
            >
              <strong>{provider.displayName}</strong>
              <span>{accounts.filter((account) => account.provider === provider.key).length} accounts</span>
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar-add-column">
        <div className="toolbar-add-column-header">
          <span>{providerCatalog.find((provider) => provider.key === selectedProvider)?.displayName ?? selectedProvider}</span>
        </div>
        <div className="toolbar-add-account-list">
          {providerAccounts.length > 0 ? (
            providerAccounts.map((account) => (
              <button
                className={account.id === selectedAccountId ? 'toolbar-add-account toolbar-add-account-active' : 'toolbar-add-account'}
                key={account.id}
                onClick={() => setRequestedAccountId(account.id)}
                onMouseEnter={() => setRequestedAccountId(account.id)}
                type="button"
              >
                <strong>{account.displayName}</strong>
                <span>{account.authState}</span>
              </button>
            ))
          ) : (
            <div className="toolbar-add-empty">
              No accounts registered for this provider. Use <strong>Accounts &gt; {providerCatalog.find((provider) => provider.key === selectedProvider)?.displayName ?? selectedProvider} &gt; Settings</strong> first.
            </div>
          )}
        </div>
      </div>

      <div className="toolbar-add-column">
        <div className="toolbar-add-column-header">
          <span>{selectedAccount?.displayName ?? 'Profile actions'}</span>
        </div>
        {selectedAccount ? (
          <div className="toolbar-add-action-group">
            <button className="menu-item" onClick={() => onAddProfile(selectedAccount.id)} type="button">
              <strong>Add new profile</strong>
            </button>
          </div>
        ) : (
          <div className="toolbar-add-empty">Select an account to open the profile editor.</div>
        )}
      </div>
    </div>
  )
}
