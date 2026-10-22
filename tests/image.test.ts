import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, imagePathname, processLandingImage } from '@/lib/image'

const make = (width: number, height: number, format: 'jpeg' | 'png' | 'webp' | 'gif' = 'jpeg') =>
  sharp({ create: { width, height, channels: 3, background: { r: 20, g: 120, b: 80 } } })
    .toFormat(format)
    .toBuffer()

describe('processLandingImage', () => {
  it('re-encodes a valid photo to WebP', async () => {
    const result = await processLandingImage(await make(1200, 800))
    if (!result.ok) throw new Error(result.message)
    expect(result.contentType).toBe('image/webp')
    expect(result.hash).toMatch(/^[0-9a-f]{16}$/)
    const meta = await sharp(result.body).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.width).toBe(1200)
  })

  it('shrinks very large images to 1600px wide', async () => {
    const result = await processLandingImage(await make(3200, 2000, 'png'))
    if (!result.ok) throw new Error(result.message)
    expect((await sharp(result.body).metadata()).width).toBe(1600)
  })

  it.each(['png', 'webp'] as const)('accepts %s uploads', async (format) => {
    expect((await processLandingImage(await make(1000, 600, format))).ok).toBe(true)
  })

  it('rejects images smaller than 800×450', async () => {
    const result = await processLandingImage(await make(640, 480))
    expect(result).toEqual({ ok: false, message: 'Image is 640×480. It needs to be at least 800×450 pixels' })
  })

  it('rejects files that are not images, even if renamed', async () => {
    const result = await processLandingImage(Buffer.from('%PDF-1.7 not really an image'))
    expect(result).toEqual({ ok: false, message: "That file isn't a JPG, PNG or WebP image" })
  })

  it('rejects GIFs', async () => {
    expect(await processLandingImage(await make(1000, 600, 'gif'))).toEqual({
      ok: false,
      message: "That file isn't a JPG, PNG or WebP image",
    })
  })

  it('rejects files over 4 MB before decoding them', async () => {
    expect(await processLandingImage(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).toEqual({
      ok: false,
      message: 'That image is over 4 MB. Please use a smaller file',
    })
  })

  it('strips embedded metadata', async () => {
    const withExif = await sharp({ create: { width: 1000, height: 600, channels: 3, background: '#336699' } })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'private' } })
      .toBuffer()
    const result = await processLandingImage(withExif)
    if (!result.ok) throw new Error(result.message)
    expect((await sharp(result.body).metadata()).exif).toBeUndefined()
  })
})

describe('imagePathname', () => {
  it('names files by program and content hash', () => {
    expect(imagePathname('data-school', 'abcd')).toBe('images/data-school-abcd.webp')
  })
})
