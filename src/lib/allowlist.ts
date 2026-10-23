export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAllowedEmail(email: string | null | undefined, allowlist: string[]): boolean {
  return !!email && allowlist.includes(email.trim().toLowerCase())
}

/** Spec §5: Google only, email_verified must be true, and the email must be allowlisted. */
export function allowGoogleSignIn(
  provider: string | undefined,
  profile: { email?: string | null; email_verified?: boolean | null } | undefined,
  allowlist: string[],
): boolean {
  return provider === 'google' && profile?.email_verified === true && isAllowedEmail(profile.email, allowlist)
}
