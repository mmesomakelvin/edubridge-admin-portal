'use client'

import type { Dispatch } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { StatusPill } from '@/components/StatusPill'
import { NEW_COHORT_PREFIX } from '@/lib/cohort-ids'
import { getCohortStatus } from '@/lib/cohort-status'
import { COHORT_FORMATS, type Cohort, type CohortFormat } from '@/lib/content-schema'
import { isRealDate } from '@/lib/dates'
import type { DraftAction } from '@/lib/draft-reducer'
import type { Issue } from '@/lib/validate'
import { FieldError, isInvalid } from './FieldError'

const FORMAT_LABELS: Record<CohortFormat, string> = { hybrid: 'Hybrid', virtual: 'Virtual', 'in-person': 'In person' }
const shown = (n: number) => (Number.isNaN(n) ? '' : n)

interface Props {
  cohorts: Cohort[]
  issues: Issue[]
  now: Date
  dispatch: Dispatch<DraftAction>
}

export function CohortsTab({ cohorts, issues, now, dispatch }: Props) {
  return (
    <div className="stack">
      <p className="hint">
        Set <b>seats left</b> to 0 to close enrolment. Status updates as you type, using the same rules as the website.
      </p>
      <div className="table-wrap">
        <table className="ctable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Start</th>
              <th>End</th>
              <th>Format</th>
              <th>Seats left</th>
              <th>Total</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c, index) => {
              const at = (field: string) => `cohorts.${index}.${field}`
              const status = isRealDate(c.startDate) && isRealDate(c.endDate) ? getCohortStatus(c, now) : null
              return (
                <tr key={c.id} className={status === 'ended' ? 'is-past' : undefined}>
                  <td data-label="Name">
                    <input className="inp" aria-label="Cohort name" value={c.name} aria-invalid={isInvalid(issues, at('name'))}
                      onChange={(e) => dispatch({ type: 'cohort/text', index, field: 'name', value: e.target.value })} />
                    <FieldError issues={issues} path={at('name')} />
                  </td>
                  <td data-label="Start">
                    <input className="inp" type="date" aria-label="Start date" value={c.startDate} aria-invalid={isInvalid(issues, at('startDate'))}
                      onChange={(e) => dispatch({ type: 'cohort/text', index, field: 'startDate', value: e.target.value })} />
                    <FieldError issues={issues} path={at('startDate')} />
                  </td>
                  <td data-label="End">
                    <input className="inp" type="date" aria-label="End date" value={c.endDate} aria-invalid={isInvalid(issues, at('endDate'))}
                      onChange={(e) => dispatch({ type: 'cohort/text', index, field: 'endDate', value: e.target.value })} />
                    <FieldError issues={issues} path={at('endDate')} />
                  </td>
                  <td data-label="Format">
                    <select className="inp" aria-label="Format" value={c.format}
                      onChange={(e) => dispatch({ type: 'cohort/format', index, value: e.target.value as CohortFormat })}>
                      {COHORT_FORMATS.map((f) => (
                        <option key={f} value={f}>
                          {FORMAT_LABELS[f]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Seats left">
                    <input className="inp inp-num" type="number" min={0} step={1} inputMode="numeric" aria-label="Seats left"
                      value={shown(c.seatsRemaining)} aria-invalid={isInvalid(issues, at('seatsRemaining'))}
                      onChange={(e) => dispatch({ type: 'cohort/number', index, field: 'seatsRemaining', value: e.target.valueAsNumber })} />
                    <FieldError issues={issues} path={at('seatsRemaining')} />
                  </td>
                  <td data-label="Total seats">
                    <input className="inp inp-num" type="number" min={1} step={1} inputMode="numeric" aria-label="Total seats"
                      value={shown(c.totalSeats)} aria-invalid={isInvalid(issues, at('totalSeats'))}
                      onChange={(e) => dispatch({ type: 'cohort/number', index, field: 'totalSeats', value: e.target.valueAsNumber })} />
                    <FieldError issues={issues} path={at('totalSeats')} />
                  </td>
                  <td data-label="Status">{status ? <StatusPill status={status} /> : <span className="meta">—</span>}</td>
                  <td>
                    <button type="button" className="icon-btn" aria-label={`Remove ${c.name || 'cohort'}`}
                      onClick={() => dispatch({ type: 'cohort/remove', index })}>
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div>
        <button type="button" className="btn btn-outline"
          onClick={() => dispatch({ type: 'cohort/add', id: `${NEW_COHORT_PREFIX}${crypto.randomUUID()}` })}>
          <Plus size={15} aria-hidden /> Add cohort
        </button>
      </div>
    </div>
  )
}
