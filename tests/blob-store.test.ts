import { beforeEach, describe, expect, it, vi } from 'vitest'
import { content } from './fixtures'

// Stand-in for the Vercel Blob SDK: get() serves content.json with the etag a real store returns.
const blobGet = vi.fn()
const blobPut = vi.fn()
vi.mock('@vercel/blob', () => ({
  get: (...args: unknown[]) => blobGet(...args),
  put: (...args: unknown[]) => blobPut(...args),
  list: vi.fn(),
  BlobPreconditionFailedError: class extends Error {},
}))

const { createBlobStore } = await import('@/lib/blob-store')

function serve(etag: string) {
  blobGet.mockResolvedValue({ stream: new Response(JSON.stringify(content())).body, blob: { etag } })
}

describe('blob store etags', () => {
  beforeEach(() => {
    blobGet.mockReset()
    blobPut.mockReset().mockResolvedValue({})
  })

  // Found in the Task 17 end-to-end check: Blob compresses larger files on the way out and labels the
  // etag weak (W/"…"), but put({ ifMatch }) only accepts the strong form, so every publish was refused.
  it('hands back the strong etag when Blob serves a weak one', async () => {
    serve('W/"e81279576ed63165c20fde998af6ad16"')
    const { etag } = await createBlobStore('test-token').readContent()
    expect(etag).toBe('"e81279576ed63165c20fde998af6ad16"')
  })

  it('leaves a strong etag as it is', async () => {
    serve('"abc123"')
    expect((await createBlobStore('test-token').readContent()).etag).toBe('"abc123"')
  })

  it('writes with the strong etag so the publish guard can pass', async () => {
    serve('W/"abc123"')
    const store = createBlobStore('test-token')
    const { etag } = await store.readContent()
    await store.writeContent(content({ version: 2 }), etag)
    expect(blobPut.mock.calls[0]?.[2]).toMatchObject({ ifMatch: '"abc123"' })
  })
})
