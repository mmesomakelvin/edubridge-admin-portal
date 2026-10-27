import { describe, expect, it } from 'vitest'
import { rollbackMessage } from '@/lib/rollback-message'

describe('rollbackMessage', () => {
  it('confirms a rollback', () => {
    expect(rollbackMessage({ ok: true, version: 7, restoredFrom: 5, feedUpdated: true })).toEqual({
      tone: 'ok',
      text: "Rolled back. Version 5's content is live again as version 7.",
    })
  })

  // Found in the final review: rollback is usually used to undo bad dates, so a silent feed failure
  // would keep those dates in the win-back emails.
  it('warns when the win-back feed did not update', () => {
    expect(rollbackMessage({ ok: true, version: 7, restoredFrom: 5, feedUpdated: false })).toEqual({
      tone: 'warn',
      text: "Rolled back. Version 5's content is live again as version 7, but the win-back cohort feed didn't update yet. The portal retries it automatically when the Programs page opens and once a day.",
    })
  })

  it('explains each refusal', () => {
    expect(rollbackMessage({ ok: false, reason: 'conflict' }).text).toBe('Someone published since this page loaded. Reload and try again.')
    expect(rollbackMessage({ ok: false, reason: 'no-backup' }).text).toBe('There is no earlier version to roll back to.')
    expect(rollbackMessage({ ok: false, reason: 'unauthorized' }).text).toBe('Your session has ended. Sign in again.')
  })
})
