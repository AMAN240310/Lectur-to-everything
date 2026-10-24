import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Assignment } from '../lib/types'
import { AssignmentItem } from './AssignmentItem'

const base: Assignment = {
  id: 'a1', lecture_id: 'l1', lecture_title: 'Stacks', course_id: 'c1', course_name: 'Data Structures',
  title: 'Assignment 3', description: 'Implement a stack', kind: 'assignment', deadline_text: 'next Monday',
  due_date: '2099-01-01', status: 'suggested', source: 'ai', evidence: 'assignment number 3 next Monday tak submit karna',
  start: 24, verified: true,
}

function setup(over: Partial<Assignment> = {}) {
  const handlers = { onStatus: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() }
  render(<MemoryRouter><ul><AssignmentItem assignment={{ ...base, ...over }} {...handlers} /></ul></MemoryRouter>)
  return handlers
}

describe('AssignmentItem', () => {
  it('lets the user confirm or dismiss an AI suggestion, showing its evidence', async () => {
    const h = setup()
    expect(screen.getByText('Needs your review')).toBeInTheDocument()
    expect(screen.getByText('AI-detected')).toBeInTheDocument()
    expect(screen.getByText(/assignment number 3 next Monday/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /0:24/ })).toHaveAttribute('href', '/lectures/l1?tab=transcript&t=24')

    await userEvent.click(screen.getByRole('button', { name: /Confirm/ }))
    expect(h.onStatus).toHaveBeenCalledWith('confirmed')
    await userEvent.click(screen.getByRole('button', { name: /Dismiss/ }))
    expect(h.onStatus).toHaveBeenCalledWith('dismissed')
  })

  it('offers "Mark done" for confirmed items and "Reopen" for finished ones', async () => {
    const h = setup({ status: 'confirmed' })
    await userEvent.click(screen.getByRole('button', { name: /Mark done/ }))
    expect(h.onStatus).toHaveBeenCalledWith('done')
  })

  it('only allows deleting manual tasks', () => {
    setup({ source: 'ai' })
    expect(screen.queryByRole('button', { name: /Delete Assignment 3/ })).not.toBeInTheDocument()
  })

  it('shows manual tasks as added by the user and deletable', async () => {
    const h = setup({ source: 'manual', status: 'confirmed', evidence: '', start: null })
    expect(screen.getByText('Added by you')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Delete Assignment 3/ }))
    expect(h.onDelete).toHaveBeenCalled()
  })

  it('flags a missing date instead of inventing one', () => {
    setup({ due_date: null })
    expect(screen.getByText(/No date detected/)).toBeInTheDocument()
  })
})
