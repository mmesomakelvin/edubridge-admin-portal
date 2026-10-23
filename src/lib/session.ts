import 'server-only'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isAllowedEmail, parseAllowlist } from './allowlist'
import { isDemoMode } from './demo'

export class UnauthorizedError extends Error {
  constructor() {
    super('Not signed in as an allowed admin')
    this.name = 'UnauthorizedError'
  }
}

/** Re-checked on every page load and write, so removing an email from ALLOWED_EMAILS revokes access. */
export async function requireAdmin(): Promise<string> {
  if (isDemoMode()) return 'demo@localhost'
  const session = await auth()
  const email = session?.user?.email
  if (!email || !isAllowedEmail(email, parseAllowlist(process.env.ALLOWED_EMAILS))) throw new UnauthorizedError()
  return email.trim().toLowerCase()
}

/** For pages and layouts: the admin's email, or a redirect to /login. Every console page calls this itself. */
export async function adminOrRedirect(): Promise<string> {
  try {
    return await requireAdmin()
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login')
    throw error
  }
}
