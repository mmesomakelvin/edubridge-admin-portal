import { describe, expect, it } from 'vitest'
import { describeChanges } from '@/lib/diff'
import { NOW, cohort, program } from './fixtures'

describe('describeChanges', () => {
  it('returns nothing when nothing changed', () => {
    expect(describeChanges(program(), program(), NOW)).toEqual([])
  })

  it('describes cohort edits in one line and the knock-on next-cohort change', () => {
    const after = program({ cohorts: [cohort({ startDate: '2027-01-30', seatsRemaining: 0 })] })
    expect(describeChanges(program(), after, NOW)).toEqual([
      'Q1 2027 Cohort: start 23 Jan 2027 → 30 Jan 2027; seats left 20 → 0',
      'Next open cohort on the site: 23 Jan 2027 → none',
    ])
  })

  it('describes added and removed cohorts', () => {
    const before = program({ cohorts: [cohort(), cohort({ id: 'old', name: 'Q3 2026 Cohort', startDate: '2026-07-11', endDate: '2026-08-30' })] })
    const after = program({
      cohorts: [cohort(), cohort({ id: 'new-1', name: 'Q2 2027 Cohort', startDate: '2027-04-10', endDate: '2027-05-30', totalSeats: 25, seatsRemaining: 25 })],
    })
    expect(describeChanges(before, after, NOW)).toEqual([
      'Added Q2 2027 Cohort (10 Apr 2027 – 30 May 2027, 25 seats)',
      'Removed Q3 2026 Cohort',
    ])
  })

  it('describes price changes with naira formatting', () => {
    const after = program()
    after.pricing[0] = { ...after.pricing[0]!, priceLabel: '₦200,000', amount: 200000 }
    expect(describeChanges(program(), after, NOW)).toEqual([
      'Pay in full: price label "₦175,000" → "₦200,000"; amount ₦175,000 → ₦200,000',
    ])
  })

  it('describes hero label and image changes', () => {
    const after = program({ heroPriceLabel: '₦200,000 · or 2 installments of ₦100,000', landingImageUrl: 'https://x/new.webp' })
    expect(describeChanges(program(), after, NOW)).toEqual([
      'Hero price label: "₦175,000 · or 2 installments of ₦87,500" → "₦200,000 · or 2 installments of ₦100,000"',
      'Landing image replaced',
    ])
  })

  it('shows blank values plainly while a draft is half-typed', () => {
    const after = program({ cohorts: [cohort({ seatsRemaining: Number.NaN })] })
    expect(describeChanges(program(), after, NOW)[0]).toBe('Q1 2027 Cohort: seats left 20 → (blank)')
  })
})
