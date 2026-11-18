import { isDeepStrictEqual } from 'node:util'
import type { Cohort, Content, ProgramContent } from './content-schema'
import { PROGRAMS } from './programs'
import { commitContent } from './publish'
import { readSiteProgram, type SeedSource } from './seed'
import type { ContentStore } from './store'
import { issueLabel, validateProgram } from './validate'

export interface ProgramSyncChange {
  slug: string
  added: Cohort[]
  removed: Cohort[]
  moved: { before: Cohort; after: Cohort }[]
}

export interface SitePlan {
  programs: Content['programs']
  changes: ProgramSyncChange[]
  /** Differences this sync deliberately leaves alone (only cohorts are copied). */
  notCopied: string[]
  /** Anything here stops the whole sync. */
  problems: string[]
}

export type SiteSyncResult =
  | { ok: true; version: number; changed: number; feedUpdated: boolean }
  | { ok: false; reason: 'version-changed'; liveVersion: number }
  | { ok: false; reason: 'problems'; problems: string[] }
  | { ok: false; reason: 'conflict' }

function describeChange(slug: string, live: Cohort[], site: Cohort[]): ProgramSyncChange {
  const liveById = new Map(live.map((c) => [c.id, c]))
  const siteIds = new Set(site.map((c) => c.id))
  const moved: ProgramSyncChange['moved'] = []
  const added: Cohort[] = []
  for (const after of site) {
    const before = liveById.get(after.id)
    if (!before) added.push(after)
    else if (!isDeepStrictEqual(before, after)) moved.push({ before, after })
  }
  return { slug, added, removed: live.filter((c) => !siteIds.has(c.id)), moved }
}

/**
 * Work out what copying the website's cohorts into the portal would change. Until Plan 2 ships, the
 * website's data files are where dates are edited, so they win. Writes nothing.
 */
export async function planSiteSync(content: Content, source: SeedSource, now: Date = new Date()): Promise<SitePlan> {
  const plan: SitePlan = { programs: { ...content.programs }, changes: [], notCopied: [], problems: [] }
  for (const { slug } of PROGRAMS) {
    const live = content.programs[slug]
    if (!live) {
      plan.problems.push(`${slug}: missing from the portal`)
      continue
    }
    const site = await readSiteProgram(source, slug)
    if (!isDeepStrictEqual(live.pricing, site.pricing)) plan.notCopied.push(`${slug}: pricing differs`)
    if (live.heroPriceLabel !== site.heroPriceLabel) plan.notCopied.push(`${slug}: hero price label differs`)
    if (site.cohorts.length === 0) {
      plan.problems.push(`${slug}: the website lists no cohorts`)
      continue
    }
    if (isDeepStrictEqual(live.cohorts, site.cohorts)) continue

    const draft: ProgramContent = { ...live, cohorts: site.cohorts }
    const errors = validateProgram(draft, { now, original: live }).filter((issue) => issue.level === 'error')
    if (errors.length > 0) {
      plan.problems.push(...errors.map((issue) => `${slug}: ${issueLabel(issue, draft)}`))
      continue
    }
    plan.programs[slug] = draft
    plan.changes.push(describeChange(slug, live.cohorts, site.cohorts))
  }
  return plan
}

/** Publish the plan as one new version, with the same backup, write guard and feed update as a normal publish. */
export async function applySiteSync(
  store: ContentStore,
  input: { source: SeedSource; expectedVersion: number; by: string; now?: Date },
): Promise<SiteSyncResult> {
  const now = input.now ?? new Date()
  const { content, etag } = await store.readContent()
  if (content.version !== input.expectedVersion) return { ok: false, reason: 'version-changed', liveVersion: content.version }

  const plan = await planSiteSync(content, input.source, now)
  if (plan.problems.length > 0) return { ok: false, reason: 'problems', problems: plan.problems }
  if (plan.changes.length === 0) return { ok: true, version: content.version, changed: 0, feedUpdated: false }

  const backup = await store.writeBackup(content, now)
  const next: Content = {
    ...content,
    version: content.version + 1,
    updatedAt: now.toISOString(),
    updatedBy: input.by,
    programs: plan.programs,
  }
  const result = await commitContent(store, next, etag, backup)
  if (!result.ok) return { ok: false, reason: 'conflict' }
  return { ok: true, version: next.version, changed: plan.changes.length, feedUpdated: result.feedUpdated }
}
