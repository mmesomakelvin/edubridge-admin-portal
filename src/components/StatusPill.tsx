import type { CohortStatus } from '@/lib/cohort-status'
import type { ProgramPill } from '@/lib/next-cohort'

const LABELS: Record<CohortStatus | ProgramPill, string> = {
  open: 'Open',
  full: 'Full',
  ended: 'Ended',
  none: 'No upcoming cohort',
}

export function StatusPill({ status }: { status: CohortStatus | ProgramPill }) {
  return <span className={`pill pill-${status}`}>{LABELS[status]}</span>
}
