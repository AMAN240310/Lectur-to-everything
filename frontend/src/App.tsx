import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { EmptyState } from './components/ui'
import { AssignmentsPage } from './pages/AssignmentsPage'
import { CourseDetailPage } from './pages/CourseDetailPage'
import { CoursesPage } from './pages/CoursesPage'
import { DashboardPage } from './pages/DashboardPage'
import { FlashcardsPage } from './pages/FlashcardsPage'
import { LecturePage } from './pages/LecturePage'
import { LecturesPage } from './pages/LecturesPage'
import { SearchPage } from './pages/SearchPage'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="courses" element={<CoursesPage />} />
        <Route path="courses/:courseId" element={<CourseDetailPage />} />
        <Route path="lectures" element={<LecturesPage />} />
        <Route path="lectures/:lectureId" element={<LecturePage />} />
        <Route path="flashcards" element={<FlashcardsPage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="*" element={<EmptyState title="Page not found">That page does not exist.</EmptyState>} />
      </Route>
    </Routes>
  )
}
