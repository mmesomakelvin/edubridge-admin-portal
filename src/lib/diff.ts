import type { ProgramContent } from './content-schema'
import { isRealDate } from './dates'
import { formatDay, formatNaira } from './format'
import { nextOpenCohort } from './next-cohort'

const day = (iso: string) => (isRealDate(iso) ? formatDay(iso) : iso || '(blank)')
const count = (n: number) => (Number.isFinite(n) ? String(n) : '(blank)')

/** Human-readable list of what publishing `after` would change compared with `before`. */
export function describeChanges(before: ProgramContent, after: ProgramContent, now: Date = new Date()): string[] {
  const lines: string[] = []

  const beforeCohorts = new Map(before.cohorts.map((c) => [c.id, c]))
  const afterIds = new Set(after.cohorts.map((c) => c.id))
  for (const a of after.cohorts) {
    const b = beforeCohorts.get(a.id)
    if (!b) {
      lines.push(`Added ${a.name || 'a new cohort'} (${day(a.startDate)} – ${day(a.endDate)}, ${count(a.totalSeats)} seats)`)
      continue
    }
    const parts: string[] = []
    if (b.name !== a.name) parts.push(`renamed to "${a.name}"`)
    if (b.startDate !== a.startDate) parts.push(`start ${day(b.startDate)} → ${day(a.startDate)}`)
    if (b.endDate !== a.endDate) parts.push(`end ${day(b.endDate)} → ${day(a.endDate)}`)
    if (b.format !== a.format) parts.push(`format ${b.format} → ${a.format}`)
    if (!Object.is(b.seatsRemaining, a.seatsRemaining)) parts.push(`seats left ${count(b.seatsRemaining)} → ${count(a.seatsRemaining)}`)
    if (!Object.is(b.totalSeats, a.totalSeats)) parts.push(`total seats ${count(b.totalSeats)} → ${count(a.totalSeats)}`)
    if (parts.length) lines.push(`${b.name}: ${parts.join('; ')}`)
  }
  for (const b of before.cohorts) if (!afterIds.has(b.id)) lines.push(`Removed ${b.name}`)

  const beforePricing = new Map(before.pricing.map((p) => [p.id, p]))
  for (const a of after.pricing) {
    const b = beforePricing.get(a.id)
    if (!b) continue
    const parts: string[] = []
    if (b.title !== a.title) parts.push(`title "${b.title}" → "${a.title}"`)
    if (b.priceLabel !== a.priceLabel) parts.push(`price label "${b.priceLabel}" → "${a.priceLabel}"`)
    if (!Object.is(b.amount, a.amount)) parts.push(`amount ${formatNaira(b.amount)} → ${formatNaira(a.amount)}`)
    if (b.description !== a.description) parts.push('description updated')
    if (parts.length) lines.push(`${b.title}: ${parts.join('; ')}`)
  }

  if (before.heroPriceLabel !== after.heroPriceLabel) {
    lines.push(`Hero price label: "${before.heroPriceLabel}" → "${after.heroPriceLabel}"`)
  }
  if (before.landingImageUrl !== after.landingImageUrl) lines.push('Landing image replaced')

  if (lines.length > 0) {
    const was = nextOpenCohort(before.cohorts, now)
    const will = nextOpenCohort(after.cohorts, now)
    if ((was?.startDate ?? null) !== (will?.startDate ?? null)) {
      lines.push(`Next open cohort on the site: ${was ? formatDay(was.startDate) : 'none'} → ${will ? formatDay(will.startDate) : 'none'}`)
    }
  }
  return lines
}
