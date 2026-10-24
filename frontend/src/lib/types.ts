export type LectureStatus = 'queued' | 'transcribing' | 'filtering' | 'extracting' | 'completed' | 'failed'
export const ACTIVE_STATUSES: LectureStatus[] = ['queued', 'transcribing', 'filtering', 'extracting']

export interface HistoryEvent {
  stage: string
  message: string
  at: string
  lecture_id?: string
  lecture_title?: string
}

export interface Course {
  id: string
  name: string
  code: string
  subject: string
  semester: string
  instructor: string
  description: string
  lecture_count: number
  completed_count: number
  total_duration_sec: number
}

export interface CourseInput {
  name: string
  code?: string
  subject?: string
  semester?: string
  instructor?: string
  description?: string
}

export interface Lecture {
  id: string
  title: string
  course_id: string
  course_name: string
  subject: string
  date: string
  description: string
  language_hint: string
  detected_language: string | null
  original_filename: string
  size_bytes: number
  duration_sec: number | null
  status: LectureStatus
  progress: number
  stage_detail: string
  error: string | null
  failed_stage: string | null
  warnings: string[]
  materials_stale: boolean
  attempts: number
  history?: HistoryEvent[]
  created_at: string
  updated_at: string
  processed_at: string | null
}

export type SegmentCategory = 'academic' | 'admin' | 'casual' | 'filler'

export interface Segment {
  idx: number
  start: number
  end: number
  text: string
  original_text: string
  confidence: number | null
  category: SegmentCategory
  excluded: boolean
  reason: string
  edited: boolean
  user_override: boolean
}

export interface Transcript {
  lecture_id: string
  language: string | null
  segments: Segment[]
}

/** Every extracted item points back at the transcript segment that supports it. */
export interface Evidence {
  start: number | null
  end?: number | null
  evidence: string
  verified?: boolean
  seg?: number | null
}

export interface Topic {
  title: string
  summary: string
  start: number
  end: number
}
export interface NoteSection {
  heading: string
  bullets: string[]
  start: number
}
export interface Concept extends Evidence {
  term: string
  definition: string
}
export interface Formula extends Evidence {
  expression: string
  meaning: string
}
export interface Example extends Evidence {
  title: string
  description: string
}
export interface Point extends Evidence {
  text: string
}
export interface ExamTopic extends Evidence {
  topic: string
}
export interface QA extends Evidence {
  question: string
  answer: string
}

export interface Materials {
  lecture_id: string
  summary: string
  topics: Topic[]
  detailed_notes: NoteSection[]
  concepts: Concept[]
  formulas: Formula[]
  examples: Example[]
  important_points: Point[]
  exam_topics: ExamTopic[]
  qa: QA[]
  model: string
  updated_at: string
}

export type CardStatus = 'new' | 'known' | 'difficult'

export interface Flashcard {
  id: string
  lecture_id: string
  lecture_title: string
  course_id: string
  type: 'qa' | 'definition' | 'formula'
  question: string
  answer: string
  topic: string
  start: number | null
  evidence: string
  status: CardStatus
  box: number
  review_count: number
  last_reviewed: string | null
  next_review: string | null
}

export interface FlashcardStats {
  total: number
  new: number
  known: number
  difficult: number
  due: number
  topics: string[]
}

export type AssignmentKind = 'assignment' | 'exam' | 'deadline' | 'instruction' | 'reading'
export type AssignmentStatus = 'suggested' | 'confirmed' | 'done' | 'dismissed'

export interface Assignment {
  id: string
  lecture_id: string | null
  lecture_title: string
  course_id: string | null
  course_name: string
  title: string
  description: string
  kind: AssignmentKind
  deadline_text: string
  due_date: string | null
  status: AssignmentStatus
  source: 'ai' | 'manual'
  evidence: string
  start: number | null
  verified: boolean
}

export interface DashboardData {
  counts: {
    courses: number
    lectures: number
    completed: number
    processing: number
    failed: number
    flashcards: number
    flashcards_due: number
    open_assignments: number
  }
  recent_lectures: Lecture[]
  processing: Lecture[]
  upcoming_assignments: Assignment[]
  activity: HistoryEvent[]
}

export interface SearchResult {
  type: 'lecture' | 'summary' | 'concept' | 'formula' | 'point' | 'exam' | 'notes' | 'transcript' | 'flashcard' | 'assignment'
  lecture_id: string | null
  lecture_title: string
  title: string
  snippet: string
  start: number | null
  ref_id: string | null
}

export interface Health {
  mongo: { ok: boolean; error?: string }
  ollama: { ok: boolean; model: string; model_available: boolean; error?: string }
  ffmpeg: { ok: boolean }
  whisper: { ok: boolean; model: string }
}
