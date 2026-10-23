import { describe, expect, it } from 'vitest'
import { ContentSchema } from '@/lib/content-schema'
import { PROGRAMS, getProgram, isProgramSlug, liveUrl } from '@/lib/programs'
import { cohort, content, program } from './fixtures'

describe('program registry', () => {
  it('covers exactly the seven learner programs, keyed by folder slug', () => {
    expect(PROGRAMS.map((p) => p.slug)).toEqual([
      'school-of-finance',
      'data-school',
      'school-of-mgmt-consulting',
      'advanced-financial-modeling',
      'school-of-hr-and-analytics',
      'project-finance-modeling',
      'securities-trading',
    ])
  })

  it('excludes Corporate Training', () => {
    expect(isProgramSlug('corporate-training')).toBe(false)
  })

  it('links consulting to its real page, not its folder slug', () => {
    expect(liveUrl(getProgram('school-of-mgmt-consulting')!)).toBe(
      'https://www.edubridgeacademy.com/school-of-management-consulting',
    )
  })

  it('maps each program to its homepage card', () => {
    expect(PROGRAMS.map((p) => p.homeCardId)).toEqual(['prog-1', 'prog-2', 'prog-3', 'prog-4', 'prog-hr', 'prog-pfm', 'prog-securities-trading'])
  })
})

describe('ContentSchema', () => {
  it('accepts a well-formed document unchanged', () => {
    expect(ContentSchema.parse(content())).toEqual(content())
  })

  it('drops keys the portal does not own', () => {
    const raw = { ...program(), extra: 'x', cohorts: [{ ...cohort(), colour: 'red' }] }
    const parsed = ContentSchema.parse({ ...content(), programs: { 'school-of-finance': raw } })
    expect(parsed.programs['school-of-finance']).toEqual(program())
  })

  it('rejects a seat count sent as text', () => {
    const bad = { ...program(), cohorts: [{ ...cohort(), seatsRemaining: '5' }] }
    expect(ContentSchema.safeParse({ ...content(), programs: { 'school-of-finance': bad } }).success).toBe(false)
  })
})
