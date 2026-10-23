'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { publishProgramAction } from '@/app/actions'
import type { ProgramContent } from '@/lib/content-schema'
import type { ProgramInfo } from '@/lib/programs'
import { liveServerIssues, type ServerIssues } from '@/lib/review-state'
import { issueLabel, type Issue } from '@/lib/validate'

type Problem = { kind: 'conflict' } | { kind: 'unauthorized' } | { kind: 'error'; message: string }

interface Props {
  info: ProgramInfo
  draft: ProgramContent
  issues: Issue[]
  changes: string[]
  baseVersion: number
  onDiscard: () => void
}

export function ReviewPanel({ info, draft, issues, changes, baseVersion, onDiscard }: Props) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [pending, startTransition] = useTransition()
  const [problem, setProblem] = useState<Problem | null>(null)
  const [server, setServer] = useState<ServerIssues | null>(null)
  const serverIssues = liveServerIssues(server, draft)

  const errors = [...issues.filter((i) => i.level === 'error'), ...serverIssues]
  const warnings = issues.filter((i) => i.level === 'warning')
  const canPublish = changes.length > 0 && errors.length === 0 && !pending

  function publish() {
    startTransition(async () => {
      try {
        const result = await publishProgramAction(info.slug, draft, baseVersion)
        dialogRef.current?.close()
        if (result.ok) {
          router.replace(`/programs/${info.slug}?published=${result.version}${result.feedUpdated ? '' : '&feed=0'}`)
          return
        }
        if (result.reason === 'invalid') setServer({ draft, issues: result.issues })
        else if (result.reason === 'conflict') setProblem({ kind: 'conflict' })
        else if (result.reason === 'unauthorized') setProblem({ kind: 'unauthorized' })
        else setProblem({ kind: 'error', message: 'This program could not be found.' })
      } catch {
        dialogRef.current?.close()
        setProblem({ kind: 'error', message: 'Publishing failed. Check your connection and try again.' })
      }
    })
  }

  return (
    <aside className="pane-detail" aria-label="Review changes">
      <div className="review-head">
        <h2 className="detail-title">Review changes</h2>
        {changes.length > 0 && <span className="chip-draft">{changes.length} unpublished</span>}
      </div>

      {problem?.kind === 'conflict' && (
        <div className="banner banner-warn" role="alert">
          This program was updated in another session since you opened it. Reload to see the latest version. Your unsaved
          edits here will be lost.
          <button type="button" className="btn btn-outline" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}
      {problem?.kind === 'unauthorized' && (
        <div className="banner banner-warn" role="alert">
          Your session has ended. Copy any edits you need, then <a href="/login">sign in again</a>.
        </div>
      )}
      {problem?.kind === 'error' && (
        <div className="banner banner-error" role="alert">
          {problem.message}
        </div>
      )}

      {changes.length === 0 ? (
        <p className="empty-note">No changes yet. Edits you make appear here before anything goes live.</p>
      ) : (
        <ul className="changes">
          {changes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <div className="issues issues-error" role="alert">
          <b>Fix before publishing</b>
          <ul>
            {errors.map((i) => (
              <li key={`${i.path}:${i.message}`}>{issueLabel(i, draft)}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="issues issues-warn">
          <b>Check</b>
          <ul>
            {warnings.map((i) => (
              <li key={`${i.path}:${i.message}`}>{issueLabel(i, draft)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="actions">
        <button type="button" className="btn btn-danger" disabled={changes.length === 0 || pending}
          onClick={() => { onDiscard(); setProblem(null) }}>
          Discard
        </button>
        <button type="button" className="btn btn-primary" disabled={!canPublish} onClick={() => dialogRef.current?.showModal()}>
          Review &amp; publish
        </button>
      </div>

      <dialog ref={dialogRef} className="confirm" aria-labelledby="confirm-title">
        <h2 id="confirm-title">
          Publish {changes.length} change{changes.length === 1 ? '' : 's'} to the live site?
        </h2>
        <ul className="changes">
          {changes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="meta">The public site updates within about a minute. You can roll back from Publish history.</p>
        <div className="actions">
          <button type="button" className="btn btn-outline" disabled={pending} onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={publish}>
            {pending ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </dialog>
    </aside>
  )
}
