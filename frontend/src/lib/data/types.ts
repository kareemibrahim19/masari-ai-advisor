/**
 * Shape of the student data file the frontend reads, field names as in the file itself:
 *   src/data/demo/students.json  copy of ai/data/students.json (six fictional students)
 *
 * This is also the contract for the backend: when the real API is ready it should return records of
 * these shapes (or the adapter in student-adapter.ts gets updated to match).
 */

// ------------------------------------------------------------------------------ students.json

export type StudentCourseResult = {
  code: string
  name_ar: string
  name_en: string
  credits: number
  attempt: number
  marks?: { midterm?: number; coursework?: number; practical?: number; final?: number }
  total?: number
  /** Missing while the term is in progress. */
  grade?: string
  grade_ar?: string
}

export type StudentTerm = {
  academic_year: string
  /** fall | spring | summer */
  term: string
  term_ar: string
  /** published (results out) | in_progress (current term, no grades yet) */
  status: string
  courses: StudentCourseResult[]
  summary?: {
    registered_hours?: number
    earned_hours?: number
    term_gpa?: number | null
    cumulative_gpa?: number | null
    cumulative_earned_hours?: number
    academic_standing?: string
  }
}

export type StudentFileEntry = {
  student_id: string
  persona: string
  persona_note: string
  personal: { name_ar: string; name_en: string; gender: string; [key: string]: unknown }
  enrollment: { university: string; faculty: string; program: string; enrollment_year: string }
  academic_status: {
    level: number
    name: string
    required_hours: number
    earned_hours: number
    trainings_passed: string[]
    /** null for a student who has not finished a term yet. */
    cumulative_gpa: number | null
    main_semesters_completed: number
    academic_standing: string
    consecutive_warning_semesters: number
    current_term: { academic_year: string; term_ar: string; registered_hours: number }
  }
  terms: StudentTerm[]
  [key: string]: unknown
}

export type StudentsFile = {
  _note?: string
  generated_for_term: { academic_year: string; term: string }
  students: StudentFileEntry[]
}
