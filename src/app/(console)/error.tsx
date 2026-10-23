'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'

/** Shown instead of Next's blank "Application error" when a console page fails to load or act. */
export default function ConsoleError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="panes panes-single">
      <section className="pane-main">
        <div className="banner banner-error" role="alert">
          Something went wrong loading this page. Nothing was changed. Check your connection and try again; if it keeps
          happening, sign in again or tell a developer.
        </div>
        <p className="history-actions">
          <button type="button" className="btn btn-primary" onClick={() => retry()}>
            Try again
          </button>{' '}
          <a className="btn btn-outline" href="/login">
            Sign in again
          </a>
        </p>
      </section>
    </div>
  )
}
