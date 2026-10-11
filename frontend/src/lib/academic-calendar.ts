/**
 * The faculty's academic calendar for the current semester, as the image the faculty publishes,
 * plus its dates as data for the dashboard's reminders.
 *
 * Each semester: put the new image in public/calendar/, update `image`, `semester` and `academicYear`,
 * and replace `events` with the new calendar's dates. Nothing is uploaded from the website.
 */
import type { L } from "@/lib/i18n"

export type CalendarEvent = {
  id: string
  /** First day, YYYY-MM-DD. */
  date: string
  /** Last day of a period ("till ..."), YYYY-MM-DD. */
  until?: string
  /** Time of day when the calendar gives one. */
  time?: L
  title: L
}

export const academicCalendar = {
  semester: { ar: "خريف", en: "Fall" } as L,
  academicYear: "2026-2027",
  image: "/calendar/fall-2026-2027.jpg",
  source: { ar: "كلية الهندسة – جامعة المنصورة", en: "Faculty of Engineering – Mansoura University" } as L,
}

const noon: L = { ar: "الساعة 12 الضهر", en: "at 12:00 PM" }

/** Fall 2026-2027 (specific programs), copied from the calendar image. AIE registration opens at 2:00 pm. */
export const calendarEvents: CalendarEvent[] = [
  { id: "registration-opens", date: "2026-09-16", time: { ar: "الساعة 2 الضهر", en: "at 2:00 PM" },
    title: { ar: "فتح تسجيل المقررات", en: "Course registration opens" } },
  { id: "semester-begins", date: "2026-09-19", time: { ar: "الساعة 8:30 الصبح", en: "at 8:30 AM" },
    title: { ar: "بداية الترم الخريفي", en: "Fall semester begins" } },
  { id: "add-drop", date: "2026-10-03", time: noon,
    title: { ar: "آخر يوم للإضافة والحذف", en: "Last day to add/drop a course" } },
  { id: "drop-without-w", date: "2026-10-17", time: noon,
    title: { ar: "آخر يوم لحذف مقرر من غير تقدير (W)", en: "Last day to drop a course without a (W)" } },
  { id: "payment", date: "2026-10-29",
    title: { ar: "آخر ميعاد لدفع المصاريف من غير غرامة تأخير", en: "Payment deadline without a late fee" } },
  { id: "midterm", date: "2026-11-07", until: "2026-11-12",
    title: { ar: "امتحانات الميدترم", en: "Midterm exams" } },
  { id: "midterm-results", date: "2026-11-14",
    title: { ar: "إعلان نتيجة الميدترم (من 20)", en: "Midterm results announced (out of 20)" } },
  { id: "withdraw", date: "2026-11-28", time: noon,
    title: { ar: "آخر يوم للانسحاب من مقرر", en: "Last day to withdraw from a course" } },
  { id: "recap-week", date: "2026-12-19",
    title: { ar: "بداية أسبوع المراجعة والامتحانات العملية", en: "Recap week and practical exams begin" } },
  { id: "coursework", date: "2026-12-24",
    title: { ar: "إعلان درجات أعمال الترم (من 50)", en: "Final coursework marks announced (out of 50)" } },
  { id: "finals", date: "2026-12-26", until: "2027-01-21",
    title: { ar: "بداية امتحانات آخر الترم", en: "Final exams begin" } },
  { id: "holiday", date: "2027-01-23", until: "2027-02-06",
    title: { ar: "بداية إجازة نص السنة", en: "Mid-year holiday begins" } },
  // The image says "till 28-1-1027"; 2027 is meant.
  { id: "project-evaluation", date: "2027-01-24", until: "2027-01-28",
    title: { ar: "تقييم المشاريع", en: "Project evaluation" } },
  { id: "final-grades", date: "2027-01-28",
    title: { ar: "إعلان النتيجة النهائية", en: "Final grades announced" } },
  { id: "appeals", date: "2027-01-30", until: "2027-02-01",
    title: { ar: "فترة التظلمات على نتيجة الترم", en: "Appeal period for the semester's results" } },
  { id: "spring-registration", date: "2027-02-03",
    title: { ar: "بداية تسجيل مقررات الترم الربيعي", en: "Spring course registration begins" } },
  { id: "spring-begins", date: "2027-02-06",
    title: { ar: "بداية الترم الربيعي", en: "Spring semester begins" } },
]
