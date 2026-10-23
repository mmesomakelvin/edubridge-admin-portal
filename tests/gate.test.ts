import { describe, expect, it } from 'vitest'
import { needsLoginRedirect } from '@/lib/gate'

describe('needsLoginRedirect', () => {
  const page = { pathname: '/', isServerAction: false, allowed: false }

  it('sends signed-out visitors to sign in', () => {
    expect(needsLoginRedirect(page)).toBe(true)
    expect(needsLoginRedirect({ ...page, pathname: '/programs/data-school' })).toBe(true)
  })

  it('lets allow-listed admins through', () => {
    expect(needsLoginRedirect({ ...page, allowed: true })).toBe(false)
  })

  it('never redirects the sign-in page itself', () => {
    expect(needsLoginRedirect({ ...page, pathname: '/login' })).toBe(false)
  })

  // Found in the final review: a redirect answers a server action or upload with the sign-in page's
  // HTML, which the browser can't read, so staff saw "check your connection" instead of "session ended".
  // These requests check the session themselves (requireAdmin) and answer in a form the page understands.
  it('leaves server actions to their own session check', () => {
    expect(needsLoginRedirect({ ...page, pathname: '/programs/data-school', isServerAction: true })).toBe(false)
  })

  it('leaves API routes to their own session check', () => {
    expect(needsLoginRedirect({ ...page, pathname: '/api/images' })).toBe(false)
  })
})
