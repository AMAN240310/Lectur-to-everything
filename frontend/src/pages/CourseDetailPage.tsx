import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Trash2, UploadCloud } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CourseDialog } from '../components/CourseDialog'
import { useUpload } from '../components/Layout'
import { LectureRow } from '../components/LectureRow'
import { Button, EmptyState, ErrorNote, PageHeader, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { formatDuration } from '../lib/format'

export function CourseDetailPage() {
  const { courseId = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const openUpload = useUpload()
  const [editing, setEditing] = useState(false)

  const course = useQuery({ queryKey: ['course', courseId], queryFn: () => api.courses().then((all) => all.find((c) => c.id === courseId) ?? null) })
  const lectures = useQuery({ queryKey: ['lectures', { course: courseId }], queryFn: () => api.lectures({ course_id: courseId }), refetchInterval: 5000 })
  const stats = useQuery({ queryKey: ['flashcardStats', courseId], queryFn: () => api.flashcardStats({ course_id: courseId }) })

  const remove = useMutation({
    mutationFn: () => api.deleteCourse(courseId, true),
    onSuccess: async () => {
      await qc.invalidateQueries()
      navigate('/courses')
    },
  })

  if (course.isLoading) return <Spinner />
  if (!course.data) return <EmptyState title="Course not found"><Link to="/courses" className="text-accent-400 underline">Back to courses</Link></EmptyState>
  const c = course.data

  const confirmDelete = () => {
    const n = c.lecture_count
    const msg = n
      ? `Delete “${c.name}” together with its ${n} lecture${n === 1 ? '' : 's'}, recordings, notes and flashcards? This cannot be undone.`
      : `Delete “${c.name}”?`
    if (window.confirm(msg)) remove.mutate()
  }

  return (
    <div>
      <Link to="/courses" className="mb-3 inline-flex items-center gap-1 text-xs text-cream-400 hover:text-cream-100"><ArrowLeft className="h-3 w-3" /> Courses</Link>
      <PageHeader
        title={c.name}
        subtitle={[c.code, c.subject, c.semester && `Semester ${c.semester}`, c.instructor].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button variant="primary" onClick={() => openUpload(c.id)}><UploadCloud className="h-4 w-4" /> Upload lecture</Button>
            <Button onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>
            <Button variant="danger" onClick={confirmDelete} loading={remove.isPending}><Trash2 className="h-4 w-4" /> Delete</Button>
          </>
        }
      />
      <ErrorNote error={remove.error} />
      {c.description && <p className="mb-4 max-w-2xl text-sm text-cream-300">{c.description}</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini label="Lectures" value={c.lecture_count} />
        <Mini label="Recorded" value={formatDuration(c.total_duration_sec)} />
        <Mini label="Flashcards" value={stats.data?.total ?? 0} />
        <Mini label="Due for revision" value={stats.data?.due ?? 0} to="/flashcards" />
      </div>

      <section className="panel p-5">
        <h2 className="mb-2 text-sm font-semibold text-cream-50">Lectures</h2>
        {lectures.data?.length === 0 ? (
          <EmptyState title="No lectures in this course yet" action={<Button variant="primary" onClick={() => openUpload(c.id)}>Upload a recording</Button>} />
        ) : (
          lectures.data?.map((l) => <LectureRow key={l.id} lecture={l} />)
        )}
      </section>
      <CourseDialog open={editing} course={c} onClose={() => setEditing(false)} />
    </div>
  )
}

function Mini({ label, value, to }: { label: string; value: string | number; to?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-cream-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-cream-50">{value}</p>
    </>
  )
  return to ? <Link to={to} className="panel p-4 hover:bg-ink-800">{body}</Link> : <div className="panel p-4">{body}</div>
}
