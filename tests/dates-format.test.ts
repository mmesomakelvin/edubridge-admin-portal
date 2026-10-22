import { describe, expect, it } from 'vitest'
import { isRealDate, todayIso } from '@/lib/dates'
import { formatDay, formatNaira, formatStamp } from '@/lib/format'

describe('isRealDate', () => {
  it('accepts real calendar days', () => {
    expect(isRealDate('2027-01-23')).toBe(true)
    expect(isRealDate('2028-02-29')).toBe(true)
  })
  it.each(['2026-02-30', '2026-13-01', '23/01/2027', '', '2027-1-5'])('rejects %j', (value) => {
    expect(isRealDate(value)).toBe(false)
  })
})

describe('todayIso', () => {
  it('uses the UTC calendar day', () => {
    expect(todayIso(new Date('2026-10-14T23:30:00Z'))).toBe('2026-10-14')
  })
})

describe('formatters', () => {
  it('formats a day', () => expect(formatDay('2027-01-23')).toBe('23 Jan 2027'))
  it('formats naira without decimals', () => expect(formatNaira(175000)).toBe('₦175,000'))
  it('shows a blank amount plainly', () => expect(formatNaira(Number.NaN)).toBe('(blank)'))
  it('formats a publish time in Lagos time', () => {
    expect(formatStamp('2026-10-14T11:30:00.000Z')).toBe('14 Oct 2026, 12:30')
  })
})
