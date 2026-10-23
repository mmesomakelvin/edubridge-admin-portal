import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowGoogleSignIn, isAllowedEmail, parseAllowlist } from '@/lib/allowlist'
import { isDemoMode } from '@/lib/demo'

const list = parseAllowlist(' Hello@EduBridgeAcademy.com , ,other@example.com ')

describe('allowlist', () => {
  it('parses a comma-separated, case-insensitive list', () => {
    expect(list).toEqual(['hello@edubridgeacademy.com', 'other@example.com'])
    expect(parseAllowlist(undefined)).toEqual([])
  })

  it('matches emails regardless of case and spacing', () => {
    expect(isAllowedEmail(' HELLO@edubridgeacademy.com', list)).toBe(true)
    expect(isAllowedEmail('someone@gmail.com', list)).toBe(false)
    expect(isAllowedEmail(undefined, list)).toBe(false)
  })

  it('lets in only the verified, allowlisted Google account', () => {
    expect(allowGoogleSignIn('google', { email: 'hello@edubridgeacademy.com', email_verified: true }, list)).toBe(true)
    expect(allowGoogleSignIn('google', { email: 'hello@edubridgeacademy.com', email_verified: false }, list)).toBe(false)
    expect(allowGoogleSignIn('google', { email: 'intruder@gmail.com', email_verified: true }, list)).toBe(false)
    expect(allowGoogleSignIn('github', { email: 'hello@edubridgeacademy.com', email_verified: true }, list)).toBe(false)
    expect(allowGoogleSignIn('google', { email: 'hello@edubridgeacademy.com', email_verified: true }, [])).toBe(false)
  })
})

describe('isDemoMode', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is off unless explicitly enabled', () => {
    vi.stubEnv('ADMIN_DEMO', '')
    expect(isDemoMode()).toBe(false)
  })
  it('is on in development when ADMIN_DEMO=1', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ADMIN_DEMO', '1')
    expect(isDemoMode()).toBe(true)
  })
  it('can never be on in a production build', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ADMIN_DEMO', '1')
    expect(isDemoMode()).toBe(false)
  })
})
