import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import type { Course } from '../lib/types'
import { Button, ErrorNote, Field, Modal } from './ui'

const EMPTY = { name: '', code: '', subject: '', semester: '', instructor: '', description: '' }

export function CourseDialog({ open, course, onClose }: { open: boolean; course?: Course | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY)

  useEffect(() => {
    if (open) {
      setForm(course
        ? { name: course.name, code: course.code, subject: course.subject, semester: course.semester, instructor: course.instructor, description: course.description }
        : EMPTY)
    }
  }, [open, course])

  const save = useMutation({
    mutationFn: () => (course ? api.updateCourse(course.id, form) : api.createCourse(form)),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['courses'] })
      await qc.invalidateQueries({ queryKey: ['course'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
  })

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (form.name.trim()) save.mutate()
  }

  return (
    <Modal open={open} onClose={onClose} title={course ? 'Edit course' : 'New course'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Course name">
          <input className="input" required autoFocus value={form.name} onChange={set('name')} placeholder="e.g. Data Structures" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code"><input className="input" value={form.code} onChange={set('code')} placeholder="CS201" /></Field>
          <Field label="Semester"><input className="input" value={form.semester} onChange={set('semester')} placeholder="3" /></Field>
          <Field label="Subject"><input className="input" value={form.subject} onChange={set('subject')} placeholder="Computer Science" /></Field>
          <Field label="Instructor"><input className="input" value={form.instructor} onChange={set('instructor')} /></Field>
        </div>
        <Field label="Description">
          <textarea className="input min-h-[64px]" value={form.description} onChange={set('description')} />
        </Field>
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>{course ? 'Save changes' : 'Create course'}</Button>
        </div>
      </form>
    </Modal>
  )
}
