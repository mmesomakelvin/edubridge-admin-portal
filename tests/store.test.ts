import { describe, expect, it } from 'vitest'
import { createMemoryStore } from '@/lib/memory-store'
import { ConflictError, NotSeededError, backupInfoFromPathname, backupPathname, recentPublishes, versionFromPathname, versionPathname } from '@/lib/store'
import { content } from './fixtures'

describe('backup pathnames', () => {
  it('round-trips version and time', () => {
    const pathname = backupPathname(12, new Date('2026-10-14T12:30:05.123Z'))
    expect(pathname).toBe('backups/content-v000012-2026-10-14T12-30-05-123Z.json')
    expect(backupInfoFromPathname(pathname)).toEqual({ pathname, version: 12, savedAt: '2026-10-14T12:30:05.123Z' })
  })
  it('records when the version was replaced by a rollback, and to which version', () => {
    const pathname = backupPathname(12, new Date('2026-10-14T12:30:05.123Z'), { rollbackTo: 9 })
    expect(pathname).toBe('backups/content-v000012-2026-10-14T12-30-05-123Z-rollback-v000009.json')
    expect(backupInfoFromPathname(pathname)).toEqual({ pathname, version: 12, savedAt: '2026-10-14T12:30:05.123Z', replacedByRollbackTo: 9 })
  })
  it('ignores unrelated files', () => {
    expect(backupInfoFromPathname('backups/notes.txt')).toBeNull()
  })
})

describe('version file pathnames', () => {
  it('round-trips the version number', () => {
    expect(versionPathname(3)).toBe('versions/content-v000003.json')
    expect(versionFromPathname('versions/content-v000003.json')).toBe(3)
  })
  it('ignores unrelated files', () => {
    expect(versionFromPathname('versions/notes.txt')).toBeNull()
  })
})

describe('recentPublishes', () => {
  it('turns backups into the versions that replaced them, newest first', () => {
    const backups = [
      { pathname: 'c', version: 3, savedAt: '2026-10-14T12:00:00.000Z' },
      { pathname: 'b', version: 2, savedAt: '2026-10-13T12:00:00.000Z' },
      { pathname: 'a', version: 1, savedAt: '2026-10-12T12:00:00.000Z' },
    ]
    expect(recentPublishes(backups, 2)).toEqual([
      { version: 4, at: '2026-10-14T12:00:00.000Z' },
      { version: 3, at: '2026-10-13T12:00:00.000Z' },
    ])
  })
  it('labels a version that was a rollback with the version it restored', () => {
    const backups = [
      { pathname: 'b', version: 3, savedAt: '2026-10-14T12:00:00.000Z', replacedByRollbackTo: 2 },
      { pathname: 'a', version: 2, savedAt: '2026-10-13T12:00:00.000Z' },
    ]
    expect(recentPublishes(backups)).toEqual([
      { version: 4, at: '2026-10-14T12:00:00.000Z', restoredFrom: 2 },
      { version: 3, at: '2026-10-13T12:00:00.000Z' },
    ])
  })
})

describe('memory store', () => {
  it('reports an unseeded store', async () => {
    await expect(createMemoryStore().readContent()).rejects.toBeInstanceOf(NotSeededError)
  })

  it('creates content only once', async () => {
    const store = createMemoryStore()
    await store.createContent(content())
    await expect(store.createContent(content())).rejects.toThrow(/already exists/)
  })

  it('rejects writes made with a stale etag', async () => {
    const store = createMemoryStore(content())
    const { etag } = await store.readContent()
    await store.writeContent(content({ version: 2 }), etag)
    await expect(store.writeContent(content({ version: 3 }), etag)).rejects.toBeInstanceOf(ConflictError)
  })

  it('refuses a version number that already has a version file', async () => {
    const store = createMemoryStore(content())
    const { etag } = await store.readContent()
    store.files.set(versionPathname(2), content({ version: 2, updatedBy: 'other tab' }))
    await expect(store.writeContent(content({ version: 2 }), etag)).rejects.toBeInstanceOf(ConflictError)
    expect((await store.readContent()).content.version).toBe(1)
  })

  it('keeps a version file for every version it writes', async () => {
    const store = createMemoryStore()
    await store.createContent(content())
    await store.writeContent(content({ version: 2 }), (await store.readContent()).etag)
    expect([...store.files.keys()].filter((k) => k.startsWith('versions/'))).toEqual([versionPathname(1), versionPathname(2)])
  })

  it('hands out copies, not live references', async () => {
    const store = createMemoryStore(content())
    const first = await store.readContent()
    first.content.version = 99
    expect((await store.readContent()).content.version).toBe(1)
  })

  it('lists backups newest first and reads them back', async () => {
    const store = createMemoryStore(content())
    await store.writeBackup(content({ version: 1 }), new Date('2026-10-14T10:00:00Z'))
    await store.writeBackup(content({ version: 2 }), new Date('2026-10-14T11:00:00Z'))
    const backups = await store.listBackups()
    expect(backups.map((b) => b.version)).toEqual([2, 1])
    expect((await store.readBackup(backups[1]!.pathname)).version).toBe(1)
  })

  it('owns only the data-URL images it hands out', async () => {
    const store = createMemoryStore()
    const url = await store.putImage('images/x-0123456789abcdef.webp', Buffer.from('abc'), 'image/webp')
    expect(await store.ownsImageUrl(url)).toBe(true)
    // Issue #4: any well-formed data image used to pass.
    expect(await store.ownsImageUrl('data:image/png;base64,AAAA')).toBe(false)
    expect(await store.ownsImageUrl('https://abc.public.blob.vercel-storage.com/images/x-0123456789abcdef.webp')).toBe(false)
  })

  it('returns a data URL for images', async () => {
    const url = await createMemoryStore().putImage('images/x.webp', Buffer.from('abc'), 'image/webp')
    expect(url).toBe('data:image/webp;base64,YWJj')
  })
})
