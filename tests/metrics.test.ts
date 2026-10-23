import { describe, expect, it } from 'vitest'
import { computeMetrics, publishesThisMonth, seatsLeftDelta } from '@/lib/metrics'
import type { BackupInfo } from '@/lib/store'
import { NOW, cohort, content, program } from './fixtures'

const full = cohort({ id: 'full', startDate: '2026-11-07', endDate: '2026-12-20', seatsRemaining: 0, totalSeats: 30 })
const ended = cohort({ id: 'ended', startDate: '2026-05-02', endDate: '2026-06-28', seatsRemaining: 4, totalSeats: 30 })
const halfTyped = cohort({ id: 'half', startDate: '2027-02-', endDate: '2027-04-10', seatsRemaining: 9, totalSeats: 9 })

describe('computeMetrics', () => {
  it('counts open programs out of all seven, with missing or dateless programs flagged', () => {
    const m = computeMetrics(
      content({
        programs: {
          'school-of-finance': program(),
          'data-school': program({ cohorts: [ended] }),
          'school-of-mgmt-consulting': program({ cohorts: [full] }),
        },
      }),
      NOW,
    )
    expect(m.totalPrograms).toBe(7)
    expect(m.openPrograms).toBe(1)
    // data-school (only ended) + the four programs missing from the store; the full one is not "without dates"
    expect(m.programsWithoutDates).toBe(5)
  })

  it('sums seats over every open cohort and ignores full, ended and half-typed ones', () => {
    const second = cohort({ id: 'q2', startDate: '2027-04-10', endDate: '2027-06-05', seatsRemaining: 5, totalSeats: 25 })
    const m = computeMetrics(
      content({
        programs: {
          'school-of-finance': program({ cohorts: [cohort(), second, full, ended, halfTyped] }),
          'data-school': program({ cohorts: [cohort({ seatsRemaining: 10, totalSeats: 40 })] }),
        },
      }),
      NOW,
    )
    expect(m.seatsLeft).toBe(20 + 5 + 10)
    expect(m.seatsTotal).toBe(50 + 25 + 40)
  })

  it('finds the soonest open cohort across programs and how many days away it is', () => {
    const m = computeMetrics(
      content({
        programs: {
          'school-of-finance': program(),
          'data-school': program({ cohorts: [cohort({ startDate: '2026-11-04', endDate: '2026-12-19' })] }),
        },
      }),
      NOW,
    )
    expect(m.nextStart).toEqual({ slug: 'data-school', startDate: '2026-11-04', daysAway: 21 })
  })

  it('has no next start and zero seats when nothing is open', () => {
    const m = computeMetrics(content({ programs: { 'school-of-finance': program({ cohorts: [full, ended] }) } }), NOW)
    expect(m.nextStart).toBeNull()
    expect(m.seatsLeft).toBe(0)
    expect(m.seatsTotal).toBe(0)
  })

  it('ignores keys that are not one of the seven programs', () => {
    const m = computeMetrics(content({ programs: { 'corporate-training': program() } }), NOW)
    expect(m.openPrograms).toBe(0)
    expect(m.seatsLeft).toBe(0)
  })
})

describe('seatsLeftDelta', () => {
  it('is the change in open seats since the previous version', () => {
    const before = content({ programs: { 'school-of-finance': program() } })
    const after = content({ programs: { 'school-of-finance': program({ cohorts: [cohort({ seatsRemaining: 15 })] }) } })
    expect(seatsLeftDelta(after, before, NOW)).toBe(-5)
  })

  it('is null when there is no previous version to compare with', () => {
    expect(seatsLeftDelta(content(), null, NOW)).toBeNull()
  })
})

describe('publishesThisMonth', () => {
  const backup = (savedAt: string, version = 1): BackupInfo => ({ pathname: `backups/x-${savedAt}`, version, savedAt })

  it('counts publishes in the current Lagos calendar month', () => {
    const list = [
      backup('2026-10-02T09:00:00.000Z'),
      backup('2026-10-13T18:00:00.000Z', 2),
      backup('2026-09-15T09:00:00.000Z', 3),
      // 23:30 UTC on 30 Sep is 00:30 on 1 Oct in Lagos — October
      backup('2026-09-30T23:30:00.000Z', 4),
    ]
    expect(publishesThisMonth(list, NOW)).toBe(3)
  })

  it('is zero with no backups', () => {
    expect(publishesThisMonth([], NOW)).toBe(0)
  })
})
