import { finalizeCohortIds } from './cohort-ids'
import { buildCohortsFeed } from './cohorts-feed'
import { ProgramContentSchema, type Content } from './content-schema'
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
 * Write content (etag-guarded), then the derived feed. A failed feed write never undoes a publish.
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
    await store.writeFeed(buildCohortsFeed(next))
    return { ok: true, feedUpdated: true }
  } catch (error) {
    console.error('cohorts-feed.json write failed; the next publish will rewrite it', error)
    return { ok: true, feedUpdated: false }
  }
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

  const draft = { ...parsed.data, cohorts: finalizeCohortIds(parsed.data.cohorts) }
  const issues = validateProgram(draft, { now, original: content.programs[input.slug] })
  if (hasErrors(issues)) return { ok: false, reason: 'invalid', issues }

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
