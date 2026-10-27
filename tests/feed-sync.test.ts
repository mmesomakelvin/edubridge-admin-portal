import { describe, expect, it, vi } from 'vitest'
import type { CohortsFeed } from '@/lib/cohorts-feed'
import { reconcileFeed, syncFeed } from '@/lib/feed-sync'
import { createMemoryStore } from '@/lib/memory-store'
import { FEED_PATH } from '@/lib/store'
import { cohort, content, program } from './fixtures'

const noDelay = [0, 0]
const live = (version: number, name = 'Live') => content({ version, programs: { 'school-of-finance': program({ cohorts: [cohort({ name })] }) } })
const feedOf = (store: ReturnType<typeof createMemoryStore>) => store.files.get(FEED_PATH) as CohortsFeed | undefined

describe('syncFeed', () => {
  it('writes the feed for content that is still live', async () => {
    const store = createMemoryStore(live(4))
    await syncFeed(store, live(4), noDelay)
    expect(feedOf(store)?.version).toBe(4)
  })

  it('follows a newer publish that landed meanwhile', async () => {
    const store = createMemoryStore(live(5, 'Newer'))
    await syncFeed(store, live(4, 'Older'), noDelay)
    expect(feedOf(store)).toMatchObject({ version: 5, programs: { 'school-of-finance': { cohorts: [{ name: 'Newer' }] } } })
  })

  it('throws once the retries are used up', async () => {
    const store = createMemoryStore(live(4))
    const write = vi.fn().mockRejectedValue(new Error('blob down'))
    store.writeFeed = write
    await expect(syncFeed(store, live(4), noDelay)).rejects.toThrow('blob down')
    expect(write).toHaveBeenCalledTimes(3)
  })
})

// Issue #2: a feed left behind by a failed write is repaired without waiting for another publish.
describe('reconcileFeed', () => {
  it('leaves a current feed alone', async () => {
    const store = createMemoryStore(live(4))
    await store.writeFeed({ version: 4, programs: {} })
    const write = vi.spyOn(store, 'writeFeed')
    expect(await reconcileFeed(store, live(4), noDelay)).toBe('current')
    expect(write).not.toHaveBeenCalled()
  })

  it.each([
    ['behind the live content', { version: 3, programs: {} }],
    ['from before feeds had a version', { programs: {} }],
  ])('rebuilds a feed that is %s', async (_, stale) => {
    const store = createMemoryStore(live(4))
    store.files.set(FEED_PATH, stale)
    expect(await reconcileFeed(store, live(4), noDelay)).toBe('repaired')
    expect(feedOf(store)?.version).toBe(4)
  })

  it('rebuilds a missing feed', async () => {
    const store = createMemoryStore(live(4))
    expect(await reconcileFeed(store, live(4), noDelay)).toBe('repaired')
    expect(feedOf(store)?.version).toBe(4)
  })

  it('reports a repair that keeps failing instead of throwing', async () => {
    const store = createMemoryStore(live(4))
    store.writeFeed = async () => {
      throw new Error('blob down')
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await reconcileFeed(store, live(4), noDelay)).toBe('failed')
  })
})
