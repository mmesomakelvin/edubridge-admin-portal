/** Set to true in the release that connects the public website to this store (Plan 2 go-live). */
export const PUBLIC_SITE_READS_PORTAL = false

const NOT_CONNECTED = "The public website isn't connected yet, so customers won't see this change."
const UPDATES_SOON = 'The public website updates within about 5 minutes.'

export function confirmTitle(count: number, connected = PUBLIC_SITE_READS_PORTAL): string {
  return `Publish ${count} change${count === 1 ? '' : 's'} to the ${connected ? 'live site' : 'portal'}?`
}

export function reviewNotice(connected = PUBLIC_SITE_READS_PORTAL): string {
  const effect = connected ? UPDATES_SOON : `This updates the portal only. ${NOT_CONNECTED}`
  return `${effect} You can roll back from Publish history.`
}

export function publishedNotice(version: number, connected = PUBLIC_SITE_READS_PORTAL): string {
  return connected ? `Published version ${version}. ${UPDATES_SOON}` : `Published version ${version} to the portal. ${NOT_CONNECTED}`
}
