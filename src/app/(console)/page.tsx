import { NotSeeded } from '@/components/NotSeeded'
import { ProgramDetail } from '@/components/ProgramDetail'
import { ProgramRow } from '@/components/ProgramRow'
import { formatStamp } from '@/lib/format'
import { PROGRAMS, getProgram } from '@/lib/programs'
import { readContentOrNull } from '@/lib/store-instance'

export const dynamic = 'force-dynamic'

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams
  const loaded = await readContentOrNull()
  if (!loaded) return <NotSeeded />
  const { content } = loaded
  const now = new Date()
  const selected = getProgram(p ?? '') ?? PROGRAMS[0]!
  const publishedBy = content.updatedBy === 'seed' ? 'Imported from the website' : `Last published by ${content.updatedBy}`

  return (
    <div className="panes">
      <section className="pane-main">
        <header className="phead">
          <h1>Programs</h1>
          <span className="meta">
            {publishedBy} · {formatStamp(content.updatedAt)} · version {content.version}
          </span>
        </header>
        <ul className="list">
          {PROGRAMS.map((info) => (
            <ProgramRow key={info.slug} info={info} entry={content.programs[info.slug]} selected={info.slug === selected.slug} now={now} />
          ))}
        </ul>
      </section>
      <ProgramDetail info={selected} entry={content.programs[selected.slug]} now={now} />
    </div>
  )
}
