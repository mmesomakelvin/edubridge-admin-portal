import { ArrowDown, ArrowUp } from 'lucide-react'
import type { Content } from '@/lib/content-schema'
import { formatAgo, formatDay } from '@/lib/format'
import type { DashboardMetrics } from '@/lib/metrics'
import { getProgram } from '@/lib/programs'

const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'Africa/Lagos' })

interface Props {
  metrics: DashboardMetrics
  /** Change in open seats since the previous version; null when there is none. */
  delta: number | null
  publishes: number
  content: Content
  now: Date
}

function inDays(n: number): string {
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  return `in ${n} days`
}

export function StatCards({ metrics: m, delta, publishes, content, now }: Props) {
  const taken = m.seatsTotal > 0 ? Math.round(((m.seatsTotal - m.seatsLeft) / m.seatsTotal) * 100) : 0
  const month = monthName.format(now)
  return (
    <section className="stats" aria-label="At a glance">
      <div className="stat">
        <span className="stat-label">Open for enrolment</span>
        <b className="stat-value">
          {m.openPrograms} <small>of {m.totalPrograms} programs</small>
        </b>
        <span className="stat-foot">
          {m.programsWithoutDates > 0 ? (
            <span className="badge badge-warn">
              {m.programsWithoutDates} {m.programsWithoutDates === 1 ? 'has' : 'have'} no upcoming dates
            </span>
          ) : (
            <span className="badge badge-ok">All have upcoming dates</span>
          )}
        </span>
      </div>

      <div className="stat">
        <span className="stat-label">Seats left</span>
        <b className="stat-value">
          {m.seatsLeft} {m.seatsTotal > 0 && <small>of {m.seatsTotal}</small>}
        </b>
        {m.seatsTotal > 0 ? (
          <>
            <span className="bar" aria-hidden>
              <span style={{ width: `${taken}%` }} />
            </span>
            <span className="stat-foot">
              {taken}% taken
              {delta !== null && delta !== 0 && (
                <span className={`badge ${delta < 0 ? 'badge-ok' : 'badge-info'}`}>
                  {delta < 0 ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />}
                  {Math.abs(delta)} since last publish
                </span>
              )}
            </span>
          </>
        ) : (
          <span className="stat-foot">No open cohorts</span>
        )}
      </div>

      <div className="stat">
        <span className="stat-label">Next cohort</span>
        <b className="stat-value">{m.nextStart ? formatDay(m.nextStart.startDate) : '—'}</b>
        <span className="stat-foot">
          {m.nextStart
            ? `${getProgram(m.nextStart.slug)?.name ?? m.nextStart.slug} · ${inDays(m.nextStart.daysAway)}`
            : 'No open cohorts'}
        </span>
      </div>

      <div className="stat">
        <span className="stat-label">Last published</span>
        <b className="stat-value">{formatAgo(content.updatedAt, now)}</b>
        <span className="stat-foot stat-who">
          {content.updatedBy === 'seed' ? 'Imported from the website' : `Version ${content.version} · ${content.updatedBy}`}
        </span>
        <span className="stat-foot">
          {publishes === 0 ? `No publishes yet in ${month}` : `${publishes} ${publishes === 1 ? 'publish' : 'publishes'} in ${month}`}
        </span>
      </div>
    </section>
  )
}
