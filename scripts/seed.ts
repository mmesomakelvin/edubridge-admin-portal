// One-time import of today's site data into the content store.
// Usage: npm run seed -- --public-repo "C:\path\to\ea-website-revamp" [--dry-run]
import { parseArgs } from 'node:util'
import { createBlobStore } from '../src/lib/blob-store'
import { buildCohortsFeed } from '../src/lib/cohorts-feed'
import { buildSeed, createFsSource } from '../src/lib/seed'

const { values } = parseArgs({
  options: { 'public-repo': { type: 'string' }, 'dry-run': { type: 'boolean', default: false } },
})
const repo = values['public-repo']
if (!repo) {
  console.error('Usage: npm run seed -- --public-repo "<path to ea-website-revamp>" [--dry-run]')
  process.exit(1)
}
const source = createFsSource(repo)

if (values['dry-run']) {
  const content = await buildSeed(source, async (pathname) => `https://dry-run.invalid/${pathname}`)
  console.log(JSON.stringify(content, null, 2))
} else {
  const store = createBlobStore()
  const content = await buildSeed(source, (pathname, body, type) => store.putImage(pathname, body, type))
  await store.createContent(content)
  await store.writeFeed(buildCohortsFeed(content))
  console.log(`Seeded content.json v${content.version} with ${Object.keys(content.programs).length} programs, plus cohorts-feed.json`)
}
