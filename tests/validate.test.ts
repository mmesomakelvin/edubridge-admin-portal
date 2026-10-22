import { describe, expect, it } from 'vitest'
import { hasErrors, isSafeImageUrl, issueLabel, validateProgram, type Issue } from '@/lib/validate'
import { NOW, cohort, program } from './fixtures'

const codes = (issues: Issue[]) => issues.map((i) => `${i.level}:${i.path}`)
const withCohort = (over: Parameters<typeof cohort>[0]) => program({ cohorts: [cohort(over)] })

describe('validateProgram', () => {
  it('passes a clean program', () => {
    expect(validateProgram(program(), { now: NOW })).toEqual([])
  })

  it('rejects an end date before the start date', () => {
    expect(codes(validateProgram(withCohort({ endDate: '2027-01-01' }), { now: NOW }))).toContain('error:cohorts.0.endDate')
  })

  it('rejects an end date equal to the start date', () => {
    expect(codes(validateProgram(withCohort({ endDate: '2027-01-23' }), { now: NOW }))).toContain('error:cohorts.0.endDate')
  })

  it('rejects impossible dates', () => {
    const issues = validateProgram(withCohort({ startDate: '2026-02-30' }), { now: NOW })
    expect(codes(issues)).toContain('error:cohorts.0.startDate')
  })

  it('rejects blank seat numbers', () => {
    const issues = validateProgram(withCohort({ seatsRemaining: Number.NaN }), { now: NOW })
    expect(codes(issues)).toContain('error:cohorts.0.seatsRemaining')
  })

  it('rejects seats left above total seats', () => {
    const issues = validateProgram(withCohort({ seatsRemaining: 60, totalSeats: 50 }), { now: NOW })
    expect(issues).toContainEqual({ path: 'cohorts.0.seatsRemaining', level: 'error', message: "Seats left can't be more than total seats" })
  })

  it('rejects fractional, negative and zero seat totals', () => {
    expect(codes(validateProgram(withCohort({ seatsRemaining: 2.5 }), { now: NOW }))).toContain('error:cohorts.0.seatsRemaining')
    expect(codes(validateProgram(withCohort({ seatsRemaining: -1 }), { now: NOW }))).toContain('error:cohorts.0.seatsRemaining')
    expect(codes(validateProgram(withCohort({ totalSeats: 0, seatsRemaining: 0 }), { now: NOW }))).toContain('error:cohorts.0.totalSeats')
  })

  it('requires a cohort name', () => {
    expect(codes(validateProgram(withCohort({ name: '  ' }), { now: NOW }))).toContain('error:cohorts.0.name')
  })

  it('rejects duplicate cohort ids', () => {
    const p = program({ cohorts: [cohort(), cohort({ startDate: '2027-04-10', endDate: '2027-05-30' })] })
    expect(codes(validateProgram(p, { now: NOW }))).toContain('error:cohorts.1.id')
  })

  it('rejects a zero or fractional amount', () => {
    const p = program()
    p.pricing[0] = { ...p.pricing[0]!, amount: 0 }
    p.pricing[1] = { ...p.pricing[1]!, amount: 87500.5 }
    expect(codes(validateProgram(p, { now: NOW }))).toEqual(['error:pricing.0.amount', 'error:pricing.1.amount'])
  })

  it('rejects blank labels', () => {
    const p = program({ heroPriceLabel: ' ' })
    p.pricing[0] = { ...p.pricing[0]!, priceLabel: '', title: '' }
    expect(codes(validateProgram(p, { now: NOW }))).toEqual([
      'error:pricing.0.title',
      'error:pricing.0.priceLabel',
      'error:heroPriceLabel',
    ])
  })

  it('rejects adding or removing pricing options', () => {
    const p = program({ pricing: [program().pricing[0]!] })
    expect(codes(validateProgram(p, { now: NOW, original: program() }))).toContain('error:pricing')
  })

  it('requires a landing image', () => {
    expect(codes(validateProgram(program({ landingImageUrl: '' }), { now: NOW }))).toContain('error:landingImageUrl')
  })

  it.each([
    'javascript:alert(1)',
    'http://store.public.blob.vercel-storage.com/images/a.webp',
    'https://evil.example.com/a.webp',
    'https://store.public.blob.vercel-storage.com.evil.com/a.webp',
    'data:text/html;base64,PHNjcmlwdD4=',
  ])('rejects image URLs that are not our own image store: %s', (url) => {
    expect(codes(validateProgram(program({ landingImageUrl: url }), { now: NOW }))).toContain('error:landingImageUrl')
  })

  it('accepts Blob image URLs and demo-mode data images', () => {
    expect(isSafeImageUrl('https://abc123.public.blob.vercel-storage.com/images/data-school-0123456789abcdef.webp')).toBe(true)
    expect(isSafeImageUrl('data:image/webp;base64,UklGRg==')).toBe(true)
  })

  it('caps text lengths so nothing oversized reaches the public site', () => {
    const p = program({ heroPriceLabel: 'x'.repeat(121), cohorts: [cohort({ name: 'n'.repeat(81) })] })
    p.pricing[0] = { ...p.pricing[0]!, description: 'd'.repeat(501) }
    expect(codes(validateProgram(p, { now: NOW }))).toEqual([
      'error:cohorts.0.name',
      'error:pricing.0.description',
      'error:heroPriceLabel',
    ])
  })

  it('warns about, but allows, a newly entered past start date', () => {
    const p = withCohort({ id: 'new-1', startDate: '2026-09-01', endDate: '2026-12-01' })
    const issues = validateProgram(p, { now: NOW, original: program() })
    expect(codes(issues)).toEqual(['warning:cohorts.0.startDate'])
    expect(hasErrors(issues)).toBe(false)
  })

  it('does not warn about historical cohorts nobody touched', () => {
    const past = withCohort({ id: 'cohort-2026-q1', startDate: '2026-01-10', endDate: '2026-02-28', seatsRemaining: 0 })
    expect(validateProgram(past, { now: NOW, original: past })).toEqual([])
  })
})

describe('issueLabel', () => {
  it('prefixes cohort and pricing issues with what they belong to', () => {
    const p = program()
    expect(issueLabel({ path: 'cohorts.0.endDate', level: 'error', message: 'End date must be after the start date' }, p)).toBe(
      'Q1 2027 Cohort: End date must be after the start date',
    )
    expect(issueLabel({ path: 'pricing.1.amount', level: 'error', message: 'x' }, p)).toBe('2 installments: x')
    expect(issueLabel({ path: 'heroPriceLabel', level: 'error', message: 'y' }, p)).toBe('y')
  })
  it('falls back to a position when the name is blank', () => {
    const p = withCohort({ name: '' })
    expect(issueLabel({ path: 'cohorts.0.name', level: 'error', message: 'Give this cohort a name' }, p)).toBe(
      'Cohort 1: Give this cohort a name',
    )
  })
})
