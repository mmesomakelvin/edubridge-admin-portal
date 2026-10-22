const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** True only for a real calendar day written yyyy-mm-dd (rejects 2026-02-30). */
export function isRealDate(iso: string): boolean {
  if (!ISO_DAY.test(iso)) return false
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** Today's calendar day in UTC, matching cohort-status.ts. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}
