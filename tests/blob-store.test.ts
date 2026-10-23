import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, NotSeededError } from '@/lib/store'
import { content } from './fixtures'

// Stand-in for the Vercel Blob SDK. Only what blob-store calls is modelled.
class BlobError extends Error {}
class BlobPreconditionFailedError extends BlobError {}
class BlobNotFoundError extends BlobError {}
const sdk = { get: vi.fn(), head: vi.fn(), list: vi.fn(), put: vi.fn(), del: vi.fn() }
vi.mock('@vercel/blob', () => ({
  get: (...a: unknown[]) => sdk.get(...a),
  head: (...a: unknown[]) => sdk.head(...a),
  list: (...a: unknown[]) => sdk.list(...a),
  put: (...a: unknown[]) => sdk.put(...a),
  del: (...a: unknown[]) => sdk.del(...a),
  BlobError,
  BlobPreconditionFailedError,
  BlobNotFoundError,
}))
const fetchMock = vi.fn()

const { createBlobStore } = await import('@/lib/blob-store')
const store = () => createBlobStore('test-token')
const url = (pathname: string) => `https://store.public.blob.vercel-storage.com/${pathname}`
const putPaths = () => sdk.put.mock.calls.map((c) => c[0] as string)

/** Pretend the store holds content.json with this etag and these version files. */
function storeHolds(etag: string, versions: Record<string, unknown>) {
  sdk.head.mockResolvedValue({ etag, url: url('content.json') })
  sdk.list.mockResolvedValue({ blobs: Object.keys(versions).map((p) => ({ pathname: p, url: url(p) })), hasMore: false })
  fetchMock.mockImplementation(async (u: string) => {
    const pathname = Object.keys(versions).find((p) => u.startsWith(url(p)))
    return new Response(JSON.stringify(versions[pathname!]))
  })
}

describe('blob store', () => {
  beforeEach(() => {
    for (const fn of Object.values(sdk)) fn.mockReset()
    sdk.put.mockResolvedValue({})
    sdk.del.mockResolvedValue(undefined)
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  describe('readContent', () => {
    // Found in the Task 17 end-to-end check: Blob's CDN keeps serving an overwritten public file for
    // several seconds and ignores useCache:false and query strings, so content.json can't be read back
    // reliably. Each version also lives in its own never-overwritten file, which the portal reads instead.
    it('reads the newest version file, not the overwritten content.json', async () => {
      storeHolds('"etag-v3"', {
        'versions/content-v000002.json': content({ version: 2 }),
        'versions/content-v000003.json': content({ version: 3 }),
      })
      const { content: live, etag } = await store().readContent()
      expect(live.version).toBe(3)
      expect(etag).toBe('"etag-v3"')
      expect(sdk.get).not.toHaveBeenCalled()
    })

    it('takes the etag from head(), with any weak W/ prefix removed', async () => {
      storeHolds('W/"abc123"', { 'versions/content-v000001.json': content() })
      expect((await store().readContent()).etag).toBe('"abc123"')
    })

    it('falls back to content.json in a store seeded before version files existed', async () => {
      storeHolds('"etag-v1"', {})
      sdk.get.mockResolvedValue({ stream: new Response(JSON.stringify(content())).body, blob: { etag: '"etag-v1"' } })
      expect((await store().readContent()).content.version).toBe(1)
    })

    it('reports an unseeded store', async () => {
      sdk.head.mockRejectedValue(new BlobNotFoundError())
      await expect(store().readContent()).rejects.toBeInstanceOf(NotSeededError)
    })
  })

  describe('writeContent', () => {
    it('creates the version file first, then updates content.json guarded by the etag', async () => {
      await store().writeContent(content({ version: 4 }), '"etag-v3"')
      expect(putPaths()).toEqual(['versions/content-v000004.json', 'content.json'])
      expect(sdk.put.mock.calls[0]?.[2]).toMatchObject({ allowOverwrite: false })
      expect(sdk.put.mock.calls[1]?.[2]).toMatchObject({ allowOverwrite: true, ifMatch: '"etag-v3"' })
    })

    it('refuses when that version already exists (another publish got there first)', async () => {
      sdk.put.mockRejectedValueOnce(new BlobError('Vercel Blob: This blob already exists, use `allowOverwrite: true` …'))
      await expect(store().writeContent(content({ version: 4 }), '"etag-v3"')).rejects.toBeInstanceOf(ConflictError)
      expect(putPaths()).toEqual(['versions/content-v000004.json'])
    })

    it('refuses and removes its version file when content.json moved on', async () => {
      sdk.put.mockResolvedValueOnce({}).mockRejectedValueOnce(new BlobPreconditionFailedError())
      await expect(store().writeContent(content({ version: 4 }), '"stale"')).rejects.toBeInstanceOf(ConflictError)
      expect(sdk.del).toHaveBeenCalledWith('versions/content-v000004.json', { token: 'test-token' })
    })
  })

  describe('createContent', () => {
    it('creates content.json (never overwriting) and then its version file', async () => {
      await store().createContent(content())
      expect(putPaths()).toEqual(['content.json', 'versions/content-v000001.json'])
      expect(sdk.put.mock.calls[0]?.[2]).toMatchObject({ allowOverwrite: false })
    })
  })
})
