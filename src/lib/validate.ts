import type { ProgramContent } from './content-schema'
import { isRealDate, todayIso } from './dates'

export type IssueLevel = 'error' | 'warning'
export interface Issue {
  path: string
  level: IssueLevel
  message: string
}
export interface ValidateOptions {
  now?: Date
  /** The live version of this program; enables the pricing-set and past-date checks. */
  original?: ProgramContent
}

/** Upper bounds keep stored text to what the public layout can show (and limit abuse). */
export const MAX_LENGTHS = { cohortName: 80, title: 80, priceLabel: 120, description: 500, heroPriceLabel: 120 } as const

const BLOB_HOST = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i
const DATA_IMAGE = /^data:image\/(webp|jpeg|png);base64,[a-z0-9+/=]+$/i

/**
 * Only images from our own Blob store (or demo-mode data images) may be published.
 * Blocks javascript:, plain http, look-alike hosts and non-image data URLs (XSS defence).
 */
export function isSafeImageUrl(url: string): boolean {
  if (DATA_IMAGE.test(url)) return true
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && BLOB_HOST.test(parsed.hostname)
  } catch {
    return false
  }
}

export function validateProgram(p: ProgramContent, opts: ValidateOptions = {}): Issue[] {
  const issues: Issue[] = []
  const error = (path: string, message: string) => issues.push({ path, level: 'error', message })
  const warn = (path: string, message: string) => issues.push({ path, level: 'warning', message })
  const tooLong = (path: string, value: string, max: number) => {
    if (value.length > max) error(path, `Keep this under ${max} characters`)
  }
  const today = todayIso(opts.now)
  const originalStarts = new Map(opts.original?.cohorts.map((c) => [c.id, c.startDate]) ?? [])
  const seenIds = new Set<string>()

  p.cohorts.forEach((c, i) => {
    const at = (field: string) => `cohorts.${i}.${field}`
    if (seenIds.has(c.id)) error(at('id'), 'This cohort is listed twice. Remove one copy')
    seenIds.add(c.id)
    if (!c.name.trim()) error(at('name'), 'Give this cohort a name')
    tooLong(at('name'), c.name, MAX_LENGTHS.cohortName)

    const startOk = isRealDate(c.startDate)
    const endOk = isRealDate(c.endDate)
    if (!startOk) error(at('startDate'), 'Pick a valid start date')
    if (!endOk) error(at('endDate'), 'Pick a valid end date')
    if (startOk && endOk && c.startDate >= c.endDate) error(at('endDate'), 'End date must be after the start date')
    if (startOk && c.startDate < today && originalStarts.get(c.id) !== c.startDate) {
      warn(at('startDate'), 'This start date is in the past, so the cohort will show as Full or Ended')
    }

    const totalOk = Number.isInteger(c.totalSeats) && c.totalSeats >= 1
    if (!totalOk) error(at('totalSeats'), 'Total seats must be a whole number of at least 1')
    if (!Number.isInteger(c.seatsRemaining) || c.seatsRemaining < 0) {
      error(at('seatsRemaining'), 'Seats left must be a whole number, 0 or more')
    } else if (totalOk && c.seatsRemaining > c.totalSeats) {
      error(at('seatsRemaining'), "Seats left can't be more than total seats")
    }
  })

  p.pricing.forEach((option, i) => {
    const at = (field: string) => `pricing.${i}.${field}`
    if (!option.title.trim()) error(at('title'), 'Give this option a title')
    tooLong(at('title'), option.title, MAX_LENGTHS.title)
    if (!option.priceLabel.trim()) error(at('priceLabel'), 'Add the price exactly as it should appear')
    tooLong(at('priceLabel'), option.priceLabel, MAX_LENGTHS.priceLabel)
    if (!Number.isInteger(option.amount) || option.amount <= 0) error(at('amount'), 'Amount must be a whole number above 0')
    tooLong(at('description'), option.description, MAX_LENGTHS.description)
  })

  if (opts.original) {
    const ids = (q: ProgramContent) => q.pricing.map((o) => o.id).sort().join(',')
    if (ids(p) !== ids(opts.original)) error('pricing', "Pricing options can't be added or removed here")
  }

  if (!p.heroPriceLabel.trim()) error('heroPriceLabel', 'Add the price line shown under the program title')
  tooLong('heroPriceLabel', p.heroPriceLabel, MAX_LENGTHS.heroPriceLabel)
  if (!p.landingImageUrl.trim()) error('landingImageUrl', 'Upload a landing image')
  else if (!isSafeImageUrl(p.landingImageUrl)) error('landingImageUrl', 'Upload the image here instead of pasting a link')

  return issues
}

export function hasErrors(issues: readonly Issue[]): boolean {
  return issues.some((i) => i.level === 'error')
}

/** 'Q1 2027 Cohort: End date must be after the start date' — for the review panel summary. */
export function issueLabel(issue: Issue, draft: ProgramContent): string {
  const match = /^(cohorts|pricing)\.(\d+)\./.exec(issue.path)
  if (!match) return issue.message
  const i = Number(match[2])
  const owner =
    match[1] === 'cohorts' ? draft.cohorts[i]?.name.trim() || `Cohort ${i + 1}` : draft.pricing[i]?.title.trim() || `Option ${i + 1}`
  return `${owner}: ${issue.message}`
}
