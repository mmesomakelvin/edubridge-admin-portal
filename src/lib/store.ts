import type { CohortsFeed } from './cohorts-feed'
import type { Content } from './content-schema'

export const CONTENT_PATH = 'content.json'
export const FEED_PATH = 'cohorts-feed.json'
export const BACKUP_PREFIX = 'backups/'
/**
 * One never-overwritten copy per version. content.json is overwritten on every publish, and Blob's CDN
 * keeps serving the old copy for a while, so the portal reads the newest version file instead.
 */
export const VERSIONS_PREFIX = 'versions/'
export const IMAGE_PREFIX = 'images/'
/** The only pathnames the upload route writes: images/<slug>-<sha16>.webp (see imagePathname). */
export const UPLOADED_IMAGE_PATH = /^images\/[a-z0-9-]+-[0-9a-f]{16}\.webp$/
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
  /** Set when the version that replaced this one was a rollback restoring this version number. */
  replacedByRollbackTo?: number
}
export interface RecentPublish {
  version: number
  at: string
  /** Set when this version was a rollback: the version whose content it restored. */
  restoredFrom?: number
}
export interface BackupOptions {
  /** The backup is being saved because a rollback to this version is replacing it. */
  rollbackTo?: number
}

/** Everything the portal needs from storage. Blob in real use; memory in tests and demo mode. */
export interface ContentStore {
  readContent(): Promise<{ content: Content; etag: string }>
  createContent(content: Content): Promise<void>
  /** Throws only when the content did not land: ConflictError if refused, otherwise the underlying error. */
  writeContent(content: Content, ifMatch: string): Promise<void>
  writeBackup(content: Content, savedAt: Date, opts?: BackupOptions): Promise<BackupInfo>
  deleteBackup(pathname: string): Promise<void>
  listBackups(): Promise<BackupInfo[]>
  readBackup(pathname: string): Promise<Content>
  writeFeed(feed: CohortsFeed): Promise<void>
  /** The content version the stored feed was built from; null if there is no feed or it predates versioning. */
  readFeedVersion(): Promise<number | null>
  putImage(pathname: string, body: Buffer, contentType: string): Promise<string>
  /** True only for an image this store saved through putImage and still holds; a newly published image must be one. */
  ownsImageUrl(url: string): Promise<boolean>
}

const pad6 = (n: number) => String(n).padStart(6, '0')

export function versionPathname(version: number): string {
  return `${VERSIONS_PREFIX}content-v${pad6(version)}.json`
}

const VERSION_RE = /^versions\/content-v(\d{6})\.json$/

export function versionFromPathname(pathname: string): number | null {
  const m = VERSION_RE.exec(pathname)
  return m ? Number(m[1]) : null
}

/** The rollback marker lives in the pathname so history can be shown without reading every backup. */
export function backupPathname(version: number, savedAt: Date, opts: BackupOptions = {}): string {
  const stamp = savedAt.toISOString().replace(/[:.]/g, '-')
  const marker = opts.rollbackTo === undefined ? '' : `-rollback-v${pad6(opts.rollbackTo)}`
  return `${BACKUP_PREFIX}content-v${pad6(version)}-${stamp}${marker}.json`
}

const BACKUP_RE = /^backups\/content-v(\d{6})-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(?:-rollback-v(\d{6}))?\.json$/

export function backupInfoFromPathname(pathname: string): BackupInfo | null {
  const m = BACKUP_RE.exec(pathname)
  if (!m) return null
  const info: BackupInfo = { pathname, version: Number(m[1]), savedAt: `${m[2]}T${m[3]}:${m[4]}:${m[5]}.${m[6]}Z` }
  if (m[7]) info.replacedByRollbackTo = Number(m[7])
  return info
}

export function sortBackups(list: BackupInfo[]): BackupInfo[] {
  return [...list].sort((a, b) => b.version - a.version || b.savedAt.localeCompare(a.savedAt))
}

/** A backup of version v saved at T means version v+1 was published at T. */
export function recentPublishes(backups: BackupInfo[], n = 3): RecentPublish[] {
  return sortBackups(backups)
    .slice(0, n)
    .map((b) => ({ version: b.version + 1, at: b.savedAt, ...(b.replacedByRollbackTo === undefined ? {} : { restoredFrom: b.replacedByRollbackTo }) }))
}
