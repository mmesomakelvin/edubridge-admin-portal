import { describe, expect, it, vi } from 'vitest'
import { createMemoryStore } from '@/lib/memory-store'
import { publishProgram, rollbackLastPublish } from '@/lib/publish'
import { FEED_PATH } from '@/lib/store'
import { NOW, cohort, content, program } from './fixtures'

const by = 'hello@edubridgeacademy.com'
const slug = 'school-of-finance'
const edited = () => program({ cohorts: [cohort({ seatsRemaining: 5 })] })

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
    expect(store.files.get(FEED_PATH)).toMatchObject({ programs: { [slug]: { cohorts: [{ id: 'cohort-2027-q1' }] } } })
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
