import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')
const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .map((f) => ({ path: f, text: readFileSync(join(SRC, f), 'utf8') }))

describe('XSS guard rails across src/', () => {
  it.each([
    ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
    ['innerHTML / outerHTML writes', /\.(inner|outer)HTML\s*=/],
    ['eval / new Function', /\beval\(|new Function\(/],
    ['document.write', /document\.write/],
  ])('never uses %s', (_name, pattern) => {
    expect(files.filter((f) => pattern.test(f.text)).map((f) => f.path)).toEqual([])
  })

  it('opens external links with rel="noreferrer"', () => {
    const offenders = files.filter((f) => /target="_blank"(?![^>]*rel="noreferrer")/.test(f.text)).map((f) => f.path)
    expect(offenders).toEqual([])
  })
})
