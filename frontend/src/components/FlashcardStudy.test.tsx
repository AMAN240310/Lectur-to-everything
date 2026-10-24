import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Flashcard } from '../lib/types'
import { FlashcardStudy } from './FlashcardStudy'

const card = (n: number): Flashcard => ({
  id: `c${n}`, lecture_id: 'l1', lecture_title: 'Stacks', course_id: 'co', type: 'qa', question: `Question ${n}?`,
  answer: `Answer ${n}`, topic: 'Stack basics', start: 5, evidence: '', status: 'new', box: 0, review_count: 0,
  last_reviewed: null, next_review: null,
})

describe('FlashcardStudy', () => {
  it('hides the answer until revealed, then records the verdict', async () => {
    const onReview = vi.fn()
    render(<FlashcardStudy cards={[card(1), card(2)]} resetKey="a" onReview={onReview} />)

    expect(screen.getByText('Question 1?')).toBeInTheDocument()
    expect(screen.queryByText('Answer 1')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /I know this/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Reveal answer/ }))
    expect(screen.getByText('Answer 1')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /I know this/ }))
    expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 'known')
    expect(screen.getByText('Question 2?')).toBeInTheDocument()
    expect(screen.queryByText('Answer 2')).not.toBeInTheDocument() // answer hidden again for the next card
  })

  it('supports keyboard shortcuts and finishes with a summary', async () => {
    const onReview = vi.fn()
    render(<FlashcardStudy cards={[card(1), card(2)]} resetKey="a" onReview={onReview} />)

    await userEvent.keyboard(' ')
    await userEvent.keyboard('2')
    await userEvent.keyboard(' ')
    await userEvent.keyboard('1')

    expect(onReview.mock.calls.map((c) => c[1])).toEqual(['known', 'difficult'])
    expect(screen.getByText('Session complete')).toBeInTheDocument()
    expect(screen.getByText(/You knew 1 of 2 cards, and 1 need another look/)).toBeInTheDocument()
  })

  it('ignores verdict keys before the answer is revealed', async () => {
    const onReview = vi.fn()
    render(<FlashcardStudy cards={[card(1)]} resetKey="a" onReview={onReview} />)
    await userEvent.keyboard('2')
    expect(onReview).not.toHaveBeenCalled()
  })

  it('restarts a session when the reset key changes', async () => {
    const { rerender } = render(<FlashcardStudy cards={[card(1)]} resetKey="a" onReview={() => {}} />)
    await userEvent.keyboard(' ')
    await userEvent.keyboard('2')
    expect(screen.getByText('Session complete')).toBeInTheDocument()
    rerender(<FlashcardStudy cards={[card(3)]} resetKey="b" onReview={() => {}} />)
    expect(screen.getByText('Question 3?')).toBeInTheDocument()
  })
})
