import { MAX_UPLOAD_BYTES, imagePathname, processLandingImage } from '@/lib/image'
import { isProgramSlug } from '@/lib/programs'
import { requireAdmin } from '@/lib/session'
import { getStore } from '@/lib/store-instance'

export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch {
    return Response.json({ error: 'Your session has ended. Sign in again.' }, { status: 401 })
  }

  const slug = new URL(request.url).searchParams.get('slug') ?? ''
  if (!isProgramSlug(slug)) return Response.json({ error: 'Unknown program.' }, { status: 400 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return Response.json({ error: 'No file was received. Try again.' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: 'That image is over 4 MB. Please use a smaller file' }, { status: 413 })

  const result = await processLandingImage(Buffer.from(await file.arrayBuffer()))
  if (!result.ok) return Response.json({ error: result.message }, { status: 422 })

  const url = await (await getStore()).putImage(imagePathname(slug, result.hash), result.body, result.contentType)
  return Response.json({ url })
}
