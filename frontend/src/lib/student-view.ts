/**
 * Everything the pages show about one student, computed from their students.json record by the rules
 * engine (rules.ts) and the course data (aie-program.ts). Nothing here is written by hand for a particular
 * student: progress, the load limit, recommendations, eligibility, the plan, what-ifs and alerts all
 * follow from the record. Successor of the per-student half of mock-data.ts.
 *
 * Advice starts from the term the student is in now and counts only published results:
 * courses of the term in progress are not assumed passed.
 */
import {
  allDependentsOf,
  categoryLabels,
  courseNameL,
  courses,
  dependentsOf,
  findCourse,
  type Category,
  type Term,
} from "@/lib/aie-program"
import type { L } from "@/lib/i18n"
import {
  earnedCredits,
  FIRST_TERM_MAX_LOAD,
  LOAD_BANDS,
  maxLoad,
  MIN_LOAD,
  planGraduation,
  priorityScore,
  remainingItems,
  RETAKE_MAX_GRADE,
  statusOf,
  type PlanItem,
  type PlanOptions,
  type StudentRecord,
} from "@/lib/rules"
import { defaultPrefsSummary, sectionsFor, type Section } from "@/lib/demo-content"
import { registeredNow, toStudentRecord } from "@/lib/data/student-adapter"
import { dataTerm } from "@/lib/data/student-source"
import type { StudentFileEntry } from "@/lib/data/types"

export type { Category }

/** How many terms ahead the planner looks (a first-term student needs 10). */
const HORIZON = 12

// ---------------------------------------------------------------- types (shared with the pages)

export type RequirementGroup = { id: string; name: L; earned: number; required: number }
export type ElectiveCategory = { id: string; name: L; done: number; required: number }
export type Alert = { id: string; kind: "warning" | "info" | "seat"; title: L; body: L; sourceId?: string }

export type RecommendedCourse = {
  code: string
  name: L
  credits: number
  category: Category
  priority: number
  prereqs: string[]
  unlocks: string[]
  sections: Section[]
  verifiedReasons: L[]
  /** LLM explanation; empty until the AI service provides one. */
  aiReason: L
  slot?: string
}

export type IneligibleCourse = { code: string; name: L; credits: number; reason: L; sourceId: string; missing: string[] }

export type PlannedCourse = { code: string; credits: number; category: Category; requires: string[]; slot?: string; minCredits?: number }

export type Scenario = {
  id: string
  label: L
  plan: PlannedCourse[][]
  graduationIndex: number
  verdict: "delay" | "same" | "infeasible"
  graduation: L
  summary: L
  ruleNote: L
  /** Courses whose term differs from the baseline plan. */
  affected: string[]
}

export type StudentView = ReturnType<typeof buildStudentView>

// ---------------------------------------------------------------- small helpers

const termWord: Record<Term, L> = { fall: { ar: "الخريف", en: "Fall" }, spring: { ar: "الربيع", en: "Spring" } }
const listCodes = (codes: string[]) => codes.join("، ")
const listCodesEn = (codes: string[]) => codes.join(", ")
const fmt = (n: number) => n.toFixed(2)
const nameEn = (code: string) => courseNameL(code).en
const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? s
const beyond: L = { ar: "بعد أكتر من 6 سنين", en: "Beyond 6 years" }

const standingEn: Record<string, string> = { "منتظم": "Good standing", "إنذار أكاديمي": "Academic warning" }

/** The term the student is in now: their in-progress term, else the term the data was generated for. */
function currentTerm(s: StudentFileEntry): { term: Term; academicYear: number } {
  const t = s.terms.find((x) => x.status === "in_progress")
  const term = (t?.term ?? dataTerm.term) === "spring" ? "spring" : "fall"
  return { term, academicYear: parseInt(t?.academic_year ?? dataTerm.academic_year, 10) }
}

/** Fall 2026, Spring 2027, … starting at the current term. Academic year 2026-2027 = Fall 2026 + Spring 2027. */
function termNames(start: { term: Term; academicYear: number }): L[] {
  return Array.from({ length: HORIZON }, (_, i) => {
    const t = i + (start.term === "spring" ? 1 : 0)
    const year = start.academicYear + Math.floor(t / 2) + (t % 2 === 1 ? 1 : 0)
    return t % 2 === 0 ? { ar: `خريف ${year}`, en: `Fall ${year}` } : { ar: `ربيع ${year}`, en: `Spring ${year}` }
  })
}

function loadRule(r: StudentRecord, limit: number): L {
  if (r.gpa === null)
    return { ar: `أول ترم (لسه مفيش معدل) ← حد أقصى ${FIRST_TERM_MAX_LOAD} ساعة`, en: `First term (no GPA yet) → up to ${FIRST_TERM_MAX_LOAD} credit hours` }
  if (r.onProbation) return { ar: `إنذار أكاديمي ← حد أقصى ${limit} ساعة`, en: `Academic warning → up to ${limit} credit hours` }
  const b = LOAD_BANDS.find((x) => x.max_credits === limit)!
  if (b.gpa_min === 0) return { ar: `معدل أقل من ${fmt(b.gpa_max)} ← حد أقصى ${limit} ساعة`, en: `GPA < ${fmt(b.gpa_max)} → up to ${limit} credit hours` }
  if (b.gpa_max > 4) return { ar: `معدل ${fmt(b.gpa_min)} أو أكتر ← حد أقصى ${limit} ساعة`, en: `GPA ≥ ${fmt(b.gpa_min)} → up to ${limit} credit hours` }
  return {
    ar: `معدل من ${fmt(b.gpa_min)} لأقل من ${fmt(b.gpa_max)} ← حد أقصى ${limit} ساعة`,
    en: `${fmt(b.gpa_min)} ≤ GPA < ${fmt(b.gpa_max)} → up to ${limit} credit hours`,
  }
}

const toPlanned = (terms: PlanItem[][]): PlannedCourse[][] =>
  terms.map((t) => t.map((i) => ({ code: i.code, credits: i.credits, category: i.category, requires: i.prereqs, slot: i.slot, minCredits: i.minCredits || undefined })))

const termIndex = (plan: PlannedCourse[][]) => new Map(plan.flatMap((t, i) => t.map((c) => [c.code, i] as const)))

// ---------------------------------------------------------------- the view

export function buildStudentView(s: StudentFileEntry) {
  const record = toStudentRecord(s)
  const st = s.academic_status
  const now = currentTerm(s)
  const startTerm = now.term
  const currentSemester = st.main_semesters_completed + 1
  const earned = earnedCredits(record)
  const limit = maxLoad(record.gpa, record.onProbation)
  const semesterNames = termNames(now)
  /** First term index ≥ `from` that falls in `term`. */
  const nextIndexOf = (term: Term, from = 0) => semesterNames.findIndex((n, i) => i >= from && (i + (startTerm === "spring" ? 1 : 0)) % 2 === (term === "fall" ? 0 : 1))

  const planOpts: PlanOptions = { maxLoad: limit, startTerm, currentSemester, horizon: HORIZON }
  const baseline = planGraduation(record, planOpts)
  const gradName = (idx: number) => (idx >= 0 ? semesterNames[idx] : beyond)

  const student = {
    id: s.student_id,
    name: { ar: firstWord(s.personal.name_ar), en: firstWord(s.personal.name_en) },
    fullName: { ar: s.personal.name_ar, en: s.personal.name_en },
    program: { ar: s.enrollment.program, en: "Artificial Intelligence Engineering (AIE)" },
    level: { ar: `المستوى ${st.level}`, en: `Level ${st.level}` },
    standing: { ar: st.academic_standing, en: standingEn[st.academic_standing] ?? st.academic_standing },
    gpa: st.cumulative_gpa,
    earned: st.earned_hours,
    total: st.required_hours,
    maxLoad: limit,
    maxLoadRule: loadRule(record, limit),
    estGraduation: gradName(baseline.graduationIndex),
    preferences: { summary: defaultPrefsSummary },
    completed: record.passed,
    completedSemesters: st.main_semesters_completed,
    registeredNow: registeredNow(s),
  }

  // -------------------------------------------------------------- progress

  const order: Category[] = ["UNR", "BAS", "ENG", "PDE", "ELE", "ECE", "CSE", "ARI"]
  const requirementGroups: RequirementGroup[] = [
    ...order.map((cat) => {
      const list = courses.filter((c) => c.category === cat && c.type !== "elective")
      return {
        id: cat,
        name: categoryLabels[cat],
        required: list.reduce((sum, c) => sum + c.credits, 0),
        earned: list.filter((c) => record.passed.includes(c.code)).reduce((sum, c) => sum + c.credits, 0),
      }
    }),
    (() => {
      const slots = courses.filter((c) => c.type === "elective")
      const done = slots.filter((x) => record.passed.includes(record.electiveChoices[x.code] ?? "")).length
      return { id: "elective", name: { ar: "المقررات الاختيارية", en: "Electives" }, required: slots.length * 3, earned: done * 3 }
    })(),
  ]

  const electiveCategories: ElectiveCategory[] = (["L300", "L400"] as const).map((g) => {
    const slots = courses.filter((c) => c.electiveGroup === g)
    return {
      id: g,
      name: { ar: `اختياري المستوى ${g === "L300" ? 3 : 4} (${g})`, en: `Level ${g === "L300" ? 3 : 4} electives (${g})` },
      required: slots.length,
      done: slots.filter((x) => record.passed.includes(record.electiveChoices[x.code] ?? "")).length,
    }
  })

  // -------------------------------------------------------------- what can be registered in the current term

  const remaining = remainingItems(record)
  const offeredNow = remaining.filter((i) => i.term === startTerm)
  const isEligible = (i: PlanItem) =>
    i.slot && !record.electiveChoices[`ELEC ${i.slot}`]
      ? statusOf(`ELEC ${i.slot}`, record).kind === "eligible" // open slot: some pool course must be available
      : i.prereqs.every((p) => record.passed.includes(p)) && earned >= i.minCredits
  const eligibleNow = offeredNow.filter(isEligible)

  function verifiedReasonsFor(i: PlanItem): L[] {
    const out: L[] = []
    if (i.prereqs.length) out.push({ ar: `المتطلبات السابقة مستوفاة: ${listCodes(i.prereqs)}`, en: `Prerequisites met: ${listCodesEn(i.prereqs)}` })
    else if (!i.minCredits) out.push({ ar: "بدون متطلبات سابقة", en: "No prerequisites" })
    if (i.minCredits) out.push({ ar: `يتطلب ≥ ${i.minCredits} ساعة، ومعاك ${earned}`, en: `Requires ≥ ${i.minCredits} credits; you have ${earned}` })
    if (i.slot) out.push({ ar: `يملأ خانة الاختياري ${i.slot} (${i.group})`, en: `Fills elective slot ${i.slot} (${i.group})` })
    else if (i.semester === currentSemester) out.push({ ar: `في موعده حسب الخطة (الفصل ${i.semester})`, en: `On schedule (plan semester ${i.semester})` })
    else if (i.semester > currentSemester) out.push({ ar: `متقدم عن الخطة (الفصل ${i.semester})`, en: `Ahead of plan (semester ${i.semester})` })
    else out.push({ ar: `متأخر عن الخطة (الفصل ${i.semester})`, en: `Behind plan (semester ${i.semester})` })
    const deps = dependentsOf(i.code)
    if (deps.length) out.push({ ar: `متطلب سابق لـ: ${listCodes(deps)}`, en: `Prerequisite for: ${listCodesEn(deps)}` })
    return out
  }

  const recommendedCourses: RecommendedCourse[] = eligibleNow
    .map((i) => ({
      code: i.code,
      name: courseNameL(i.code),
      credits: i.credits,
      category: i.category,
      priority: priorityScore(i, currentSemester),
      prereqs: i.prereqs,
      unlocks: dependentsOf(i.code),
      sections: sectionsFor[i.code] ?? [{ id: "1", seatsLeft: 15, capacity: 40 }],
      verifiedReasons: verifiedReasonsFor(i),
      aiReason: { ar: "", en: "" },
      slot: i.slot,
    }))
    .sort((a, b) => b.priority - a.priority || a.code.localeCompare(b.code))

  /** What the planner registers in the current term — the default selection in the UI. */
  const proposedNow = (baseline.terms[0] ?? []).map((i) => i.code)

  const ineligibleCourses: IneligibleCourse[] = [
    ...offeredNow
      .filter((i) => !eligibleNow.includes(i) && !i.slot)
      .map((i) => {
        const missing = i.prereqs.filter((p) => !record.passed.includes(p))
        const reason: L = missing.length
          ? { ar: `ناقص المتطلب السابق ${listCodes(missing)}`, en: `Missing prerequisite ${listCodesEn(missing)}` }
          : { ar: `يتطلب ${i.minCredits} ساعة مكتسبة (معاك ${earned})`, en: `Requires ${i.minCredits} earned credits (you have ${earned})` }
        return { code: i.code, name: courseNameL(i.code), credits: i.credits, reason, sourceId: missing.length ? "catalog" : "training", missing }
      }),
    // Failed courses that cannot be retaken this term because they run in the other term.
    ...remaining
      .filter((i) => record.failed.includes(i.code) && i.term !== startTerm)
      .map((i) => ({
        code: i.code,
        name: courseNameL(i.code),
        credits: i.credits,
        reason: { ar: `إعادة: بيتدرّس في ${termWord[i.term].ar} فقط حسب الخطة`, en: `Retake: offered in ${termWord[i.term].en} only per the plan` },
        sourceId: "catalog",
        missing: [] as string[],
      })),
  ]

  // -------------------------------------------------------------- alerts (from the record and the rules)

  const alerts: Alert[] = []
  if (record.onProbation && record.gpa !== null) {
    alerts.push({
      id: "probation",
      kind: "warning",
      title: { ar: "إنذار أكاديمي", en: "Academic warning" },
      body: {
        ar: `معدلك التراكمي ${fmt(record.gpa)} أقل من 2.00، فالحد الأقصى للتسجيل ${limit} ساعة لحد ما المعدل يتحسن.`,
        en: `Your cumulative GPA (${fmt(record.gpa)}) is below 2.00, so you can register up to ${limit} credit hours until it improves.`,
      },
      sourceId: "load",
    })
  }
  for (const code of record.failed) {
    const item = remaining.find((i) => i.code === code)
    if (!item) continue
    const gated = allDependentsOf(code).length
    const retake = gradName(nextIndexOf(item.term))
    const name = nameEn(code)
    const when: L = student.registeredNow.includes(code)
      ? { ar: `وإنت مسجّله تاني الترم ده (${semesterNames[0].ar}).`, en: `You are retaking it this term (${semesterNames[0].en}).` }
      : {
          ar: `بيتدرّس في ${termWord[item.term].ar} بس حسب الخطة، فأقرب إعادة ${retake.ar}.`,
          en: `It is a ${termWord[item.term].en} course in the plan, so the earliest retake is ${retake.en}.`,
        }
    alerts.push({
      id: `fail-${code}`,
      kind: "warning",
      title: { ar: `رسوب في ${name}`, en: `Failed ${name}` },
      body: gated
        ? { ar: `متطلب سابق لـ ${gated} مقررات (مباشر وغير مباشر). ${when.ar}`, en: `It gates ${gated} courses (directly or indirectly). ${when.en}` }
        : when,
      sourceId: "catalog",
    })
  }
  if (record.failed.length) {
    alerts.push({
      id: "retake",
      kind: "info",
      title: { ar: "قاعدة إعادة التسجيل", en: "Re-registration rule" },
      body: {
        ar: `لما تعيد مقرر سقطت فيه، أعلى تقدير ممكن تاخده ${RETAKE_MAX_GRADE}.`,
        en: `When you re-register a failed course, the highest grade you can get is ${RETAKE_MAX_GRADE}.`,
      },
      sourceId: "retake",
    })
  }
  const nextGate = courses
    .filter((c) => c.minCredits && !record.passed.includes(c.code) && c.minCredits > earned)
    .sort((a, b) => a.minCredits! - b.minCredits!)[0]
  if (nextGate?.minCredits) {
    alerts.push({
      id: "gate",
      kind: "info",
      title: { ar: `${nextGate.name} لسه مقفول`, en: `${nextGate.name} is still locked` },
      body: {
        ar: `محتاج ${nextGate.minCredits} ساعة مكتسبة، ومعاك ${earned}. فاضلك ${nextGate.minCredits - earned} ساعة.`,
        en: `It requires ${nextGate.minCredits} earned credits and you have ${earned}, so ${nextGate.minCredits - earned} to go.`,
      },
      sourceId: "training",
    })
  }
  for (const c of recommendedCourses) {
    const full = c.sections.find((x) => x.seatsLeft === 0)
    const open = c.sections.find((x) => x.seatsLeft > 0)
    if (!full || !open) continue
    const name = nameEn(c.code)
    alerts.push({
      id: `seat-${c.code}`,
      kind: "seat",
      title: { ar: `سكشن ${full.id} في ${name} مكتمل`, en: `${name} section ${full.id} is full` },
      body: {
        ar: `سكشن ${open.id} فيه ${open.seatsLeft} مقاعد متاحة. لو محتاج سكشن ${full.id} تقدر تبعت طلب فتح مقعد.`,
        en: `Section ${open.id} has ${open.seatsLeft} seats left. If you need section ${full.id}, you can send a seat request.`,
      },
    })
  }

  // -------------------------------------------------------------- study plan + what-ifs

  const baselinePlan = toPlanned(baseline.terms)
  const baselineGraduationIndex = baseline.graduationIndex
  const before = termIndex(baselinePlan)

  function scenario(id: string, label: L, opts: Partial<PlanOptions>, ruleNote: L, summary: (gradIdx: number, affected: string[]) => L): Scenario {
    const p = planGraduation(record, { ...planOpts, ...opts })
    const plan = toPlanned(p.terms)
    const after = termIndex(plan)
    const affected = [...before.keys()].filter((code) => before.get(code) !== after.get(code))
    const gradIdx = p.graduationIndex
    const verdict = gradIdx === -1 || (baselineGraduationIndex !== -1 && gradIdx > baselineGraduationIndex) ? "delay" : "same"
    return { id, label, plan, graduationIndex: gradIdx, verdict, graduation: gradName(gradIdx), summary: summary(gradIdx, affected), ruleNote, affected }
  }

  const scenarios: Scenario[] = []

  // 1) Failing the current-term course that most other courses depend on.
  const keyCourse = (baseline.terms[0] ?? [])
    .filter((i) => !i.slot)
    .map((i) => ({ code: i.code, deps: allDependentsOf(i.code).length }))
    .filter((x) => x.deps > 0)
    .sort((a, b) => b.deps - a.deps)[0]
  if (keyCourse) {
    const code = keyCourse.code
    const direct = dependentsOf(code).filter((d) => before.has(d))
    const retake = gradName(nextIndexOf(remaining.find((i) => i.code === code)!.term, 1))
    scenarios.push(
      scenario(
        `fail-${code}`,
        { ar: `لو سقطت في ${nameEn(code)}`, en: `What if I fail ${nameEn(code)}?` },
        { failAt: { [code]: 0 } },
        direct.length
          ? { ar: `${listCodes(direct)} ${direct.length > 1 ? "بيتطلبوا" : "بيتطلب"} ${code}`, en: `${listCodesEn(direct)} require${direct.length > 1 ? "" : "s"} ${code}` }
          : { ar: `${code} متطلب سابق لمقررات بعده`, en: `${code} is a prerequisite for later courses` },
        (gradIdx, affected) => ({
          ar: `هتعيد ${nameEn(code)} ${retake.ar}، و${gradIdx === baselineGraduationIndex ? "موعد التخرج مش هيتغير" : `التخرج يبقى ${gradName(gradIdx).ar}`}. المقررات المتأثرة: ${affected.length}.`,
          en: `You retake ${nameEn(code)} in ${retake.en}, and ${gradIdx === baselineGraduationIndex ? "graduation does not change" : `graduation moves to ${gradName(gradIdx).en}`}. Affected courses: ${affected.length}.`,
        })
      )
    )
  }

  // 2) Reaching the next GPA band (a higher load limit).
  const nextBand = record.gpa === null ? undefined : LOAD_BANDS.find((b) => b.gpa_min > record.gpa! && b.max_credits > limit)
  if (nextBand) {
    scenarios.push(
      scenario(
        "gpa-up",
        {
          ar: `لو معدلي وصل ${fmt(nextBand.gpa_min)} (حد ${nextBand.max_credits} ساعة)`,
          en: `What if my GPA reaches ${fmt(nextBand.gpa_min)} (${nextBand.max_credits}-credit limit)?`,
        },
        { maxLoad: nextBand.max_credits },
        { ar: `معدل ≥ ${fmt(nextBand.gpa_min)} ← حد أقصى ${nextBand.max_credits} ساعة`, en: `GPA ≥ ${fmt(nextBand.gpa_min)} → up to ${nextBand.max_credits} credit hours` },
        (gradIdx) =>
          gradIdx === baselineGraduationIndex
            ? {
                ar: "هتقدر تسجّل مقررات أكتر بدري، بس التخرج هيفضل زي ما هو. اللي محدد موعد تخرجك هو سلسلة المتطلبات، مش عدد الساعات.",
                en: "You can take more courses earlier, but graduation stays the same. Your bottleneck is the prerequisite chain, not the credit limit.",
              }
            : {
                ar: `هتقدر تسجّل مقررات أكتر بدري، والتخرج يبقى ${gradName(gradIdx).ar}.`,
                en: `You can take more courses earlier, and graduation moves to ${gradName(gradIdx).en}.`,
              }
      )
    )
  }

  // 3) Graduating one term earlier, checked at the highest load the rules allow.
  const topLoad = Math.max(...LOAD_BANDS.map((b) => b.max_credits))
  if (baselineGraduationIndex > 0) {
    const fastest = planGraduation(record, { ...planOpts, maxLoad: topLoad })
    if (fastest.graduationIndex >= baselineGraduationIndex) {
      // The prerequisite chain that ends in the graduation term.
      const placed = termIndex(baselinePlan)
      const chainTo = (code: string): string[] => {
        const pre = (findCourse(code)?.prereqs ?? []).filter((p) => placed.has(p)).sort((a, b) => placed.get(b)! - placed.get(a)!)[0]
        return pre ? [...chainTo(pre), code] : [code]
      }
      const chain = baselinePlan[baselineGraduationIndex]
        .map((c) => chainTo(c.code))
        .sort((a, b) => b.length - a.length)[0]
      const withTerm = (code: string, lang: "ar" | "en") => `${code} (${semesterNames[placed.get(code)!][lang]})`
      const target = semesterNames[baselineGraduationIndex - 1]
      scenarios.push({
        id: "earlier",
        label: { ar: `أقدر أتخرج ${target.ar}؟`, en: `Can I graduate in ${target.en}?` },
        plan: baselinePlan,
        graduationIndex: baselineGraduationIndex,
        verdict: "infeasible",
        graduation: { ar: "غير ممكن بالقواعد الحالية", en: "Not possible under current rules" },
        summary: {
          ar: `لأ. حتى بأقصى حمل (${topLoad} ساعة)، أقرب تخرج ${semesterNames[baselineGraduationIndex].ar}، لأن كل مقرر في السلسلة دي بيتدرّس في ترم واحد بس في السنة.`,
          en: `No. Even at the maximum load (${topLoad} credit hours), the earliest graduation is ${semesterNames[baselineGraduationIndex].en}, because each course in this chain runs in only one term a year.`,
        },
        ruleNote: {
          ar: chain.map((c) => withTerm(c, "ar")).join(" ← "),
          en: chain.map((c) => withTerm(c, "en")).join(" → "),
        },
        affected: [],
      })
    }
  }

  return {
    record,
    student,
    earned,
    minLoad: MIN_LOAD,
    currentSemester,
    startTerm,
    semesterNames,
    requirementGroups,
    electiveCategories,
    alerts,
    recommendedCourses,
    proposedNow,
    ineligibleCourses,
    baselinePlan,
    baselineGraduationIndex,
    scenarios,
  }
}
