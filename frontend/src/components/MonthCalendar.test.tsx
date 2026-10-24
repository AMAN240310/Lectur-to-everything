import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MonthCalendar } from './MonthCalendar'

const today = new Date(2026, 9, 24) // Saturday 24 October 2026

describe('MonthCalendar', () => {
  it('shows the month, marks deadline days and selects on click', async () => {
    const onSelect = vi.fn()
    render(<MonthCalendar counts={{ '2026-10-26': 2 }} selected={null} onSelect={onSelect} today={today} />)

    expect(screen.getByText('October 2026')).toBeInTheDocument()
    const day = screen.getByRole('button', { name: '2026-10-26, 2 due' })
    await userEvent.click(day)
    expect(onSelect).toHaveBeenCalledWith('2026-10-26')
    expect(screen.getByRole('button', { name: '2026-10-27' })).toBeInTheDocument() // no deadline suffix
  })

  it('starts weeks on Monday', () => {
    render(<MonthCalendar counts={{}} selected={null} onSelect={() => {}} today={today} />)
    const headers = screen.getAllByText(/^(Mo|Tu|We|Th|Fr|Sa|Su)$/).map((n) => n.textContent)
    expect(headers).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'])
  })

  it('navigates between months and reflects the selected day', async () => {
    render(<MonthCalendar counts={{}} selected="2026-10-24" onSelect={() => {}} today={today} />)
    expect(screen.getByRole('button', { name: '2026-10-24' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('November 2026')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('September 2026')).toBeInTheDocument()
  })
})
