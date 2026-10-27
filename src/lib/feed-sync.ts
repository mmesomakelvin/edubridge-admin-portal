import { buildCohortsFeed } from './cohorts-feed'
import type { Content } from './content-schema'
import type { ContentStore } from './store'

/** Pauses between attempts when a feed write fails (Blob hiccups are usually over within a second). */
export const FEED_RETRY_DELAYS_MS = [150, 600]
/** Rounds of "write, then re-check" before giving up while publishes keep landing. */
const MAX_ROUNDS = 3

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function writeWithRetry(store: ContentStore, content: Content, delays: readonly number[]) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await store.writeFeed(buildCohortsFeed(content))
    } catch (error) {
      if (attempt >= delays.length) throw error
      await sleep(delays[attempt]!)
    }
  }
}

/**
 * Write cohorts-feed.json for `content`, then re-read the live content: if another publish landed
 * meanwhile (its feed write may already have happened, and ours just overwrote it), write the feed
 * again from that newer content. So a slow publish can't leave an older feed behind (issue #1).
 * Failed writes are retried; if they keep failing this throws and reconcileFeed repairs it later.
 */
export async function syncFeed(store: ContentStore, content: Content, delays: readonly number[] = FEED_RETRY_DELAYS_MS) {
  let current = content
  for (let round = 0; round < MAX_ROUNDS; round++) {
    await writeWithRetry(store, current, delays)
    const { content: latest } = await store.readContent()
    if (latest.version === current.version) return
    current = latest
  }
  throw new Error(`content kept changing while cohorts-feed.json was written (last seen v${current.version})`)
}

export type FeedHealth = 'current' | 'repaired' | 'failed'

/**
 * Rebuild the feed if it doesn't match the live content (issue #2: a failed feed write must not wait
 * for the next publish). Runs when the Programs page opens and from the daily cron.
 */
export async function reconcileFeed(store: ContentStore, live: Content, delays?: readonly number[]): Promise<FeedHealth> {
  try {
    if ((await store.readFeedVersion()) === live.version) return 'current'
    await syncFeed(store, live, delays)
    return 'repaired'
  } catch (error) {
    console.error('cohorts-feed.json could not be repaired', error)
    return 'failed'
  }
}
