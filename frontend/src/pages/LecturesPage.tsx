import { useQuery } from '@tanstack/react-query'
import { Library, UploadCloud } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useUpload } from '../components/Layout'
import { LectureRow } from '../components/LectureRow'
import { Button, EmptyState, ErrorNote, PageHeader, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { cx } from '../lib/format'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'processing', label: 'Processing' },
  { id: 'completed', label: 'Ready' },
  { id: 'failed', label: 'Failed' },
] as const

export function LecturesPage() {
  const openUpload = useUpload()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [courseId, setCourseId] = useState('')
  const [text, setText] = useState('')

  const courses = useQuery({ queryKey: ['courses'], queryFn: api.courses })
  const { data, error, isLoading } = useQuery({
    queryKey: ['lectures', { course: courseId }],
    queryFn: () => api.lectures(courseId ? { course_id: courseId } : undefined),
    refetchInterval: 4000,
  })

  const shown = useMemo(() => {
    const needle = text.trim().toLowerCase()
    return (data ?? []).filter((l) => {
      if (filter === 'processing' && !['queued', 'transcribing', 'filtering', 'extracting'].includes(l.status)) return false
      if (filter === 'completed' && l.status !== 'completed') return false
      if (filter === 'failed' && l.status !== 'failed') return false
      return !needle || `${l.title} ${l.subject} ${l.course_name}`.toLowerCase().includes(needle)
    })
  }, [data, filter, text])

  return (
    <div>
      <PageHeader
        title="Lectures" subtitle="Every recording, with its processing status."
        actions={<Button variant="primary" onClick={() => openUpload()}><UploadCloud className="h-4 w-4" /> Upload lecture</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Status filter" className="flex gap-1 rounded-xl bg-ink-850 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
              className={cx('rounded-lg px-3 py-1.5 text-xs font-medium transition', filter === f.id ? 'bg-ink-600 text-cream-50' : 'text-cream-400 hover:text-cream-100')}
            >{f.label}</button>
          ))}
        </div>
        <select aria-label="Course" className="input w-auto" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">All courses</option>
          {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input aria-label="Filter lectures" className="input max-w-xs" placeholder="Filter by title…" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {isLoading && <Spinner />}
      <ErrorNote error={error} />
      {data && shown.length === 0 && (
        <EmptyState icon={<Library className="h-10 w-10" />} title={data.length === 0 ? 'No lectures yet' : 'No lectures match'}>
          {data.length === 0 ? 'Upload a recording to get started.' : 'Try a different filter.'}
        </EmptyState>
      )}
      {shown.length > 0 && <section className="panel p-3">{shown.map((l) => <LectureRow key={l.id} lecture={l} />)}</section>}
    </div>
  )
}
