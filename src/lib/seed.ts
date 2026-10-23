import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { ProgramContentSchema, type Content } from './content-schema'
import { sha16 } from './hash'
import { PROGRAMS, type ProgramInfo, type ProgramSlug } from './programs'
import { IMAGE_PREFIX } from './store'

/** Read access to the public site repo (ea-website-revamp). */
export interface SeedSource {
  readProgramData(slug: ProgramSlug): Promise<unknown>
  readHomeData(): Promise<unknown>
  readPublicFile(relPath: string): Promise<Buffer>
}
export type UploadImage = (pathname: string, body: Buffer, contentType: string) => Promise<string>

export function createFsSource(publicRepoDir: string): SeedSource {
  const readJson = async (...parts: string[]) => JSON.parse(await readFile(join(publicRepoDir, ...parts), 'utf8')) as unknown
  return {
    readProgramData: (slug) => readJson('product', 'sections', slug, 'data.json'),
    readHomeData: () => readJson('product', 'sections', 'home', 'data.json'),
    readPublicFile: (relPath) => readFile(join(publicRepoDir, 'public', relPath)),
  }
}

const SourceProgram = z.object({
  cohorts: z.array(z.unknown()),
  pricing: z.array(z.unknown()),
  heroContent: z.object({ priceLabel: z.string() }),
})
const SourceHome = z.object({
  featuredPrograms: z.array(z.object({ id: z.string(), imageUrl: z.string().nullable() })),
})
type SourceHomeData = z.infer<typeof SourceHome>

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

/** 'images/finance.jpg' — the card image path relative to the public folder. */
function cardImagePath(home: SourceHomeData, info: ProgramInfo): string {
  const card = home.featuredPrograms.find((c) => c.id === info.homeCardId)
  if (!card?.imageUrl) throw new Error(`Homepage card ${info.homeCardId} for ${info.slug} has no imageUrl`)
  return card.imageUrl.replace(/^\//, '')
}

function programFields(data: z.infer<typeof SourceProgram>) {
  const parsed = ProgramContentSchema.pick({ cohorts: true, pricing: true }).parse({ cohorts: data.cohorts, pricing: data.pricing })
  return { ...parsed, heroPriceLabel: data.heroContent.priceLabel }
}

/** Build content.json v1 from today's site data. Card images are uploaded byte-for-byte for exact parity. */
export async function buildSeed(source: SeedSource, upload: UploadImage, now: Date = new Date()): Promise<Content> {
  const home = SourceHome.parse(await source.readHomeData())
  const programs: Content['programs'] = {}
  for (const info of PROGRAMS) {
    const fields = programFields(SourceProgram.parse(await source.readProgramData(info.slug)))
    const relPath = cardImagePath(home, info)
    const ext = extname(relPath).toLowerCase()
    const contentType = CONTENT_TYPES[ext]
    if (!contentType) throw new Error(`Unsupported card image type for ${info.slug}: ${relPath}`)
    const bytes = await source.readPublicFile(relPath)
    const landingImageUrl = await upload(`${IMAGE_PREFIX}${info.slug}-${sha16(bytes)}${ext}`, bytes, contentType)
    programs[info.slug] = { ...fields, landingImageUrl }
  }
  return { version: 1, updatedAt: now.toISOString(), updatedBy: 'seed', programs }
}

/** Compare stored content with the public repo. Empty list = zero visible change. */
export async function checkParity(content: Content, source: SeedSource, fetchBytes: (url: string) => Promise<Buffer>): Promise<string[]> {
  const home = SourceHome.parse(await source.readHomeData())
  const problems: string[] = []
  for (const info of PROGRAMS) {
    const entry = content.programs[info.slug]
    if (!entry) {
      problems.push(`${info.slug}: missing from content.json`)
      continue
    }
    const expected = programFields(SourceProgram.parse(await source.readProgramData(info.slug)))
    const imageBytes = await source.readPublicFile(cardImagePath(home, info))
    if (!isDeepStrictEqual(entry.cohorts, expected.cohorts)) problems.push(`${info.slug}: cohorts differ`)
    if (!isDeepStrictEqual(entry.pricing, expected.pricing)) problems.push(`${info.slug}: pricing differs`)
    if (entry.heroPriceLabel !== expected.heroPriceLabel) problems.push(`${info.slug}: hero price label differs`)
    if (sha16(await fetchBytes(entry.landingImageUrl)) !== sha16(imageBytes)) problems.push(`${info.slug}: landing image differs`)
  }
  return problems
}
