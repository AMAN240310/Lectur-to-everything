import { useQuery } from '@tanstack/react-query'
import { BookOpen, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CourseDialog } from '../components/CourseDialog'
import { Button, EmptyState, ErrorNote, PageHeader, ProgressBar, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { formatDuration } from '../lib/format'

export function CoursesPage() {
  const { data: courses, error, isLoading } = useQuery({ queryKey: ['courses'], queryFn: api.courses })
  const [creating, setCreating] = useState(false)

  return (
    <div>
      <PageHeader
        title="Courses" subtitle="Group lectures by course. Flashcards and deadlines are organised the same way."
        actions={<Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New course</Button>}
      />
      {isLoading && <Spinner />}
      <ErrorNote error={error} />
      {courses && courses.length === 0 && (
        <EmptyState icon={<BookOpen className="h-10 w-10" />} title="No courses yet" action={<Button variant="primary" onClick={() => setCreating(true)}>Create a course</Button>}>
          A course is a subject you attend, like “Data Structures · Sem 3”.
        </EmptyState>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {courses?.map((c) => (
          <Link key={c.id} to={`/courses/${c.id}`} className="panel p-5 transition hover:border-ink-600 hover:bg-ink-800">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-cream-50">{c.name}</h2>
              {c.code && <span className="rounded-md bg-ink-700 px-1.5 py-0.5 font-mono text-[11px] text-cream-300">{c.code}</span>}
            </div>
            <p className="mt-1 text-xs text-cream-400">{[c.subject, c.semester && `Semester ${c.semester}`, c.instructor].filter(Boolean).join(' · ') || 'No details yet'}</p>
            <div className="mt-4 flex items-baseline justify-between text-xs text-cream-300">
              <span><b className="text-lg tabular-nums text-cream-50">{c.lecture_count}</b> lecture{c.lecture_count === 1 ? '' : 's'}</span>
              <span>{formatDuration(c.total_duration_sec)} recorded</span>
            </div>
            <ProgressBar className="mt-2" value={c.lecture_count ? (c.completed_count / c.lecture_count) * 100 : 0} label={`${c.name} processed`} />
            <p className="mt-1 text-[11px] text-cream-500">{c.completed_count} of {c.lecture_count} processed</p>
          </Link>
        ))}
      </div>
      <CourseDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
