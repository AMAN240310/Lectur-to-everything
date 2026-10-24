import { Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatTime } from '../lib/format'

const CLS =
  'inline-flex items-center gap-1 rounded-md bg-ink-700 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-accent-300 transition hover:bg-accent-500/20'

/** Seeks the lecture audio (used inside the lecture workspace). */
export function TimeLink({ seconds, onSeek }: { seconds: number | null | undefined; onSeek: (s: number) => void }) {
  if (seconds === null || seconds === undefined) return null
  return (
    <button type="button" onClick={() => onSeek(seconds)} className={CLS} aria-label={`Play from ${formatTime(seconds)}`}>
      <Clock className="h-3 w-3" /> {formatTime(seconds)}
    </button>
  )
}

/** Opens the lecture workspace at a moment in the recording (used on other pages). */
export function SourceLink({ lectureId, seconds, label }: { lectureId: string; seconds: number | null | undefined; label?: string }) {
  const t = seconds ?? 0
  return (
    <Link to={`/lectures/${lectureId}?tab=transcript&t=${Math.floor(t)}`} className={CLS}>
      <Clock className="h-3 w-3" /> {label ?? (seconds !== null && seconds !== undefined ? formatTime(seconds) : 'Open')}
    </Link>
  )
}
