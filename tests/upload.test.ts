import { describe, expect, it } from 'vitest'
import { uploadImage, type UploadProgress, type XhrLike } from '@/lib/upload'

/** Minimal XMLHttpRequest stand-in the test drives by hand. */
function fakeXhr() {
  const xhr = {
    upload: {} as XhrLike['upload'],
    status: 0,
    responseText: '',
    opened: [] as string[],
    sent: null as unknown,
    open(method: string, url: string) {
      this.opened = [method, url]
    },
    send(body: unknown) {
      this.sent = body
    },
  } as XhrLike & { opened: string[]; sent: unknown }
  return xhr
}

const file = new Blob(['x'.repeat(100)], { type: 'image/jpeg' })

describe('uploadImage', () => {
  it('posts the file as multipart form data to the given URL', () => {
    const xhr = fakeXhr()
    void uploadImage('/api/images?slug=data-school', file, () => {}, () => xhr)
    expect(xhr.opened).toEqual(['POST', '/api/images?slug=data-school'])
    expect((xhr.sent as FormData).get('file')).toBeInstanceOf(Blob)
  })

  it('reports the share of bytes sent, then switches to processing once all are sent', () => {
    const xhr = fakeXhr()
    const seen: UploadProgress[] = []
    void uploadImage('/u', file, (p) => seen.push(p), () => xhr)
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 } as ProgressEvent)
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 } as ProgressEvent)
    xhr.upload.onload?.({} as ProgressEvent)
    expect(seen).toEqual([
      { stage: 'sending', percent: 0 },
      { stage: 'sending', percent: 25 },
      { stage: 'sending', percent: 100 },
      { stage: 'processing' },
    ])
  })

  it('resolves with the stored image URL', async () => {
    const xhr = fakeXhr()
    const done = uploadImage('/u', file, () => {}, () => xhr)
    Object.assign(xhr, { status: 200, responseText: JSON.stringify({ url: 'https://b/images/x.webp' }) })
    xhr.onload?.({} as ProgressEvent)
    await expect(done).resolves.toEqual({ url: 'https://b/images/x.webp' })
  })

  it("rejects with the server's own message when the image is refused", async () => {
    const xhr = fakeXhr()
    const done = uploadImage('/u', file, () => {}, () => xhr)
    Object.assign(xhr, { status: 422, responseText: JSON.stringify({ error: 'Image is 600×400. It needs to be at least 800×450 pixels' }) })
    xhr.onload?.({} as ProgressEvent)
    await expect(done).rejects.toThrow('Image is 600×400. It needs to be at least 800×450 pixels')
  })

  it('rejects with a plain message when the connection drops', async () => {
    const xhr = fakeXhr()
    const done = uploadImage('/u', file, () => {}, () => xhr)
    xhr.onerror?.({} as ProgressEvent)
    await expect(done).rejects.toThrow('Upload failed. Check your connection and try again')
  })
})
