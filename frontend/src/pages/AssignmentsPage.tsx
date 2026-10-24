import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AssignmentDialog } from '../components/AssignmentDialog'
import { AssignmentItem } from '../components/AssignmentItem'
import { MonthCalendar } from '../components/MonthCalendar'
import { Button, EmptyState, ErrorNote, PageHeader, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { cx, formatDay, todayIso } from '../lib/format'
import type { Assignment, AssignmentStatus } from '../lib/types'

const TABS = [
  { id: 'open', label: 'Open' },
  { id: 'review', label: 'Needs review' },
  { id: 'done', label: 'Done' },
  { id: 'dismissed', label: 'Dismissed' },
] as const
type Tab = (typeof TABS)[number]['id']

const inTab = (a: Assignment, tab: Tab) =>
  tab === 'open' ? a.status === 'suggested' || a.status === 'confirmed'
    : tab === 'review' ? a.status === 'suggested'
    : a.status === tab

export function AssignmentsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('open')
  const [courseId, setCourseId] = useState('')
  const [day, setDay] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ open: boolean; item: Assignment | null }>({ open: false, item: null })

  const courses = useQuery({ queryKey: ['courses'], queryFn: api.courses })
  const { data, error, isLoading } = useQuery({
    queryKey: ['assignments', courseId],
    queryFn: () => api.assignments({ course_id: courseId || undefined, include_dismissed: true }),
  })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['assignments'] })
    void qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: AssignmentStatus }) => api.updateAssignment(id, { status }), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (id: string) => api.deleteAssignment(id), onSuccess: refresh })

  const tabCounts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, (data ?? []).filter((a) => inTab(a, t.id)).length])), [data])
  const inCurrentTab = useMemo(() => (data ?? []).filter((a) => inTab(a, tab)), [data, tab])
  const calendarCounts = useMemo(() => {
    const m: Record<string, number> = {}
    inCurrentTab.forEach((a) => { if (a.due_date) m[a.due_date] = (m[a.due_date] ?? 0) + 1 })
    return m
  }, [inCurrentTab])
  const shown = day ? inCurrentTab.filter((a) => a.due_date === day) : inCurrentTab
  const undated = shown.filter((a) => !a.due_date)
  const dated = shown.filter((a) => a.due_date)

  return (
    <div>
      <PageHeader
        title="Assignments and deadlines"
        subtitle="Detected from your lectures. Confirm what is right, fix what is not."
        actions={<Button variant="primary" onClick={() => setDialog({ open: true, item: null })}><Plus className="h-4 w-4" /> Add task</Button>}
      />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <MonthCalendar counts={calendarCounts} selected={day} onSelect={(d) => setDay((cur) => (cur === d ? null : d))} />
          <select aria-label="Course" className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">All courses</option>
            {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <div role="tablist" aria-label="Status" className="mb-4 flex flex-wrap gap-1 rounded-xl bg-ink-850 p-1">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={cx('rounded-lg px-3 py-1.5 text-xs font-medium transition', tab === t.id ? 'bg-ink-600 text-cream-50' : 'text-cream-400 hover:text-cream-100')}>
                {t.label} <span className="ml-1 text-cream-500">{tabCounts[t.id] ?? 0}</span>
              </button>
            ))}
          </div>
          {day && (
            <p className="mb-3 flex items-center gap-2 text-sm text-cream-300">
              Showing {formatDay(day)}
              <button className="text-accent-400 underline" onClick={() => setDay(null)}>Clear</button>
              <button className="text-accent-400 underline" onClick={() => setDialog({ open: true, item: null })}>Add task for this day</button>
            </p>
          )}
          {isLoading && <Spinner />}
          <ErrorNote error={error ?? setStatus.error ?? remove.error} />
          {data && shown.length === 0 && (
            <EmptyState icon={<CalendarCheck className="h-10 w-10" />} title="Nothing here">
              {tab === 'open' ? 'When a teacher announces an assignment or exam, it will show up here for you to confirm.' : 'No items in this list.'}
            </EmptyState>
          )}
          <ul className="space-y-3">
            {[...dated, ...undated].map((a) => (
              <AssignmentItem
                key={a.id} assignment={a} busy={setStatus.isPending}
                onStatus={(status) => setStatus.mutate({ id: a.id, status })}
                onEdit={() => setDialog({ open: true, item: a })}
                onDelete={() => window.confirm(`Delete “${a.title}”?`) && remove.mutate(a.id)}
              />
            ))}
          </ul>
        </div>
      </div>
      <AssignmentDialog open={dialog.open} assignment={dialog.item} defaultDate={day ?? todayIso()} onClose={() => setDialog({ open: false, item: null })} />
    </div>
  )
}
