import { BlobError, BlobNotFoundError, BlobPreconditionFailedError, del, get, head, list, put } from '@vercel/blob'
import type { CohortsFeed } from './cohorts-feed'
import { ContentSchema, type Content } from './content-schema'
import {
  BACKUP_PREFIX,
  CONTENT_MAX_AGE_SECONDS,
  CONTENT_PATH,
  ConflictError,
  FEED_PATH,
  NotSeededError,
  VERSIONS_PREFIX,
  backupInfoFromPathname,
  backupPathname,
  sortBackups,
  versionFromPathname,
  versionPathname,
  type BackupInfo,
  type BackupOptions,
  type ContentStore,
} from './store'

const ONE_YEAR = 60 * 60 * 24 * 365
const JSON_TYPE = 'application/json'

// Blob compresses larger files when serving them and marks the etag weak (W/"…"); put({ ifMatch })
// only accepts the strong form of the same tag.
const strongEtag = (etag: string) => etag.replace(/^W\//, '')

// The SDK has no dedicated class for "allowOverwrite: false and the pathname is taken".
const isAlreadyExists = (error: unknown) => error instanceof BlobError && /already exists/i.test(error.message)

/**
 * Vercel Blob implementation. Public-read objects; writes need BLOB_READ_WRITE_TOKEN (server only).
 *
 * Why version files: Blob's CDN keeps serving an overwritten public file for several seconds, and
 * neither `get({ useCache: false })` (private stores only) nor a query string gets past it. So
 * content.json, which the public site reads, is overwritten as before, but every version is also
 * written once to versions/content-vNNNNNN.json. The portal reads the newest of those (a never-
 * overwritten URL is never stale), takes content.json's etag from head() (always current), and
 * relies on "each version file can be created only once" as a second publish guard.
 */
export function createBlobStore(token = process.env.BLOB_READ_WRITE_TOKEN): ContentStore {
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is not set')
  const base = { access: 'public' as const, token, addRandomSuffix: false }

  async function readJson(pathname: string): Promise<{ json: unknown; etag: string } | null> {
    const result = await get(pathname, { access: 'public', token, useCache: false })
    if (!result) return null
    const text = await new Response(result.stream).text()
    return { json: JSON.parse(text), etag: strongEtag(result.blob.etag) }
  }

  function putJson(pathname: string, data: unknown, options: { allowOverwrite: boolean; cacheControlMaxAge: number; ifMatch?: string }) {
    return put(pathname, JSON.stringify(data, null, 2), { ...base, contentType: JSON_TYPE, ...options })
  }

  async function listAll(prefix: string): Promise<{ pathname: string; url: string }[]> {
    const found: { pathname: string; url: string }[] = []
    let cursor: string | undefined
    do {
      const page = await list({ prefix, token, cursor, limit: 1000 })
      found.push(...page.blobs)
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor)
    return found
  }

  async function newestVersionFile(): Promise<{ version: number; url: string } | null> {
    let newest: { version: number; url: string } | null = null
    for (const blob of await listAll(VERSIONS_PREFIX)) {
      const version = versionFromPathname(blob.pathname)
      if (version !== null && (!newest || version > newest.version)) newest = { version, url: blob.url }
    }
    return newest
  }

  return {
    async readContent() {
      // head() first: if a publish lands between these calls, the etag is the older one and that
      // publish's version file is newer, so any write based on this read is refused, never misapplied.
      let etag: string
      try {
        etag = strongEtag((await head(CONTENT_PATH, { token })).etag)
      } catch (error) {
        if (error instanceof BlobNotFoundError) throw new NotSeededError()
        throw error
      }
      const newest = await newestVersionFile()
      if (newest) {
        const response = await fetch(newest.url, { cache: 'no-store' })
        if (!response.ok) throw new Error(`Could not read ${newest.url}: HTTP ${response.status}`)
        return { content: ContentSchema.parse(await response.json()), etag }
      }
      // A store seeded before version files existed; its first publish creates them.
      const legacy = await readJson(CONTENT_PATH)
      if (!legacy) throw new NotSeededError()
      return { content: ContentSchema.parse(legacy.json), etag }
    },
    async createContent(content: Content) {
      // content.json first: it refuses to overwrite, so a second seed stops before touching anything.
      await putJson(CONTENT_PATH, content, { allowOverwrite: false, cacheControlMaxAge: CONTENT_MAX_AGE_SECONDS })
      await putJson(versionPathname(content.version), content, { allowOverwrite: false, cacheControlMaxAge: ONE_YEAR })
    },
    async writeContent(content: Content, ifMatch: string) {
      const versionFile = versionPathname(content.version)
      try {
        await putJson(versionFile, content, { allowOverwrite: false, cacheControlMaxAge: ONE_YEAR })
      } catch (error) {
        if (isAlreadyExists(error)) throw new ConflictError()
        throw error
      }
      try {
        await putJson(CONTENT_PATH, content, { allowOverwrite: true, ifMatch, cacheControlMaxAge: CONTENT_MAX_AGE_SECONDS })
      } catch (error) {
        // Only a refused write proves content.json is unchanged; any other failure might have landed.
        if (!(error instanceof BlobPreconditionFailedError)) throw error
        await del(versionFile, { token }).catch((cleanupError: unknown) => {
          console.error(`could not remove ${versionFile} after a refused write`, cleanupError)
        })
        throw new ConflictError()
      }
    },
    async writeBackup(content: Content, savedAt: Date, opts?: BackupOptions): Promise<BackupInfo> {
      const pathname = backupPathname(content.version, savedAt, opts)
      await putJson(pathname, content, { allowOverwrite: false, cacheControlMaxAge: ONE_YEAR })
      return backupInfoFromPathname(pathname)!
    },
    async deleteBackup(pathname: string) {
      await del(pathname, { token })
    },
    async listBackups() {
      const infos = (await listAll(BACKUP_PREFIX)).map((b) => backupInfoFromPathname(b.pathname)).filter((b): b is BackupInfo => b !== null)
      return sortBackups(infos)
    },
    async readBackup(pathname: string) {
      const result = await readJson(pathname)
      if (!result) throw new Error(`No backup at ${pathname}`)
      return ContentSchema.parse(result.json)
    },
    async writeFeed(feed: CohortsFeed) {
      await putJson(FEED_PATH, feed, { allowOverwrite: true, cacheControlMaxAge: CONTENT_MAX_AGE_SECONDS })
    },
    async putImage(pathname: string, body: Buffer, contentType: string) {
      // Hashed names mean identical bytes map to the same object, so overwrite is harmless.
      const blob = await put(pathname, body, { ...base, contentType, allowOverwrite: true, cacheControlMaxAge: ONE_YEAR })
      return blob.url
    },
  }
}
