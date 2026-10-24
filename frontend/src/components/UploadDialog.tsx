import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileAudio, UploadCloud } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { cx, formatBytes, todayIso } from '../lib/format'
import { Button, ErrorNote, Field, Modal, ProgressBar } from './ui'

export const ACCEPTED = ['.mp3', '.wav', '.m4a']
export const isSupportedAudio = (name: string) => ACCEPTED.some((ext) => name.toLowerCase().endsWith(ext))

const LANGUAGES: Array<[string, string]> = [
  ['auto', 'Auto-detect'], ['hinglish', 'Hinglish (Hindi + English mixed)'], ['en', 'English'], ['hi', 'Hindi'],
  ['mr', 'Marathi'], ['ta', 'Tamil'], ['te', 'Telugu'], ['bn', 'Bengali'], ['gu', 'Gujarati'], ['pa', 'Punjabi'], ['ur', 'Urdu'],
]

export function UploadDialog({ open, onClose, defaultCourseId }: { open: boolean; onClose: () => void; defaultCourseId?: string }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: courses = [] } = useQuery({ queryKey: ['courses'], queryFn: api.courses, enabled: open })
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState('')
  const [subject, setSubject] = useState('')
  const [date, setDate] = useState(todayIso())
  const [description, setDescription] = useState('')
  const [language, setLanguage] = useState('auto')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [duplicateId, setDuplicateId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!open) return
    setCourseId((cur) => cur || defaultCourseId || courses[0]?.id || '')
  }, [open, defaultCourseId, courses])

  useEffect(() => {
    const course = courses.find((c) => c.id === courseId)
    if (course && !subject) setSubject(course.subject || course.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, courses])

  const reset = () => {
    setFile(null); setTitle(''); setSubject(''); setDescription(''); setDate(todayIso()); setLanguage('auto')
    setProgress(null); setError(null); setDuplicateId(null)
  }

  const pick = (f: File | undefined) => {
    setError(null); setDuplicateId(null)
    if (!f) return
    if (!isSupportedAudio(f.name)) {
      setFile(null)
      setError(new Error('Unsupported file type. Please choose an MP3, WAV or M4A recording.'))
      return
    }
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim())
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    pick(e.dataTransfer.files[0])
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file || !courseId || !title.trim()) return
    setError(null); setDuplicateId(null); setProgress(0)
    const form = new FormData()
    form.append('file', file)
    form.append('title', title.trim())
    form.append('course_id', courseId)
    form.append('subject', subject)
    form.append('date', date)
    form.append('description', description)
    form.append('language', language)
    try {
      const lecture = await api.uploadLecture(form, setProgress)
      await qc.invalidateQueries()
      reset()
      onClose()
      navigate(`/lectures/${lecture.id}`)
    } catch (err) {
      setProgress(null)
      setError(err)
      if (err instanceof ApiError && err.status === 409 && err.detail && typeof err.detail === 'object' && 'lecture_id' in err.detail) {
        setDuplicateId(String((err.detail as { lecture_id: unknown }).lecture_id))
      }
    }
  }

  const uploading = progress !== null
  const noCourses = courses.length === 0

  return (
    <Modal open={open} onClose={uploading ? () => {} : onClose} title="Upload a lecture" wide>
      <form onSubmit={submit} className="space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx('rounded-2xl border-2 border-dashed p-6 text-center transition', dragging ? 'border-accent-500 bg-accent-500/5' : 'border-ink-600')}
        >
          <input
            ref={inputRef} type="file" accept={ACCEPTED.join(',')} className="sr-only" aria-label="Audio file"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          {file ? (
            <div className="flex items-center justify-center gap-3 text-left">
              <FileAudio className="h-8 w-8 text-accent-400" />
              <div>
                <p className="text-sm font-medium text-cream-50">{file.name}</p>
                <p className="text-xs text-cream-400">{formatBytes(file.size)}</p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => inputRef.current?.click()} disabled={uploading}>Change</Button>
            </div>
          ) : (
            <button type="button" onClick={() => inputRef.current?.click()} className="mx-auto flex flex-col items-center gap-2 text-cream-300">
              <UploadCloud className="h-8 w-8 text-cream-400" />
              <span className="text-sm font-medium">Drop a recording here, or click to browse</span>
              <span className="text-xs text-cream-500">MP3, WAV or M4A</span>
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lecture title">
            <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Stacks and queues" />
          </Field>
          <Field label="Course">
            <select className="input" required value={courseId} onChange={(e) => setCourseId(e.target.value)} disabled={noCourses}>
              {noCourses && <option value="">No courses yet</option>}
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.semester ? ` · Sem ${c.semester}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Subject">
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Helps Whisper spell technical terms" />
          </Field>
          <Field label="Lecture date">
            <input className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Spoken language" hint="Pick Hinglish if the teacher mixes Hindi and English.">
            <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Description (optional)">
          <textarea className="input min-h-[72px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Anything worth remembering about this class" />
        </Field>

        {noCourses && (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Create a course first. <Link to="/courses" onClick={onClose} className="underline">Go to Courses</Link>
          </p>
        )}
        <ErrorNote error={error} />
        {duplicateId && (
          <Link to={`/lectures/${duplicateId}`} onClick={onClose} className="block text-sm text-accent-400 underline">
            Open the existing lecture
          </Link>
        )}
        {uploading && <ProgressBar value={progress * 100} label="Upload progress" />}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button type="submit" variant="primary" loading={uploading} disabled={!file || !courseId || !title.trim()}>
            {uploading ? `Uploading ${Math.round((progress ?? 0) * 100)}%` : 'Upload and process'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
