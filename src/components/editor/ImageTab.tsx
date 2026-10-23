'use client'

import { useState, type Dispatch } from 'react'
import { Upload } from 'lucide-react'
import type { DraftAction } from '@/lib/draft-reducer'
import { uploadImage, type UploadProgress } from '@/lib/upload'

const MAX_BYTES = 4 * 1024 * 1024
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']

function ProgressBar({ progress }: { progress: UploadProgress }) {
  if (progress.stage === 'processing') {
    return (
      <span className="upload-bar is-indeterminate" role="progressbar" aria-label="Optimising image">
        <span />
      </span>
    )
  }
  return (
    <span className="upload-bar" role="progressbar" aria-label="Uploading image" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
      <span style={{ width: `${progress.percent}%` }} />
    </span>
  )
}

export function ImageTab({ slug, url, dispatch }: { slug: string; url: string; dispatch: Dispatch<DraftAction> }) {
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const busy = progress !== null

  async function upload(file: File) {
    if (busy) return
    setError(null)
    // Quick checks here for instant feedback; the server re-checks everything by decoding the file.
    if (!ACCEPT.includes(file.type)) return setError("That file isn't a JPG, PNG or WebP image")
    if (file.size > MAX_BYTES) return setError('That image is over 4 MB. Please use a smaller file')
    try {
      const result = await uploadImage(`/api/images?slug=${encodeURIComponent(slug)}`, file, setProgress)
      dispatch({ type: 'image', url: result.url })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setProgress(null)
    }
  }

  const label = !progress
    ? 'Drop a new image here, or click to choose'
    : progress.stage === 'sending'
      ? `Uploading… ${progress.percent}%`
      : 'Optimising image… this can take a few seconds'

  return (
    <div className="stack">
      {/* eslint-disable-next-line @next/next/no-img-element -- Blob/data URLs, already optimised */}
      <img className="image-preview" src={url} alt="Current landing image" />
      <label
        className={`dropzone${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) void upload(file)
        }}
      >
        <Upload size={22} aria-hidden />
        <b aria-live="polite">{label}</b>
        {progress ? <ProgressBar progress={progress} /> : <small>JPG, PNG or WebP · up to 4 MB · at least 800×450 · optimised automatically</small>}
        <input type="file" accept={ACCEPT.join(',')} className="sr-only" disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void upload(file)
            e.target.value = ''
          }} />
      </label>
      {error && (
        <p className="field-msg field-error" role="alert">
          {error}
        </p>
      )}
      <p className="meta">Appears on this program’s card on the homepage. The new image goes live only when you publish.</p>
    </div>
  )
}
