import { Flag, Target } from 'lucide-react'
import { usePlayer } from '../components/Player'
import { TimeLink } from '../components/TimeLink'
import { EmptyState } from '../components/ui'
import { formatTime } from '../lib/format'
import type { Materials } from '../lib/types'

/** Summary plus "important moments": topic timeline, key points and exam topics, all seekable. */
export function OverviewTab({ materials }: { materials: Materials | null | undefined }) {
  const player = usePlayer()
  if (!materials) return <EmptyState title="No study material yet">It appears when processing finishes.</EmptyState>
  const seek = (t: number) => player.seek(t)

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <section className="panel p-5">
          <h2 className="mb-2 text-sm font-semibold text-cream-50">Summary</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-cream-200">{materials.summary || 'No summary was generated.'}</p>
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-cream-50"><Flag className="h-4 w-4 text-accent-400" /> Topic timeline</h2>
          {materials.topics.length === 0 ? <p className="text-sm text-cream-400">No topics detected.</p> : (
            <ol className="relative space-y-4 border-l border-ink-600 pl-5">
              {materials.topics.map((t, i) => (
                <li key={`${t.title}-${i}`} className="relative">
                  <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-accent-500" />
                  <div className="flex flex-wrap items-center gap-2">
                    <TimeLink seconds={t.start} onSeek={seek} />
                    <h3 className="text-sm font-medium text-cream-50">{t.title}</h3>
                    <span className="text-xs text-cream-500">{formatTime(t.end - t.start)} long</span>
                  </div>
                  {t.summary && <p className="mt-1 text-sm text-cream-300">{t.summary}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="space-y-6">
        <section className="panel p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-cream-50"><Target className="h-4 w-4 text-red-300" /> Likely exam topics</h2>
          {materials.exam_topics.length === 0 ? <p className="text-sm text-cream-400">None flagged.</p> : (
            <ul className="space-y-2">
              {materials.exam_topics.map((x, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-cream-100"><TimeLink seconds={x.start} onSeek={seek} /> <span>{x.topic}</span></li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel p-5">
          <h2 className="mb-3 text-sm font-semibold text-cream-50">Important points</h2>
          {materials.important_points.length === 0 ? <p className="text-sm text-cream-400">None flagged.</p> : (
            <ul className="space-y-2">
              {materials.important_points.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-cream-100"><TimeLink seconds={p.start} onSeek={seek} /> <span>{p.text}</span></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
