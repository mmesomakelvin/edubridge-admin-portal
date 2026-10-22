import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import type { ProgramContent } from '@/lib/content-schema'
import { formatDay } from '@/lib/format'
import { heroNextCohortLabel, nextOpenCohort } from '@/lib/next-cohort'
import { liveUrl, type ProgramInfo } from '@/lib/programs'

export function ProgramDetail({ info, entry, now }: { info: ProgramInfo; entry: ProgramContent | undefined; now: Date }) {
  if (!entry) {
    return (
      <aside className="pane-detail">
        <p className="muted">No content for this program yet.</p>
      </aside>
    )
  }
  const next = nextOpenCohort(entry.cohorts, now)
  const price = (id: string) => entry.pricing.find((p) => p.id === id)?.priceLabel ?? '—'
  return (
    <aside className="pane-detail" aria-label={`${info.name} summary`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Blob/data URLs, already optimised */}
      <img className="detail-img" src={entry.landingImageUrl} alt={`${info.name} landing image`} />
      <div>
        <h2 className="detail-title">{info.name}</h2>
        <p className="meta">{liveUrl(info).replace('https://www.', '')}</p>
      </div>
      <dl className="facts">
        <div>
          <dt>Next cohort</dt>
          <dd>{next ? formatDay(next.startDate) : 'None open'}</dd>
        </div>
        <div>
          <dt>Seats left</dt>
          <dd>{next ? `${next.seatsRemaining} of ${next.totalSeats}` : '—'}</dd>
        </div>
        <div>
          <dt>Pay in full</dt>
          <dd>{price('full')}</dd>
        </div>
        <div>
          <dt>Installments</dt>
          <dd>{price('installments')}</dd>
        </div>
        <div className="wide">
          <dt>Hero price label</dt>
          <dd>{entry.heroPriceLabel}</dd>
        </div>
        <div className="wide">
          <dt>Program page will show</dt>
          <dd>{heroNextCohortLabel(next)}</dd>
        </div>
      </dl>
      <div className="actions">
        <a className="btn btn-outline" href={liveUrl(info)} target="_blank" rel="noreferrer">
          View live page <ExternalLink size={14} aria-hidden />
        </a>
        <Link className="btn btn-primary" href={`/programs/${info.slug}`}>
          Edit program
        </Link>
      </div>
    </aside>
  )
}
