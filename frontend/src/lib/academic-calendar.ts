/**
 * The faculty's academic calendar for the current semester, as the image the faculty publishes.
 *
 * Each semester: put the new image in public/calendar/ and update `image`, `semester` and `academicYear` below.
 * Nothing is uploaded from the website.
 */
import type { L } from "@/lib/i18n"

export const academicCalendar = {
  semester: { ar: "خريف", en: "Fall" } as L,
  academicYear: "2026-2027",
  image: "/calendar/fall-2026-2027.jpg",
  source: { ar: "كلية الهندسة – جامعة المنصورة", en: "Faculty of Engineering – Mansoura University" } as L,
}
