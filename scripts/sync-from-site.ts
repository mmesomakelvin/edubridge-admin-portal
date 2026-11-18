// Copies cohorts from the public site's data files into the content store. Pricing and images are left alone.
// Preview (writes nothing): npm run sync-site -- --public-repo "C:\path\to\ea-website-revamp"
// Apply:                    add --apply --expect-store <storeId> --expect-version <n> (both shown by the preview)
// Production uses npm run sync-site:production, which reads .env.production-sync (git-ignored).
import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { createBlobStore, storeIdFromToken } from '../src/lib/blob-store'
import type { Cohort } from '../src/lib/content-schema'
import { createFsSource } from '../src/lib/seed'
import { applySiteSync, planSiteSync } from '../src/lib/site-sync'

const { values } = parseArgs({
  options: {
    'public-repo': { type: 'string' },
    apply: { type: 'boolean', default: false },
    'expect-store': { type: 'string' },
    'expect-version': { type: 'string' },
  },
})

function stop(message: string): never {
  console.error(message)
  process.exit(1)
}

const repo = values['public-repo']
if (!repo) stop('Usage: npm run sync-site -- --public-repo "<path to ea-website-revamp>" [--apply --expect-store <id> --expect-version <n>]')

const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim()
const branch = git('branch', '--show-current')
const uncommitted = git('status', '--porcelain', '--', 'product/sections')
const storeId = storeIdFromToken(process.env.BLOB_READ_WRITE_TOKEN ?? '')
const expectedStore = values['expect-store']?.toLowerCase()
if (expectedStore && expectedStore !== storeId) stop(`Stopped: this key is for store "${storeId}", not "${expectedStore}".`)

const store = createBlobStore()
const source = createFsSource(repo)
const { content } = await store.readContent()
const plan = await planSiteSync(content, source)

const describe = (c: Cohort) => `${c.name}, ${c.startDate} to ${c.endDate}, ${c.seatsRemaining}/${c.totalSeats} seats`
console.log(`Store: ${storeId}  |  version ${content.version}  |  website branch: ${branch} (${git('rev-parse', '--short', 'HEAD')})`)
for (const change of plan.changes) {
  console.log(`\n${change.slug}`)
  for (const { before, after } of change.moved) console.log(`  changed: ${describe(before)}\n       to: ${describe(after)}`)
  for (const cohort of change.added) console.log(`  added:   ${describe(cohort)}`)
  for (const cohort of change.removed) console.log(`  removed: ${describe(cohort)}`)
}
const count = (pick: (c: (typeof plan.changes)[number]) => number) => plan.changes.reduce((sum, c) => sum + pick(c), 0)
console.log(`\nTotal: ${count((c) => c.moved.length)} changed, ${count((c) => c.added.length)} added, ${count((c) => c.removed.length)} removed`)
for (const note of plan.notCopied) console.log(`Not copied: ${note}`)
for (const problem of plan.problems) console.error(`Problem: ${problem}`)
if (plan.problems.length > 0) process.exit(1)

if (!values.apply) {
  console.log('\nPreview only: nothing was changed.')
  process.exit(0)
}

if (branch !== 'main') stop('Stopped: the website folder must be on its main branch.')
if (uncommitted) stop('Stopped: the website has uncommitted changes in product/sections.')
if (!expectedStore) stop('Stopped: --apply needs --expect-store.')
const expectedVersion = Number(values['expect-version'])
if (!Number.isInteger(expectedVersion) || expectedVersion < 1) stop('Stopped: --apply needs --expect-version.')

const result = await applySiteSync(store, { source, expectedVersion, by: 'site-sync' })
if (!result.ok) stop(`Nothing was changed: ${JSON.stringify(result)}`)
if (result.changed === 0) console.log('\nAlready in step: nothing to copy.')
else console.log(`\nDone: version ${result.version} saved, ${result.changed} programs updated. Feed updated: ${result.feedUpdated}.`)
