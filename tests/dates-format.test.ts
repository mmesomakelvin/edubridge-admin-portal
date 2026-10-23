import { describe, expect, it } from 'vitest'
import { isRealDate, todayIso } from '@/lib/dates'
import { formatAgo, formatDay, formatNaira, formatStamp } from '@/lib/format'

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

describe('formatAgo', () => {
  const now = new Date('2026-10-14T12:00:00Z') // 13:00 in Lagos
  it('says today with the time', () => expect(formatAgo('2026-10-14T08:15:00.000Z', now)).toBe('Today, 09:15'))
  it('says yesterday by the Lagos calendar', () => {
    // 23:30 UTC on 13 Oct is 00:30 on 14 Oct in Lagos — still today
    expect(formatAgo('2026-10-13T23:30:00.000Z', now)).toBe('Today, 00:30')
    expect(formatAgo('2026-10-13T17:00:00.000Z', now)).toBe('Yesterday, 18:00')
  })
  it('counts days for the past month', () => expect(formatAgo('2026-10-11T09:00:00.000Z', now)).toBe('3 days ago'))
  it('falls back to the date after 30 days', () => expect(formatAgo('2026-09-02T09:00:00.000Z', now)).toBe('2 Sept 2026'))
})
