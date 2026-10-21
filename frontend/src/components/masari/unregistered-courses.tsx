"use client"

/**
 * "Courses you haven't registered this term" on the timetable page: the courses the student should register but whose
 * section is full (StudentView.seatCourses). While registration is open (lib/registration.ts) the student sends one
 * request to the academic advisor about all of them: a ready email opens in Gmail and each course is saved as a seat
 * request (lib/seat-requests.ts), which is how the page knows the request went out, so it is offered once. Once
 * registration closes, the card says so: paper registration only in necessary cases.
 */
import * as React from "react"
import { Check, ExternalLink, Lock, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Code } from "@/components/masari/bits"
import { useAdvisor, type Advisor } from "@/lib/advisor"
import { addDropEvent, dropWithoutWEvent, useRegistrationPhase } from "@/lib/registration"
import { useI18n } from "@/lib/i18n"
import type { useSeatRequests } from "@/lib/seat-requests"
import type { SeatCourse, StudentView } from "@/lib/student-view"

export function UnregisteredCourses({
  view,
  seats,
  open,
}: {
  view: StudentView
  seats: ReturnType<typeof useSeatRequests>
  open: boolean
}) {
  const { t, tr, lang } = useI18n()
  const advisor = useAdvisor(view.student.id)
  const phase = useRegistrationPhase()
  const canRequest = phase === "system" || phase === "paper"
  const [failed, setFailed] = React.useState(false)
  const list = view.seatCourses
  const sent = seats.loaded && list.length > 0 && list.every((c) => seats.isSent(c.code, c.full))
  if (!list.length || !seats.loaded) return null

  const email = advisorEmail(view, list, advisor, lang)
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email.to)}&su=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`
  const record = () => {
    setFailed(false)
    seats.requestAll(list.filter((c) => !seats.isSent(c.code, c.full)).map((c) => ({ code: c.code, section: c.full })))
      .then((ok) => setFailed(!ok))
  }
  const advisorName = advisor ? (lang === "ar" ? advisor.name_ar : advisor.name_en) : null

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t("regTitle")}</h2>
          {open ? (
            <p className="text-sm text-muted-foreground">
              {t("regOpenSub")} {addDropEvent && <>{tr(dayMonth(addDropEvent.date))} {addDropEvent.time && tr(addDropEvent.time)}</>}.
            </p>
          ) : (
            <div className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm">
              <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <p>
                {phase === "over" ? (
                  <>
                    <span className="font-medium">{t("regOver")}</span> {dropWithoutWEvent && tr(dayMonth(dropWithoutWEvent.date))}.
                  </>
                ) : (
                  <>
                    <span className="font-medium">{t("regClosed")}</span> {t("regClosedPaper")}{" "}
                    {dropWithoutWEvent && <>{tr(dayMonth(dropWithoutWEvent.date))} {dropWithoutWEvent.time && tr(dropWithoutWEvent.time)}.</>}
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        <ul className="divide-y rounded-xl border">
          {list.map((c) => (
            <li key={c.code} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{tr(c.name)}</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <Code className="text-[11px]">{c.code}</Code>
                  <span>
                    {c.credits} {lang === "ar" ? "ساعات" : "credits"}
                  </span>
                </p>
              </div>
              <p className="text-xs">
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
                  {lang === "ar" ? "سكشن" : "Section"} {c.full} {t("regFull")}
                </span>
                <span className="ms-2 text-muted-foreground">
                  {c.open ? `${lang === "ar" ? "سكشن" : "Section"} ${c.open.id}: ${c.open.seatsLeft} ${t("regSeatsLeft")}` : t("regAllFull")}
                </span>
              </p>
            </li>
          ))}
        </ul>

        {sent ? (
          <div className="space-y-1 rounded-xl bg-verified-soft p-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-verified">
              <Check className="size-4" aria-hidden />
              {t("regSent")}
              {advisorName && <span className="font-normal text-foreground/80">({advisorName})</span>}
            </p>
            <p className="text-muted-foreground">{t("regSentHint")}</p>
            {canRequest && (
              <a href={gmail} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline">
                <ExternalLink className="size-3" aria-hidden />
                {t("regReopen")}
              </a>
            )}
          </div>
        ) : (
          canRequest && (
            <div className="space-y-2">
              <Button
                nativeButton={false}
                render={<a href={gmail} target="_blank" rel="noopener noreferrer" onClick={record} />}
                className="h-10 gap-2"
              >
                <Mail className="size-4" aria-hidden />
                {t("regSend")}
              </Button>
              {advisorName && (
                <p className="text-xs text-muted-foreground">
                  {t("regTo")} {advisorName} · <span dir="ltr">{advisor?.email}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">{t(open ? "regSendHint" : "regSendHintPaper")}</p>
              {failed && (
                <p className="text-xs text-destructive" role="alert">
                  {t("regSendFailed")}
                </p>
              )}
            </div>
          )
        )}
      </CardContent>
    </Card>
  )
}

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** "2026-10-03" → "3 أكتوبر" / "October 3". */
function dayMonth(iso: string) {
  const [, m, d] = iso.split("-").map(Number)
  return { ar: `${d} ${MONTHS_AR[m - 1]}`, en: `${MONTHS_EN[m - 1]} ${d}` }
}

/** The email to the advisor: the courses with their full sections, and who the student is. */
function advisorEmail(view: StudentView, list: SeatCourse[], advisor: Advisor | null, lang: "ar" | "en") {
  const s = view.student
  const registered = view.currentCourses.reduce((sum, c) => sum + c.credits, 0)
  const gpa = s.gpa == null ? "—" : s.gpa.toFixed(2)
  if (lang === "ar") {
    const courses = list.map(
      (c) => `- ${c.code} ${c.name.ar} (${c.credits} ساعات): سكشن ${c.full} مكتمل` + (c.open ? `، وسكشن ${c.open.id} فيه ${c.open.seatsLeft} مقاعد` : "، وكل السكاشن مكتملة")
    )
    const body = [
      advisor ? `${advisor.name_ar}،` : "السيد/ة المرشد الأكاديمي المحترم،",
      "تحية طيبة وبعد،",
      "",
      "أرجو مساعدتي في تسجيل المقررات التالية الترم ده، لأن السكاشن المطلوبة مكتملة العدد على سيستم الجامعة:",
      ...courses,
      "",
      "بياناتي:",
      `- الاسم: ${s.fullName.ar}`,
      `- كود الطالب: ${s.id}`,
      `- ${s.level.ar}`,
      `- المعدل التراكمي: ${gpa}`,
      `- الساعات المكتسبة: ${s.earned} من ${s.total}`,
      `- الساعات المسجلة الترم ده: ${registered} (الحد المسموح ${s.maxLoad})`,
      "",
      "وتفضلوا بقبول فائق الاحترام،",
      s.fullName.ar,
      s.email,
    ]
    return { to: advisor?.email ?? "", subject: `طلب تسجيل مقررات مكتملة العدد - ${s.id}`, body: body.join("\n").trim() }
  }
  const courses = list.map(
    (c) => `- ${c.code} ${c.name.en} (${c.credits} credits): section ${c.full} is full` + (c.open ? `; section ${c.open.id} has ${c.open.seatsLeft} seats` : "; all sections are full")
  )
  const body = [
    advisor ? `Dear ${advisor.name_en},` : "Dear Academic Advisor,",
    "",
    "Could you help me register the following courses this term? The sections I need are full on the university system:",
    ...courses,
    "",
    "My information:",
    `- Name: ${s.fullName.en}`,
    `- Student ID: ${s.id}`,
    `- ${s.level.en}`,
    `- Cumulative GPA: ${gpa}`,
    `- Credits earned: ${s.earned} of ${s.total}`,
    `- Credits registered this term: ${registered} (limit ${s.maxLoad})`,
    "",
    "Best regards,",
    s.fullName.en,
    s.email,
  ]
  return { to: advisor?.email ?? "", subject: `Request to register full courses - ${s.id}`, body: body.join("\n").trim() }
}
