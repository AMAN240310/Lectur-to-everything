import type { LectureStatus } from './types'

/** 75 -> "1:15", 3725 -> "1:02:05" */
export function formatTime(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(seconds ?? 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** 3725 -> "1h 02m", 540 -> "9m" */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${Math.max(1, m)}m`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

/** Parse "YYYY-MM-DD" as a *local* date (new Date("2026-10-24") would be UTC and can shift a day). */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const todayIso = (): string => toIsoDay(new Date())

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—'
  return parseDay(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDayShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  return parseDay(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Whole days from today to the given day (negative = overdue). */
export function daysUntil(iso: string, from: Date = new Date()): number {
  const a = parseDay(toIsoDay(from)).getTime()
  const b = parseDay(iso).getTime()
  return Math.round((b - a) / 86_400_000)
}

export function dueLabel(iso: string | null | undefined, from: Date = new Date()): string {
  if (!iso) return 'No date'
  const d = daysUntil(iso, from)
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`
  if (d === 0) return 'Due today'
  if (d === 1) return 'Due tomorrow'
  if (d < 7) return `Due in ${d} days`
  return `Due ${formatDayShort(iso)}`
}

export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return ''
  const diff = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (diff < 45) return 'just now'
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`
  if (diff < 86_400) return `${Math.round(diff / 3600)} h ago`
  if (diff < 7 * 86_400) return `${Math.round(diff / 86_400)} d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export const STATUS_LABEL: Record<LectureStatus, string> = {
  queued: 'Queued',
  transcribing: 'Transcribing',
  filtering: 'Filtering',
  extracting: 'Extracting',
  completed: 'Ready',
  failed: 'Failed',
}

export const LANGUAGE_LABEL: Record<string, string> = {
  auto: 'Auto-detect', hinglish: 'Hinglish', en: 'English', hi: 'Hindi', mr: 'Marathi', ta: 'Tamil',
  te: 'Telugu', bn: 'Bengali', gu: 'Gujarati', pa: 'Punjabi', ur: 'Urdu',
}

export function languageName(code: string | null | undefined): string {
  if (!code) return '—'
  return LANGUAGE_LABEL[code] ?? code.toUpperCase()
}

export const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ')
