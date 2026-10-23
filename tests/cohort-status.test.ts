import { describe, expect, it } from 'vitest'
import { getCohortStatus, isCohortSelectable } from '@/lib/cohort-status'

const c = (seatsRemaining = 10) => ({ startDate: '2027-01-23', endDate: '2027-03-21', seatsRemaining })
const on = (day: string) => new Date(`${day}T12:00:00Z`)

describe('getCohortStatus (must match the public site exactly)', () => {
  it('is open before the start when seats remain', () => {
    expect(getCohortStatus(c(), on('2026-10-14'))).toBe('open')
    expect(isCohortSelectable(c(), on('2026-10-14'))).toBe(true)
  })
  it('is full before the start when no seats remain', () => expect(getCohortStatus(c(0), on('2026-10-14'))).toBe('full'))
  it('is full on the start day', () => expect(getCohortStatus(c(), on('2027-01-23'))).toBe('full'))
  it('is still full on the last day', () => expect(getCohortStatus(c(), on('2027-03-21'))).toBe('full'))
  it('is ended the day after', () => expect(getCohortStatus(c(), on('2027-03-22'))).toBe('ended'))
})
