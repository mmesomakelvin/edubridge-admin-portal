/**
 * Derives the live status of a cohort from today's date + seatsRemaining.
 * PORTED VERBATIM from ea-website-revamp/src/lib/cohort-status.ts — keep the two in sync.
 *
 * - 'ended'    The endDate has passed. Cohort is over; show 'Cohort ended'.
 * - 'full'     Today is between startDate and endDate (program in session),
 *              OR cohort hasn't started yet but seatsRemaining is 0.
 * - 'open'     Cohort hasn't started AND has seats. Visitors can enrol.
 *
 * Date comparison uses calendar days (UTC-normalised) so a cohort that
 * 'ends Saturday' is still counted as full all day Saturday and switches
 * to ended on Sunday.
 *
 * Shared by every school page (Finance, Data, SOMC, AFM, HR) and their
 * enrolment forms so all date math lives in one place.
 */
export type CohortStatus = 'open' | 'full' | 'ended'

export interface CohortLike {
  startDate: string // ISO yyyy-mm-dd
  endDate: string // ISO yyyy-mm-dd
  seatsRemaining: number
}

function toDayNumber(iso: string): number {
  // Treat the string as a calendar day in UTC. parseInt avoids timezone
  // ambiguity for short ISO dates ('2026-07-11' -> 2026-07-11 UTC midnight).
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1)
}

function todayDayNumber(now: Date = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
}

export function getCohortStatus(
  cohort: CohortLike,
  now: Date = new Date(),
): CohortStatus {
  const today = todayDayNumber(now)
  const start = toDayNumber(cohort.startDate)
  const end = toDayNumber(cohort.endDate)

  if (today > end) return 'ended'
  if (today >= start) return 'full' // in session
  if (cohort.seatsRemaining <= 0) return 'full' // sold out pre-start
  return 'open'
}

export function isCohortSelectable(
  cohort: CohortLike,
  now: Date = new Date(),
): boolean {
  return getCohortStatus(cohort, now) === 'open'
}
