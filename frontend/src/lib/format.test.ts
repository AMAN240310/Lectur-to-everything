import { describe, expect, it } from 'vitest'
import { errorMessage } from './api'
import { daysUntil, dueLabel, formatBytes, formatDuration, formatTime, languageName, parseDay, timeAgo, toIsoDay } from './format'

describe('formatTime', () => {
  it('formats minutes and hours', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(75)).toBe('1:15')
    expect(formatTime(3725)).toBe('1:02:05')
    expect(formatTime(null)).toBe('0:00')
    expect(formatTime(-5)).toBe('0:00')
  })
})

describe('formatDuration / formatBytes', () => {
  it('summarises lengths', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(20)).toBe('1m')
    expect(formatDuration(3725)).toBe('1h 02m')
    expect(formatBytes(500)).toBe('1 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('dates', () => {
  it('parses ISO days as local dates without timezone drift', () => {
    const d = parseDay('2026-10-24')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 24])
    expect(toIsoDay(d)).toBe('2026-10-24')
  })

  const now = new Date(2026, 9, 24, 23, 30) // late evening must still count as the same day
  it('counts whole days regardless of time of day', () => {
    expect(daysUntil('2026-10-24', now)).toBe(0)
    expect(daysUntil('2026-10-25', now)).toBe(1)
    expect(daysUntil('2026-10-20', now)).toBe(-4)
  })

  it('labels deadlines', () => {
    expect(dueLabel(null, now)).toBe('No date')
    expect(dueLabel('2026-10-23', now)).toBe('1 day overdue')
    expect(dueLabel('2026-10-20', now)).toBe('4 days overdue')
    expect(dueLabel('2026-10-24', now)).toBe('Due today')
    expect(dueLabel('2026-10-25', now)).toBe('Due tomorrow')
    expect(dueLabel('2026-10-28', now)).toBe('Due in 4 days')
    expect(dueLabel('2026-11-20', now)).toMatch(/^Due /)
  })

  it('formats relative times', () => {
    const base = Date.UTC(2026, 9, 24, 12, 0, 0)
    expect(timeAgo(new Date(base - 10_000).toISOString(), base)).toBe('just now')
    expect(timeAgo(new Date(base - 5 * 60_000).toISOString(), base)).toBe('5 min ago')
    expect(timeAgo(new Date(base - 3 * 3_600_000).toISOString(), base)).toBe('3 h ago')
    expect(timeAgo(null)).toBe('')
  })
})

describe('languageName', () => {
  it('maps known codes and tolerates unknown ones', () => {
    expect(languageName('hi')).toBe('Hindi')
    expect(languageName('hinglish')).toBe('Hinglish')
    expect(languageName('nl')).toBe('NL')
    expect(languageName(null)).toBe('—')
  })
})

describe('errorMessage', () => {
  it('understands every FastAPI error shape', () => {
    expect(errorMessage('Nope', 'fallback')).toBe('Nope')
    expect(errorMessage({ message: 'Already uploaded', lecture_id: 'x' }, 'fallback')).toBe('Already uploaded')
    expect(errorMessage([{ msg: 'Field required' }, { msg: 'Too short' }], 'fallback')).toBe('Field required; Too short')
    expect(errorMessage(undefined, 'fallback')).toBe('fallback')
    expect(errorMessage([], 'fallback')).toBe('fallback')
  })
})
