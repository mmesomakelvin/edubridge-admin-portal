import { createHash, timingSafeEqual } from 'node:crypto'

const digest = (s: string) => createHash('sha256').update(s).digest()

/** Vercel Cron sends "Authorization: Bearer <CRON_SECRET>". With no secret configured, every call is refused. */
export function isCronRequest(authorization: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || !authorization) return false
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`))
}
