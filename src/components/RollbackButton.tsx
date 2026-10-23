'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { rollbackAction } from '@/app/actions'
import { rollbackMessage } from '@/lib/rollback-message'

export function RollbackButton({ baseVersion, previousVersion }: { baseVersion: number; previousVersion: number | null }) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null)

  function rollBack() {
    startTransition(async () => {
      try {
        const result = await rollbackAction(baseVersion)
        setMessage(rollbackMessage(result))
        if (result.ok) router.refresh()
      } catch {
        setMessage({ tone: 'error', text: 'Rolling back failed. Nothing was changed. Check your connection and try again.' })
      } finally {
        dialogRef.current?.close()
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
