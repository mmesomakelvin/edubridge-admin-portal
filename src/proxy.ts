import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { isAllowedEmail, parseAllowlist } from '@/lib/allowlist'
import { buildCsp, createNonce } from '@/lib/csp'
import { isDemoMode } from '@/lib/demo'
import { needsLoginRedirect } from '@/lib/gate'

/** Next.js reads the nonce from the request's CSP header and stamps it on its own scripts. */
function withCsp(req: NextRequest) {
  const nonce = createNonce()
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV !== 'production' })
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

// Every page except sign-in itself requires the allowlisted session. Server actions and API routes
// check it themselves (see needsLoginRedirect); this is the first gate, not the only one.
export const proxy = auth((req) => {
  const allowed = isDemoMode() || isAllowedEmail(req.auth?.user?.email, parseAllowlist(process.env.ALLOWED_EMAILS))
  if (needsLoginRedirect({ pathname: req.nextUrl.pathname, isServerAction: req.headers.has('next-action'), allowed })) {
    return Response.redirect(new URL('/login', req.nextUrl.origin))
  }
  return withCsp(req)
})

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|icon.svg).*)'],
}
