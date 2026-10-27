import type { RollbackResult } from './publish'

export interface RollbackMessage {
  tone: 'ok' | 'warn'
  text: string
}

/** What the history page says after a rollback attempt. */
export function rollbackMessage(result: RollbackResult | { ok: false; reason: 'unauthorized' }): RollbackMessage {
  if (result.ok) {
    const done = `Rolled back. Version ${result.restoredFrom}'s content is live again as version ${result.version}`
    return result.feedUpdated
      ? { tone: 'ok', text: `${done}.` }
      : { tone: 'warn', text: `${done}, but the win-back cohort feed didn't update yet. The portal retries it automatically when the Programs page opens and once a day.` }
  }
  if (result.reason === 'conflict') return { tone: 'warn', text: 'Someone published since this page loaded. Reload and try again.' }
  if (result.reason === 'no-backup') return { tone: 'warn', text: 'There is no earlier version to roll back to.' }
  return { tone: 'warn', text: 'Your session has ended. Sign in again.' }
}
