import { notFound } from 'next/navigation'
import { NotSeeded } from '@/components/NotSeeded'
import { ProgramEditor } from '@/components/editor/ProgramEditor'
import { getProgram } from '@/lib/programs'
import { readContentOrNull } from '@/lib/store-instance'

export const dynamic = 'force-dynamic'

export default async function EditProgramPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ published?: string; feed?: string }>
}) {
  const [{ slug }, { published, feed }] = await Promise.all([params, searchParams])
  const info = getProgram(slug)
  if (!info) notFound()
  const loaded = await readContentOrNull()
  if (!loaded) return <NotSeeded />
  const entry = loaded.content.programs[info.slug]
  if (!entry) notFound()

  return (
    <ProgramEditor
      // Remount with fresh state whenever a new version is live.
      key={loaded.content.version}
      info={info}
      initial={entry}
      baseVersion={loaded.content.version}
      nowIso={new Date().toISOString()}
      publishedVersion={published ? Number(published) : null}
      feedWarning={feed === '0'}
    />
  )
}
