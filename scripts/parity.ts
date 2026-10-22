// Confirms the stored content matches the public repo exactly (run right after seeding).
// Usage: npm run parity -- --public-repo "C:\path\to\ea-website-revamp"
import { parseArgs } from 'node:util'
import { createBlobStore } from '../src/lib/blob-store'
import { checkParity, createFsSource } from '../src/lib/seed'

const { values } = parseArgs({ options: { 'public-repo': { type: 'string' } } })
const repo = values['public-repo']
if (!repo) {
  console.error('Usage: npm run parity -- --public-repo "<path to ea-website-revamp>"')
  process.exit(1)
}
const { content } = await createBlobStore().readContent()
const problems = await checkParity(content, createFsSource(repo), async (url) => {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Could not download ${url} (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
})
if (problems.length > 0) {
  console.error(`Parity check FAILED:\n${problems.map((p) => ` - ${p}`).join('\n')}`)
  process.exit(1)
}
console.log('Parity check passed: content.json matches the public site data for all 6 programs.')
