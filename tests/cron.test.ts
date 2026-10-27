import { describe, expect, it } from 'vitest'
import { isCronRequest } from '@/lib/cron'

describe('isCronRequest', () => {
  it('accepts the bearer secret Vercel Cron sends', () => {
    expect(isCronRequest('Bearer s3cret-value', 's3cret-value')).toBe(true)
  })

  it.each([
    ['a wrong secret', 'Bearer nope', 's3cret-value'],
    ['no header', null, 's3cret-value'],
    ['the bare secret', 's3cret-value', 's3cret-value'],
    ['an empty secret', 'Bearer ', ''],
    ['an unset secret', 'Bearer undefined', undefined],
  ])('refuses %s', (_, header, secret) => {
    expect(isCronRequest(header, secret)).toBe(false)
  })
})
