/**
 * The student's weekly timetable for the current term: SIMULATED until the faculty publishes its timetable in a
 * form we can read. It is built from the courses the student is registered in this term, in the shape of the
 * faculty's timetable (Table_1st_term_26-27): Saturday to Thursday, six periods a day, a lecture for the whole
 * group and a section (tutorial or lab) per section, and rest days on which the level has no classes. Which day and period each class lands on, and the rooms, are made up (the same student
 * always gets the same timetable). The period times are the faculty's (confirmed by the team, 2026-10-17).
 */
import type { L } from "@/lib/i18n"
import type { StudentFileEntry } from "@/lib/data/types"

export type Day = "sat" | "sun" | "mon" | "tue" | "wed" | "thu"
export const DAYS: Day[] = ["sat", "sun", "mon", "tue", "wed", "thu"]
export const dayNames: Record<Day, L> = {
  sat: { ar: "السبت", en: "Saturday" },
  sun: { ar: "الأحد", en: "Sunday" },
  mon: { ar: "الاثنين", en: "Monday" },
  tue: { ar: "الثلاثاء", en: "Tuesday" },
  wed: { ar: "الأربعاء", en: "Wednesday" },
  thu: { ar: "الخميس", en: "Thursday" },
}

export type Period = { n: number; name: L; start: string; end: string }
const p = (n: number, ar: string, en: string, start: string, end: string): Period => ({ n, name: { ar, en }, start, end })
/** The faculty's six periods, 24-hour "HH:MM". */
export const PERIODS: Period[] = [
  p(1, "الفترة الأولى", "Period 1", "08:30", "10:00"),
  p(2, "الفترة الثانية", "Period 2", "10:10", "11:40"),
  p(3, "الفترة الثالثة", "Period 3", "11:50", "13:20"),
  p(4, "الفترة الرابعة", "Period 4", "13:40", "15:10"),
  p(5, "الفترة الخامسة", "Period 5", "15:15", "16:45"),
  p(6, "الفترة السادسة", "Period 6", "16:50", "18:20"),
]

export type SessionKind = "lecture" | "tutorial" | "lab"
export type Session = {
  id: string
  kind: SessionKind
  code: string
  name: L
  day: Day
  period: number
  room: L
}
export type Timetable = {
  section: number
  studyDays: Day[]
  restDays: Day[]
  sessions: Session[]
}

// ------------------------------------------------------------------------------------------------ rooms (from the PDF)

const room = (r: string): L => ({ ar: r, en: r })
const HALLS = ["308", "315", "3013", "2012", "H408"].map(room)
const LABS: Record<"computer" | "comms", L[]> = {
  computer: [
    { ar: "معمل شبكات الحاسب", en: "Computer networks lab" },
    { ar: "معمل الحاسب", en: "Computer lab" },
  ],
  comms: [
    { ar: "معمل الاتصالات الرقمية", en: "Digital communications lab" },
    { ar: "معمل الاتصالات", en: "Communications lab" },
  ],
}

/** Days with no classes, per level (levels 300 and 400 rest on Wednesday and Thursday in the PDF). */
const REST_DAYS: Record<string, Day[]> = {
  "0": ["tue", "thu"],
  "100": ["sun", "thu"],
  "200": ["sat", "thu"],
  "300": ["wed", "thu"],
  "400": ["wed", "thu"],
}

// ------------------------------------------------------------------------------------------------ building it

/** Small deterministic random numbers from a seed (mulberry32), so a student always gets the same timetable. */
function random(seedText: string) {
  let seed = [...seedText].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261)
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const shuffle = <T>(xs: T[], rnd: () => number) => {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const MAX_PER_DAY = 4

/** What each registered course meets for: a lecture, and for 3+ credits a lab (computing and electronics) or a tutorial. */
function needs(code: string, credits: number): SessionKind[] {
  const dept = code.split(" ")[0]
  if (dept === "UNR" || credits < 3) return ["lecture"]
  return ["lecture", ["CSE", "ARI", "ECE", "ELE"].includes(dept) ? "lab" : "tutorial"]
}

export function buildTimetable(s: StudentFileEntry, level: string): Timetable {
  const rnd = random(s.student_id)
  const restDays = REST_DAYS[level] ?? ["thu"]
  const studyDays = DAYS.filter((d) => !restDays.includes(d))
  const section = 1 + Math.floor(rnd() * 3)
  const courses = s.terms.filter((t) => t.status === "in_progress").flatMap((t) => t.courses)

  const taken = new Set<string>() // "day-period"
  const perDay = new Map<Day, number>()
  const courseDays = new Map<string, Set<Day>>()
  const sessions: Session[] = []

  /** Lectures prefer the morning, sections the afternoon; a course's two meetings go on different days. */
  const place = (kind: SessionKind, code: string): { day: Day; period: number } | null => {
    const periods = kind === "lecture" ? [1, 2, 3, 4] : [3, 4, 5, 6, 2]
    // Every free slot, the preferred periods first but mixed a little, so classes do not all stack in period 1.
    const slots = shuffle(studyDays, rnd)
      .flatMap((day) =>
        periods.map((period, rank) => ({
          day,
          period,
          score: rank + rnd() * 2.5,
        })),
      )
      .sort((a, b) => a.score - b.score)
    for (const strict of [true, false]) {
      for (const { day, period } of slots) {
        if (taken.has(`${day}-${period}`)) continue
        if (strict && ((perDay.get(day) ?? 0) >= MAX_PER_DAY || courseDays.get(code)?.has(day))) continue
        return { day, period }
      }
    }
    return null
  }
  const add = (kind: SessionKind, code: string, name: L, roomOf: () => L) => {
    const at = place(kind, code)
    if (!at) return
    taken.add(`${at.day}-${at.period}`)
    perDay.set(at.day, (perDay.get(at.day) ?? 0) + 1)
    courseDays.set(code, new Set([...(courseDays.get(code) ?? []), at.day]))
    sessions.push({
      id: `${code}-${kind}`,
      kind,
      code,
      name,
      room: roomOf(),
      ...at,
    })
  }
  const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]

  // The longest courses first, so they get the best periods.
  for (const c of [...courses].sort((a, b) => b.credits - a.credits || a.code.localeCompare(b.code))) {
    const name = { ar: c.name_ar, en: c.name_en }
    for (const kind of needs(c.code, c.credits)) {
      const labs = c.code.startsWith("ECE") || c.code.startsWith("ELE") ? LABS.comms : LABS.computer
      add(kind, c.code, name, () => (kind === "lab" ? pick(labs) : pick(HALLS)))
    }
  }

  sessions.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.period - b.period)
  return { section, studyDays, restDays, sessions }
}
