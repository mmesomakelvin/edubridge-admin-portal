import { createHash } from 'node:crypto'

/** First 16 hex chars of SHA-256 — used in image filenames so uploads never collide. */
export function sha16(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16)
}
