'use client'

import { useEffect, useMemo, useReducer, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ProgramContent } from '@/lib/content-schema'
import { describeChanges } from '@/lib/diff'
import { draftReducer } from '@/lib/draft-reducer'
import { liveUrl, type ProgramInfo } from '@/lib/programs'
import { validateProgram, type Issue } from '@/lib/validate'
import { CohortsTab } from './CohortsTab'
import { ImageTab } from './ImageTab'
import { PricingTab } from './PricingTab'
import { ReviewPanel } from './ReviewPanel'

type Tab = 'cohorts' | 'pricing' | 'image'
const TABS: { id: Tab; label: string; owns: (path: string) => boolean }[] = [
  { id: 'cohorts', label: 'Cohorts', owns: (p) => p.startsWith('cohorts') },
  { id: 'pricing', label: 'Pricing', owns: (p) => p.startsWith('pricing') || p === 'heroPriceLabel' },
  { id: 'image', label: 'Landing image', owns: (p) => p === 'landingImageUrl' },
]

export interface ProgramEditorProps {
  info: ProgramInfo
  initial: ProgramContent
  baseVersion: number
  nowIso: string
  publishedVersion: number | null
  feedWarning: boolean
}

export function ProgramEditor({ info, initial, baseVersion, nowIso, publishedVersion, feedWarning }: ProgramEditorProps) {
  const [draft, dispatch] = useReducer(draftReducer, initial)
  const [tab, setTab] = useState<Tab>('cohorts')
  const now = useMemo(() => new Date(nowIso), [nowIso])
  const issues: Issue[] = useMemo(() => validateProgram(draft, { now, original: initial }), [draft, initial, now])
  const changes = useMemo(() => describeChanges(initial, draft, now), [initial, draft, now])

  // Warn before closing the tab with unpublished edits.
  useEffect(() => {
    if (changes.length === 0) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [changes.length])

  return (
    <div className="panes">
      <section className="pane-main">
        <Link className="back" href={`/?p=${info.slug}`}>
          <ArrowLeft size={14} aria-hidden /> All programs
        </Link>
        {publishedVersion !== null && (
          <p className="banner banner-ok" role="status">
            Published version {publishedVersion}. The live site updates within about a minute.{' '}
            <a href={liveUrl(info)} target="_blank" rel="noreferrer">
              View live page ↗
            </a>
          </p>
        )}
        {feedWarning && (
          <p className="banner banner-warn" role="alert">
            Published, but the win-back cohort feed didn’t update. Publish again, or tell a developer.
          </p>
        )}
        <header className="phead">
          <h1>{info.name}</h1>
          <span className="meta">Editing version {baseVersion}</span>
        </header>
        <div className="card">
          <div className="tabs" role="tablist" aria-label="Edit sections">
            {TABS.map((t) => {
              const errors = issues.filter((i) => i.level === 'error' && t.owns(i.path)).length
              return (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                  {t.label}
                  {errors > 0 && <span className="tab-count">{errors}</span>}
                </button>
              )
            })}
          </div>
          <div className="tabpad" role="tabpanel">
            {tab === 'cohorts' && <CohortsTab cohorts={draft.cohorts} issues={issues} now={now} dispatch={dispatch} />}
            {tab === 'pricing' && <PricingTab draft={draft} issues={issues} dispatch={dispatch} />}
            {tab === 'image' && <ImageTab slug={info.slug} url={draft.landingImageUrl} dispatch={dispatch} />}
          </div>
        </div>
      </section>
      <ReviewPanel
        info={info}
        draft={draft}
        issues={issues}
        changes={changes}
        baseVersion={baseVersion}
        onDiscard={() => dispatch({ type: 'reset', value: initial })}
      />
    </div>
  )
}
