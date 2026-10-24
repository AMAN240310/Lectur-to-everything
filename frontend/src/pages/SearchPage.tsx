import { useQuery } from '@tanstack/react-query'
import { SearchX } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { SourceLink } from '../components/TimeLink'
import { Badge, EmptyState, ErrorNote, PageHeader, Spinner, type Tone } from '../components/ui'
import { api } from '../lib/api'
import type { SearchResult } from '../lib/types'

const LABEL: Record<SearchResult['type'], [string, Tone]> = {
  lecture: ['Lecture', 'accent'], summary: ['Summary', 'blue'], concept: ['Concept', 'blue'], formula: ['Formula', 'purple'],
  point: ['Important', 'amber'], exam: ['Exam topic', 'red'], notes: ['Notes', 'blue'], transcript: ['Transcript', 'neutral'],
  flashcard: ['Flashcard', 'green'], assignment: ['Deadline', 'amber'],
}

export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const parts: Array<{ t: string; hit: boolean }> = []
  let i = 0
  while (i < text.length) {
    const at = lower.indexOf(q, i)
    if (at === -1) { parts.push({ t: text.slice(i), hit: false }); break }
    if (at > i) parts.push({ t: text.slice(i, at), hit: false })
    parts.push({ t: text.slice(at, at + q.length), hit: true })
    i = at + q.length
  }
  return <>{parts.map((p, k) => (p.hit ? <mark key={k} className="rounded bg-accent-500/30 px-0.5 text-accent-200">{p.t}</mark> : <span key={k}>{p.t}</span>))}</>
}

export function SearchPage() {
  const [params] = useSearchParams()
  const q = params.get('q')?.trim() ?? ''
  const { data, error, isLoading } = useQuery({ queryKey: ['search', q], queryFn: () => api.search(q), enabled: q.length >= 2 })

  return (
    <div>
      <PageHeader title="Search" subtitle={q ? <>Results for “{q}”{data && ` · ${data.total} match${data.total === 1 ? '' : 'es'}`}</> : 'Type at least two characters in the search box.'} />
      {isLoading && <Spinner label="Searching" />}
      <ErrorNote error={error} />
      {data && data.results.length === 0 && (
        <EmptyState icon={<SearchX className="h-10 w-10" />} title="Nothing found">Try another word. Search covers titles, transcripts, notes, flashcards and deadlines.</EmptyState>
      )}
      <ul className="space-y-2">
        {data?.results.map((r, i) => {
          const [label, tone] = LABEL[r.type]
          return (
            <li key={`${r.type}-${r.lecture_id}-${i}`} className="panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={tone}>{label}</Badge>
                <span className="text-sm font-medium text-cream-50"><Highlight text={r.title} query={q} /></span>
              </div>
              <p className="mt-1.5 text-sm text-cream-300"><Highlight text={r.snippet} query={q} /></p>
              {r.lecture_id && (
                <p className="mt-2 flex items-center gap-2 text-xs text-cream-400">
                  <Link to={`/lectures/${r.lecture_id}`} className="hover:text-cream-100 hover:underline">{r.lecture_title}</Link>
                  {r.start !== null && <SourceLink lectureId={r.lecture_id} seconds={r.start} />}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
