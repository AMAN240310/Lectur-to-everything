import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, EyeOff, Pencil, RotateCcw, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlayer } from '../components/Player'
import { TimeLink } from '../components/TimeLink'
import { Badge, Button, EmptyState, ErrorNote, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { cx } from '../lib/format'
import type { Segment } from '../lib/types'

type View = 'all' | 'academic' | 'excluded'

export function TranscriptTab({ lectureId, focusTime }: { lectureId: string; focusTime?: number }) {
  const qc = useQueryClient()
  const player = usePlayer()
  const [view, setView] = useState<View>('all')
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [follow, setFollow] = useState(true)
  const activeRef = useRef<HTMLLIElement>(null)

  const { data, error, isLoading } = useQuery({ queryKey: ['transcript', lectureId], queryFn: () => api.transcript(lectureId) })

  const patch = useMutation({
    mutationFn: ({ idx, body }: { idx: number; body: { text?: string; excluded?: boolean } }) => api.patchSegment(lectureId, idx, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['transcript', lectureId] })
      await qc.invalidateQueries({ queryKey: ['lecture', lectureId] })
      setEditing(null)
    },
  })

  const segments = data?.segments ?? []
  const excludedCount = segments.filter((s) => s.excluded).length
  const shown = useMemo(
    () => segments.filter((s) => (view === 'all' ? true : view === 'excluded' ? s.excluded : !s.excluded)),
    [segments, view],
  )
  const activeIdx = useMemo(() => {
    const t = player.time
    if (!player.playing && t === 0) return -1 // nothing has been played yet: don't highlight line one
    const hit = segments.find((s) => t >= s.start && t < s.end)
    return hit?.idx ?? -1
  }, [segments, player.time])

  useEffect(() => {
    if (follow && player.playing) activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeIdx, follow, player.playing])

  useEffect(() => {
    if (focusTime !== undefined) setFollow(false)
  }, [focusTime])

  if (isLoading) return <Spinner />
  if (error) return <ErrorNote error={error} />
  if (segments.length === 0) return <EmptyState title="No transcript yet">The transcript appears once Whisper has finished.</EmptyState>

  const startEdit = (s: Segment) => { setEditing(s.idx); setDraft(s.text) }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Transcript view" className="flex gap-1 rounded-xl bg-ink-850 p-1">
          {([['all', `All (${segments.length})`], ['academic', 'Academic only'], ['excluded', `Excluded (${excludedCount})`]] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}
              className={cx('rounded-lg px-3 py-1.5 text-xs font-medium', view === id ? 'bg-ink-600 text-cream-50' : 'text-cream-400 hover:text-cream-100')}>{label}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-cream-300">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="accent-accent-500" /> Follow audio
        </label>
        <p className="text-xs text-cream-500">Excluded lines are kept in the original transcript. Restore any that were wrongly removed.</p>
      </div>
      <ErrorNote error={patch.error} />
      {shown.length === 0 && <EmptyState title="Nothing to show">{view === 'excluded' ? 'No content was excluded.' : 'No segments match.'}</EmptyState>}

      <ol className="space-y-1" aria-label="Transcript">
        {shown.map((s) => {
          const active = s.idx === activeIdx
          return (
            <li
              key={s.idx} ref={active ? activeRef : undefined} id={`seg-${s.idx}`}
              className={cx('group flex gap-3 rounded-xl border px-3 py-2.5', active ? 'border-accent-500/60 bg-accent-500/10' : 'border-transparent hover:bg-ink-850',
                s.excluded && 'opacity-70')}
            >
              <div className="w-14 shrink-0 pt-0.5"><TimeLink seconds={s.start} onSeek={(t) => player.seek(t)} /></div>
              <div className="min-w-0 flex-1">
                {editing === s.idx ? (
                  <div className="space-y-2">
                    <textarea className="input min-h-[64px]" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Edit segment text" autoFocus />
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" loading={patch.isPending} onClick={() => patch.mutate({ idx: s.idx, body: { text: draft } })}><Check className="h-3.5 w-3.5" /> Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className={cx('text-sm leading-relaxed text-cream-100', s.excluded && 'line-through decoration-cream-500/60')}>{s.text}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {s.category === 'admin' && <Badge tone="amber">Instruction / deadline</Badge>}
                      {s.excluded && <Badge tone="red">Excluded · {s.category}{s.reason ? ` · ${s.reason}` : ''}</Badge>}
                      {s.edited && <Badge tone="blue">Edited</Badge>}
                      {s.user_override && !s.excluded && <Badge tone="green">Restored</Badge>}
                    </div>
                    {s.edited && <p className="mt-1 text-xs text-cream-500">Original: {s.original_text}</p>}
                  </>
                )}
              </div>
              {editing !== s.idx && (
                <div className="flex shrink-0 items-start gap-1 opacity-60 transition group-hover:opacity-100 group-focus-within:opacity-100">
                  <Button size="sm" variant="ghost" aria-label="Edit text" onClick={() => startEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                  {s.edited && (
                    <Button size="sm" variant="ghost" aria-label="Revert to original wording" onClick={() => patch.mutate({ idx: s.idx, body: { text: s.original_text } })}><Undo2 className="h-3.5 w-3.5" /></Button>
                  )}
                  {s.excluded ? (
                    <Button size="sm" variant="secondary" onClick={() => patch.mutate({ idx: s.idx, body: { excluded: false } })}><RotateCcw className="h-3.5 w-3.5" /> Restore</Button>
                  ) : (
                    <Button size="sm" variant="ghost" aria-label="Exclude from notes" onClick={() => patch.mutate({ idx: s.idx, body: { excluded: true } })}><EyeOff className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
