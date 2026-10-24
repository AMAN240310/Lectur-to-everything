import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { UploadDialog, isSupportedAudio } from './UploadDialog'

afterEach(() => vi.restoreAllMocks())

function setup() {
  vi.spyOn(api, 'courses').mockResolvedValue([
    { id: 'c1', name: 'Data Structures', code: '', subject: 'Computer Science', semester: '3', instructor: '', description: '', lecture_count: 0, completed_count: 0, total_duration_sec: 0 },
  ])
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={qc}><MemoryRouter><UploadDialog open onClose={onClose} /></MemoryRouter></QueryClientProvider>,
  )
  return { onClose, input: () => screen.getByLabelText('Audio file') as HTMLInputElement }
}

describe('isSupportedAudio', () => {
  it('accepts MP3, WAV and M4A in any case and rejects the rest', () => {
    expect(isSupportedAudio('Lecture 1.MP3')).toBe(true)
    expect(isSupportedAudio('a.wav')).toBe(true)
    expect(isSupportedAudio('a.m4a')).toBe(true)
    expect(isSupportedAudio('a.mp4')).toBe(false)
    expect(isSupportedAudio('a.mp3.txt')).toBe(false)
  })
})

describe('UploadDialog', () => {
  it('keeps submit disabled until a file is chosen, then pre-fills the title', async () => {
    const { input } = setup()
    const submit = await screen.findByRole('button', { name: /Upload and process/ })
    expect(submit).toBeDisabled()

    await userEvent.upload(input(), new File(['x'], 'stacks_and-queues.mp3', { type: 'audio/mpeg' }))
    expect(screen.getByLabelText('Lecture title')).toHaveValue('stacks and queues')
    await waitFor(() => expect(submit).toBeEnabled())
  })

  it('submits every field the backend needs', async () => {
    const upload = vi.spyOn(api, 'uploadLecture').mockResolvedValue({ id: 'new' } as never)
    const { input } = setup()
    await screen.findByRole('option', { name: /Data Structures/ })
    await userEvent.upload(input(), new File(['x'], 'lec.m4a', { type: 'audio/mp4' }))
    await userEvent.selectOptions(screen.getByLabelText('Spoken language'), 'hinglish')
    await userEvent.click(screen.getByRole('button', { name: /Upload and process/ }))

    await waitFor(() => expect(upload).toHaveBeenCalled())
    const form = upload.mock.calls[0][0] as FormData
    expect(form.get('title')).toBe('lec')
    expect(form.get('course_id')).toBe('c1')
    expect(form.get('language')).toBe('hinglish')
    expect(form.get('subject')).toBe('Computer Science')
    expect((form.get('file') as File).name).toBe('lec.m4a')
  })

  it('rejects unsupported files client-side with a clear message', async () => {
    const { input } = setup()
    // applyAccept:false lets the test bypass the input's accept filter, like drag-and-drop does
    await userEvent.setup({ applyAccept: false }).upload(input(), new File(['x'], 'notes.pdf', { type: 'application/pdf' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported file type')
    expect(screen.getByRole('button', { name: /Upload and process/ })).toBeDisabled()
  })

  it('offers a link to the existing lecture when the recording is a duplicate', async () => {
    const { ApiError } = await import('../lib/api')
    vi.spyOn(api, 'uploadLecture').mockRejectedValue(
      new ApiError('This recording was already uploaded as “Stacks”.', 409, { message: 'This recording was already uploaded as “Stacks”.', lecture_id: 'abc' }),
    )
    const { input } = setup()
    await screen.findByRole('option', { name: /Data Structures/ })
    await userEvent.upload(input(), new File(['x'], 'lec.mp3', { type: 'audio/mpeg' }))
    await userEvent.click(screen.getByRole('button', { name: /Upload and process/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('already uploaded')
    expect(screen.getByRole('link', { name: /Open the existing lecture/ })).toHaveAttribute('href', '/lectures/abc')
  })
})
