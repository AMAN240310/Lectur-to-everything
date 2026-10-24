import { Check, Pencil, RotateCcw, Sparkles, Trash2, User, X } from 'lucide-react'
import { daysUntil, dueLabel, cx } from '../lib/format'
import type { Assignment, AssignmentKind, AssignmentStatus } from '../lib/types'
import { SourceLink } from './TimeLink'
import { Badge, Button, type Tone } from './ui'

export const KIND_LABEL: Record<AssignmentKind, string> = {
  assignment: 'Assignment', exam: 'Exam', deadline: 'Deadline', instruction: 'Instruction', reading: 'Reading',
}
const KIND_TONE: Record<AssignmentKind, Tone> = {
  assignment: 'accent', exam: 'red', deadline: 'amber', instruction: 'blue', reading: 'purple',
}

interface Props {
  assignment: Assignment
  onStatus: (status: AssignmentStatus) => void
  onEdit: () => void
  onDelete: () => void
  busy?: boolean
}

export function AssignmentItem({ assignment: a, onStatus, onEdit, onDelete, busy }: Props) {
  const open = a.status === 'suggested' || a.status === 'confirmed'
  const days = a.due_date ? daysUntil(a.due_date) : null
  const dueTone = !open ? 'text-cream-500' : days === null ? 'text-cream-400' : days < 0 ? 'text-red-300' : days <= 1 ? 'text-amber-300' : 'text-cream-300'

  return (
    <li className={cx('rounded-xl border bg-ink-900 p-4', a.status === 'suggested' ? 'border-accent-500/40' : 'border-ink-700', a.status === 'dismissed' && 'opacity-60')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={cx('text-sm font-semibold text-cream-50', a.status === 'done' && 'line-through opacity-70')}>{a.title}</h4>
            <Badge tone={KIND_TONE[a.kind]}>{KIND_LABEL[a.kind]}</Badge>
            {a.source === 'ai' ? (
              <Badge tone="neutral"><Sparkles className="h-3 w-3" /> AI-detected</Badge>
            ) : (
              <Badge tone="neutral"><User className="h-3 w-3" /> Added by you</Badge>
            )}
            {a.status === 'suggested' && <Badge tone="accent">Needs your review</Badge>}
            {a.status === 'done' && <Badge tone="green">Done</Badge>}
            {a.status === 'dismissed' && <Badge>Dismissed</Badge>}
          </div>
          <p className={cx('mt-1 text-xs', dueTone)}>
            {a.due_date ? dueLabel(a.due_date) : 'No date detected'}
            {a.deadline_text && <span className="text-cream-500"> · teacher said “{a.deadline_text}”</span>}
          </p>
          {a.description && <p className="mt-2 text-sm text-cream-300">{a.description}</p>}
          {a.evidence && (
            <p className="mt-2 line-clamp-2 border-l-2 border-ink-600 pl-2 text-xs italic text-cream-400" title={a.evidence}>
              “{a.evidence}”
            </p>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-cream-500">
            {a.course_name && <span>{a.course_name}</span>}
            {a.lecture_id && a.lecture_title && <span>· {a.lecture_title}</span>}
            {a.lecture_id && a.start !== null && <SourceLink lectureId={a.lecture_id} seconds={a.start} />}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {a.status === 'suggested' && (
            <>
              <Button size="sm" variant="primary" disabled={busy} onClick={() => onStatus('confirmed')}><Check className="h-3.5 w-3.5" /> Confirm</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus('dismissed')}><X className="h-3.5 w-3.5" /> Dismiss</Button>
            </>
          )}
          {a.status === 'confirmed' && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onStatus('done')}><Check className="h-3.5 w-3.5" /> Mark done</Button>
          )}
          {a.status === 'done' && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus('confirmed')}><RotateCcw className="h-3.5 w-3.5" /> Reopen</Button>
          )}
          {a.status === 'dismissed' && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus('suggested')}><RotateCcw className="h-3.5 w-3.5" /> Restore</Button>
          )}
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${a.title}`}><Pencil className="h-3.5 w-3.5" /></Button>
          {a.source === 'manual' && (
            <Button size="sm" variant="ghost" onClick={onDelete} aria-label={`Delete ${a.title}`}><Trash2 className="h-3.5 w-3.5" /></Button>
          )}
        </div>
      </div>
    </li>
  )
}
