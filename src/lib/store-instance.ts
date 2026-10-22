import 'server-only'
import { createBlobStore } from './blob-store'
import type { Content } from './content-schema'
import { isDemoMode } from './demo'
import { createMemoryStore } from './memory-store'
import { buildSeed, createFsSource } from './seed'
import { NotSeededError, type ContentStore } from './store'

// Cached on globalThis so dev-server hot reloads keep the same demo store.
const cache = globalThis as typeof globalThis & { __eduStore?: Promise<ContentStore> }

async function createDemoStore(): Promise<ContentStore> {
  const repo = process.env.DEMO_PUBLIC_REPO
  if (!repo) throw new Error('Set DEMO_PUBLIC_REPO to the ea-website-revamp folder to use ADMIN_DEMO=1')
  const store = createMemoryStore()
  await store.createContent(await buildSeed(createFsSource(repo), (p, body, type) => store.putImage(p, body, type)))
  return store
}

export function getStore(): Promise<ContentStore> {
  cache.__eduStore ??= isDemoMode() ? createDemoStore() : Promise.resolve(createBlobStore())
  return cache.__eduStore
}

export async function readContentOrNull(): Promise<{ content: Content; etag: string } | null> {
  try {
    return await (await getStore()).readContent()
  } catch (error) {
    if (error instanceof NotSeededError) return null
    throw error
  }
}
