import { getCohortStatus } from './cohort-status'
import type { Cohort } from './content-schema'
import { isRealDate, todayIso } from './dates'

const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' })
const longDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function utcDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d))
}

const hasRealDates = (c: Cohort) => isRealDate(c.startDate) && isRealDate(c.endDate)

/** Earliest cohort a visitor can enrol in today, or null. Half-typed cohorts never count. */
export function nextOpenCohort(cohorts: readonly Cohort[], now: Date = new Date()): Cohort | null {
  return (
    cohorts
      .filter((c) => hasRealDates(c) && getCohortStatus(c, now) === 'open')
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  )
}

/** Program hero line, e.g. 'Next cohort starts Saturday, 23 January 2027'. */
export function heroNextCohortLabel(cohort: Cohort | null): string {
  if (!cohort) return 'New cohort dates coming soon'
  const date = utcDate(cohort.startDate)
  return `Next cohort starts ${weekday.format(date)}, ${longDay.format(date)}`
}

/** Homepage card value, e.g. 'January 2027'; null renders nothing (as for Corporate today). */
export function cardNextCohort(cohort: Cohort | null): string | null {
  return cohort ? monthYear.format(utcDate(cohort.startDate)) : null
}

export type ProgramPill = 'open' | 'full' | 'none'

/** Dashboard pill: open if enrolable, full if only sold-out cohorts lie ahead, else none. */
export function programPill(cohorts: readonly Cohort[], now: Date = new Date()): ProgramPill {
  if (nextOpenCohort(cohorts, now)) return 'open'
  const today = todayIso(now)
  return cohorts.some((c) => hasRealDates(c) && c.startDate > today) ? 'full' : 'none'
}
