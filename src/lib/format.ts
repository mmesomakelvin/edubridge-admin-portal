const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const stampDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Lagos',
})
const stampTime = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Africa/Lagos',
})

const lagosDay = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Africa/Lagos' })

/** Day number of the Lagos calendar day containing this instant. */
function lagosDayNumber(date: Date): number {
  const [y, m, d] = lagosDay.format(date).split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** '2027-01-23' → '23 Jan 2027'. */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return dayFormat.format(new Date(Date.UTC(y, m - 1, d)))
}

/** 175000 → '₦175,000'. Blank (NaN) amounts read '(blank)'. */
export function formatNaira(n: number): string {
  return Number.isFinite(n) ? `₦${n.toLocaleString('en-US')}` : '(blank)'
}

/** ISO timestamp → '14 Oct 2026, 12:30' in Lagos time. */
export function formatStamp(iso: string): string {
  const date = new Date(iso)
  return `${stampDate.format(date)}, ${stampTime.format(date)}`
}

/** ISO timestamp → 'Today, 09:15' / 'Yesterday, 18:00' / '3 days ago' / '2 Sep 2026', by the Lagos calendar. */
export function formatAgo(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const days = lagosDayNumber(now) - lagosDayNumber(date)
  if (days <= 0) return `Today, ${stampTime.format(date)}`
  if (days === 1) return `Yesterday, ${stampTime.format(date)}`
  if (days <= 30) return `${days} days ago`
  return stampDate.format(date)
}
