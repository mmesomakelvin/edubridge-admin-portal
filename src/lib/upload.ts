/**
 * Image upload with progress. fetch() can't report upload progress, so this uses XMLHttpRequest.
 * Two stages: 'sending' (bytes leaving the browser) and 'processing' (the server decoding,
 * resizing, re-encoding to WebP and storing — usually the longer part).
 */
export type UploadProgress = { stage: 'sending'; percent: number } | { stage: 'processing' }

/** The slice of XMLHttpRequest this module uses, so tests can drive it by hand. */
export interface XhrLike {
  upload: { onprogress?: ((e: ProgressEvent) => void) | null; onload?: ((e: ProgressEvent) => void) | null }
  onload?: ((e: ProgressEvent) => void) | null
  onerror?: ((e: ProgressEvent) => void) | null
  status: number
  responseText: string
  open(method: string, url: string): void
  send(body: FormData): void
}

const NETWORK_ERROR = 'Upload failed. Check your connection and try again'
const SESSION_ERROR = 'Upload failed. Your session may have ended. Reload the page and try again'

export function uploadImage(
  url: string,
  file: Blob,
  onProgress: (p: UploadProgress) => void,
  makeXhr: () => XhrLike = () => new XMLHttpRequest(),
): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = makeXhr()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress({ stage: 'sending', percent: Math.round((e.loaded / e.total) * 100) })
    }
    xhr.upload.onload = () => onProgress({ stage: 'processing' })
    xhr.onerror = () => reject(new Error(NETWORK_ERROR))
    xhr.onload = () => {
      let data: { url?: string; error?: string } | null = null
      try {
        data = JSON.parse(xhr.responseText) as { url?: string; error?: string }
      } catch {
        // A non-JSON reply (e.g. the sign-in page after a redirect) is handled below.
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.url) resolve({ url: data.url })
      else reject(new Error(data?.error ?? SESSION_ERROR))
    }
    const body = new FormData()
    body.append('file', file)
    xhr.open('POST', url)
    onProgress({ stage: 'sending', percent: 0 })
    xhr.send(body)
  })
}
