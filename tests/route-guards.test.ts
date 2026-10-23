import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The proxy lets /api/* and server actions through to their own checks, so every one of them must make it.
const APP = join(process.cwd(), 'src', 'app')

describe('session guard rails', () => {
  it('every API route (other than Auth.js) checks the admin session', () => {
    const routes = readdirSync(join(APP, 'api'), { recursive: true, encoding: 'utf8' })
      .filter((f) => /(^|[\\/])route\.ts$/.test(f) && !f.startsWith('auth'))
      .map((f) => ({ f, text: readFileSync(join(APP, 'api', f), 'utf8') }))
    expect(routes.length).toBeGreaterThan(0)
    expect(routes.filter((r) => !r.text.includes('requireAdmin(')).map((r) => r.f)).toEqual([])
  })

  it('every server action other than sign-out checks the admin session first', () => {
    const text = readFileSync(join(APP, 'actions.ts'), 'utf8')
    const bodies = text.split(/\nexport async function /).slice(1)
    expect(bodies.length).toBeGreaterThan(0)
    const unchecked = bodies.filter((b) => !b.startsWith('signOutAction') && !/^\w+\([^)]*\)[^{]*\{\s*const by = await adminOrNull\(\)/.test(b))
    expect(unchecked.map((b) => b.split('(')[0])).toEqual([])
  })
})
