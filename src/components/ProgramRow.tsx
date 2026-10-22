import Link from 'next/link'
import { StatusPill } from './StatusPill'
import type { ProgramContent } from '@/lib/content-schema'
import { formatDay, formatNaira } from '@/lib/format'
import { nextOpenCohort, programPill } from '@/lib/next-cohort'
import type { ProgramInfo } from '@/lib/programs'

interface Props {
  info: ProgramInfo
  entry: ProgramContent | undefined
  selected: boolean
  now: Date
}

/** One row of the programs table. The name link covers the whole row, so any cell selects it. */
export function ProgramRow({ info, entry, selected, now }: Props) {
  if (!entry) {
    return (
      <tr className="row-missing">
        <td>
          <span className="nm">
            <b>{info.name}</b>
          </span>
        </td>
        <td colSpan={5} className="muted">
          Not in the content store yet
        </td>
      </tr>
    )
  }
  const next = nextOpenCohort(entry.cohorts, now)
  const full = entry.pricing.find((p) => p.id === 'full')
  return (
    <tr className={selected ? 'is-selected' : undefined}>
      <td>
        <span className="prog">
          {/* eslint-disable-next-line @next/next/no-img-element -- Blob/data URLs, already optimised */}
          <img className="thumb" src={entry.landingImageUrl} alt="" />
          <Link href={`/?p=${info.slug}`} scroll={false} className="nm row-link" aria-current={selected ? 'true' : undefined}>
            <b>{info.name}</b>
          </Link>
        </span>
      </td>
      <td className="num col-price">{full ? formatNaira(full.amount) : '—'}</td>
      <td className="num col-next">{next ? formatDay(next.startDate) : '—'}</td>
      <td className="num col-seats">{next ? `${next.seatsRemaining} of ${next.totalSeats}` : '—'}</td>
      <td className="num col-count">{entry.cohorts.length}</td>
      <td>
        <StatusPill status={programPill(entry.cohorts, now)} />
      </td>
    </tr>
  )
}
