import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, NotSeededError } from '@/lib/store'
import { createHash } from 'node:crypto'
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
/** Blob's etag for a JSON body as blob-store writes it: the quoted MD5 of the bytes. */
const etagOf = (c: unknown) => `"${createHash('md5').update(JSON.stringify(c, null, 2)).digest('hex')}"`
const alreadyExists = () => new BlobError('Vercel Blob: This blob already exists, use allowOverwrite: true if you want to overwrite it.')
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
    const v4 = content({ version: 4 })
    /** head() answers from this map; a missing entry means the blob doesn't exist. */
    function headsAre(heads: Record<string, string>) {
      sdk.head.mockImplementation(async (pathname: string) => {
        if (!(pathname in heads)) throw new BlobNotFoundError()
        return { etag: heads[pathname], url: url(pathname) }
      })
    }

    it('creates the version file first, then updates content.json guarded by the etag', async () => {
      await store().writeContent(v4, '"etag-v3"')
      expect(putPaths()).toEqual(['versions/content-v000004.json', 'content.json'])
      expect(sdk.put.mock.calls[0]?.[2]).toMatchObject({ allowOverwrite: false })
      expect(sdk.put.mock.calls[1]?.[2]).toMatchObject({ allowOverwrite: true, ifMatch: '"etag-v3"' })
    })

    it('refuses when another publish already created that version', async () => {
      headsAre({ 'versions/content-v000004.json': etagOf(content({ version: 4, updatedBy: 'other tab' })) })
      sdk.put.mockRejectedValueOnce(alreadyExists())
      await expect(store().writeContent(v4, '"etag-v3"')).rejects.toBeInstanceOf(ConflictError)
      expect(putPaths()).toEqual(['versions/content-v000004.json'])
      expect(sdk.del).not.toHaveBeenCalled()
    })

    it('refuses and removes its version file when content.json moved on', async () => {
      headsAre({ 'content.json': etagOf(content({ version: 4, updatedBy: 'other tab' })) })
      sdk.put.mockResolvedValueOnce({}).mockRejectedValueOnce(new BlobPreconditionFailedError())
      await expect(store().writeContent(v4, '"stale"')).rejects.toBeInstanceOf(ConflictError)
      expect(sdk.del).toHaveBeenCalledWith('versions/content-v000004.json', { token: 'test-token' })
    })

    // Found in the final review: @vercel/blob retries failed requests up to 10 times, so a write that
    // landed can come back as "already exists" or 412 on the retry. Blob's etag is the MD5 of the bytes,
    // which tells us for certain whether the stored file is ours.
    it('carries on when a retried version-file create finds its own earlier attempt', async () => {
      headsAre({ 'versions/content-v000004.json': etagOf(v4) })
      sdk.put.mockRejectedValueOnce(alreadyExists()).mockResolvedValueOnce({})
      await store().writeContent(v4, '"etag-v3"')
      expect(putPaths()).toEqual(['versions/content-v000004.json', 'content.json'])
    })

    it('counts the publish as done when a retried content.json write finds it already landed', async () => {
      headsAre({ 'content.json': etagOf(v4) })
      sdk.put.mockResolvedValueOnce({}).mockRejectedValueOnce(new BlobPreconditionFailedError())
      await store().writeContent(v4, '"etag-v3"')
      expect(sdk.del).not.toHaveBeenCalled()
    })

    it('counts the publish as done when content.json landed but the response was lost', async () => {
      headsAre({ 'content.json': etagOf(v4) })
      sdk.put.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('fetch failed'))
      await store().writeContent(v4, '"etag-v3"')
      expect(sdk.del).not.toHaveBeenCalled()
    })

    it('removes its version file and reports the failure when content.json never landed', async () => {
      headsAre({ 'content.json': '"etag-v3"' })
      sdk.put.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('fetch failed'))
      await expect(store().writeContent(v4, '"etag-v3"')).rejects.toThrow('fetch failed')
      expect(sdk.del).toHaveBeenCalledWith('versions/content-v000004.json', { token: 'test-token' })
    })

    it('carries on when the version-file create errored but the file landed', async () => {
      headsAre({ 'versions/content-v000004.json': etagOf(v4) })
      sdk.put.mockRejectedValueOnce(new Error('fetch failed')).mockResolvedValueOnce({})
      await store().writeContent(v4, '"etag-v3"')
      expect(putPaths()).toEqual(['versions/content-v000004.json', 'content.json'])
    })
  })

  // Found in the final review: the image check accepted any tenant's Blob host (and data: images) in
  // production. A new landing image must come from this store's own images/ folder.
  describe('ownsImageUrl', () => {
    const own = createBlobStore('vercel_blob_rw_AbCd1234EfGh5678_secretpart')
    const host = 'https://abcd1234efgh5678.public.blob.vercel-storage.com'
    const uploaded = 'images/data-school-0123456789abcdef.webp'

    it('accepts an uploaded image this store holds', async () => {
      sdk.head.mockResolvedValue({ contentType: 'image/webp', url: `${host}/${uploaded}` })
      expect(await own.ownsImageUrl(`${host}/${uploaded}`)).toBe(true)
      expect(sdk.head).toHaveBeenCalledWith(uploaded, expect.objectContaining({ token: expect.any(String) }))
    })

    // Issue #4: a URL can name this store's images/ folder without being an image the upload route saved.
    it('rejects an upload-shaped URL the store does not hold', async () => {
      sdk.head.mockRejectedValue(new BlobNotFoundError())
      expect(await own.ownsImageUrl(`${host}/${uploaded}`)).toBe(false)
    })
    it('rejects a blob at that path that is not a WebP image', async () => {
      sdk.head.mockResolvedValue({ contentType: 'text/html', url: `${host}/${uploaded}` })
      expect(await own.ownsImageUrl(`${host}/${uploaded}`)).toBe(false)
    })

    it.each([
      `https://otherstore0000000.public.blob.vercel-storage.com/${uploaded}`,
      `http://abcd1234efgh5678.public.blob.vercel-storage.com/${uploaded}`,
      `${host}/content.json`,
      `${host}/images/not-an-image.html`,
      `${host}/images/x.webp`,
      `${host}/images/data-school-0123456789abcdef.png`,
      `${host}/images/nested/data-school-0123456789abcdef.webp`,
      `${host}/${uploaded}?v=1`,
      `${host}/${uploaded}#x`,
      'data:image/webp;base64,UklGRg==',
      'data:image/png;base64,AAAA',
      'not a url',
    ])('rejects %s without asking Blob', async (u) => {
      expect(await own.ownsImageUrl(u)).toBe(false)
      expect(sdk.head).not.toHaveBeenCalled()
    })
  })

  describe('readFeedVersion', () => {
    const feedHolds = (json: unknown) =>
      sdk.get.mockResolvedValue({ stream: new Response(JSON.stringify(json)).body, blob: { etag: '"feed"' } })

    it('reads the content version the feed was built from', async () => {
      feedHolds({ version: 7, programs: {} })
      expect(await store().readFeedVersion()).toBe(7)
      expect(sdk.get).toHaveBeenCalledWith('cohorts-feed.json', expect.anything())
    })
    it('is null for a feed from before versioning, or no feed at all', async () => {
      feedHolds({ programs: {} })
      expect(await store().readFeedVersion()).toBeNull()
      sdk.get.mockResolvedValue(null)
      expect(await store().readFeedVersion()).toBeNull()
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
