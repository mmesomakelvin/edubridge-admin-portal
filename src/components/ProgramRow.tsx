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

export function ProgramRow({ info, entry, selected, now }: Props) {
  if (!entry) {
    return (
      <li className="row row-missing">
        <span className="nm">
          <b>{info.name}</b>
          <span>Not in the content store yet</span>
        </span>
      </li>
    )
  }
  const next = nextOpenCohort(entry.cohorts, now)
  const full = entry.pricing.find((p) => p.id === 'full')
  return (
    <li>
      <Link href={`/?p=${info.slug}`} scroll={false} className="row" aria-current={selected ? 'true' : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Blob/data URLs, already optimised */}
        <img className="thumb" src={entry.landingImageUrl} alt="" />
        <span className="nm">
          <b>{info.name}</b>
          <span>
            {entry.cohorts.length} {entry.cohorts.length === 1 ? 'cohort' : 'cohorts'} on file
          </span>
        </span>
        <span className="chip">{full ? formatNaira(full.amount) : '—'}</span>
        <span className="when">
          {next ? formatDay(next.startDate) : '—'}
          <span>Next start</span>
        </span>
        <StatusPill status={programPill(entry.cohorts, now)} />
      </Link>
    </li>
  )
}
