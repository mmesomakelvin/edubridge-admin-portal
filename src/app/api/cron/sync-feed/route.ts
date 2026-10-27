import { isCronRequest } from '@/lib/cron'
import { reconcileFeed } from '@/lib/feed-sync'
import { getStore, readContentOrNull } from '@/lib/store-instance'

/** Daily (vercel.json): rebuild cohorts-feed.json if it fell behind the live content, even if no one signs in. */
export async function GET(request: Request) {
  if (!isCronRequest(request.headers.get('authorization'))) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const loaded = await readContentOrNull()
  if (!loaded) return Response.json({ feed: 'not-seeded' })
  const feed = await reconcileFeed(await getStore(), loaded.content)
  // A 500 marks the run as failed in Vercel's cron logs.
  return Response.json({ feed }, { status: feed === 'failed' ? 500 : 200 })
}
