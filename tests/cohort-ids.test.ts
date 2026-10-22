import { describe, expect, it } from 'vitest'
import { cohortIdFor, finalizeCohortIds, suggestCohortName } from '@/lib/cohort-ids'
import { cohort } from './fixtures'

describe('new cohort naming', () => {
  it('suggests a quarter name from the start date', () => {
    expect(suggestCohortName('2027-04-10')).toBe('Q2 2027 Cohort')
    expect(suggestCohortName('2027-12-01')).toBe('Q4 2027 Cohort')
    expect(suggestCohortName('')).toBe('')
  })

  it('builds ids in the existing cohort-YYYY-qN style, avoiding clashes', () => {
    expect(cohortIdFor('2027-04-10', new Set())).toBe('cohort-2027-q2')
    expect(cohortIdFor('2027-04-10', new Set(['cohort-2027-q2']))).toBe('cohort-2027-q2-2')
  })

  it('keeps existing ids and gives each new cohort a unique permanent id', () => {
    const result = finalizeCohortIds([
      cohort({ id: 'cohort-2027-q1' }),
      cohort({ id: 'new-a', startDate: '2027-02-06' }),
      cohort({ id: 'new-b', startDate: '2027-03-01' }),
    ])
    expect(result.map((c) => c.id)).toEqual(['cohort-2027-q1', 'cohort-2027-q1-2', 'cohort-2027-q1-3'])
  })
})
