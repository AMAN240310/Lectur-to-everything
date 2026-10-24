import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Layers } from 'lucide-react'
import { useState } from 'react'
import { FlashcardStudy } from '../components/FlashcardStudy'
import { SourceLink } from '../components/TimeLink'
import { EmptyState, ErrorNote, PageHeader, Spinner } from '../components/ui'
import { api } from '../lib/api'
import type { Flashcard } from '../lib/types'

export function FlashcardsPage() {
  const qc = useQueryClient()
  const [courseId, setCourseId] = useState('')
  const [lectureId, setLectureId] = useState('')
  const [topic, setTopic] = useState('')
  const [mode, setMode] = useState<'due' | 'difficult' | 'all'>('due')
  const [round, setRound] = useState(0)

  const courses = useQuery({ queryKey: ['courses'], queryFn: api.courses })
  const lectures = useQuery({ queryKey: ['lectures', { course: courseId }], queryFn: () => api.lectures(courseId ? { course_id: courseId } : undefined) })
  const scope = { course_id: courseId || undefined, lecture_id: lectureId || undefined }
  const stats = useQuery({ queryKey: ['flashcardStats', courseId, lectureId], queryFn: () => api.flashcardStats(scope) })
  const params = { ...scope, topic: topic || undefined, due: mode === 'due', status: mode === 'difficult' ? 'difficult' : undefined }
  // The deck is fetched once per filter/round; reviews update the server but do not reshuffle the running session.
  const cards = useQuery({ queryKey: ['flashcards', params, round], queryFn: () => api.flashcards(params), staleTime: Infinity, gcTime: 0 })

  const review = useMutation({
    mutationFn: ({ card, result }: { card: Flashcard; result: 'known' | 'difficult' }) => api.reviewCard(card.id, result),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['flashcardStats'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const s = stats.data
  const resetKey = JSON.stringify([params, round, cards.dataUpdatedAt])

  return (
    <div>
      <PageHeader title="Flashcards" subtitle="Reveal the answer, then mark each card known or difficult. Known cards return after longer gaps." />

      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([['Total', s.total], ['Due now', s.due], ['Known', s.known], ['Difficult', s.difficult]] as const).map(([l, v]) => (
            <div key={l} className="panel p-3"><p className="text-xs uppercase tracking-wide text-cream-400">{l}</p><p className="text-2xl font-semibold tabular-nums text-cream-50">{v}</p></div>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select aria-label="Course" className="input w-auto" value={courseId} onChange={(e) => { setCourseId(e.target.value); setLectureId(''); setTopic('') }}>
          <option value="">All courses</option>
          {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Lecture" className="input w-auto" value={lectureId} onChange={(e) => { setLectureId(e.target.value); setTopic('') }}>
          <option value="">All lectures</option>
          {lectures.data?.filter((l) => l.status === 'completed').map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
        </select>
        <select aria-label="Topic" className="input w-auto" value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">All topics</option>
          {s?.topics.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select aria-label="Which cards" className="input w-auto" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="due">Due for review</option>
          <option value="difficult">Difficult only</option>
          <option value="all">All cards</option>
        </select>
      </div>

      <ErrorNote error={cards.error ?? review.error} />
      {cards.isLoading && <Spinner />}
      {cards.data && cards.data.length === 0 && (
        <EmptyState icon={<Layers className="h-10 w-10" />} title={mode === 'due' && (s?.total ?? 0) > 0 ? 'You are all caught up' : 'No flashcards here yet'}>
          {mode === 'due' && (s?.total ?? 0) > 0
            ? 'Nothing is due right now. Switch to “All cards” to practise anyway.'
            : 'Flashcards are generated automatically after a lecture finishes processing.'}
        </EmptyState>
      )}
      {cards.data && cards.data.length > 0 && (
        <FlashcardStudy
          cards={cards.data} resetKey={resetKey}
          onReview={(card, result) => review.mutate({ card, result })}
          onRestart={() => setRound((r) => r + 1)}
          renderSource={(c) => <><span className="text-cream-300">{c.lecture_title}</span><SourceLink lectureId={c.lecture_id} seconds={c.start} /></>}
        />
      )}
    </div>
  )
}
