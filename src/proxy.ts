import { auth } from '@/auth'
import { isAllowedEmail, parseAllowlist } from '@/lib/allowlist'
import { isDemoMode } from '@/lib/demo'

// Every page and API route except sign-in itself requires the allowlisted session.
// Pages and server actions re-check with requireAdmin(); this is the first gate, not the only one.
export const proxy = auth((req) => {
  if (isDemoMode()) return
  if (!isAllowedEmail(req.auth?.user?.email, parseAllowlist(process.env.ALLOWED_EMAILS))) {
    return Response.redirect(new URL('/login', req.nextUrl.origin))
  }
})

export const config = {
  matcher: ['/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)'],
}
