import { describe, expect, it } from 'vitest'
import { storeIdFromToken } from '@/lib/blob-store'
import type { CohortsFeed } from '@/lib/cohorts-feed'
import type { Cohort, Content, ProgramContent } from '@/lib/content-schema'
import { createMemoryStore } from '@/lib/memory-store'
import { PROGRAM_SLUGS, type ProgramSlug } from '@/lib/programs'
import { rollbackLastPublish } from '@/lib/publish'
import type { SeedSource } from '@/lib/seed'
import { applySiteSync, planSiteSync } from '@/lib/site-sync'
import { FEED_PATH } from '@/lib/store'
import { NOW, cohort, content, program } from './fixtures'

const SLUG = 'school-of-finance'
const q1 = cohort()
const q2 = cohort({ id: 'cohort-2027-q2', name: 'Q2 2027 Cohort', startDate: '2027-04-10', endDate: '2027-05-30' })
const old = cohort({ id: 'cohort-2026-nov', name: 'November 2026 Cohort', startDate: '2026-11-07', endDate: '2026-12-13' })

/** Live content holding all seven programs, each with the fixture program unless overridden. */
function live(over: Partial<Record<ProgramSlug, ProgramContent>> = {}, rest: Partial<Content> = {}): Content {
  const programs = Object.fromEntries(PROGRAM_SLUGS.map((slug) => [slug, over[slug] ?? program()]))
  return content({ programs, ...rest })
}

/** The website's data files: same as the fixture program unless overridden. */
function site(over: Partial<Record<ProgramSlug, { cohorts?: Cohort[]; pricing?: unknown[]; priceLabel?: string }>> = {}): SeedSource {
  return {
    readProgramData: async (slug) => {
      const base = program()
      const o = over[slug] ?? {}
      return {
        heroContent: { priceLabel: o.priceLabel ?? base.heroPriceLabel },
        cohorts: o.cohorts ?? base.cohorts,
        pricing: o.pricing ?? base.pricing,
      }
    },
    readHomeData: async () => {
      throw new Error('the sync must not need homepage data')
    },
    readPublicFile: async () => {
      throw new Error('the sync must not need image files')
    },
  }
}

const apply = (store: ReturnType<typeof createMemoryStore>, source: SeedSource, expectedVersion = 1) =>
  applySiteSync(store, { source, expectedVersion, by: 'site-sync', now: NOW })

describe('planSiteSync', () => {
  it('lists moved, added and removed cohorts and takes the website order', async () => {
    const moved = cohort({ startDate: '2027-01-09', endDate: '2027-03-14' })
    const plan = await planSiteSync(live({ [SLUG]: program({ cohorts: [old, q1] }) }), site({ [SLUG]: { cohorts: [moved, q2] } }), NOW)

    expect(plan.changes).toEqual([{ slug: SLUG, added: [q2], removed: [old], moved: [{ before: q1, after: moved }] }])
    expect(plan.programs[SLUG]?.cohorts).toEqual([moved, q2])
  })

  it('never copies pricing, the hero price or the image', async () => {
    const image = 'https://store.public.blob.vercel-storage.com/images/school-of-finance-ffffffffffffffff.jpg'
    const kept = program({ landingImageUrl: image })
    const pricing = program().pricing.map((o) => ({ ...o, amount: 1 }))
    const plan = await planSiteSync(live({ [SLUG]: kept }), site({ [SLUG]: { cohorts: [q1, q2], pricing, priceLabel: 'Different' } }), NOW)

    expect(plan.programs[SLUG]).toEqual({ ...kept, cohorts: [q1, q2] })
    expect(plan.notCopied).toEqual([`${SLUG}: pricing differs`, `${SLUG}: hero price label differs`])
  })

  it('reports nothing for programs that already match', async () => {
    const plan = await planSiteSync(live(), site(), NOW)
    expect(plan).toMatchObject({ changes: [], notCopied: [], problems: [] })
  })

  it('counts a reorder as a change even when every cohort is the same', async () => {
    const plan = await planSiteSync(live({ [SLUG]: program({ cohorts: [q1, q2] }) }), site({ [SLUG]: { cohorts: [q2, q1] } }), NOW)
    expect(plan.changes).toEqual([{ slug: SLUG, added: [], removed: [], moved: [] }])
  })

  it('refuses a website program with no cohorts rather than emptying the portal', async () => {
    const plan = await planSiteSync(live(), site({ [SLUG]: { cohorts: [] } }), NOW)
    expect(plan.problems).toEqual([`${SLUG}: the website lists no cohorts`])
  })

  it('refuses website data the portal itself would reject', async () => {
    const bad = cohort({ startDate: '2027-03-01', endDate: '2027-02-01' })
    const plan = await planSiteSync(live(), site({ [SLUG]: { cohorts: [bad] } }), NOW)
    expect(plan.problems).toEqual([`${SLUG}: Q1 2027 Cohort: End date must be after the start date`])
  })

  it('refuses when a program is missing from the portal', async () => {
    const stored = live()
    delete stored.programs[SLUG]
    const plan = await planSiteSync(stored, site(), NOW)
    expect(plan.problems).toEqual([`${SLUG}: missing from the portal`])
  })
})

describe('applySiteSync', () => {
  it('publishes one new version with the website cohorts', async () => {
    const store = createMemoryStore(live())
    const result = await apply(store, site({ [SLUG]: { cohorts: [q1, q2] } }))

    expect(result).toEqual({ ok: true, version: 2, changed: 1, feedUpdated: true })
    const { content: saved } = await store.readContent()
    expect(saved).toMatchObject({ version: 2, updatedBy: 'site-sync', updatedAt: NOW.toISOString() })
    expect(saved.programs[SLUG]?.cohorts).toEqual([q1, q2])
  })

  it('updates the cohort feed', async () => {
    const store = createMemoryStore(live())
    await apply(store, site({ [SLUG]: { cohorts: [q1, q2] } }))
    const feed = store.files.get(FEED_PATH) as CohortsFeed
    expect(feed.programs[SLUG]?.cohorts.map((c) => c.id)).toEqual(['cohort-2027-q1', 'cohort-2027-q2'])
  })

  it('can be undone with the normal rollback', async () => {
    const store = createMemoryStore(live())
    await apply(store, site({ [SLUG]: { cohorts: [q1, q2] } }))

    const undone = await rollbackLastPublish(store, { baseVersion: 2, by: 'owner', now: NOW })
    expect(undone).toMatchObject({ ok: true, version: 3, restoredFrom: 1 })
    expect((await store.readContent()).content.programs[SLUG]?.cohorts).toEqual([q1])
  })

  it('refuses when the portal has moved on since the preview', async () => {
    const store = createMemoryStore(live({}, { version: 2 }))
    const result = await apply(store, site({ [SLUG]: { cohorts: [q1, q2] } }), 1)

    expect(result).toEqual({ ok: false, reason: 'version-changed', liveVersion: 2 })
    expect((await store.readContent()).content.programs[SLUG]?.cohorts).toEqual([q1])
  })

  it('writes nothing when the plan has a problem, even if other programs are fine', async () => {
    const store = createMemoryStore(live())
    const result = await apply(store, site({ [SLUG]: { cohorts: [q1, q2] }, 'data-school': { cohorts: [] } }))

    expect(result).toEqual({ ok: false, reason: 'problems', problems: ['data-school: the website lists no cohorts'] })
    expect((await store.readContent()).content.version).toBe(1)
    expect(await store.listBackups()).toEqual([])
  })

  it('does not create a version when nothing differs', async () => {
    const store = createMemoryStore(live())
    expect(await apply(store, site())).toEqual({ ok: true, version: 1, changed: 0, feedUpdated: false })
    expect(await store.listBackups()).toEqual([])
  })
})

describe('storeIdFromToken', () => {
  it('reads the lower-case store id without needing the secret part', () => {
    expect(storeIdFromToken('vercel_blob_rw_AbC123_secretpart')).toBe('abc123')
  })

  it('returns an empty id for a token in another format', () => {
    expect(storeIdFromToken('not-a-blob-token')).toBe('')
  })
})
