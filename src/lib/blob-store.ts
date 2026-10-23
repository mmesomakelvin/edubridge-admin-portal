import { BlobPreconditionFailedError, get, list, put } from '@vercel/blob'
import type { CohortsFeed } from './cohorts-feed'
import { ContentSchema, type Content } from './content-schema'
import {
  BACKUP_PREFIX,
  CONTENT_MAX_AGE_SECONDS,
  CONTENT_PATH,
  ConflictError,
  FEED_PATH,
  NotSeededError,
  backupInfoFromPathname,
  backupPathname,
  sortBackups,
  type BackupInfo,
  type BackupOptions,
  type ContentStore,
} from './store'

const ONE_YEAR = 60 * 60 * 24 * 365
const JSON_TYPE = 'application/json'

/** Vercel Blob implementation. Public-read objects; writes need BLOB_READ_WRITE_TOKEN (server only). */
export function createBlobStore(token = process.env.BLOB_READ_WRITE_TOKEN): ContentStore {
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is not set')
  const base = { access: 'public' as const, token, addRandomSuffix: false }

  // Reads bypass the CDN so the editor always starts from the latest version.
  // Fallback if `get` is unavailable: head(pathname, { token }) for { url, etag },
  // then fetch(`${url}?v=${encodeURIComponent(etag)}`, { cache: 'no-store' }).
  async function readJson(pathname: string): Promise<{ json: unknown; etag: string } | null> {
    const result = await get(pathname, { access: 'public', token, useCache: false })
    if (!result) return null
    const text = await new Response(result.stream).text()
    // Blob compresses larger files when serving them and marks the etag weak (W/"…"); put({ ifMatch })
    // only accepts the strong form of the same tag, so drop the prefix or every publish looks like a conflict.
    return { json: JSON.parse(text), etag: result.blob.etag.replace(/^W\//, '') }
  }

  function putJson(pathname: string, data: unknown, options: { allowOverwrite: boolean; cacheControlMaxAge: number; ifMatch?: string }) {
    return put(pathname, JSON.stringify(data, null, 2), { ...base, contentType: JSON_TYPE, ...options })
  }

  return {
    async readContent() {
      const result = await readJson(CONTENT_PATH)
      if (!result) throw new NotSeededError()
      return { content: ContentSchema.parse(result.json), etag: result.etag }
    },
    async createContent(content: Content) {
      await putJson(CONTENT_PATH, content, { allowOverwrite: false, cacheControlMaxAge: CONTENT_MAX_AGE_SECONDS })
    },
    async writeContent(content: Content, ifMatch: string) {
      try {
        await putJson(CONTENT_PATH, content, { allowOverwrite: true, ifMatch, cacheControlMaxAge: CONTENT_MAX_AGE_SECONDS })
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) throw new ConflictError()
        throw error
      }
    },
    async writeBackup(content: Content, savedAt: Date, opts?: BackupOptions): Promise<BackupInfo> {
      const pathname = backupPathname(content.version, savedAt, opts)
      await putJson(pathname, content, { allowOverwrite: false, cacheControlMaxAge: ONE_YEAR })
      return backupInfoFromPathname(pathname)!
    },
    async listBackups() {
      const infos: BackupInfo[] = []
      let cursor: string | undefined
      do {
        const page = await list({ prefix: BACKUP_PREFIX, token, cursor, limit: 1000 })
        for (const blob of page.blobs) {
          const info = backupInfoFromPathname(blob.pathname)
          if (info) infos.push(info)
        }
        cursor = page.hasMore ? page.cursor : undefined
      } while (cursor)
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
