import { Download, RefreshCw } from 'lucide-react'
import { usePlayer } from '../components/Player'
import { TimeLink } from '../components/TimeLink'
import { Button, EmptyState } from '../components/ui'
import { api } from '../lib/api'
import type { Lecture, Materials } from '../lib/types'

interface Props {
  lecture: Lecture
  materials: Materials | null | undefined
  onRegenerate: () => void
  regenerating: boolean
}

export function NotesTab({ lecture, materials, onRegenerate, regenerating }: Props) {
  const player = usePlayer()
  if (!materials) return <EmptyState title="No notes yet">Notes are written when processing finishes.</EmptyState>
  const seek = (t: number) => player.seek(t)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {lecture.materials_stale ? (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            You changed the transcript after these notes were made. Regenerate to include your corrections.
          </p>
        ) : <span />}
        <div className="flex gap-2">
          <Button onClick={onRegenerate} loading={regenerating}><RefreshCw className="h-4 w-4" /> Regenerate notes</Button>
          <a href={api.pdfUrl(lecture.id)} download
            className="inline-flex items-center gap-2 rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-accent-400">
            <Download className="h-4 w-4" /> Download PDF
          </a>
        </div>
      </div>

      {materials.detailed_notes.length > 0 && (
        <section className="panel p-5">
          <h2 className="mb-3 text-sm font-semibold text-cream-50">Detailed notes</h2>
          <div className="space-y-5">
            {materials.detailed_notes.map((n, i) => (
              <div key={i}>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-accent-300">{n.heading} <TimeLink seconds={n.start} onSeek={seek} /></h3>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-cream-200">{n.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="mb-3 text-sm font-semibold text-cream-50">Key concepts and definitions</h2>
          {materials.concepts.length === 0 ? <p className="text-sm text-cream-400">None found.</p> : (
            <dl className="space-y-3">
              {materials.concepts.map((c, i) => (
                <div key={i}>
                  <dt className="flex items-center gap-2 text-sm font-medium text-cream-50">{c.term} <TimeLink seconds={c.start} onSeek={seek} /></dt>
                  <dd className="text-sm text-cream-300">{c.definition}</dd>
                  {c.evidence && <dd className="mt-1 border-l-2 border-ink-600 pl-2 text-xs italic text-cream-500">“{c.evidence}”</dd>}
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 text-sm font-semibold text-cream-50">Formulas</h2>
          {materials.formulas.length === 0 ? <p className="text-sm text-cream-400">None found.</p> : (
            <ul className="space-y-3">
              {materials.formulas.map((f, i) => (
                <li key={i}>
                  <code className="block rounded-lg bg-ink-900 px-3 py-2 font-mono text-sm text-accent-300">{f.expression}</code>
                  <p className="mt-1 flex items-center gap-2 text-sm text-cream-300">{f.meaning} <TimeLink seconds={f.start} onSeek={seek} /></p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {materials.examples.length > 0 && (
        <section className="panel p-5">
          <h2 className="mb-3 text-sm font-semibold text-cream-50">Examples</h2>
          <ul className="space-y-3">
            {materials.examples.map((e, i) => (
              <li key={i} className="text-sm text-cream-200">
                {e.title && <b className="text-cream-50">{e.title}: </b>}{e.description} <TimeLink seconds={e.start} onSeek={seek} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {materials.qa.length > 0 && (
        <section className="panel p-5">
          <h2 className="mb-3 text-sm font-semibold text-cream-50">Revision questions</h2>
          <ol className="space-y-3">
            {materials.qa.map((q, i) => (
              <li key={i}>
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-cream-50 marker:text-accent-400">{q.question}</summary>
                  <p className="mt-1.5 pl-4 text-sm text-cream-300">{q.answer} <TimeLink seconds={q.start} onSeek={seek} /></p>
                </details>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
