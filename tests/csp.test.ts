import { describe, expect, it } from 'vitest'
import { SECURITY_HEADERS, buildCsp, createNonce } from '@/lib/csp'

const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? ''

describe('buildCsp', () => {
  const csp = buildCsp('abc123', { dev: false })

  it('only runs scripts carrying this response’s nonce', () => {
    expect(directive(csp, 'script-src')).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'")
  })
  it('never allows inline or eval’d script in production', () => {
    expect(directive(csp, 'script-src')).not.toMatch(/unsafe-inline|unsafe-eval/)
  })
  it('allows eval only in local development (Next.js dev tooling needs it)', () => {
    expect(directive(buildCsp('n', { dev: true }), 'script-src')).toContain("'unsafe-eval'")
  })
  it('blocks framing, plugins and base-tag hijacks', () => {
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
  })
  it('loads images only from us and the Blob store', () => {
    expect(directive(csp, 'img-src')).toBe("img-src 'self' data: blob: https://*.public.blob.vercel-storage.com")
  })
  it('lets the sign-in form hand off to Google and nowhere else', () => {
    expect(directive(csp, 'form-action')).toBe("form-action 'self' https://accounts.google.com")
  })
})

describe('createNonce', () => {
  it('is unique per call and base64', () => {
    const a = createNonce()
    expect(a).not.toBe(createNonce())
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })
})

describe('SECURITY_HEADERS', () => {
  it('sets the standard hardening headers', () => {
    const keys = SECURITY_HEADERS.map((h) => h.key)
    expect(keys).toEqual(
      expect.arrayContaining(['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy', 'Strict-Transport-Security']),
    )
  })
})
