import type { Content } from './content-schema'
import {
  ConflictError,
  FEED_PATH,
  NotSeededError,
  backupInfoFromPathname,
  backupPathname,
  sortBackups,
  type BackupInfo,
  type ContentStore,
} from './store'

export type MemoryStore = ContentStore & { files: Map<string, unknown> }

/** In-process store for tests and local demo mode. Mirrors Blob semantics (etags, create-once). */
export function createMemoryStore(initial?: Content): MemoryStore {
  const files = new Map<string, unknown>()
  let etagCounter = 0
  const nextEtag = () => `"m${++etagCounter}"`
  let current: { value: Content; etag: string } | null = initial ? { value: structuredClone(initial), etag: nextEtag() } : null

  return {
    files,
    async readContent() {
      if (!current) throw new NotSeededError()
      return { content: structuredClone(current.value), etag: current.etag }
    },
    async createContent(content) {
      if (current) throw new Error('content.json already exists')
      current = { value: structuredClone(content), etag: nextEtag() }
    },
    async writeContent(content, ifMatch) {
      if (!current || current.etag !== ifMatch) throw new ConflictError()
      current = { value: structuredClone(content), etag: nextEtag() }
    },
    async writeBackup(content, savedAt, opts) {
      const pathname = backupPathname(content.version, savedAt, opts)
      files.set(pathname, structuredClone(content))
      return backupInfoFromPathname(pathname)!
    },
    async listBackups() {
      const infos = [...files.keys()].map(backupInfoFromPathname).filter((b): b is BackupInfo => b !== null)
      return sortBackups(infos)
    },
    async readBackup(pathname) {
      const value = files.get(pathname)
      if (!value) throw new Error(`No backup at ${pathname}`)
      return structuredClone(value) as Content
    },
    async writeFeed(feed) {
      files.set(FEED_PATH, structuredClone(feed))
    },
    async putImage(pathname, body, contentType) {
      files.set(pathname, Buffer.from(body))
      return `data:${contentType};base64,${Buffer.from(body).toString('base64')}`
    },
  }
}
