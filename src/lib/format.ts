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
