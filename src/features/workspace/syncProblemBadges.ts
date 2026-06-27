export function syncProblemBadgeLabel(syncProblemCode?: string): string {
  const code = (syncProblemCode ?? '').trim().toLowerCase()
  if (!code) {
    return 'Sync issue'
  }

  switch (code) {
    case 'instagram_profile_private_or_restricted':
      return 'Private profile'
    case 'instagram_username_unresolvable':
      return 'Profile unavailable'
    case 'auth_required':
      return 'Auth required'
    default:
      return 'Sync issue'
  }
}

export function isBlockingSyncProblem(syncProblemCode?: string): boolean {
  const code = (syncProblemCode ?? '').trim().toLowerCase()
  if (!code) {
    return false
  }
  return code !== 'instagram_profile_private_or_restricted'
}
