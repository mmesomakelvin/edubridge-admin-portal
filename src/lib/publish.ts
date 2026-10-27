import { finalizeCohortIds } from './cohort-ids'
import { ProgramContentSchema, type Content, type PricingOption } from './content-schema'
import { syncFeed } from './feed-sync'
import { isProgramSlug } from './programs'
import { ConflictError, type BackupInfo, type ContentStore } from './store'
import { hasErrors, validateProgram, type Issue } from './validate'

export interface PublishInput {
  slug: string
  draft: unknown
  baseVersion: number
  by: string
  now?: Date
}
export type PublishResult =
  | { ok: true; version: number; feedUpdated: boolean }
  | { ok: false; reason: 'invalid'; issues: Issue[] }
  | { ok: false; reason: 'conflict' }
  | { ok: false; reason: 'unknown-program' }

export interface RollbackInput {
  baseVersion: number
  by: string
  now?: Date
}
export type RollbackResult =
  | { ok: true; version: number; restoredFrom: number; feedUpdated: boolean }
  | { ok: false; reason: 'conflict' | 'no-backup' }

/**
 * Write content (etag-guarded), then the derived feed (see syncFeed). A failed feed write never undoes
 * a publish; reconcileFeed repairs the feed later.
 * writeContent only throws when the content did not land (blob-store checks before reporting), so any
 * failure removes the backup saved for it and history never shows a publish that didn't happen.
 */
async function commit(
  store: ContentStore,
  next: Content,
  etag: string,
  backup: BackupInfo,
): Promise<{ ok: true; feedUpdated: boolean } | { ok: false }> {
  try {
    await store.writeContent(next, etag)
  } catch (error) {
    await store.deleteBackup(backup.pathname).catch((cleanupError: unknown) => {
      console.error(`could not remove ${backup.pathname} after a failed write`, cleanupError)
    })
    if (error instanceof ConflictError) return { ok: false }
    throw error
  }
  try {
    await syncFeed(store, next)
    return { ok: true, feedUpdated: true }
  } catch (error) {
    console.error('cohorts-feed.json write failed; reconcileFeed will rebuild it', error)
    return { ok: true, feedUpdated: false }
  }
}

/**
 * The editor changes only an option's title, price label, amount and description. Its order, highlights
 * and "recommended" badge are kept from the live version, so a draft can't change what the review panel
 * doesn't show (issue #3). Unknown options pass through so validateProgram can reject an added or
 * removed option.
 */
export function keepPricingLayout(live: PricingOption[], draft: PricingOption[]): PricingOption[] {
  const edits = new Map(draft.map((o) => [o.id, o]))
  const kept = live.flatMap((o) => {
    const edit = edits.get(o.id)
    return edit ? [{ ...o, title: edit.title, priceLabel: edit.priceLabel, amount: edit.amount, description: edit.description }] : []
  })
  const liveIds = new Set(live.map((o) => o.id))
  return [...kept, ...draft.filter((o) => !liveIds.has(o.id))]
}

export async function publishProgram(store: ContentStore, input: PublishInput): Promise<PublishResult> {
  if (!isProgramSlug(input.slug)) return { ok: false, reason: 'unknown-program' }
  const parsed = ProgramContentSchema.safeParse(input.draft)
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid',
      issues: [{ path: '', level: 'error', message: 'The edit could not be read. Reload the page and try again' }],
    }
  }

  const now = input.now ?? new Date()
  const { content, etag } = await store.readContent()
  if (content.version !== input.baseVersion) return { ok: false, reason: 'conflict' }

  const live = content.programs[input.slug]
  const draft = {
    ...parsed.data,
    cohorts: finalizeCohortIds(parsed.data.cohorts),
    pricing: live ? keepPricingLayout(live.pricing, parsed.data.pricing) : parsed.data.pricing,
  }
  const issues = validateProgram(draft, { now, original: content.programs[input.slug] })
  if (hasErrors(issues)) return { ok: false, reason: 'invalid', issues }
  // A changed image must be one this store handed out (validate.ts only checks the URL's shape).
  if (draft.landingImageUrl !== content.programs[input.slug]?.landingImageUrl && !(await store.ownsImageUrl(draft.landingImageUrl))) {
    return { ok: false, reason: 'invalid', issues: [{ path: 'landingImageUrl', level: 'error', message: 'Upload the image here instead of pasting a link' }] }
  }

  const backup = await store.writeBackup(content, now)
  const next: Content = {
    ...content,
    version: content.version + 1,
    updatedAt: now.toISOString(),
    updatedBy: input.by,
    programs: { ...content.programs, [input.slug]: draft },
  }
  const result = await commit(store, next, etag, backup)
  return result.ok ? { ok: true, version: next.version, feedUpdated: result.feedUpdated } : { ok: false, reason: 'conflict' }
}

export async function rollbackLastPublish(store: ContentStore, input: RollbackInput): Promise<RollbackResult> {
  const now = input.now ?? new Date()
  const { content, etag } = await store.readContent()
  if (content.version !== input.baseVersion) return { ok: false, reason: 'conflict' }

  const target = (await store.listBackups()).find((b) => b.version < content.version)
  if (!target) return { ok: false, reason: 'no-backup' }
  const restored = await store.readBackup(target.pathname)

  const backup = await store.writeBackup(content, now, { rollbackTo: target.version })
  const next: Content = { ...restored, version: content.version + 1, updatedAt: now.toISOString(), updatedBy: input.by }
  const result = await commit(store, next, etag, backup)
  return result.ok
    ? { ok: true, version: next.version, restoredFrom: target.version, feedUpdated: result.feedUpdated }
    : { ok: false, reason: 'conflict' }
}
