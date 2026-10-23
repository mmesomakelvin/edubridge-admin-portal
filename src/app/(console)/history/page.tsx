import { RotateCcw } from 'lucide-react'
import { NotSeeded } from '@/components/NotSeeded'
import { RollbackButton } from '@/components/RollbackButton'
import { formatStamp } from '@/lib/format'
import { recentPublishes } from '@/lib/store'
import { getStore, readContentOrNull } from '@/lib/store-instance'
import { adminOrRedirect } from '@/lib/session'

export const dynamic = 'force-dynamic'

function RolledBackBadge({ from }: { from: number | undefined }) {
  if (from === undefined) return null
  return (
    <span className="badge badge-info">
      <RotateCcw size={11} aria-hidden /> Rolled back to version {from}
    </span>
  )
}

export default async function HistoryPage() {
  await adminOrRedirect()
  const loaded = await readContentOrNull()
  if (!loaded) return <NotSeeded />
  const { content } = loaded
  const backups = await (await getStore()).listBackups()
  const previous = backups.find((b) => b.version < content.version) ?? null
  const by = content.updatedBy === 'seed' ? 'Imported from the website' : content.updatedBy
  // Which versions were rollbacks, and of what — read from backup pathnames, no extra fetches.
  const restoredFrom = new Map(recentPublishes(backups, Infinity).map((p) => [p.version, p.restoredFrom]))

  return (
    <div className="panes panes-single">
      <section className="pane-main">
        <header className="phead">
          <h1>Publish history</h1>
          <span className="meta">Live: version {content.version}</span>
        </header>
        <p className="psub">
          Every publish saves the previous version first. Rolling back restores the version from before the last publish, as a
          new version, so you can always roll forward again.
        </p>
        <RollbackButton baseVersion={content.version} previousVersion={previous?.version ?? null} />
        <ul className="list">
          <li className="hist-row">
            <span className="hist-main">
              <b>Version {content.version}</b>
              <RolledBackBadge from={restoredFrom.get(content.version)} />
              <span className="meta">
                {by} · {formatStamp(content.updatedAt)}
              </span>
            </span>
            <span className="pill pill-open">Live</span>
          </li>
          {backups.map((b) => (
            <li key={b.pathname} className="hist-row">
              <span className="hist-main">
                <b>Version {b.version}</b>
                <RolledBackBadge from={restoredFrom.get(b.version)} />
                <span className="meta">replaced {formatStamp(b.savedAt)}</span>
              </span>
            </li>
          ))}
        </ul>
        {backups.length === 0 && <p className="meta history-empty">Publish a change to see history build up here.</p>}
      </section>
    </div>
  )
}
