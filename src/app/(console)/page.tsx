import { NotSeeded } from '@/components/NotSeeded'
import { ProgramDetail } from '@/components/ProgramDetail'
import { ProgramRow } from '@/components/ProgramRow'
import { StatCards } from '@/components/StatCards'
import type { Content } from '@/lib/content-schema'
import { reconcileFeed } from '@/lib/feed-sync'
import { computeMetrics, publishesThisMonth, seatsLeftDelta } from '@/lib/metrics'
import { PROGRAMS, getProgram } from '@/lib/programs'
import { sortBackups } from '@/lib/store'
import { getStore, readContentOrNull } from '@/lib/store-instance'
import { adminOrRedirect } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  await adminOrRedirect()
  const { p } = await searchParams
  const loaded = await readContentOrNull()
  if (!loaded) return <NotSeeded />
  const { content } = loaded
  const now = new Date()
  const selected = getProgram(p ?? '') ?? PROGRAMS[0]!

  const store = await getStore()
  // Repairs a feed that a failed or overtaken publish left behind (normally a no-op read).
  const feedHealth = await reconcileFeed(store, content)
  const backups = await store.listBackups()
  // The newest backup is the version before the current one; the dashboard still renders if it can't be read.
  const latest = sortBackups(backups)[0]
  let previous: Content | null = null
  if (latest) previous = await store.readBackup(latest.pathname).catch(() => null)

  return (
    <div className="panes">
      <section className="pane-main">
        <header className="phead">
          <h1>Programs</h1>
        </header>
        {feedHealth === 'failed' && (
          <p className="banner banner-warn" role="alert">
            The win-back cohort feed is behind the live content and couldn’t be updated just now. The portal retries when this
            page opens and once a day. If this message stays, tell a developer.
          </p>
        )}
        <StatCards
          metrics={computeMetrics(content, now)}
          delta={seatsLeftDelta(content, previous, now)}
          publishes={publishesThisMonth(backups, now)}
          content={content}
          now={now}
        />
        <div className="ptable-wrap">
          <table className="ptable">
            <thead>
              <tr>
                <th scope="col">Program</th>
                <th scope="col" className="num col-price">Full price</th>
                <th scope="col" className="num col-next">Next start</th>
                <th scope="col" className="num col-seats">Seats left</th>
                <th scope="col" className="num col-count">Cohorts</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {PROGRAMS.map((info) => (
                <ProgramRow key={info.slug} info={info} entry={content.programs[info.slug]} selected={info.slug === selected.slug} now={now} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <ProgramDetail info={selected} entry={content.programs[selected.slug]} now={now} />
    </div>
  )
}
