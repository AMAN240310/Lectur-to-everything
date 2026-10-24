import { ChevronRight, FileAudio } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ACTIVE_STATUSES, type Lecture } from '../lib/types'
import { formatDay, formatDuration } from '../lib/format'
import { ProgressBar, StatusBadge } from './ui'

export function LectureRow({ lecture }: { lecture: Lecture }) {
  const active = ACTIVE_STATUSES.includes(lecture.status)
  return (
    <Link
      to={`/lectures/${lecture.id}`}
      className="group flex items-center gap-4 rounded-xl px-3 py-3 transition hover:bg-ink-800"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-700 text-accent-400">
        <FileAudio className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-cream-50">{lecture.title}</span>
        <span className="block truncate text-xs text-cream-400">
          {lecture.course_name} · {formatDay(lecture.date)} · {formatDuration(lecture.duration_sec)}
        </span>
        {active && (
          <span className="mt-2 block">
            <ProgressBar value={lecture.progress} className="animate-pulse-bar" label={`${lecture.title} progress`} />
            <span className="mt-1 block truncate text-[11px] text-cream-500">{lecture.stage_detail}</span>
          </span>
        )}
        {lecture.status === 'failed' && lecture.error && (
          <span className="mt-1 block truncate text-[11px] text-red-300">{lecture.error}</span>
        )}
      </span>
      <StatusBadge status={lecture.status} />
      <ChevronRight className="h-4 w-4 text-cream-500 transition group-hover:translate-x-0.5 group-hover:text-cream-200" />
    </Link>
  )
}
