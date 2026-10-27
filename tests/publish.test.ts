import { describe, expect, it, vi } from 'vitest'
import { createMemoryStore } from '@/lib/memory-store'
import { publishProgram, rollbackLastPublish } from '@/lib/publish'
import type { CohortsFeed } from '@/lib/cohorts-feed'
import { FEED_PATH } from '@/lib/store'
import { NOW, cohort, content, program } from './fixtures'

const by = 'hello@edubridgeacademy.com'
const slug = 'school-of-finance'
const edited = () => program({ cohorts: [cohort({ seatsRemaining: 5 })] })
const named = (name: string) => program({ cohorts: [cohort({ name })] })
const feedOf = (store: ReturnType<typeof createMemoryStore>) => store.files.get(FEED_PATH) as CohortsFeed

/** Holds the store's next feed write until release(); `reached` resolves once that write has started. */
function pauseNextFeedWrite(store: ReturnType<typeof createMemoryStore>) {
  const write = store.writeFeed
  let release!: () => void
  let arrived!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const reached = new Promise<void>((r) => (arrived = r))
  let paused = false
  store.writeFeed = async (feed) => {
    if (!paused) {
      paused = true
      arrived()
      await gate
    }
    return write(feed)
  }
  return { reached, release }
}

describe('publishProgram', () => {
  it('saves the edit as a new version, backs up the old one and refreshes the feed', async () => {
    const store = createMemoryStore(content())
    const result = await publishProgram(store, { slug, draft: edited(), baseVersion: 1, by, now: NOW })
    expect(result).toEqual({ ok: true, version: 2, feedUpdated: true })

    const { content: saved } = await store.readContent()
    expect(saved).toMatchObject({ version: 2, updatedBy: by, updatedAt: NOW.toISOString() })
    expect(saved.programs[slug]?.cohorts[0]?.seatsRemaining).toBe(5)

    const backups = await store.listBackups()
    expect(backups.map((b) => b.version)).toEqual([1])
    expect(await store.readBackup(backups[0]!.pathname)).toEqual(content())
    expect(store.files.get(FEED_PATH)).toMatchObject({ version: 2, programs: { [slug]: { cohorts: [{ id: 'cohort-2027-q1' }] } } })
  })

  // Issue #1: A wrote content v2 and stalled before its feed write; B then published v3 and its feed.
  // A's late write used to leave the v2 feed in place while v3 was live.
  it('a publish whose feed write is overtaken leaves the newest feed in place', async () => {
    const store = createMemoryStore(content())
    const pause = pauseNextFeedWrite(store)
    const a = publishProgram(store, { slug, draft: named('A'), baseVersion: 1, by, now: NOW })
    await pause.reached
    expect(await publishProgram(store, { slug, draft: named('B'), baseVersion: 2, by, now: NOW })).toMatchObject({ ok: true, version: 3 })
    pause.release()

    expect(await a).toEqual({ ok: true, version: 2, feedUpdated: true })
    expect(feedOf(store)).toMatchObject({ version: 3, programs: { [slug]: { cohorts: [{ name: 'B' }] } } })
  })

  it('retries a feed write that fails once', async () => {
    const store = createMemoryStore(content())
    const write = store.writeFeed
    let calls = 0
    store.writeFeed = async (feed) => {
      if (++calls === 1) throw new Error('blob hiccup')
      return write(feed)
    }
    expect(await publishProgram(store, { slug, draft: edited(), baseVersion: 1, by, now: NOW })).toEqual({ ok: true, version: 2, feedUpdated: true })
    expect(feedOf(store).version).toBe(2)
  })

  it('refuses with a conflict when someone published since the editor opened (stale baseVersion)', async () => {
    const store = createMemoryStore(content({ version: 3 }))
    const result = await publishProgram(store, { slug, draft: edited(), baseVersion: 2, by, now: NOW })
    expect(result).toEqual({ ok: false, reason: 'conflict' })
    expect((await store.readContent()).content.version).toBe(3)
    expect(await store.listBackups()).toEqual([])
  })

  it('refuses with a conflict when another publish lands mid-write', async () => {
    const store = createMemoryStore(content())
    const realRead = store.readContent
    store.readContent = async () => {
      const snapshot = await realRead()
      await store.writeContent({ ...snapshot.content, version: snapshot.content.version + 1, updatedBy: 'other tab' }, snapshot.etag)
      return snapshot
    }
    const result = await publishProgram(store, { slug, draft: edited(), baseVersion: 1, by, now: NOW })
    expect(result).toEqual({ ok: false, reason: 'conflict' })
    expect((await realRead()).content.updatedBy).toBe('other tab')
    // Found in the Task 17 end-to-end check: the refused attempt's backup stayed behind and showed up
    // in history as a publish that never happened.
    expect(await store.listBackups()).toEqual([])
  })

  // Found in the final review: only a conflict cleaned up, so any other failure (e.g. Blob down) left a
  // backup that history showed as a publish that never happened.
  it('leaves no backup behind when the write fails for any other reason', async () => {
    const store = createMemoryStore(content())
    store.writeContent = async () => {
      throw new Error('Blob is unavailable')
    }
    await expect(publishProgram(store, { slug, draft: edited(), baseVersion: 1, by, now: NOW })).rejects.toThrow('Blob is unavailable')
    expect(await store.listBackups()).toEqual([])
  })

  it('rejects a new landing image that is not from this store', async () => {
    const store = createMemoryStore(content())
    const draft = program({ landingImageUrl: 'https://otherstore0000000.public.blob.vercel-storage.com/images/x.webp' })
    const result = await publishProgram(store, { slug, draft, baseVersion: 1, by, now: NOW })
    expect(result).toEqual({ ok: false, reason: 'invalid', issues: [{ path: 'landingImageUrl', level: 'error', message: 'Upload the image here instead of pasting a link' }] })
    expect(await store.listBackups()).toEqual([])
  })

  // Issue #4: a well-formed data image passed the URL check without ever going through the upload.
  it('rejects a data image the store did not hand out', async () => {
    const store = createMemoryStore(content())
    const result = await publishProgram(store, { slug, draft: program({ landingImageUrl: 'data:image/png;base64,AAAA' }), baseVersion: 1, by, now: NOW })
    expect(result).toMatchObject({ ok: false, reason: 'invalid', issues: [{ path: 'landingImageUrl' }] })
  })

  it('accepts a landing image the store handed out', async () => {
    const store = createMemoryStore(content())
    const url = await store.putImage('images/school-of-finance-0123456789abcdef.webp', Buffer.from('img'), 'image/webp')
    const result = await publishProgram(store, { slug, draft: program({ landingImageUrl: url }), baseVersion: 1, by, now: NOW })
    expect(result).toMatchObject({ ok: true, version: 2 })
  })

  it('rejects invalid edits without writing anything', async () => {
    const store = createMemoryStore(content())
    const bad = program({ cohorts: [cohort({ endDate: '2027-01-01' })] })
    const result = await publishProgram(store, { slug, draft: bad, baseVersion: 1, by, now: NOW })
    if (result.ok || result.reason !== 'invalid') throw new Error(`expected invalid, got ${JSON.stringify(result)}`)
    expect(result.issues.map((i) => i.path)).toContain('cohorts.0.endDate')
    expect((await store.readContent()).content.version).toBe(1)
  })

  it('rejects a draft that is not shaped like program content', async () => {
    const store = createMemoryStore(content())
    const result = await publishProgram(store, { slug, draft: { ...program(), heroPriceLabel: 42 }, baseVersion: 1, by, now: NOW })
    if (result.ok || result.reason !== 'invalid') throw new Error('expected invalid')
    expect(result.issues[0]?.message).toMatch(/could not be read/)
  })

  it('does not allow pricing options to be removed', async () => {
    const store = createMemoryStore(content())
    const result = await publishProgram(store, { slug, draft: program({ pricing: [program().pricing[0]!] }), baseVersion: 1, by, now: NOW })
    expect(result.ok).toBe(false)
  })

  it('gives new cohorts permanent ids based on their start date', async () => {
    const store = createMemoryStore(content())
    const draft = program({
      cohorts: [cohort(), cohort({ id: 'new-abc', name: 'Q2 2027 Cohort', startDate: '2027-04-10', endDate: '2027-05-30' })],
    })
    await publishProgram(store, { slug, draft, baseVersion: 1, by, now: NOW })
    const { content: saved } = await store.readContent()
    expect(saved.programs[slug]?.cohorts.map((c) => c.id)).toEqual(['cohort-2027-q1', 'cohort-2027-q2'])
  })

  it('still publishes when the feed write fails, and says so', async () => {
    const store = createMemoryStore(content())
    store.writeFeed = async () => {
      throw new Error('blob down')
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await publishProgram(store, { slug, draft: edited(), baseVersion: 1, by, now: NOW })
    expect(result).toEqual({ ok: true, version: 2, feedUpdated: false })
    expect((await store.readContent()).content.version).toBe(2)
  })

  it('rejects programs outside the seven', async () => {
    const store = createMemoryStore(content())
    expect(await publishProgram(store, { slug: 'corporate-training', draft: edited(), baseVersion: 1, by, now: NOW })).toEqual({
      ok: false,
      reason: 'unknown-program',
    })
  })
})

describe('rollbackLastPublish', () => {
  it('restores the version before the last publish, as a new version', async () => {
    const store = createMemoryStore(content())
    await publishProgram(store, { slug, draft: edited(), baseVersion: 1, by, now: NOW })
    const later = new Date('2026-10-14T13:00:00Z')

    const result = await rollbackLastPublish(store, { baseVersion: 2, by, now: later })
    expect(result).toEqual({ ok: true, version: 3, restoredFrom: 1, feedUpdated: true })

    const { content: live } = await store.readContent()
    expect(live).toMatchObject({ version: 3, updatedBy: by, updatedAt: later.toISOString() })
    expect(live.programs[slug]).toEqual(program())
    expect((await store.listBackups()).map((b) => b.version)).toEqual([2, 1])
  })

  // Issue #1, rollback side: the same overtaken feed write, starting from a rollback.
  it('a rollback whose feed write is overtaken leaves the newest feed in place', async () => {
    const store = createMemoryStore(content())
    await publishProgram(store, { slug, draft: named('A'), baseVersion: 1, by, now: NOW })
    const pause = pauseNextFeedWrite(store)
    const rollback = rollbackLastPublish(store, { baseVersion: 2, by, now: NOW })
    await pause.reached
    await publishProgram(store, { slug, draft: named('B'), baseVersion: 3, by, now: NOW })
    pause.release()

    expect(await rollback).toMatchObject({ ok: true, version: 3, feedUpdated: true })
    expect(feedOf(store)).toMatchObject({ version: 4, programs: { [slug]: { cohorts: [{ name: 'B' }] } } })
  })

  it('marks the backup it saves as replaced by a rollback, so history can say so', async () => {
    const store = createMemoryStore(content())
    await publishProgram(store, { slug, draft: edited(), baseVersion: 1, by, now: NOW })
    await rollbackLastPublish(store, { baseVersion: 2, by, now: new Date('2026-10-14T13:00:00Z') })
    const [replacedByRollback, replacedByPublish] = await store.listBackups()
    expect(replacedByRollback).toMatchObject({ version: 2, replacedByRollbackTo: 1 })
    expect(replacedByPublish?.replacedByRollbackTo).toBeUndefined()
  })

  it('reports when there is nothing to roll back to', async () => {
    const store = createMemoryStore(content())
    expect(await rollbackLastPublish(store, { baseVersion: 1, by, now: NOW })).toEqual({ ok: false, reason: 'no-backup' })
  })

  it('leaves no backup behind when another publish lands mid-rollback', async () => {
    const store = createMemoryStore(content())
    await publishProgram(store, { slug, draft: edited(), baseVersion: 1, by, now: NOW })
    const before = await store.listBackups()
    const realRead = store.readContent
    store.readContent = async () => {
      const snapshot = await realRead()
      await store.writeContent({ ...snapshot.content, version: snapshot.content.version + 1, updatedBy: 'other tab' }, snapshot.etag)
      return snapshot
    }
    const result = await rollbackLastPublish(store, { baseVersion: 2, by, now: new Date('2026-10-14T13:00:00Z') })
    expect(result).toEqual({ ok: false, reason: 'conflict' })
    expect(await store.listBackups()).toEqual(before)
  })

  it('refuses with a conflict when the live version moved on', async () => {
    const store = createMemoryStore(content())
    await publishProgram(store, { slug, draft: edited(), baseVersion: 1, by, now: NOW })
    expect(await rollbackLastPublish(store, { baseVersion: 1, by, now: NOW })).toEqual({ ok: false, reason: 'conflict' })
  })
})
