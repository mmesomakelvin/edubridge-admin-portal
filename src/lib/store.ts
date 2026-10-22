import type { CohortsFeed } from './cohorts-feed'
import type { Content } from './content-schema'

export const CONTENT_PATH = 'content.json'
export const FEED_PATH = 'cohorts-feed.json'
export const BACKUP_PREFIX = 'backups/'
export const IMAGE_PREFIX = 'images/'
/** Public cache lifetime for content.json and the feed: "live within about a minute". */
export const CONTENT_MAX_AGE_SECONDS = 60

export class ConflictError extends Error {
  constructor() {
    super('content.json changed since it was read')
    this.name = 'ConflictError'
  }
}
export class NotSeededError extends Error {
  constructor() {
    super('content.json does not exist yet; run the seed script')
    this.name = 'NotSeededError'
  }
}

export interface BackupInfo {
  pathname: string
  version: number
  savedAt: string
}
export interface RecentPublish {
  version: number
  at: string
}

/** Everything the portal needs from storage. Blob in real use; memory in tests and demo mode. */
export interface ContentStore {
  readContent(): Promise<{ content: Content; etag: string }>
  createContent(content: Content): Promise<void>
  writeContent(content: Content, ifMatch: string): Promise<void>
  writeBackup(content: Content, savedAt: Date): Promise<BackupInfo>
  listBackups(): Promise<BackupInfo[]>
  readBackup(pathname: string): Promise<Content>
  writeFeed(feed: CohortsFeed): Promise<void>
  putImage(pathname: string, body: Buffer, contentType: string): Promise<string>
}

export function backupPathname(version: number, savedAt: Date): string {
  const stamp = savedAt.toISOString().replace(/[:.]/g, '-')
  return `${BACKUP_PREFIX}content-v${String(version).padStart(6, '0')}-${stamp}.json`
}

const BACKUP_RE = /^backups\/content-v(\d{6})-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/

export function backupInfoFromPathname(pathname: string): BackupInfo | null {
  const m = BACKUP_RE.exec(pathname)
  if (!m) return null
  return { pathname, version: Number(m[1]), savedAt: `${m[2]}T${m[3]}:${m[4]}:${m[5]}.${m[6]}Z` }
}

export function sortBackups(list: BackupInfo[]): BackupInfo[] {
  return [...list].sort((a, b) => b.version - a.version || b.savedAt.localeCompare(a.savedAt))
}

/** A backup of version v saved at T means version v+1 was published at T. */
export function recentPublishes(backups: BackupInfo[], n = 3): RecentPublish[] {
  return sortBackups(backups)
    .slice(0, n)
    .map((b) => ({ version: b.version + 1, at: b.savedAt }))
}
