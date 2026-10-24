import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PlayerProvider } from '../components/Player'
import { Badge, Button, EmptyState, ErrorNote, ProgressBar, Spinner, StatusBadge } from '../components/ui'
import { CardsTab } from '../lecture/CardsTab'
import { NotesTab } from '../lecture/NotesTab'
import { OverviewTab } from '../lecture/OverviewTab'
import { TasksTab } from '../lecture/TasksTab'
import { TranscriptTab } from '../lecture/TranscriptTab'
import { api } from '../lib/api'
import { cx, formatBytes, formatDay, formatDuration, languageName, timeAgo } from '../lib/format'
import { ACTIVE_STATUSES } from '../lib/types'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'notes', label: 'Notes' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'tasks', label: 'Assignments' },
] as const
type TabId = (typeof TABS)[number]['id']

export function LecturePage() {
  const { lectureId = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [showHistory, setShowHistory] = useState(false)

  const tabParam = params.get('tab') as TabId | null
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'overview'
  const tParam = params.get('t')
  const focusTime = tParam !== null && !Number.isNaN(Number(tParam)) ? Number(tParam) : undefined

  const lecture = useQuery({
    queryKey: ['lecture', lectureId], queryFn: () => api.lecture(lectureId),
    refetchInterval: (q) => (q.state.data && ACTIVE_STATUSES.includes(q.state.data.status) ? 2000 : false),
  })
  const status = lecture.data?.status
  const materials = useQuery({
    queryKey: ['materials', lectureId, status], queryFn: () => api.materials(lectureId), enabled: status === 'completed' || status === 'failed',
  })

  const refreshAll = async () => { await qc.invalidateQueries() }
  const reprocess = useMutation({ mutationFn: (mode: 'full' | 'content' | 'extract') => api.reprocess(lectureId, mode), onSuccess: refreshAll })
  const regenerate = useMutation({ mutationFn: () => api.regenerate(lectureId), onSuccess: refreshAll })
  const remove = useMutation({ mutationFn: () => api.deleteLecture(lectureId), onSuccess: async () => { await qc.invalidateQueries(); navigate('/lectures') } })

  const setTab = (id: TabId) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', id); n.delete('t'); return n }, { replace: true })

  if (lecture.isLoading) return <Spinner />
  if (lecture.error || !lecture.data) {
    return <EmptyState title="Lecture not found"><Link to="/lectures" className="text-accent-400 underline">Back to lectures</Link></EmptyState>
  }
  const l = lecture.data
  const active = ACTIVE_STATUSES.includes(l.status)
  const hasTranscript = l.status !== 'queued' && (l.status !== 'transcribing' && l.status !== 'failed' || Boolean(l.detected_language))

  return (
    <PlayerProvider lectureId={l.id} initialTime={focusTime}>
      <Link to={`/courses/${l.course_id}`} className="mb-3 inline-flex items-center gap-1 text-xs text-cream-400 hover:text-cream-100"><ArrowLeft className="h-3 w-3" /> {l.course_name}</Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-cream-50">{l.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-cream-400">
            <span>{formatDay(l.date)}</span>
            {l.subject && <span>{l.subject}</span>}
            <span>{formatDuration(l.duration_sec)}</span>
            <span>{languageName(l.detected_language ?? l.language_hint)}</span>
            <span>{l.original_filename} · {formatBytes(l.size_bytes)}</span>
          </p>
          {l.description && <p className="mt-2 max-w-2xl text-sm text-cream-300">{l.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={l.status} />
          <Button size="sm" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>Processing log</Button>
          {!active && (
            <select
              aria-label="Reprocess" className="input w-auto py-1.5 text-xs" value=""
              onChange={(e) => {
                const mode = e.target.value as 'full' | 'content' | 'extract'
                if (!mode) return
                if (mode === 'full' && !window.confirm('Re-transcribe from the audio? Your manual transcript corrections will be replaced.')) return
                reprocess.mutate(mode)
              }}
            >
              <option value="">Reprocess…</option>
              <option value="extract">Regenerate notes only</option>
              <option value="content">Re-filter and regenerate</option>
              <option value="full">Re-transcribe everything</option>
            </select>
          )}
          <Button size="sm" variant="danger" disabled={active} aria-label="Delete lecture" onClick={() => window.confirm(`Delete “${l.title}” and everything generated from it?`) && remove.mutate()}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ErrorNote error={reprocess.error ?? regenerate.error ?? remove.error} />

      {active && (
        <div className="panel mb-4 p-4" role="status">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-cream-50">{l.stage_detail}</span>
            <span className="tabular-nums text-cream-400">{Math.round(l.progress)}%</span>
          </div>
          <ProgressBar value={l.progress} className="animate-pulse-bar" label="Processing progress" />
          <p className="mt-2 text-xs text-cream-500">Long lectures can take a while on a laptop. You can leave this page; processing continues.</p>
        </div>
      )}

      {l.status === 'failed' && (
        <div role="alert" className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-200"><AlertTriangle className="h-4 w-4" /> Processing failed{l.failed_stage && ` during ${l.failed_stage}`}</p>
          <p className="mt-1 text-sm text-red-100/90">{l.error}</p>
          <Button className="mt-3" size="sm" variant="primary" loading={reprocess.isPending} onClick={() => reprocess.mutate(hasTranscript ? 'content' : 'full')}>
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </Button>
        </div>
      )}

      {l.warnings.length > 0 && l.status === 'completed' && (
        <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <b>Completed with warnings</b>
          <ul className="mt-1 list-disc pl-5 text-xs">{l.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      {showHistory && (
        <div className="panel mb-4 p-4">
          <h2 className="mb-2 text-sm font-semibold text-cream-50">Processing log <Badge className="ml-1">attempt {l.attempts}</Badge></h2>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-cream-300">
            {[...(l.history ?? [])].reverse().map((h, i) => <li key={i}><span className="text-cream-500">{timeAgo(h.at)}</span> · <b>{h.stage}</b> · {h.message}</li>)}
          </ul>
        </div>
      )}

      <div role="tablist" aria-label="Lecture workspace" className="mb-5 flex gap-1 overflow-x-auto border-b border-ink-700">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={cx('whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition', tab === t.id ? 'border-accent-500 text-cream-50' : 'border-transparent text-cream-400 hover:text-cream-100')}>
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'overview' && (l.status === 'completed' ? <OverviewTab materials={materials.data} /> : !active && <EmptyState title="Nothing generated yet">Use “Try again” to process this lecture.</EmptyState>)}
        {tab === 'transcript' && (hasTranscript || l.status === 'completed' ? <TranscriptTab lectureId={l.id} focusTime={focusTime} /> : !active && <EmptyState title="No transcript">Transcription has not finished.</EmptyState>)}
        {tab === 'notes' && (l.status === 'completed' ? <NotesTab lecture={l} materials={materials.data} onRegenerate={() => regenerate.mutate()} regenerating={regenerate.isPending} /> : !active && <EmptyState title="No notes yet" />)}
        {tab === 'flashcards' && (l.status === 'completed' ? <CardsTab lectureId={l.id} /> : !active && <EmptyState title="No flashcards yet" />)}
        {tab === 'tasks' && <TasksTab lectureId={l.id} />}
        {active && tab !== 'tasks' && !(tab === 'transcript' && hasTranscript) && <p className="py-8 text-center text-sm text-cream-400">This section fills in as processing finishes.</p>}
      </div>
    </PlayerProvider>
  )
}
