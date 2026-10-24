import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import type { Assignment, AssignmentKind } from '../lib/types'
import { KIND_LABEL } from './AssignmentItem'
import { Button, ErrorNote, Field, Modal } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  /** When set, the dialog edits this assignment; otherwise it creates a manual one. */
  assignment?: Assignment | null
  lectureId?: string
  defaultDate?: string
}

export function AssignmentDialog({ open, onClose, assignment, lectureId, defaultDate }: Props) {
  const qc = useQueryClient()
  const { data: lectures = [] } = useQuery({ queryKey: ['lectures', 'all'], queryFn: () => api.lectures(), enabled: open && !assignment })
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<AssignmentKind>('assignment')
  const [due, setDue] = useState('')
  const [description, setDescription] = useState('')
  const [lecture, setLecture] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle(assignment?.title ?? '')
    setKind(assignment?.kind ?? 'assignment')
    setDue(assignment?.due_date ?? defaultDate ?? '')
    setDescription(assignment?.description ?? '')
    setLecture(lectureId ?? '')
  }, [open, assignment, lectureId, defaultDate])

  const save = useMutation({
    mutationFn: () =>
      assignment
        ? api.updateAssignment(assignment.id, { title, kind, description, due_date: due || null })
        : api.createAssignment({ title, kind, description, due_date: due || null, lecture_id: lecture || null }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['assignments'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (title.trim()) save.mutate()
  }

  return (
    <Modal open={open} onClose={onClose} title={assignment ? 'Edit task' : 'Add a task or deadline'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title"><input className="input" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as AssignmentKind)}>
              {Object.entries(KIND_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </Field>
          <Field label="Due date"><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>
        {!assignment && (
          <Field label="Linked lecture (optional)">
            <select className="input" value={lecture} onChange={(e) => setLecture(e.target.value)}>
              <option value="">None</option>
              {lectures.map((l) => <option key={l.id} value={l.id}>{l.title} · {l.course_name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Details"><textarea className="input min-h-[72px]" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>{assignment ? 'Save changes' : 'Add task'}</Button>
        </div>
      </form>
    </Modal>
  )
}
