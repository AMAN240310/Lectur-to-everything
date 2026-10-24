import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { AssignmentDialog } from '../components/AssignmentDialog'
import { AssignmentItem } from '../components/AssignmentItem'
import { Button, EmptyState, ErrorNote, Spinner } from '../components/ui'
import { api } from '../lib/api'
import type { Assignment, AssignmentStatus } from '../lib/types'

export function TasksTab({ lectureId }: { lectureId: string }) {
  const qc = useQueryClient()
  const [dialog, setDialog] = useState<{ open: boolean; item: Assignment | null }>({ open: false, item: null })
  const { data, error, isLoading } = useQuery({ queryKey: ['assignments', 'lecture', lectureId], queryFn: () => api.assignments({ lecture_id: lectureId, include_dismissed: true }) })
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['assignments'] })
    void qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: AssignmentStatus }) => api.updateAssignment(id, { status }), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (id: string) => api.deleteAssignment(id), onSuccess: refresh })

  if (isLoading) return <Spinner />
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-cream-300">Tasks, exam announcements and deadlines mentioned in this lecture.</p>
        <Button onClick={() => setDialog({ open: true, item: null })}><Plus className="h-4 w-4" /> Add task</Button>
      </div>
      <ErrorNote error={error ?? setStatus.error ?? remove.error} />
      {data?.length === 0 && <EmptyState title="No assignments detected">If the teacher announced something that was missed, add it manually.</EmptyState>}
      <ul className="space-y-3">
        {data?.map((a) => (
          <AssignmentItem key={a.id} assignment={a} busy={setStatus.isPending}
            onStatus={(status) => setStatus.mutate({ id: a.id, status })}
            onEdit={() => setDialog({ open: true, item: a })}
            onDelete={() => window.confirm(`Delete “${a.title}”?`) && remove.mutate(a.id)} />
        ))}
      </ul>
      <AssignmentDialog open={dialog.open} assignment={dialog.item} lectureId={lectureId} onClose={() => setDialog({ open: false, item: null })} />
    </div>
  )
}
