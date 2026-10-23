import { describe, expect, it } from 'vitest'
import { cardNextCohort, heroNextCohortLabel, nextOpenCohort, programPill } from '@/lib/next-cohort'
import { NOW, cohort } from './fixtures'

describe('nextOpenCohort', () => {
  it('picks the earliest open cohort, skipping full and ended ones', () => {
    const cohorts = [
      cohort({ id: 'past', startDate: '2026-07-11', endDate: '2026-08-30' }),
      cohort({ id: 'sold-out', startDate: '2027-01-23', endDate: '2027-03-21', seatsRemaining: 0 }),
      cohort({ id: 'later', startDate: '2027-04-10', endDate: '2027-05-30' }),
      cohort({ id: 'next', startDate: '2027-02-06', endDate: '2027-03-14' }),
    ]
    expect(nextOpenCohort(cohorts, NOW)?.id).toBe('next')
  })
  it('returns null when nothing is open', () => {
    expect(nextOpenCohort([cohort({ seatsRemaining: 0 })], NOW)).toBeNull()
  })
  it('ignores cohorts with unset dates', () => {
    expect(nextOpenCohort([cohort({ id: 'draft', startDate: '', endDate: '' })], NOW)).toBeNull()
  })
})

describe('derived labels', () => {
  it('matches the hero label format the site uses today', () => {
    expect(heroNextCohortLabel(cohort())).toBe('Next cohort starts Saturday, 23 January 2027')
  })
  it('falls back when no cohort is open', () => {
    expect(heroNextCohortLabel(null)).toBe('New cohort dates coming soon')
  })
  it('gives the homepage card month', () => {
    expect(cardNextCohort(cohort())).toBe('January 2027')
    expect(cardNextCohort(null)).toBeNull()
  })
})

describe('programPill', () => {
  it('is open when any cohort is open', () => expect(programPill([cohort()], NOW)).toBe('open'))
  it('is full when only sold-out cohorts are upcoming', () => {
    expect(programPill([cohort({ seatsRemaining: 0 })], NOW)).toBe('full')
  })
  it('is none when everything has started or ended', () => {
    expect(programPill([cohort({ startDate: '2026-07-11', endDate: '2026-08-30' })], NOW)).toBe('none')
  })
})
