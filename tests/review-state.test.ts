import { describe, expect, it } from 'vitest'
import { liveServerIssues } from '@/lib/review-state'
import type { Issue } from '@/lib/validate'
import { program } from './fixtures'

const issue: Issue = { path: 'cohorts.0.endDate', level: 'error', message: 'End date must be after the start date' }

describe('liveServerIssues', () => {
  it('shows the server issues for the draft they were about', () => {
    const draft = program()
    expect(liveServerIssues({ draft, issues: [issue] }, draft)).toEqual([issue])
  })

  // Found in the final review: stale server issues kept Publish disabled after staff fixed the field,
  // so the only way out was Discard, which threw away their edits.
  it('drops them as soon as the draft changes', () => {
    expect(liveServerIssues({ draft: program(), issues: [issue] }, program())).toEqual([])
  })

  it('is empty when the server has said nothing', () => {
    expect(liveServerIssues(null, program())).toEqual([])
  })
})
