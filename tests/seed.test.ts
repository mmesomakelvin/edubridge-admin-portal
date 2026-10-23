import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sha16 } from '@/lib/hash'
import { PROGRAMS } from '@/lib/programs'
import { buildSeed, checkParity, createFsSource } from '@/lib/seed'
import { NOW, program } from './fixtures'

async function writeJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value))
}

/** A miniature copy of ea-website-revamp with just the files the seed reads. */
async function makePublicRepo(options: { dropCard?: string } = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ea-repo-'))
  const p = program()
  for (const info of PROGRAMS) {
    const sectionDir = join(dir, 'product', 'sections', info.slug)
    await mkdir(sectionDir, { recursive: true })
    await writeJson(join(sectionDir, 'data.json'), {
      heroContent: { heading: 'Heading', priceLabel: p.heroPriceLabel },
      cohorts: p.cohorts.map((c) => ({ ...c, extra: true })),
      pricing: p.pricing,
      faqs: [],
    })
  }
  await mkdir(join(dir, 'product', 'sections', 'home'), { recursive: true })
  const cards = [
    { id: 'prog-6', imageUrl: '/images/corporate.jpg' },
    ...PROGRAMS.map((info) => ({ id: info.homeCardId, imageUrl: `/images/${info.slug}.jpg` })),
  ].filter((c) => c.id !== options.dropCard)
  await writeJson(join(dir, 'product', 'sections', 'home', 'data.json'), { featuredPrograms: cards })
  await mkdir(join(dir, 'public', 'images'), { recursive: true })
  for (const info of PROGRAMS) await writeFile(join(dir, 'public', 'images', `${info.slug}.jpg`), Buffer.from(`jpeg bytes for ${info.slug}`))
  return dir
}

function fakeUploader() {
  const uploads = new Map<string, Buffer>()
  const upload = async (pathname: string, body: Buffer) => {
    uploads.set(pathname, body)
    return `https://blob.test/${pathname}`
  }
  const fetchBytes = async (url: string) => uploads.get(url.replace('https://blob.test/', '')) ?? Buffer.from('different bytes')
  return { uploads, upload, fetchBytes }
}

describe('buildSeed', () => {
  it('builds version 1 with all seven programs from the public repo', async () => {
    const { upload } = fakeUploader()
    const seeded = await buildSeed(createFsSource(await makePublicRepo()), upload, NOW)
    expect(seeded).toMatchObject({ version: 1, updatedBy: 'seed', updatedAt: NOW.toISOString() })
    expect(Object.keys(seeded.programs)).toEqual(PROGRAMS.map((p) => p.slug))
    expect(seeded.programs['school-of-finance']?.cohorts).toEqual(program().cohorts)
    expect(seeded.programs['school-of-finance']?.pricing).toEqual(program().pricing)
    expect(seeded.programs['school-of-finance']?.heroPriceLabel).toBe(program().heroPriceLabel)
  })

  it('uploads the current card image unchanged under a hashed name', async () => {
    const { upload, uploads } = fakeUploader()
    const seeded = await buildSeed(createFsSource(await makePublicRepo()), upload, NOW)
    const bytes = Buffer.from('jpeg bytes for school-of-finance')
    const pathname = `images/school-of-finance-${sha16(bytes)}.jpg`
    expect(uploads.get(pathname)).toEqual(bytes)
    expect(seeded.programs['school-of-finance']?.landingImageUrl).toBe(`https://blob.test/${pathname}`)
  })

  it('names the homepage card it could not find', async () => {
    const { upload } = fakeUploader()
    await expect(buildSeed(createFsSource(await makePublicRepo({ dropCard: 'prog-hr' })), upload, NOW)).rejects.toThrow(/prog-hr/)
  })
})

describe('checkParity', () => {
  it('finds no differences in a fresh seed', async () => {
    const source = createFsSource(await makePublicRepo())
    const { upload, fetchBytes } = fakeUploader()
    const seeded = await buildSeed(source, upload, NOW)
    expect(await checkParity(seeded, source, fetchBytes)).toEqual([])
  })

  it('reports changed prices and images per program', async () => {
    const source = createFsSource(await makePublicRepo())
    const { upload, fetchBytes } = fakeUploader()
    const seeded = await buildSeed(source, upload, NOW)
    seeded.programs['data-school']!.pricing[0]!.amount = 1
    seeded.programs['school-of-finance']!.landingImageUrl = 'https://blob.test/other.jpg'
    expect(await checkParity(seeded, source, fetchBytes)).toEqual([
      'school-of-finance: landing image differs',
      'data-school: pricing differs',
    ])
  })
})
