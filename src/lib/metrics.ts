import { getCohortStatus } from './cohort-status'
import type { Cohort, Content } from './content-schema'
import { isRealDate, todayIso } from './dates'
import { nextOpenCohort, programPill } from './next-cohort'
import { PROGRAM_SLUGS, type ProgramSlug } from './programs'
import type { BackupInfo } from './store'

export interface DashboardMetrics {
  totalPrograms: number
  /** Programs a visitor can enrol in today. */
  openPrograms: number
  /** Programs with no upcoming cohort at all (missing from the store counts too). Sold-out ones are not counted. */
  programsWithoutDates: number
  /** Seats remaining / total over every open cohort, not just the next one. */
  seatsLeft: number
  seatsTotal: number
  nextStart: { slug: ProgramSlug; startDate: string; daysAway: number } | null
}

const isOpen = (c: Cohort, now: Date) => isRealDate(c.startDate) && isRealDate(c.endDate) && getCohortStatus(c, now) === 'open'

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000

/** Headline numbers for the dashboard, derived only from content.json. */
export function computeMetrics(content: Content, now: Date = new Date()): DashboardMetrics {
  const m: DashboardMetrics = {
    totalPrograms: PROGRAM_SLUGS.length,
    openPrograms: 0,
    programsWithoutDates: 0,
    seatsLeft: 0,
    seatsTotal: 0,
    nextStart: null,
  }
  for (const slug of PROGRAM_SLUGS) {
    const entry = content.programs[slug]
    const pill = entry ? programPill(entry.cohorts, now) : 'none'
    if (pill === 'open') m.openPrograms++
    if (pill === 'none') m.programsWithoutDates++
    if (!entry) continue
    for (const c of entry.cohorts) {
      if (!isOpen(c, now)) continue
      m.seatsLeft += c.seatsRemaining
      m.seatsTotal += c.totalSeats
    }
    const next = nextOpenCohort(entry.cohorts, now)
    if (next && (!m.nextStart || next.startDate < m.nextStart.startDate)) {
      m.nextStart = { slug, startDate: next.startDate, daysAway: dayNumber(next.startDate) - dayNumber(todayIso(now)) }
    }
  }
  return m
}

/** Change in open seats since the previous version, judged on the same day; null with nothing to compare. */
export function seatsLeftDelta(current: Content, previous: Content | null, now: Date = new Date()): number | null {
  if (!previous) return null
  return computeMetrics(current, now).seatsLeft - computeMetrics(previous, now).seatsLeft
}

const lagosMonth = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Africa/Lagos' })

/** Publishes in the current Lagos calendar month. Each backup marks one publish. */
export function publishesThisMonth(backups: readonly BackupInfo[], now: Date = new Date()): number {
  const month = lagosMonth.format(now)
  return backups.filter((b) => lagosMonth.format(new Date(b.savedAt)) === month).length
}
