import { describe, expect, it } from 'vitest'
import { buildCohortsFeed } from '@/lib/cohorts-feed'
import { cohort, content, program } from './fixtures'

describe('buildCohortsFeed', () => {
  it('lists cohorts by start date with only the fields win-back reads', () => {
    const c = content({
      programs: {
        'school-of-finance': program({
          cohorts: [
            cohort({ id: 'b', name: 'B', startDate: '2027-04-10', endDate: '2027-05-30' }),
            cohort({ id: 'a', name: 'A', startDate: '2027-01-23', endDate: '2027-03-21' }),
          ],
        }),
      },
    })
    expect(buildCohortsFeed(c)).toEqual({
      version: 1,
      programs: {
        'school-of-finance': {
          url: 'https://www.edubridgeacademy.com/school-of-finance',
          cohorts: [
            { id: 'a', name: 'A', startDate: '2027-01-23', endDate: '2027-03-21' },
            { id: 'b', name: 'B', startDate: '2027-04-10', endDate: '2027-05-30' },
          ],
        },
      },
    })
  })

  it('uses the real consulting page URL', () => {
    const feed = buildCohortsFeed(content({ programs: { 'school-of-mgmt-consulting': program() } }))
    expect(feed.programs['school-of-mgmt-consulting']?.url).toBe('https://www.edubridgeacademy.com/school-of-management-consulting')
  })

  it('leaves out programs with no cohorts', () => {
    const feed = buildCohortsFeed(content({ programs: { 'data-school': program({ cohorts: [] }), 'school-of-finance': program() } }))
    expect(Object.keys(feed.programs)).toEqual(['school-of-finance'])
  })

  it('orders program keys alphabetically like the old feed', () => {
    const feed = buildCohortsFeed(
      content({ programs: { 'school-of-finance': program(), 'data-school': program(), 'advanced-financial-modeling': program() } }),
    )
    expect(Object.keys(feed.programs)).toEqual(['advanced-financial-modeling', 'data-school', 'school-of-finance'])
  })
})
