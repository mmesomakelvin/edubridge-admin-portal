'use client'

import { useState, type Dispatch } from 'react'
import { Upload } from 'lucide-react'
import type { DraftAction } from '@/lib/draft-reducer'

const MAX_BYTES = 4 * 1024 * 1024
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']

export function ImageTab({ slug, url, dispatch }: { slug: string; url: string; dispatch: Dispatch<DraftAction> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  async function upload(file: File) {
    setError(null)
    // Quick checks here for instant feedback; the server re-checks everything by decoding the file.
    if (!ACCEPT.includes(file.type)) return setError("That file isn't a JPG, PNG or WebP image")
    if (file.size > MAX_BYTES) return setError('That image is over 4 MB. Please use a smaller file')
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`/api/images?slug=${encodeURIComponent(slug)}`, { method: 'POST', body })
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null
      if (!res.ok || !data?.url) throw new Error(data?.error ?? 'Upload failed. Your session may have ended. Reload the page and try again')
      dispatch({ type: 'image', url: data.url })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      {/* eslint-disable-next-line @next/next/no-img-element -- Blob/data URLs, already optimised */}
      <img className="image-preview" src={url} alt="Current landing image" />
      <label
        className={`dropzone${dragging ? ' is-dragging' : ''}`}
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
        <b>{busy ? 'Uploading…' : 'Drop a new image here, or click to choose'}</b>
        <small>JPG, PNG or WebP · up to 4 MB · at least 800×450 · optimised automatically</small>
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
