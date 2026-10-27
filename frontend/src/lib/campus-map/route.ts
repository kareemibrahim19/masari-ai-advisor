/**
 * Walking routes over the campus map: every corridor is cut at each door, stair and junction into a graph,
 * the shortest walk is found with Dijkstra, and the walk is turned into turn-by-turn directions in both languages.
 */
import type { L } from "@/lib/i18n"
import { BUILDINGS, corridors, entrances, portals, risers, rooms, type Corridor, type Entrance, type Pt, type Riser, type Room, type Space } from "./data"

type Edge =
  | { kind: "corr"; c: Corridor }
  | { kind: "door" }
  | { kind: "riser"; r: Riser }
  | { kind: "portal"; say: L; way?: string }
type Node = { k: string; space: Space; f: number; x: number; y: number }
type Arc = { to: string; w: number; e: Edge }

export type Place =
  | { kind: "room"; id: string; space: Space; f: number; key: string; room: Room; label: L }
  | { kind: "entrance"; id: string; space: Space; f: number; key: string; ent: Entrance; label: L }

const nodes = new Map<string, Node>()
const adj = new Map<string, Arc[]>()
const keyOf = (space: Space, f: number, [x, y]: Pt) => `${space}${f}:${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`
function node(space: Space, f: number, p: Pt) {
  const k = keyOf(space, f, p)
  if (!nodes.has(k)) {
    nodes.set(k, { k, space, f, x: p[0], y: p[1] })
    adj.set(k, [])
  }
  return k
}
function link(a: string, b: string, w: number, e: Edge, back: Edge = e) {
  if (a === b) return
  adj.get(a)!.push({ to: b, w, e })
  adj.get(b)!.push({ to: a, w, e: back })
}
const dist = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1])
function project(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0
  const q: Pt = [a[0] + t * dx, a[1] + t * dy]
  return { t, q, d: dist(p, q) }
}

// ------------------------------------------------------------------------------------------------ building the graph

// The campus drawing is about half the scale of the عام drawing, so its distances count double; that keeps
// "out through the south entrance" and "out through the main gate" comparable.
const SCALE: Record<Space, number> = { gen: 1, prog: 1, campus: 2 }
const roomKey: Record<string, string> = {}
const entKey: Record<string, string> = {}
const riserKey: Record<string, Record<number, string>> = {}

for (const b of BUILDINGS) {
  b.floors.forEach((_, f) => {
    const cs = corridors.filter((c) => c.space === b.space && c.f === f)
    const segs = cs.flatMap((c) => c.pts.slice(1).map((end, i) => ({ a: c.pts[i], b: end, c })))
    const marks = segs.map((s) => [{ t: 0, q: s.a }, { t: 1, q: s.b }])
    // a corridor that ends on another one joins it there
    for (const c of cs)
      for (const p of [c.pts[0], c.pts[c.pts.length - 1]])
        segs.forEach((s, i) => {
          const r = project(p, s.a, s.b)
          if (r.d < 0.5) marks[i].push(r)
        })
    const items: { kind: "room" | "entrance" | "riser"; id: string; p: Pt; q?: Pt }[] = [
      ...rooms.filter((r) => r.space === b.space && r.f === f).map((r) => ({ kind: "room" as const, id: r.id, p: r.door })),
      ...entrances.filter((e) => e.space === b.space && e.f === f).map((e) => ({ kind: "entrance" as const, id: e.id, p: e.at })),
      ...risers.filter((r) => r.space === b.space && r.at[f]).map((r) => ({ kind: "riser" as const, id: r.id, p: r.at[f] })),
    ]
    // each door, entrance and stair joins the nearest corridor at its closest point
    for (const it of items) {
      let bi = -1, br: ReturnType<typeof project> | null = null
      for (let i = 0; i < segs.length; i++) {
        const r = project(it.p, segs[i].a, segs[i].b)
        if (!br || r.d < br.d - 1e-6) { bi = i; br = r }
      }
      if (!br) continue
      marks[bi].push(br)
      it.q = br.q
    }
    segs.forEach((s, i) => {
      const m = marks[i].sort((u, v) => u.t - v.t)
      for (let j = 1; j < m.length; j++) link(node(b.space, f, m[j - 1].q), node(b.space, f, m[j].q), dist(m[j - 1].q, m[j].q) * SCALE[b.space], { kind: "corr", c: s.c })
    })
    for (const it of items) {
      if (!it.q) continue
      const k = node(b.space, f, it.p)
      link(k, node(b.space, f, it.q), dist(it.p, it.q) * SCALE[b.space], { kind: "door" })
      if (it.kind === "room") roomKey[it.id] = k
      else if (it.kind === "entrance") entKey[it.id] = k
      else (riserKey[it.id] ??= {})[f] = k
    }
  })
}
for (const p of portals) {
  const way = p.way?.id
  link(entKey[p.a], entKey[p.b], p.w, { kind: "portal", say: p.say, way }, { kind: "portal", say: p.sayBack, way })
}
/** The ways between the two buildings (by the workshops, through Block 6, round by the main entrance). */
export const WAYS = portals.flatMap((p) => (p.way ? [p.way] : [])).filter((w, i, all) => all.findIndex((x) => x.id === w.id) === i)
// a riser joins itself floor to floor; its cost is set per walk in shortest()
for (const r of risers) {
  const fl = Object.keys(r.at).map(Number).sort((a, b) => a - b)
  for (let i = 1; i < fl.length; i++) link(riserKey[r.id][fl[i - 1]], riserKey[r.id][fl[i]], 0, { kind: "riser", r })
}

const RISER_COST = { stairs: 45, lift: 30 }

/** Shortest walk between two graph nodes; the lift only when `lift` is on, and only along `way` between the buildings when given. */
function shortest(from: string, to: string, lift: boolean, way?: string) {
  const d = new Map<string, number>([[from, 0]])
  const prev = new Map<string, { k: string; e: Edge }>()
  const done = new Set<string>()
  for (;;) {
    let u: string | null = null, best = Infinity
    for (const [k, v] of d) if (!done.has(k) && v < best) { best = v; u = k }
    if (u === null) return null
    if (u === to) break
    done.add(u)
    for (const a of adj.get(u)!) {
      // stairs and the lift link the same riser on two floors; only the cost differs
      let w = a.w
      if (way && a.e.kind === "portal" && a.e.way && a.e.way !== way) continue
      if (a.e.kind === "riser") {
        const nf = nodes.get(a.to)!.f, uf = nodes.get(u)!.f
        if (a.e.r.kind === "lift" && !lift) continue
        w = RISER_COST[a.e.r.kind] * Math.abs(nf - uf)
      }
      const nd = best + w
      if (nd < (d.get(a.to) ?? Infinity)) {
        d.set(a.to, nd)
        prev.set(a.to, { k: u, e: a.e })
      }
    }
  }
  const length = d.get(to)!
  const path: { k: string; e?: Edge }[] = [{ k: to }]
  for (let k = to; prev.has(k); k = prev.get(k)!.k) {
    path[0].e = prev.get(k)!.e
    path.unshift({ k: prev.get(k)!.k })
  }
  return { path, length }
}

// ------------------------------------------------------------------------------------------------ places and search

const floorName = (space: Space, f: number) => BUILDINGS.find((b) => b.space === space)!.floors[f]
const bldName = (space: Space) => BUILDINGS.find((b) => b.space === space)!.name

function roomLabel(r: Room): L {
  const where = (lang: "ar" | "en") => `${r.bld[lang]} · ${floorName(r.space, r.f)[lang]}`
  if (r.code) return { ar: `${r.code} · ${r.name.ar} · ${where("ar")}`, en: `${r.code} · ${r.name.en} · ${where("en")}` }
  return { ar: `${r.name.ar} · ${where("ar")}`, en: `${r.name.en} · ${where("en")}` }
}
export const places: Place[] = [
  ...entrances.filter((e) => !e.hidden).map((e) => ({ kind: "entrance" as const, id: e.id, space: e.space, f: e.f, key: entKey[e.id], ent: e, label: e.name })),
  ...rooms.map((r) => ({ kind: "room" as const, id: r.id, space: r.space, f: r.f, key: roomKey[r.id], room: r, label: roomLabel(r) })),
]
// two rooms with the same name and no number (two toilets on a floor) get a counter, so each label picks one place
{
  const seen: Record<string, number> = {}
  for (const p of places) {
    const n = (seen[p.label.ar] = (seen[p.label.ar] ?? 0) + 1)
    if (n > 1) p.label = { ar: `${p.label.ar} (${n})`, en: `${p.label.en} (${n})` }
  }
}

/** What a student would call a room: its number with the type ("مدرج B2012"), or its name. */
export function placeName(p: Place): L {
  if (p.kind === "entrance") return p.ent.name
  const r = p.room
  if (!r.code) return r.name
  const generic = ["مدرج", "قاعة", "مكتب"].includes(r.name.ar)
  return generic ? { ar: `${r.name.ar} ${r.code}`, en: `${r.name.en} ${r.code}` } : { ar: `${r.code} (${r.name.ar})`, en: `${r.code} (${r.name.en})` }
}

const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
/** The room whose number matches a timetable entry: "2012" or "B2012" (عام), "308" or "H308" (البرامج), "23A", "Hall 13". */
export function findRoomByCode(text: string): Place | null {
  const s = digits(text).replace(/\s+/g, "").toUpperCase()
  const want = /^\d{4}$/.test(s) ? `B${s}` : /^\d{3}$/.test(s) ? `H${s}` : s.replace(/^(HALL|هول|قاعة)/, "HALL")
  return places.find((p) => p.kind === "room" && p.room.code && p.room.code.replace(/\s+/g, "").toUpperCase() === want) ?? null
}
/** A timetable room: its number, or for a lab without one, its Arabic name when only one room has it. */
export function findTimetableRoom(text: string): Place | null {
  const byCode = findRoomByCode(text)
  if (byCode) return byCode
  const named = places.filter((p) => p.kind === "room" && p.room.name.ar === text.trim())
  return named.length === 1 ? named[0] : null
}
/** A place from a picker entry or free typing, optionally limited to one building. */
export function findPlace(text: string, space?: Space): Place | null {
  const s = text.trim()
  if (!s) return null
  const pool = space ? places.filter((p) => p.space === space) : places
  const exact = pool.find((p) => p.label.ar === s || p.label.en === s)
  if (exact) return exact
  const byCode = findRoomByCode(s)
  if (byCode && (!space || byCode.space === space)) return byCode
  const low = s.toLowerCase()
  return pool.find((p) => p.label.ar.startsWith(s) || p.label.en.toLowerCase().startsWith(low)) ?? pool.find((p) => p.label.ar.includes(s) || p.label.en.toLowerCase().includes(low)) ?? null
}
export const placeById = (id: string) => places.find((p) => p.id === id) ?? null

// ------------------------------------------------------------------------------------------------ directions

export type Step = { space: Space; f: number; text: L; climb?: boolean }
export type Route = { from: Place; to: Place; points: Node[]; steps: Step[]; flights: number; views: { space: Space; f: number }[]; length: number; way?: string }

type Turn = "straight" | "back" | "right" | "left"
function turn(d1: Pt, d2: Pt): Turn {
  const a = (Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]) * 180) / Math.PI
  if (Math.abs(a) < 35) return "straight"
  if (Math.abs(a) > 150) return "back"
  return a > 0 ? "right" : "left" // screen y points down, so a positive cross product is a right turn
}
const TURN: Record<Turn, L> = { straight: { ar: "امشي على طول", en: "walk straight" }, back: { ar: "لف وارجع", en: "turn back" }, right: { ar: "لف يمين", en: "turn right" }, left: { ar: "لف شمال", en: "turn left" } }
const SIDE: Record<"right" | "left", L> = { right: { ar: "اليمين", en: "right" }, left: { ar: "الشمال", en: "left" } }
const both = (fn: (lang: "ar" | "en") => string): L => ({ ar: fn("ar"), en: fn("en") })
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "go down" or "go up" when the corridor is short steps, by which way it is walked. */
function slope(c: Corridor, dir: Pt): L | null {
  if (!c.down) return null
  return c.down[0] * dir[0] + c.down[1] * dir[1] > 0 ? { ar: "انزل", en: "go down" } : { ar: "اطلع", en: "go up" }
}

/** `way`: go between the buildings only that way (an id from WAYS). */
export function route(from: Place, to: Place, opts: { lift: boolean; way?: string }): Route | null {
  const found = shortest(from.key, to.key, opts.lift, opts.way)
  if (!found) return null
  const { path, length } = found
  const P = path.map((p) => nodes.get(p.k)!)
  const moves = P.slice(1).map((b, i) => ({ e: path[i + 1].e!, a: P[i], b, dir: [b.x - P[i].x, b.y - P[i].y] as Pt, len: dist([P[i].x, P[i].y], [b.x, b.y]) }))
  const steps: Step[] = []
  let dir: Pt | null = null, cur: Corridor | null = null, fresh: "start" | "riser" | "portal" = "start", lastRiser: Riser | null = null
  let i = 0
  while (i < moves.length) {
    const m = moves[i]
    const at = { space: m.a.space, f: m.a.f }
    if (m.e.kind === "riser") {
      let j = i
      while (j + 1 < moves.length && moves[j + 1].e.kind === "riser") j++
      const toF = moves[j].b.f, up = toF > m.a.f, r = m.e.r, fl = floorName(m.a.space, toF)
      steps.push({
        space: m.a.space, f: toF, climb: true,
        text: r.kind === "lift"
          ? both((g) => (g === "ar" ? `اركب ${r.name.ar} لحد الدور ${fl.ar}` : `Take ${r.name.en} to the ${fl.en.toLowerCase()}`))
          : both((g) => (g === "ar" ? `${up ? "اطلع" : "انزل"} على ${r.name.ar} لحد الدور ${fl.ar}` : `Take ${r.name.en} ${up ? "up" : "down"} to the ${fl.en.toLowerCase()}`)),
      })
      lastRiser = r; fresh = "riser"; dir = null; cur = null; i = j + 1
      continue
    }
    if (m.e.kind === "portal") {
      steps.push({ space: m.b.space, f: m.b.f, text: m.e.say })
      fresh = "portal"; dir = null; cur = null; i++
      continue
    }
    if (m.e.kind === "door") {
      if (fresh === "start" && !cur) { if (m.len >= 0.5) dir = m.dir }
      else if (i === moves.length - 1) {
        // a door at the very end of a passage has no sideways offset: it is straight ahead
        const side = dir && m.len >= 0.5 ? turn(dir, m.dir) : "straight", name = placeName(to)
        steps.push({
          ...at,
          text: side === "right" || side === "left"
            ? both((g) => (g === "ar" ? `${name.ar} هتبقى على إيدك ${SIDE[side].ar}` : `${name.en} is on your ${SIDE[side].en}`))
            : both((g) => (g === "ar" ? `${name.ar} هتبقى قدامك` : `${name.en} is straight ahead`)),
        })
      }
      i++
      continue
    }
    if (m.len < 0.5) { i++; continue }
    const c = m.e.c, verb = slope(c, m.dir)
    if (!cur) {
      if (fresh === "start") {
        const t = dir ? turn(dir, m.dir) : "straight", how = t === "back" ? TURN.straight : TURN[t]
        const name = placeName(from)
        steps.push({
          ...at,
          text: both((g) => {
            const go = verb ? (t === "straight" || t === "back" ? `${verb[g]} ${c.name[g]}` : `${how[g]} ${g === "ar" ? "و" : "and "}${verb[g]} ${c.name[g]}`) : `${how[g]} ${g === "ar" ? "في" : "along"} ${c.name[g]}`
            return from.kind === "entrance"
              ? g === "ar" ? `ادخل من ${name.ar} و${go}` : `Enter through ${name.en} and ${go}`
              : g === "ar" ? `اطلع من باب ${name.ar} و${go}` : `Leave ${name.en} and ${go}`
          }),
        })
      } else if (fresh === "riser") {
        steps.push({ ...at, text: both((g) => (g === "ar" ? `من ${lastRiser?.kind === "lift" ? "الأسانسير" : "السلم"} امشي في ${c.name.ar}` : `From the ${lastRiser?.kind === "lift" ? "lift" : "stairs"}, walk along ${c.name.en}`)) })
      } else {
        steps.push({ ...at, text: both((g) => (verb ? cap(`${verb[g]} ${c.name[g]}`) : g === "ar" ? `امشي في ${c.name.ar}` : `Walk along ${c.name.en}`)) })
      }
    } else {
      const t = turn(dir!, m.dir)
      if (c.id !== cur.id) {
        steps.push({
          ...at,
          text: both((g) => {
            if (verb) return t === "straight" ? cap(`${verb[g]} ${c.name[g]}`) : g === "ar" ? `${TURN[t].ar} و${verb.ar} ${c.name.ar}` : `${cap(TURN[t].en)} and ${verb.en} ${c.name.en}`
            if (t === "straight") return g === "ar" ? `كمّل على طول لحد ما تدخل ${c.name.ar}` : `Keep straight into ${c.name.en}`
            return g === "ar" ? `${TURN[t].ar} في ${c.name.ar}` : `${cap(TURN[t].en)} into ${c.name.en}`
          }),
        })
      } else if (t !== "straight") {
        steps.push({ ...at, text: both((g) => (g === "ar" ? `${TURN[t].ar} وكمّل في ${c.name.ar}` : `${cap(TURN[t].en)}, staying in ${c.name.en}`)) })
      }
    }
    cur = c; dir = m.dir; i++
  }
  // a door drawn right at a passage's end is the passage's last point, so no door step was walked
  const last = P[P.length - 1]
  if (moves[moves.length - 1]?.e.kind !== "door") {
    const name = placeName(to)
    steps.push({ space: last.space, f: last.f, text: both((g) => (g === "ar" ? `${name.ar} هتبقى قدامك` : `${name.en} is straight ahead`)) })
  }
  const views: { space: Space; f: number }[] = []
  for (const n of P) if (!views.some((v) => v.space === n.space && v.f === n.f)) views.push({ space: n.space, f: n.f })
  const flights = path.reduce((s, p, j) => (p.e?.kind === "riser" ? s + Math.abs(P[j].f - P[j - 1].f) : s), 0)
  const way = path.find((p) => p.e?.kind === "portal" && p.e.way)?.e
  return { from, to, points: P, steps, flights, views, length, way: way?.kind === "portal" ? way.way : undefined }
}

export { bldName, floorName }
