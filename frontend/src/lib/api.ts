import type {
  Assignment, AssignmentKind, AssignmentStatus, Course, CourseInput, DashboardData, Flashcard, FlashcardStats,
  Health, Lecture, Materials, SearchResult, Segment, Transcript,
} from './types'

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(message: string, status: number, detail?: unknown) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

/** FastAPI errors come as a string, an object with `message`, or a list of validation problems. */
export function errorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const parts = detail.map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : ''))
    return parts.filter(Boolean).join('; ') || fallback
  }
  if (detail && typeof detail === 'object' && 'message' in detail) return String((detail as { message: unknown }).message)
  return fallback
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Cannot reach the backend. Is it running on port 8000?', 0)
  }
  if (!res.ok) {
    let detail: unknown
    try {
      detail = (await res.json()).detail
    } catch {
      detail = res.statusText
    }
    throw new ApiError(errorMessage(detail, `Request failed (${res.status})`), res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const qs = (params?: Record<string, string | boolean | number | undefined | null>): string => {
  if (!params) return ''
  const sp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== false) sp.set(k, String(v))
  })
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export interface AssignmentInput {
  lecture_id?: string | null
  course_id?: string | null
  title: string
  description?: string
  kind?: AssignmentKind
  due_date?: string | null
}

export const api = {
  health: () => request<Health>('GET', '/health'),
  dashboard: () => request<DashboardData>('GET', '/dashboard'),

  courses: () => request<Course[]>('GET', '/courses'),
  createCourse: (b: CourseInput) => request<Course>('POST', '/courses', b),
  updateCourse: (id: string, b: Partial<CourseInput>) => request<Course>('PATCH', `/courses/${id}`, b),
  deleteCourse: (id: string, cascade = false) => request<void>('DELETE', `/courses/${id}${qs({ cascade })}`),

  lectures: (p?: { course_id?: string; status?: string }) => request<Lecture[]>('GET', `/lectures${qs(p)}`),
  lecture: (id: string) => request<Lecture>('GET', `/lectures/${id}`),
  deleteLecture: (id: string) => request<void>('DELETE', `/lectures/${id}`),
  reprocess: (id: string, mode: 'full' | 'content' | 'extract') => request('POST', `/lectures/${id}/reprocess`, { mode }),
  regenerate: (id: string) => request('POST', `/lectures/${id}/regenerate`),
  transcript: (id: string) => request<Transcript>('GET', `/lectures/${id}/transcript`),
  patchSegment: (id: string, idx: number, body: { text?: string; excluded?: boolean }) =>
    request<Segment>('PATCH', `/lectures/${id}/transcript/segments/${idx}`, body),
  materials: (id: string) => request<Materials | null>('GET', `/lectures/${id}/materials`),
  audioUrl: (id: string) => `/api/lectures/${id}/audio`,
  pdfUrl: (id: string) => `/api/lectures/${id}/notes.pdf`,

  flashcards: (p?: { course_id?: string; lecture_id?: string; topic?: string; status?: string; due?: boolean }) =>
    request<Flashcard[]>('GET', `/flashcards${qs(p)}`),
  flashcardStats: (p?: { course_id?: string; lecture_id?: string }) =>
    request<FlashcardStats>('GET', `/flashcards/stats${qs(p)}`),
  reviewCard: (id: string, result: 'known' | 'difficult' | 'reset') =>
    request<Flashcard>('POST', `/flashcards/${id}/review`, { result }),

  assignments: (p?: { course_id?: string; lecture_id?: string; status?: string; include_dismissed?: boolean }) =>
    request<Assignment[]>('GET', `/assignments${qs(p)}`),
  createAssignment: (b: AssignmentInput) => request<Assignment>('POST', '/assignments', b),
  updateAssignment: (id: string, b: Partial<AssignmentInput> & { status?: AssignmentStatus }) =>
    request<Assignment>('PATCH', `/assignments/${id}`, b),
  deleteAssignment: (id: string) => request<void>('DELETE', `/assignments/${id}`),

  search: (q: string) => request<{ query: string; total: number; results: SearchResult[] }>('GET', `/search${qs({ q })}`),

  /** XHR instead of fetch so large recordings get a real upload progress bar. */
  uploadLecture: (form: FormData, onProgress?: (fraction: number) => void) =>
    new Promise<Lecture>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/lectures')
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
      }
      xhr.onerror = () => reject(new ApiError('Cannot reach the backend. Is it running on port 8000?', 0))
      xhr.onload = () => {
        let parsed: { detail?: unknown } & Partial<Lecture> = {}
        try {
          parsed = JSON.parse(xhr.responseText)
        } catch {
          /* non-JSON error body */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(parsed as Lecture)
        else reject(new ApiError(errorMessage(parsed.detail, `Upload failed (${xhr.status})`), xhr.status, parsed.detail))
      }
      xhr.send(form)
    }),
}
