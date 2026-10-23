import { describe, expect, it } from 'vitest'
import { draftReducer } from '@/lib/draft-reducer'
import { cohort, program } from './fixtures'

describe('draftReducer', () => {
  it('adds a blank cohort that copies the last cohort’s seats and format', () => {
    const next = draftReducer(program(), { type: 'cohort/add', id: 'new-1' })
    expect(next.cohorts[1]).toEqual({ id: 'new-1', name: '', startDate: '', endDate: '', format: 'hybrid', seatsRemaining: 50, totalSeats: 50 })
  })

  it('names a new cohort from its start date', () => {
    let s = draftReducer(program(), { type: 'cohort/add', id: 'new-1' })
    s = draftReducer(s, { type: 'cohort/text', index: 1, field: 'startDate', value: '2027-04-10' })
    expect(s.cohorts[1]?.name).toBe('Q2 2027 Cohort')
    s = draftReducer(s, { type: 'cohort/text', index: 1, field: 'startDate', value: '2027-07-10' })
    expect(s.cohorts[1]?.name).toBe('Q3 2027 Cohort')
  })

  it('never renames existing cohorts or names typed by staff', () => {
    let s = draftReducer(program(), { type: 'cohort/text', index: 0, field: 'startDate', value: '2027-04-10' })
    expect(s.cohorts[0]?.name).toBe('Q1 2027 Cohort')
    s = draftReducer(s, { type: 'cohort/add', id: 'new-1' })
    s = draftReducer(s, { type: 'cohort/text', index: 1, field: 'name', value: 'Easter Bootcamp' })
    s = draftReducer(s, { type: 'cohort/text', index: 1, field: 'startDate', value: '2027-04-10' })
    expect(s.cohorts[1]?.name).toBe('Easter Bootcamp')
  })

  it('keeps a cleared number as NaN so validation catches it', () => {
    const s = draftReducer(program(), { type: 'cohort/number', index: 0, field: 'seatsRemaining', value: Number.NaN })
    expect(Number.isNaN(s.cohorts[0]?.seatsRemaining)).toBe(true)
  })

  it('updates format, removes cohorts and edits pricing', () => {
    let s = draftReducer(program({ cohorts: [cohort(), cohort({ id: 'b' })] }), { type: 'cohort/format', index: 0, value: 'virtual' })
    expect(s.cohorts[0]?.format).toBe('virtual')
    s = draftReducer(s, { type: 'cohort/remove', index: 0 })
    expect(s.cohorts.map((c) => c.id)).toEqual(['b'])
    s = draftReducer(s, { type: 'pricing/text', index: 1, field: 'priceLabel', value: '2 × ₦90,000' })
    s = draftReducer(s, { type: 'pricing/amount', index: 1, value: 90000 })
    expect(s.pricing[1]).toMatchObject({ priceLabel: '2 × ₦90,000', amount: 90000 })
  })

  it('sets the hero label and image, and resets to a given program', () => {
    let s = draftReducer(program(), { type: 'heroPriceLabel', value: 'x' })
    s = draftReducer(s, { type: 'image', url: 'https://x/new.webp' })
    expect(s).toMatchObject({ heroPriceLabel: 'x', landingImageUrl: 'https://x/new.webp' })
    expect(draftReducer(s, { type: 'reset', value: program() })).toEqual(program())
  })

  it('never mutates the previous state', () => {
    const before = program()
    const snapshot = structuredClone(before)
    draftReducer(before, { type: 'cohort/number', index: 0, field: 'totalSeats', value: 99 })
    draftReducer(before, { type: 'pricing/amount', index: 0, value: 1 })
    expect(before).toEqual(snapshot)
  })
})
