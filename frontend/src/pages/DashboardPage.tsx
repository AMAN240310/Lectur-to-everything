import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BookOpen, CalendarClock, Layers, Library, Sparkles, UploadCloud } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LectureRow } from '../components/LectureRow'
import { useUpload } from '../components/Layout'
import { Badge, Button, EmptyState, ErrorNote, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { dueLabel, timeAgo } from '../lib/format'

export function DashboardPage() {
  const openUpload = useUpload()
  const { data, error, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.dashboard,
    refetchInterval: (q) => ((q.state.data?.counts.processing ?? 0) > 0 ? 3000 : 15000),
  })

  if (isLoading) return <Spinner />
  if (error || !data) return <ErrorNote error={error ?? new Error('Could not load the dashboard.')} />
  const { counts } = data
  const empty = counts.lectures === 0

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-clay-800 via-clay-700 to-clay-900 p-8">
        <div className="max-w-xl">
          <p className="text-sm text-accent-300">Welcome back</p>
          <h1 className="mt-1 text-3xl font-bold leading-tight tracking-tight text-cream-50 sm:text-4xl">
            {empty ? 'Turn your first lecture into study material.' : `You have ${counts.completed} lecture${counts.completed === 1 ? '' : 's'} ready to revise.`}
          </h1>
          <p className="mt-3 text-sm text-cream-200/80">
            Everything runs on this computer: Whisper transcribes, Gemma writes the notes. Nothing is sent to the cloud.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => openUpload()}><UploadCloud className="h-4 w-4" /> Upload a lecture</Button>
            {counts.flashcards_due > 0 && (
              <Link to="/flashcards" className="inline-flex items-center gap-2 rounded-xl bg-black/25 px-4 py-2 text-sm font-medium text-cream-50 hover:bg-black/40">
                <Layers className="h-4 w-4" /> Revise {counts.flashcards_due} card{counts.flashcards_due === 1 ? '' : 's'}
              </Link>
            )}
          </div>
        </div>
        <Sparkles className="pointer-events-none absolute -right-6 -top-6 h-56 w-56 text-accent-400/10" aria-hidden />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
        <Stat icon={BookOpen} label="Courses" value={counts.courses} to="/courses" />
        <Stat icon={Library} label="Lectures" value={counts.lectures} hint={counts.processing ? `${counts.processing} processing` : counts.failed ? `${counts.failed} failed` : undefined} to="/lectures" />
        <Stat icon={Layers} label="Flashcards due" value={counts.flashcards_due} hint={`${counts.flashcards} total`} to="/flashcards" />
        <Stat icon={CalendarClock} label="Open deadlines" value={counts.open_assignments} to="/assignments" />
      </section>

      {data.processing.length > 0 && (
        <section className="panel p-5" aria-label="Processing">
          <h2 className="mb-2 text-sm font-semibold text-cream-50">Processing now</h2>
          {data.processing.map((l) => <LectureRow key={l.id} lecture={l} />)}
        </section>
      )}

      {empty ? (
        <EmptyState
          icon={<Library className="h-10 w-10" />} title="No lectures yet"
          action={<Button variant="primary" onClick={() => openUpload()}><UploadCloud className="h-4 w-4" /> Upload your first recording</Button>}
        >
          Create a course, then upload an MP3, WAV or M4A recording. Notes, flashcards and deadlines appear when processing finishes.
        </EmptyState>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <section className="panel p-5 xl:col-span-2" aria-label="Recent lectures">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-cream-50">Recent lectures</h2>
              <Link to="/lectures" className="inline-flex items-center gap-1 text-xs text-accent-400 hover:underline">All lectures <ArrowRight className="h-3 w-3" /></Link>
            </div>
            {data.recent_lectures.map((l) => <LectureRow key={l.id} lecture={l} />)}
          </section>

          <div className="space-y-6">
            <section className="panel p-5" aria-label="Upcoming deadlines">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-cream-50">Upcoming deadlines</h2>
                <Link to="/assignments" className="text-xs text-accent-400 hover:underline">Manage</Link>
              </div>
              {data.upcoming_assignments.length === 0 ? (
                <p className="text-sm text-cream-400">Nothing due. Deadlines the teacher mentions will appear here.</p>
              ) : (
                <ul className="space-y-2">
                  {data.upcoming_assignments.map((a) => (
                    <li key={a.id} className="rounded-xl border-l-4 border-accent-500 bg-accent-500/10 px-3 py-2">
                      <p className="text-sm font-medium text-cream-50">{a.title}</p>
                      <p className="text-xs text-cream-300">
                        {dueLabel(a.due_date)} {a.course_name && `· ${a.course_name}`} {a.status === 'suggested' && <Badge tone="accent" className="ml-1">review</Badge>}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel p-5" aria-label="Recent activity">
              <h2 className="mb-3 text-sm font-semibold text-cream-50">Recent activity</h2>
              {data.activity.length === 0 ? (
                <p className="text-sm text-cream-400">No activity yet.</p>
              ) : (
                <ul className="space-y-3">
                  {data.activity.slice(0, 6).map((e, i) => (
                    <li key={`${e.lecture_id}-${e.at}-${i}`} className="text-xs">
                      <Link to={`/lectures/${e.lecture_id}`} className="font-medium text-cream-100 hover:underline">{e.lecture_title}</Link>
                      <span className="block text-cream-400">{e.message} · {timeAgo(e.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ icon: Icon, label, value, hint, to }: { icon: typeof BookOpen; label: string; value: number; hint?: string; to: string }) {
  return (
    <Link to={to} className="panel p-4 transition hover:border-ink-600 hover:bg-ink-800">
      <div className="flex items-center justify-between text-cream-400">
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-cream-50">{value}</p>
      <p className="mt-0.5 h-4 text-xs text-cream-400">{hint}</p>
    </Link>
  )
}
