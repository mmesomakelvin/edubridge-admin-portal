/**
 * The proxy's first gate. Pages redirect signed-out visitors to /login. Server actions and API routes
 * are let through: a redirect would answer them with the sign-in page's HTML, which the page can't read,
 * so they check the session themselves (requireAdmin, enforced by tests/route-guards.test.ts) and reply
 * with an answer the page understands ("unauthorized" / 401).
 */
export function needsLoginRedirect(req: { pathname: string; isServerAction: boolean; allowed: boolean }): boolean {
  if (req.allowed || req.pathname === '/login') return false
  if (req.isServerAction || req.pathname.startsWith('/api/')) return false
  return true
}
