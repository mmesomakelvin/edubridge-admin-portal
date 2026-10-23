export type GateDecision = 'allow' | 'redirect-to-login' | 'unauthorized'

/**
 * The proxy's first gate (pages and actions re-check the session themselves; this is not the only one).
 * - Pages: signed-out visitors go to /login.
 * - API routes: signed-out calls get a 401 JSON reply the page can read; a redirect would hand them
 *   the sign-in page's HTML, which surfaced as a misleading "check your connection" error.
 * - Server actions (POST + next-action header): let through to their own adminOrNull() check, which
 *   answers "unauthorized" in a form the page understands. The header is client-controlled, so it
 *   only counts on POST; a page GET that carries it is gated like any other page.
 */
export function gateDecision(req: { pathname: string; method: string; isServerAction: boolean; allowed: boolean }): GateDecision {
  if (req.allowed || req.pathname === '/login') return 'allow'
  if (req.pathname.startsWith('/api/')) return 'unauthorized'
  if (req.method === 'POST' && req.isServerAction) return 'allow'
  return 'redirect-to-login'
}
