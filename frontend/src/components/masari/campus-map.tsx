"use client"

/**
 * Campus map: a small header button (next to the calendar) opens the map in its own tab (app/map). There the student
 * picks where they are and where they're going, and gets the walk drawn on the floor plans with turn-by-turn
 * directions, across both buildings when needed. The chat links a room it was asked about (?room=308).
 */
import * as React from "react"
import { ArrowUpDown, Map as MapIcon, Minus, Plus } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BUILDINGS, VIEWBOX, corridors, entrances, labels, outlines, risers, rooms, steps as stepMarks, type Pt, type Room, type RoomType, type Space } from "@/lib/campus-map/data"
import { type Place, type Route, WAYS, findPlace, findTimetableRoom, placeById, placeName, places, route as walk } from "@/lib/campus-map/route"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** The map's own page; with a room (a number, or a lab's Arabic name) it opens already heading there. */
export const campusMapHref = (room?: string) => (room ? `/map?room=${encodeURIComponent(room)}` : "/map")

export function CampusMapButton() {
  const { t } = useI18n()
  return (
    <a
      href={campusMapHref()}
      target="_blank"
      rel="noopener"
      className={cn(buttonVariants({ variant: "ghost", size: "icon-lg" }), "size-10")}
      aria-label={t("mapOpen")}
      title={t("mapOpen")}
    >
      <MapIcon className="size-[18px]" aria-hidden />
    </a>
  )
}

const MAIN_ENTRANCE: Record<"gen" | "prog", string> = { gen: "E2", prog: "PG" }
/**
 * The walk, and when it goes between the two buildings, each of the three ways of doing that, shortest
 * first, so the student can take another one when a door or path is closed.
 */
function walks(from: Place, to: Place): Route[] {
  const best = walk(from, to, { lift: false }) // stairs only; the lift stays on the drawing as a landmark
  if (!best?.way) return best ? [best] : []
  return WAYS.map((w) => walk(from, to, { lift: false, way: w.id }))
    .filter((r): r is Route => r?.way !== undefined)
    .sort((a, b) => a.length - b.length)
}
type View = { space: Space; f: number }

export function CampusMap({ room }: { room?: string }) {
  const { t, tr, lang } = useI18n()
  // opened from the timetable: start with the walk from the main entrance of "عام" to that room already drawn
  const [initial] = React.useState(() => {
    const target = room ? findTimetableRoom(room) : null
    return { target, ways: target ? walks(placeById(MAIN_ENTRANCE.gen)!, target) : [] }
  })
  const target = initial.target
  const [fromText, setFromText] = React.useState(() => tr(placeById(MAIN_ENTRANCE.gen)!.label))
  const [toText, setToText] = React.useState(target ? tr(target.label) : "")
  const [error, setError] = React.useState("")
  const [ways, setWays] = React.useState<Route[]>(initial.ways)
  const [result, setResult] = React.useState<Route | null>(initial.ways[0] ?? null)
  const [view, setView] = React.useState<View>(initial.ways[0]?.views[0] ?? { space: "gen", f: 0 })
  const [picked, setPicked] = React.useState<Room | null>(null)
  // set by "اختار المكان من الخريطة": the next room tapped on the map fills that field
  const [pickFor, setPickFor] = React.useState<"from" | "to" | null>(null)
  const mapRef = React.useRef<HTMLDivElement>(null)

  function go(fromT: string, toT: string) {
    const from = findPlace(fromT), to = findPlace(toT)
    if (!from) return setError(t("mapErrFrom"))
    if (!to) return setError(t("mapErrTo"))
    if (from.key === to.key) return setError(t("mapErrSame"))
    const all = walks(from, to), r = all[0]
    if (!r) return setError(t("mapErrNone"))
    setError("")
    setFromText(tr(from.label))
    setToText(tr(to.label))
    setWays(all)
    setResult(r)
    setPicked(null)
    setView(r.views[0])
  }

  const choosePlace = (p: Place, as: "from" | "to") => {
    if (as === "from") {
      setFromText(tr(p.label))
      if (toText) go(tr(p.label), toText)
      else setPicked(null)
    } else {
      setToText(tr(p.label))
      go(fromText, tr(p.label))
    }
  }
  const startPicking = (as: "from" | "to") => {
    setPickFor((cur) => (cur === as ? null : as))
    setPicked(null)
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const onRoomTap = (r: Room) => {
    if (!pickFor) return setPicked(r)
    choosePlace(placeById(r.id)!, pickFor)
    setPickFor(null)
  }
  const pickLink = (as: "from" | "to") => (
    <button
      type="button"
      aria-pressed={pickFor === as}
      onClick={() => startPicking(as)}
      className={cn("rounded text-xs font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring", pickFor === as && "bg-highlight-soft px-1 text-highlight-ink")}
    >
      ({t("mapPickOnMap")})
    </button>
  )
  const onRoute = new Set(result?.views.map((v) => `${v.space}${v.f}`))

  return (
    <div className="grid items-start gap-5 px-4 pb-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <form
          className="space-y-3 rounded-xl border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault()
            go(fromText, toText)
          }}
        >
          <p className="rounded-lg bg-muted px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">{t("mapHow")}</p>
          <div className="space-y-1.5">
            <div className="flex min-h-7 flex-wrap items-center gap-x-1.5">
              <label htmlFor="map-from" className="text-xs font-semibold text-muted-foreground">{t("mapFrom")}</label>
              {pickLink("from")}
            </div>
            <Input id="map-from" list="map-from-list" autoComplete="off" placeholder={t("mapFromPh")} value={fromText} onChange={(e) => setFromText(e.target.value)} className="h-10" />
            <datalist id="map-from-list">
              {places.map((p) => <option key={p.id} value={tr(p.label)} />)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-1.5">
                <label htmlFor="map-to" className="text-xs font-semibold text-muted-foreground">{t("mapTo")}</label>
                {pickLink("to")}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("mapSwap")}
                title={t("mapSwap")}
                onClick={() => {
                  setFromText(toText); setToText(fromText)
                }}
              >
                <ArrowUpDown className="size-4" aria-hidden />
              </Button>
            </div>
            <Input id="map-to" list="map-to-list" autoComplete="off" placeholder={t("mapToPh")} value={toText} onChange={(e) => setToText(e.target.value)} className="h-10" />
            <datalist id="map-to-list">
              {places.filter((p) => p.kind === "room").map((p) => <option key={p.id} value={tr(p.label)} />)}
            </datalist>
          </div>
          <Button type="submit" size="lg" className="w-full">{t("mapGo")}</Button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </form>
      </div>

      {/* Phones: form, then the map, then the steps. Wide screens: the map fills the right column. */}
      <div ref={mapRef} className="min-w-0 scroll-mt-4 space-y-2 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <ViewTabs view={view} onRoute={onRoute} onChange={(v) => { setView(v); setPicked(null) }} />
        {pickFor && (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-highlight bg-highlight-soft px-3 py-2 text-sm font-medium text-highlight-ink">
            <span className="min-w-0 flex-1">{t(pickFor === "from" ? "mapPickingFrom" : "mapPickingTo")}</span>
            <Button size="sm" variant="outline" onClick={() => setPickFor(null)}>{t("mapPickCancel")}</Button>
          </div>
        )}
        {picked && !pickFor && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              {picked.code && <span className="font-mono font-semibold" dir="ltr">{picked.code} · </span>}
              {tr(picked.name)} · {tr(picked.bld)}
              {picked.inferred && <span className="text-xs text-warning"> · {t("mapInferred")}</span>}
            </span>
          </div>
        )}
        <FloorPlan view={view} result={result} others={ways.filter((w) => w !== result)} picked={picked} onPick={onRoomTap} lang={lang} />
        <Legend />
        {!result && !pickFor && <p className="text-xs text-muted-foreground">{t("mapPickHint")}</p>}
      </div>

      <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2">
        {result && (
          <div className="rounded-xl border bg-card p-4">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{tr(placeName(result.to))}</span>
              <span className="rounded-full border px-2 text-xs text-muted-foreground">
                {tr(BUILDINGS.find((b) => b.space === result.to.space)!.name)} · {tr(BUILDINGS.find((b) => b.space === result.to.space)!.floors[result.to.f])}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {result.steps.length} {t("mapSteps")} · {result.flights ? `${result.flights} ${t("mapFlights")}` : t("mapNoStairs")}
              {result.to.kind === "room" && result.to.room.inferred && <span className="text-warning"> · {t("mapInferred")}</span>}
            </p>
            {ways.length > 1 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">{t("mapWays")}</p>
                {ways.map((w) => {
                  const on = w === result, more = Math.round((w.length / ways[0].length - 1) * 100)
                  return (
                    <button
                      key={w.way}
                      type="button"
                      aria-pressed={on}
                      onClick={() => { setResult(w); setView({ space: "campus", f: 0 }) }}
                      className={cn("flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-start text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-highlight bg-highlight-soft" : "hover:bg-muted")}
                    >
                      <span className={cn("size-3 shrink-0 rounded-full border-2", on ? "border-highlight bg-highlight" : "border-muted-foreground/50")} aria-hidden />
                      <span className="min-w-0 flex-1">{tr(WAYS.find((x) => x.id === w.way)!.name)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {w === ways[0] ? t("mapWayShortest") : more < 3 ? t("mapWaySame") : `${t("mapWayLonger")} ${more}%`}
                      </span>
                    </button>
                  )
                })}
                <p className="text-xs text-muted-foreground">{t("mapWaysNote")}</p>
              </div>
            )}
            <ol className="mt-3 space-y-0.5">
              {result.steps.map((s, i) => {
                const here = s.space === view.space && s.f === view.f
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => setView({ space: s.space, f: s.f })}
                      className={cn("grid w-full grid-cols-[1.75rem_minmax(0,1fr)] gap-2 rounded-lg px-1.5 py-2 text-start text-sm hover:bg-muted", here && "bg-highlight-soft")}
                    >
                      <span className={cn("grid size-6 place-items-center rounded-full border border-highlight font-mono text-xs font-semibold text-highlight-ink", s.climb && "bg-highlight text-white")}>
                        {s.climb ? "↕" : i + 1}
                      </span>
                      <span>
                        {tr(s.text)}
                        <span className="block text-xs text-muted-foreground">
                          {tr(BUILDINGS.find((b) => b.space === s.space)!.name)} · {tr(BUILDINGS.find((b) => b.space === s.space)!.floors[s.f])}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">{t("mapDraft")}</p>
      </div>

    </div>
  )
}


function ViewTabs({ view, onRoute, onChange }: { view: View; onRoute: Set<string>; onChange: (v: View) => void }) {
  const { tr } = useI18n()
  const b = BUILDINGS.find((x) => x.space === view.space)!
  const dot = <span aria-hidden className="absolute -top-1 -end-1 size-2.5 rounded-full border-2 border-background bg-highlight" />
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {BUILDINGS.map((x) => {
          const on = [...onRoute].some((k) => k.startsWith(x.space))
          return (
            <Button key={x.space} size="sm" variant={x.space === view.space ? "default" : "outline"} className="relative" aria-pressed={x.space === view.space} onClick={() => onChange({ space: x.space, f: 0 })}>
              {tr(x.name)}
              {on && x.space !== view.space && dot}
            </Button>
          )
        })}
      </div>
      {b.floors.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={tr(b.name)}>
          {b.floors.map((fl, f) => (
            <Button key={f} size="xs" variant={f === view.f ? "secondary" : "ghost"} className="relative h-7 px-2.5" aria-pressed={f === view.f} onClick={() => onChange({ space: view.space, f })}>
              {tr(fl)}
              {onRoute.has(`${view.space}${f}`) && f !== view.f && dot}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------ the drawing

const mix = (c: string, p: number) => `color-mix(in oklab, ${c} ${p}%, var(--card))`
const FILL: Record<RoomType, string> = { hall: mix("var(--warning)", 18), lab: mix("var(--series-1)", 15), adm: mix("var(--muted-foreground)", 11), svc: "var(--muted)", off: "var(--card)" }
const EDGE: Record<RoomType, string> = { hall: mix("var(--warning)", 70), lab: mix("var(--series-1)", 60), adm: mix("var(--muted-foreground)", 45), svc: mix("var(--muted-foreground)", 32), off: "var(--border)" }
const CORRIDOR = mix("var(--muted-foreground)", 15)
const INK = "var(--foreground)"
const MUTED = "var(--muted-foreground)"
const ROUTE = "var(--highlight)"
/** The Programs building and the campus path have big rooms and few of them, so their text can be larger. */
const TEXT: Record<Space, number> = { gen: 1, prog: 1.55, campus: 1.5 }

function wrap(text: string, max: number) {
  const out: string[] = []
  let line = ""
  for (const w of text.split(" ")) {
    if ((line + " " + w).trim().length > max && line) { out.push(line); line = w } else line = (line + " " + w).trim()
  }
  if (line) out.push(line)
  return out.slice(0, 4)
}

function RoomShape({ r, state, lang, onPick }: { r: Room; state: "" | "dest" | "from"; lang: "ar" | "en"; onPick: (r: Room) => void }) {
  const k = TEXT[r.space], narrow = r.w < 50 * k, fs = (narrow ? 7.2 : r.w < 80 * k ? 8.2 : 9) * k
  const lines: { t: string; mono: boolean; fs: number }[] = []
  const generic = ["مدرج", "قاعة", "مكتب"].includes(r.name.ar)
  if (r.code) {
    lines.push({ t: r.code, mono: true, fs: (narrow ? 8.6 : 10.5) * k })
    if (!(narrow && generic)) wrap(r.name[lang], Math.max(4, Math.floor(r.w / (fs * 0.62)))).forEach((t) => lines.push({ t, mono: false, fs }))
  } else wrap(r.name[lang], Math.max(5, Math.floor(r.w / (fs * 0.6)))).forEach((t) => lines.push({ t, mono: false, fs }))
  const total = lines.reduce((s, l) => s + l.fs * 1.25, 0)
  let y = r.y + r.h / 2 - total / 2
  const stroke = state === "dest" ? ROUTE : state === "from" ? "var(--verified)" : EDGE[r.type]
  return (
    <g role="button" tabIndex={0} aria-label={r.code ? `${r.code} ${r.name[lang]}` : r.name[lang]} className="cursor-pointer outline-none [&:focus-visible>*:first-child]:stroke-[3]"
      onClick={() => onPick(r)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(r) } }}>
      {r.poly ? (
        <polygon points={r.poly.map((p) => p.join(",")).join(" ")} fill={FILL[r.type]} stroke={stroke} strokeWidth={state ? 3.2 : 1.2} strokeLinejoin="round" />
      ) : (
        <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={2} fill={FILL[r.type]} stroke={stroke} strokeWidth={state ? 3.2 : 1.2} />
      )}
      {lines.map((l, i) => {
        y += l.fs * 1.25
        return (
          <text key={i} x={r.x + r.w / 2} y={y - l.fs * 0.28} textAnchor="middle" fill={INK} opacity={l.mono && r.inferred ? 0.72 : 1}
            style={{ fontSize: l.fs, fontWeight: l.mono ? 600 : 500, fontFamily: l.mono ? "var(--font-mono)" : undefined }} pointerEvents="none">
            {l.t}
          </text>
        )
      })}
    </g>
  )
}

function FloorPlan({ view, result, others, picked, onPick, lang }: { view: View; result: Route | null; others: Route[]; picked: Room | null; onPick: (r: Room) => void; lang: "ar" | "en" }) {
  const { t } = useI18n()
  const [zoom, setZoom] = React.useState(1)
  const box = React.useRef<HTMLDivElement>(null)
  const svgRef = React.useRef<SVGSVGElement>(null)
  const { space, f } = view
  const vb = VIEWBOX[space]
  const at = <T extends { space: Space; f: number }>(xs: T[]) => xs.filter((x) => x.space === space && x.f === f)
  const pts = result ? result.points : []
  // bring the walk on this floor into view
  React.useEffect(() => {
    const here = (result?.points ?? []).filter((n) => n.space === space && n.f === f)
    const el = box.current, svg = svgRef.current
    if (!el || !svg || !here.length) return
    const [x0, y0, w] = VIEWBOX[space], s = svg.clientWidth / w
    const ys = here.map((n) => n.y - y0), xs = here.map((n) => n.x - x0)
    el.scrollTo({ top: ((Math.min(...ys) + Math.max(...ys)) / 2) * s - el.clientHeight / 2, left: zoom > 1 ? ((Math.min(...xs) + Math.max(...xs)) / 2) * s - el.clientWidth / 2 : 0 })
  }, [result, space, f, zoom])

  const runs: Pt[][] = []
  let run: Pt[] = []
  for (const n of pts) {
    if (n.space === space && n.f === f) run.push([n.x, n.y])
    else if (run.length) { runs.push(run); run = [] }
  }
  if (run.length) runs.push(run)
  // a badge where the walk leaves this view: up/down a floor, or out of the building
  const exits: { at: Pt; text: string }[] = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    if (a.space !== space || a.f !== f || (b.space === space && b.f === f)) continue
    // several floors in one go: badge the floor the stairs end on
    let j = i
    while (j + 1 < pts.length && pts[j + 1].space === pts[j].space && pts[j + 1].f !== pts[j].f) j++
    const nb = pts[j], bld = BUILDINGS.find((x) => x.space === nb.space)!
    const text = nb.space === space ? `${nb.f > f ? "↑" : "↓"} ${bld.floors[nb.f][lang]}` : `→ ${bld.name[lang]}`
    exits.push({ at: [a.x, a.y], text })
  }
  const first = pts[0], last = pts[pts.length - 1]
  const destRoom = result?.to.kind === "room" ? result.to.room : null
  const fromRoom = result?.from.kind === "room" ? result.from.room : null
  const stairSize = space === "prog" ? 30 : 22

  return (
    <div className="relative">
      <div className="absolute top-2 end-2 z-10 flex gap-1">
        <Button size="icon-sm" variant="outline" aria-label={t("mapZoomOut")} disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}><Minus className="size-4" aria-hidden /></Button>
        <Button size="icon-sm" variant="outline" aria-label={t("mapZoomIn")} disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))}><Plus className="size-4" aria-hidden /></Button>
      </div>
      {/* ltr: the drawing has fixed sides (north up), and it keeps scrollLeft positive in Arabic too */}
      <div ref={box} dir="ltr" className="max-h-[70dvh] overflow-auto rounded-xl border bg-card">
        <svg ref={svgRef} viewBox={vb.join(" ")} style={{ width: `${zoom * 100}%`, display: "block" }} role="img" aria-label={`${BUILDINGS.find((b) => b.space === space)!.name[lang]} · ${BUILDINGS.find((b) => b.space === space)!.floors[f][lang]}`}>
          {at(outlines).map((o, i) => (
            <g key={i}>
              <rect x={o.x} y={o.y} width={o.w} height={o.h} rx={4} fill={mix("var(--muted)", 55)} stroke="var(--border)" strokeWidth={1.2} />
              {o.label && <text x={o.lx} y={o.ly} textAnchor="middle" fill={MUTED} style={{ fontSize: 12 * TEXT[space], fontWeight: 600 }}>{o.label[lang]}</text>}
            </g>
          ))}
          {at(corridors).map((c, i) => {
            const p = c.pts.map((q) => q.join(",")).join(" ")
            return (
              <g key={i}>
                <polyline points={p} fill="none" stroke={CORRIDOR} strokeWidth={c.width ?? 22} strokeLinecap="square" strokeLinejoin="miter"><title>{c.name[lang]}</title></polyline>
                {c.guess && <polyline points={p} fill="none" stroke={MUTED} strokeWidth={1.5} strokeDasharray="6 5" opacity={0.6} />}
              </g>
            )
          })}
          {at(stepMarks).map((s, i) => (
            <g key={i} transform={`translate(${s.at[0]} ${s.at[1]})`} stroke={MUTED} strokeWidth={1.2}>
              <path d="M-7-8h14M-7-3h14M-7 2h14M-7 7h14" />
            </g>
          ))}
          {at(labels).map((l, i) => <text key={i} x={l.x} y={l.y} textAnchor="middle" fill={MUTED} style={{ fontSize: (l.size ?? 11) * TEXT[space], fontWeight: 500 }}>{l.t[lang]}</text>)}
          {at(rooms).map((r) => (
            <RoomShape key={r.id} r={r} lang={lang} onPick={onPick} state={destRoom?.id === r.id || picked?.id === r.id ? "dest" : fromRoom?.id === r.id ? "from" : ""} />
          ))}
          {risers.filter((r) => r.space === space && r.at[f]).map((r) => {
            const [x, y] = r.at[f]
            if (r.kind === "lift")
              return (
                <g key={r.id}>
                  <rect x={x - 30} y={y - 50} width={60} height={50} rx={3} fill={INK} />
                  <text x={x} y={y - 21} textAnchor="middle" fill="var(--background)" style={{ fontSize: 12, fontWeight: 600 }}>{t("mapKeyLift")}</text>
                </g>
              )
            const h = stairSize / 2
            return (
              <g key={r.id} transform={`translate(${x} ${y})`}>
                <title>{r.name[lang]}</title>
                <rect x={-h} y={-h} width={stairSize} height={stairSize} rx={2} fill="var(--card)" stroke={INK} strokeWidth={1.6} />
                <path d={`M${-h / 2} ${-h}v${stairSize}M0 ${-h}v${stairSize}M${h / 2} ${-h}v${stairSize}`} stroke={INK} strokeWidth={1.3} />
              </g>
            )
          })}
          {at(entrances).filter((e) => !e.hidden || space === "campus").map((e) => {
            const guess = e.space === "gen"
            return (
              <g key={e.id}>
                <circle cx={e.at[0]} cy={e.at[1]} r={9} fill="var(--card)" stroke="var(--warning)" strokeWidth={1.8} strokeDasharray={guess ? "3 2" : undefined} />
                <text x={e.label[0]} y={e.label[1]} textAnchor="middle" fill="var(--warning)" style={{ fontSize: 10.5 * TEXT[space], fontWeight: 600 }}>{e.short[lang]}</text>
              </g>
            )
          })}
          {(space === "gen" || space === "campus") && (
            <g transform={`translate(${space === "gen" ? 960 : 980} 70)`}>
              <path d="M0-30l10 26H-10z" fill={INK} />
              <text y={12} textAnchor="middle" fill={INK} style={{ fontSize: 12, fontWeight: 700 }}>{lang === "ar" ? "ش" : "N"}</text>
            </g>
          )}
          {/* the other ways between the buildings, faint, so the student sees where else to go */}
          {space === "campus" && others.map((o) => (
            <polyline key={o.way} points={o.points.filter((n) => n.space === "campus").map((n) => `${n.x},${n.y}`).join(" ")} fill="none" stroke={MUTED} strokeOpacity={0.55} strokeWidth={4} strokeDasharray="8 7" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {runs.map((r, i) => {
            const p = r.map((q) => q.join(",")).join(" ")
            return (
              <g key={i} fill="none" strokeLinecap="round" strokeLinejoin="round">
                <polyline points={p} stroke={ROUTE} strokeOpacity={0.22} strokeWidth={16} />
                <polyline points={p} stroke={ROUTE} strokeWidth={5} strokeDasharray="1 11" className="motion-safe:animate-[masari-map-flow_1s_linear_infinite]" />
              </g>
            )
          })}
          {exits.map((x, i) => {
            const w = x.text.length * 6.4 + 18
            return (
              <g key={i} transform={`translate(${x.at[0] + 16} ${x.at[1] - 28})`}>
                <rect width={w} height={20} rx={10} fill={ROUTE} />
                <text x={w / 2} y={14} textAnchor="middle" fill="white" style={{ fontSize: 11, fontWeight: 600 }}>{x.text}</text>
              </g>
            )
          })}
          {first && first.space === space && first.f === f && <circle cx={first.x} cy={first.y} r={8} fill="var(--verified)" stroke="var(--card)" strokeWidth={3} />}
          {last && last.space === space && last.f === f && (
            <g transform={`translate(${last.x} ${last.y})`}>
              <path d="M0 0c-6-8-11-12-11-18a11 11 0 0 1 22 0c0 6-5 10-11 18z" fill={ROUTE} stroke="var(--card)" strokeWidth={2.5} />
              <circle cy={-18} r={4} fill="var(--card)" />
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}

function Legend() {
  const { t } = useI18n()
  const item = (fill: string, edge: string, label: string, dashed = false) => (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("h-3 w-4 rounded-[3px] border-[1.5px]", dashed && "border-dashed")} style={{ background: fill, borderColor: edge }} />
      {label}
    </span>
  )
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {item(FILL.hall, EDGE.hall, t("mapKeyHall"))}
      {item(FILL.lab, EDGE.lab, t("mapKeyLab"))}
      {item(FILL.adm, EDGE.adm, t("mapKeyAdmin"))}
      {item(FILL.svc, EDGE.svc, t("mapKeyService"))}
      {item("var(--card)", INK, t("mapKeyStairs"))}
      {item(INK, INK, t("mapKeyLift"))}
      {item("var(--card)", "var(--warning)", t("mapKeyGuess"), true)}
    </div>
  )
}
