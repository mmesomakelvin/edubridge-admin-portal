import type { Content } from './content-schema'
import { PROGRAMS, liveUrl } from './programs'

/**
 * cohorts-feed.json — same shape as the public repo's public/cohorts.json,
 * which apps-script/Code.gs reads as feed.programs[program_id].{url,cohorts}.
 */
export interface FeedCohort {
  id: string
  name: string
  startDate: string
  endDate: string
}
export interface CohortsFeed {
  programs: Record<string, { url: string; cohorts: FeedCohort[] }>
}

export function buildCohortsFeed(content: Content): CohortsFeed {
  const programs: CohortsFeed['programs'] = {}
  const ordered = [...PROGRAMS].sort((a, b) => a.slug.localeCompare(b.slug))
  for (const info of ordered) {
    const entry = content.programs[info.slug]
    if (!entry || entry.cohorts.length === 0) continue
    programs[info.slug] = {
      url: liveUrl(info),
      cohorts: entry.cohorts
        .map(({ id, name, startDate, endDate }) => ({ id, name, startDate, endDate }))
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    }
  }
  return { programs }
}
