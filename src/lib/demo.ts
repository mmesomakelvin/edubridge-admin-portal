/**
 * Local demo mode: full UI against an in-memory store, no Google sign-in.
 * Production builds (`next build` / Vercel) always run with NODE_ENV=production,
 * so this can never be switched on in a deployed portal.
 */
export function isDemoMode(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ADMIN_DEMO === '1'
}
