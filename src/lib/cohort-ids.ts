import type { Cohort } from './content-schema'
import { isRealDate } from './dates'

/** Cohorts added in the editor carry a temporary id with this prefix until publish. */
export const NEW_COHORT_PREFIX = 'new-'

function yearQuarter(iso: string): { year: number; quarter: number } | null {
  if (!isRealDate(iso)) return null
  const [year, month] = iso.split('-').map(Number) as [number, number]
  return { year, quarter: Math.floor((month - 1) / 3) + 1 }
}

export function suggestCohortName(startDate: string): string {
  const yq = yearQuarter(startDate)
  return yq ? `Q${yq.quarter} ${yq.year} Cohort` : ''
}

export function cohortIdFor(startDate: string, taken: ReadonlySet<string>): string {
  const yq = yearQuarter(startDate)
  const base = yq ? `cohort-${yq.year}-q${yq.quarter}` : 'cohort'
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/** Replace temporary ids with permanent ones. Existing ids never change (win-back keys on them). */
export function finalizeCohortIds(cohorts: Cohort[]): Cohort[] {
  const taken = new Set(cohorts.filter((c) => !c.id.startsWith(NEW_COHORT_PREFIX)).map((c) => c.id))
  return cohorts.map((c) => {
    if (!c.id.startsWith(NEW_COHORT_PREFIX)) return c
    const id = cohortIdFor(c.startDate, taken)
    taken.add(id)
    return { ...c, id }
  })
}
