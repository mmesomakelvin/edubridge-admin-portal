'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { rollbackAction } from '@/app/actions'

export function RollbackButton({ baseVersion, previousVersion }: { baseVersion: number; previousVersion: number | null }) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  function rollBack() {
    startTransition(async () => {
      const result = await rollbackAction(baseVersion)
      dialogRef.current?.close()
      if (result.ok) {
        setMessage({ tone: 'ok', text: `Rolled back. Version ${result.restoredFrom}'s content is live again as version ${result.version}.` })
        router.refresh()
      } else if (result.reason === 'conflict') {
        setMessage({ tone: 'warn', text: 'Someone published since this page loaded. Reload and try again.' })
      } else if (result.reason === 'no-backup') {
        setMessage({ tone: 'warn', text: 'There is no earlier version to roll back to.' })
      } else {
        setMessage({ tone: 'warn', text: 'Your session has ended. Sign in again.' })
      }
    })
  }

  return (
    <>
      {message && (
        <p className={`banner banner-${message.tone}`} role="status">
          {message.text}
        </p>
      )}
      <p className="history-actions">
        <button type="button" className="btn btn-danger" disabled={previousVersion === null || pending} onClick={() => dialogRef.current?.showModal()}>
          <RotateCcw size={15} aria-hidden /> Roll back last publish
        </button>
      </p>
      <dialog ref={dialogRef} className="confirm" aria-labelledby="rollback-title">
        <h2 id="rollback-title">Roll back to version {previousVersion}?</h2>
        <p className="psub">
          This restores dates, prices and images from before the last publish, for every program. It goes live as version {baseVersion + 1}.
        </p>
        <div className="actions">
          <button type="button" className="btn btn-outline" disabled={pending} onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" disabled={pending} onClick={rollBack}>
            {pending ? 'Rolling back…' : 'Roll back'}
          </button>
        </div>
      </dialog>
    </>
  )
}
