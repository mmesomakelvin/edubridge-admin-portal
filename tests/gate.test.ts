import { describe, expect, it } from 'vitest'
import { gateDecision } from '@/lib/gate'

describe('gateDecision', () => {
  const page = { pathname: '/', method: 'GET', isServerAction: false, allowed: false }

  it('sends signed-out visitors to sign in', () => {
    expect(gateDecision(page)).toBe('redirect-to-login')
    expect(gateDecision({ ...page, pathname: '/programs/data-school' })).toBe('redirect-to-login')
  })

  it('lets allow-listed admins through', () => {
    expect(gateDecision({ ...page, allowed: true })).toBe('allow')
    expect(gateDecision({ ...page, pathname: '/api/images', method: 'POST', allowed: true })).toBe('allow')
  })

  it('never redirects the sign-in page itself', () => {
    expect(gateDecision({ ...page, pathname: '/login' })).toBe('allow')
  })

  // Found in the final review: a redirect answers a server action or upload with the sign-in page's
  // HTML, which the browser can't read, so staff saw "check your connection" instead of "session ended".
  it('refuses signed-out API calls with a 401 the page can read', () => {
    expect(gateDecision({ ...page, pathname: '/api/images', method: 'POST' })).toBe('unauthorized')
  })

  it('lets cron calls reach their route, which checks CRON_SECRET itself', () => {
    expect(gateDecision({ ...page, pathname: '/api/cron/sync-feed' })).toBe('allow')
    expect(gateDecision({ ...page, pathname: '/api/cronx' })).toBe('unauthorized')
  })

  it('leaves real server actions to their own session check', () => {
    expect(gateDecision({ ...page, pathname: '/programs/data-school', method: 'POST', isServerAction: true })).toBe('allow')
  })

  // Flagged by the automated security review: the next-action header is client-controlled.
  it('still gates a page request that merely carries a next-action header', () => {
    expect(gateDecision({ ...page, pathname: '/programs/data-school', method: 'GET', isServerAction: true })).toBe('redirect-to-login')
  })
})
