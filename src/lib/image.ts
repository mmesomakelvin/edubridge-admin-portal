import sharp, { type Metadata } from 'sharp'
import { sha16 } from './hash'
import { IMAGE_PREFIX } from './store'

/** Vercel rejects request bodies over 4.5 MB, so the portal caps uploads at 4 MB. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
export const MIN_WIDTH = 800
export const MIN_HEIGHT = 450
export const OUTPUT_MAX_WIDTH = 1600

export type ImageResult =
  | { ok: true; body: Buffer; contentType: 'image/webp'; hash: string }
  | { ok: false; message: string }

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp'])
const NOT_AN_IMAGE = "That file isn't a JPG, PNG or WebP image"

/**
 * Validate by decoding (never trust the file name or MIME type), then re-encode
 * to WebP. Re-encoding drops EXIF/metadata and anything hidden in the original bytes.
 */
export async function processLandingImage(input: Buffer): Promise<ImageResult> {
  if (input.byteLength > MAX_UPLOAD_BYTES) return { ok: false, message: 'That image is over 4 MB. Please use a smaller file' }

  let meta: Metadata
  try {
    meta = await sharp(input).metadata()
  } catch {
    return { ok: false, message: NOT_AN_IMAGE }
  }
  if (!ACCEPTED_FORMATS.has(meta.format ?? '')) return { ok: false, message: NOT_AN_IMAGE }

  const rotated = (meta.orientation ?? 1) >= 5
  const width = (rotated ? meta.height : meta.width) ?? 0
  const height = (rotated ? meta.width : meta.height) ?? 0
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return { ok: false, message: `Image is ${width}×${height}. It needs to be at least ${MIN_WIDTH}×${MIN_HEIGHT} pixels` }
  }

  const body = await sharp(input)
    .rotate()
    .resize({ width: OUTPUT_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()
  return { ok: true, body, contentType: 'image/webp', hash: sha16(body) }
}

export function imagePathname(slug: string, hash: string): string {
  return `${IMAGE_PREFIX}${slug}-${hash}.webp`
}
