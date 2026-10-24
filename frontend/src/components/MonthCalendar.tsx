import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cx, toIsoDay } from '../lib/format'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

/** Month grid (weeks start Monday). Days with deadlines get a dot; the count shows in the label. */
export function MonthCalendar({
  counts, selected, onSelect, today = new Date(),
}: { counts: Record<string, number>; selected: string | null; onSelect: (iso: string) => void; today?: Date }) {
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const todayIso = toIsoDay(today)

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const lead = (first.getDay() + 6) % 7
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const out: Array<{ iso: string; day: number } | null> = Array(lead).fill(null)
    for (let d = 1; d <= days; d++) out.push({ iso: toIsoDay(new Date(cursor.getFullYear(), cursor.getMonth(), d)), day: d })
    while (out.length % 7) out.push(null)
    return out
  }, [cursor])

  const shift = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1))

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => shift(-1)} aria-label="Previous month" className="rounded-lg p-1.5 text-cream-300 hover:bg-ink-700"><ChevronLeft className="h-4 w-4" /></button>
        <h3 className="text-sm font-semibold text-cream-50" aria-live="polite">
          {cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </h3>
        <button onClick={() => shift(1)} aria-label="Next month" className="rounded-lg p-1.5 text-cream-300 hover:bg-ink-700"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-cream-500">
        {WEEKDAYS.map((d) => <span key={d} className="py-1">{d}</span>)}
        {cells.map((c, i) =>
          c === null ? <span key={i} /> : (
            <button
              key={c.iso} onClick={() => onSelect(c.iso)}
              aria-label={`${c.iso}${counts[c.iso] ? `, ${counts[c.iso]} due` : ''}`} aria-pressed={selected === c.iso}
              className={cx(
                'relative aspect-square rounded-lg text-xs tabular-nums transition',
                selected === c.iso ? 'bg-accent-500 font-semibold text-ink-950' : 'text-cream-200 hover:bg-ink-700',
                c.iso === todayIso && selected !== c.iso && 'ring-1 ring-accent-500/60',
              )}
            >
              {c.day}
              {counts[c.iso] ? <span className={cx('absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full', selected === c.iso ? 'bg-ink-950' : 'bg-accent-400')} /> : null}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
