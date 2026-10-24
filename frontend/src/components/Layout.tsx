import { useQuery } from '@tanstack/react-query'
import {
  BookOpen, CalendarCheck, CheckCircle2, Clapperboard, Layers, LayoutDashboard, Library, Search, UploadCloud, XCircle,
} from 'lucide-react'
import { createContext, useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import { NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { cx } from '../lib/format'
import type { Health } from '../lib/types'
import { UploadDialog } from './UploadDialog'
import { Button } from './ui'

const UploadContext = createContext<(courseId?: string) => void>(() => {})
export const useUpload = () => useContext(UploadContext)

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/courses', label: 'Courses', icon: BookOpen },
  { to: '/lectures', label: 'Lectures', icon: Library },
  { to: '/flashcards', label: 'Flashcards', icon: Layers },
  { to: '/assignments', label: 'Assignments', icon: CalendarCheck },
]

export function Layout() {
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadCourse, setUploadCourse] = useState<string | undefined>()
  const open = (courseId?: string) => {
    setUploadCourse(courseId)
    setUploadOpen(true)
  }

  return (
    <UploadContext.Provider value={open}>
      <div className="flex h-full bg-ink-950">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-700/60 bg-ink-900 px-4 py-6 lg:flex">
          <div className="mb-8 flex items-center gap-2 px-2">
            <Clapperboard className="h-6 w-6 text-accent-500" />
            <span className="text-xl font-bold tracking-tight text-accent-500">Lecture<span className="text-cream-100">AI</span></span>
          </div>
          <nav aria-label="Main" className="flex flex-col gap-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to} to={to} end={end}
                className={({ isActive }) =>
                  cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                    isActive ? 'bg-ink-700 font-medium text-cream-50' : 'text-cream-300 hover:bg-ink-800 hover:text-cream-50')
                }
              >
                <Icon className="h-4 w-4" /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl bg-gradient-to-br from-tan to-accent-400 p-4 text-ink-950">
            <p className="text-base font-bold leading-snug">Turn a recording into notes</p>
            <p className="mt-1 text-xs text-ink-800">MP3, WAV or M4A. Hindi, English or Hinglish.</p>
            <button
              onClick={() => open()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-ink-950 px-3 py-2 text-sm font-medium text-cream-50 hover:bg-ink-800"
            >
              <UploadCloud className="h-4 w-4" /> Upload lecture
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onUpload={() => open()} />
          <nav aria-label="Main (mobile)" className="flex gap-1 overflow-x-auto border-b border-ink-700/60 px-3 py-2 lg:hidden">
            {NAV.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => cx('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm', isActive ? 'bg-ink-700 text-cream-50' : 'text-cream-300')}>
                {label}
              </NavLink>
            ))}
          </nav>
          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1400px] px-5 py-6 lg:px-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <UploadDialog open={uploadOpen} defaultCourseId={uploadCourse} onClose={() => setUploadOpen(false)} />
    </UploadContext.Provider>
  )
}

function TopBar({ onUpload }: { onUpload: () => void }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (q.trim().length >= 2) navigate(`/search?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <header className="flex items-center gap-3 border-b border-ink-700/60 bg-ink-950 px-5 py-3 lg:px-8">
      <form onSubmit={submit} role="search" className="relative max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-500" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search"
          placeholder="Search lectures, transcripts, notes, flashcards…"
          className="input rounded-full bg-ink-850 pl-9"
        />
      </form>
      <div className="ml-auto flex items-center gap-3">
        <SystemStatus />
        <Button variant="primary" size="sm" onClick={onUpload} className="lg:hidden"><UploadCloud className="h-4 w-4" /> Upload</Button>
      </div>
    </header>
  )
}

function healthIssues(h: Health): string[] {
  const issues: string[] = []
  if (!h.mongo.ok) issues.push('MongoDB is not reachable. Start the MongoDB service.')
  if (!h.ollama.ok) issues.push('Ollama is not running. Start Ollama.')
  else if (!h.ollama.model_available) issues.push(`Gemma model missing. Run: ollama pull ${h.ollama.model}`)
  if (!h.ffmpeg.ok) issues.push('FFmpeg was not found on PATH.')
  if (!h.whisper.ok) issues.push('openai-whisper is not installed in the backend environment.')
  return issues
}

export function SystemStatus() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data, isError } = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 30_000, retry: false })

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const issues = isError ? ['The backend is not reachable on port 8000.'] : data ? healthIssues(data) : []
  const loading = !data && !isError
  const ok = !loading && issues.length === 0

  const rows: Array<[string, boolean]> = data
    ? [
        ['MongoDB', data.mongo.ok],
        [`Ollama · ${data.ollama.model}`, data.ollama.ok && data.ollama.model_available],
        ['FFmpeg', data.ffmpeg.ok],
        [`Whisper · ${data.whisper.model}`, data.whisper.ok],
      ]
    : []

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="System status"
        className="flex items-center gap-2 rounded-full border border-ink-600 bg-ink-850 px-3 py-1.5 text-xs text-cream-200 hover:bg-ink-800"
      >
        <span className={cx('h-2 w-2 rounded-full', loading ? 'bg-cream-500' : ok ? 'bg-emerald-400' : 'bg-amber-400')} />
        {loading ? 'Checking…' : ok ? 'All local services ready' : `${issues.length} issue${issues.length > 1 ? 's' : ''}`}
      </button>
      {open && (
        <div className="panel absolute right-0 z-40 mt-2 w-80 p-4">
          <h3 className="mb-2 text-sm font-semibold text-cream-50">Local services</h3>
          <ul className="space-y-1.5">
            {rows.map(([name, good]) => (
              <li key={name} className="flex items-center gap-2 text-sm text-cream-200">
                {good ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
                {name}
              </li>
            ))}
          </ul>
          {issues.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-ink-700 pt-3 text-xs text-amber-200">
              {issues.map((i) => <li key={i}>• {i}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
