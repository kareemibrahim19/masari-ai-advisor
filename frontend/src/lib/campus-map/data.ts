/**
 * Campus map data: the general engineering building ("عام"), the Programs building ("البرامج") and the
 * outdoor path between them. Schematic, not to scale: it keeps the order of rooms, corridors and stairs.
 *
 * Sources: the faculty's 2017 floor plans for "عام" (engfac.mans.edu.eg, "Faculty maps"), and floor
 * sketches the team drew by hand for "البرامج" and for the path between the two buildings.
 * Anything marked `inferred` or `guess` was worked out from the drawings and still needs checking on site.
 */
import type { L } from "@/lib/i18n"

export type Space = "gen" | "prog" | "campus"
export type Pt = [number, number]
export type RoomType = "hall" | "lab" | "adm" | "svc" | "off"

export type Room = {
  id: string
  space: Space
  f: number
  name: L
  /** Room number as students see it on the timetable, e.g. "B2012" or "H308". */
  code?: string
  /** The number follows the building's numbering scheme but isn't written on the source drawing. */
  inferred?: boolean
  type: RoomType
  x: number
  y: number
  w: number
  h: number
  door: Pt
  bld: L
  dept?: L
  /** Outline for a room that isn't a plain rectangle (an L); x/y/w/h then mark the part that holds its label. */
  poly?: Pt[]
}
export type Corridor = {
  space: Space
  f: number
  id: string
  name: L
  pts: Pt[]
  width?: number
  /** Worked out from the drawings, not drawn on them; shown dashed. */
  guess?: boolean
  /** Short steps along this corridor: walking in this direction goes down, the other way goes up. */
  down?: Pt
}
/** Stairs or a lift; each floor it serves can sit at its own point on the drawing. */
export type Riser = { id: string; space: Space; kind: "stairs" | "lift"; name: L; at: Record<number, Pt> }
export type Entrance = { id: string; space: Space; f: number; name: L; short: L; at: Pt; label: Pt; hidden?: boolean }
/**
 * Walking out of one drawing into another (a building door onto the outdoor path). A door of "عام" that starts one
 * of the ways to the Programs building names that way in `way`; the two doors by the workshops share one way.
 */
export type Portal = { a: string; b: string; w: number; say: L; sayBack: L; way?: { id: string; name: L } }
export type Outline = { space: Space; f: number; x: number; y: number; w: number; h: number; label?: L; lx?: number; ly?: number }
export type Label = { space: Space; f: number; x: number; y: number; t: L; size?: number }
export type View = { space: Space; f: number; name: L; viewBox: [number, number, number, number] }

const l = (ar: string, en?: string): L => ({ ar, en: en ?? ar })

export const rooms: Room[] = []
export const corridors: Corridor[] = []
export const risers: Riser[] = []
export const entrances: Entrance[] = []
export const outlines: Outline[] = []
export const labels: Label[] = []
/** Little hatched step marks drawn on short steps. */
export const steps: { space: Space; f: number; at: Pt }[] = []

const GENERIC: Record<string, string> = {
  مدرج: "Lecture hall",
  قاعة: "Room",
  مكتب: "Office",
  "دورة مياه": "Toilets",
  "دورة مياه رجالي": "Men's toilets",
  "دورة مياه حريمي": "Women's toilets",
  غرفة: "Room",
  مسجد: "Prayer room",
}
const nm = (ar: string): L => l(ar, GENERIC[ar])

function typeOf(n: string): RoomType {
  if (/^(مدرج|قاعة|صال)|^Hall/.test(n)) return "hall"
  if (/معمل|Lab|ICDL|HEEPF|ورشة/i.test(n)) return "lab"
  if (/مياه|مخزن|مخازن|مسجد|مجلس|بوفيه/.test(n)) return "svc"
  if (n === "مكتب") return "off"
  return "adm"
}

type Extra = Partial<Pick<Room, "code" | "inferred" | "dept" | "type" | "poly">>
let nextId = 0
function addRoom(r: Omit<Room, "id" | "type"> & Extra) {
  rooms.push({ type: typeOf(r.name.ar), ...r, id: `${r.space}${nextId++}` })
}
/** Cuts a rectangle into equal rooms along x ("h") or y ("v"); each door sits on the side facing the corridor. */
function split(
  space: Space, f: number, bld: L, box: [number, number, number, number],
  names: (string | [string, Extra])[], door: "top" | "bottom" | "left" | "right", dir: "h" | "v",
) {
  const [x1, y1, x2, y2] = box
  const n = names.length
  names.forEach((entry, i) => {
    const [name, extra] = typeof entry === "string" ? [entry, {}] : entry
    let x = x1, y = y1, w = x2 - x1, h = y2 - y1
    if (dir === "h") { w /= n; x = x1 + i * w } else { h /= n; y = y1 + i * h }
    const d: Record<typeof door, Pt> = { top: [x + w / 2, y], bottom: [x + w / 2, y + h], left: [x, y + h / 2], right: [x + w, y + h / 2] }
    addRoom({ space, f, bld, name: nm(name), x, y, w, h, door: d[door], ...extra })
  })
}
/** One room with its own box. */
function room(space: Space, f: number, bld: L, box: [number, number, number, number], name: string, door: "top" | "bottom" | "left" | "right", extra: Extra = {}) {
  split(space, f, bld, box, [[name, extra]], door, "h")
}
const corr = (space: Space, f: number, id: string, name: L, pts: Pt[], opt: Partial<Corridor> = {}) =>
  corridors.push({ space, f, id, name, pts, ...opt })

// ================================================================================================ عام (general building)

export const GEN_FLOORS = [l("الأرضي", "Ground floor"), l("الأول", "First floor"), l("الثاني", "Second floor"), l("الثالث", "Third floor")]
const T = [440, 595, 750, 905, 1060, 1215] // top edge of each block's rooms
const DEPT_LOW = [l("حاسبات وتحكم", "Computers & Control"), l("كهرباء", "Electrical"), l("إلكترونيات واتصالات", "Electronics & Comms"), l("مدني", "Civil"), l("عمارة وإنتاج", "Architecture & Production"), l("ميكانيكا", "Mechanical")]
const DEPT_HIGH = [l("علوم طبيعية – حاسبات وتحكم", "Physics & Maths – Computers & Control"), l("كهرباء – ري وهيدروليكا", "Electrical – Irrigation & Hydraulics"), l("إلكترونيات واتصالات – نسيج", "Electronics & Comms – Textiles"), DEPT_LOW[3], l("عمارة – إنتاج", "Architecture – Production"), DEPT_LOW[5]]
const dept = (f: number, b: number) => (f < 2 ? DEPT_LOW : DEPT_HIGH)[b - 1]
// Only these numbers are written on the faculty plans; the rest follow B + block + floor + room.
const PRINTED = new Set("B1011 B1012 B2012 B2013 B2014 B3012 B3013 B4012 B4013 B4014 B5012 B5013 B5014 B6012 B6014 B6015 B2211 B2212 B2213 B2214 B2215 B2216 B2217 B2218 B2219 B2220".split(" "))

const ADMIN: Record<number, { w: string[]; t: string[]; e: string[]; b: string[] }> = {
  0: { w: ["أمين الكلية", "الدراسات العليا", "الشؤون القانونية", "الخزينة", "الأرشيف"], t: ["البحوث"],
       e: ["سنترال", "شؤون الخريجين", "رابطة الخريجين", "الشؤون العامة", "وحدة الشبكات", "دورة مياه"], b: ["شؤون الطلاب", "شؤون الدراسة والامتحانات"] },
  1: { w: ["وكيل الكلية لخدمة المجتمع", "وكيل الكلية للدراسات العليا", "وكيل الكلية لشؤون التعليم والطلاب", "سكرتارية الوكلاء"], t: ["مكتب العميد"],
       e: ["سكرتارية العميد", "وحدة نظم المعلومات", "دورة مياه"], b: ["قاعة الدكتور السعيد عبد الغني"] },
  2: { w: ["قاعة الاستقبال الأكاديمية", "مركز الخدمات الفنية والمعملية", "مكتب التصميم", "مركز البحوث والاستشارات الهندسية"], t: ["أمانة مجلس الكلية"],
       e: ["قاعة المجالس الأكاديمية", "وحدة ضمان الجودة", "دورة مياه"], b: ["القاعة الأكاديمية"] },
  3: { w: ["شؤون العاملين", "الاستحقاقات", "العلاقات الثقافية", "المجلة العلمية"], t: ["شؤون أعضاء هيئة التدريس"],
       e: ["الوحدة الحسابية", "مكاتب إدارية"], b: ["الحسابات الخاصة", "التوريدات"] },
}
const LAB1: Record<number, string[]> = {
  0: ["معمل الآلات الهيدروليكية", "معمل الري والهيدروليكا", "معمل اختبارات المواد الخرسانية", "معمل الآلات الكهربية", "معمل د. حسن أبوطالب"],
  1: ["معمل الري والهيدروليكا", "معمل الحاسبات المصغرة", "معمل الإلكترونيات الرقمية", "HP Lab", "معمل الإلكترونيات الصناعية", "معمل التحكم الآلي", "معمل المحاكاة الصناعية"],
  2: ["معمل الأساسيات الإلكترونية", "HEEPF", "معمل القياسات الإلكترونية", "معمل الاتصالات", "معمل الراديو والتليفزيون", "معمل الموجات", "معمل الإلكترونيات الطبية", "معمل البصريات", "معمل الصوتيات والسمعيات"],
}
const LAB2A: Record<number, string[]> = { 0: ["معمل التبريد والتكييف", "معمل اختبارات المواد الخرسانية 2"], 1: ["معمل حاسبات A", "معمل حاسبات B"], 2: ["معمل الهندسة المساحية"] }
const LAB2B: Record<number, string[]> = { 0: ["معمل الإنشاءات الثقيلة"], 1: ["قاعة البدراوي", "معمل اللغات A", "معمل اللغات B", "معمل الفيزياء"], 2: ["صالة رسم 1 و 2", "صالة رسم 3 و 4"] }
const CORNER: Record<number, string> = { 0: "مسجد", 1: "معمل البرمجيات", 2: "معمل الطاقة الشمسية" }
const WORK: Record<number, string[]> = {
  0: ["معمل تصميم التروس", "ورشة 1", "ورشة 2", "ورشة 3", "الأزمات والكوارث", "ورشة 4", "ورشة 5", "معمل المحاكاة"],
  1: ["الكنترول المركزي", "كنترول نسيج", "كنترول إعدادي", "قاعة الكنترول", "إدارة الورش الفنية", "مكتب التشغيل", "التوريدات", "ملحق النجارة", "معمل نسيج", "معمل المحاكاة"],
}
const EAST: Record<number, string[]> = {
  0: ["معمل الجهد العالي", "معمل الطرق", "المخازن", "معمل ديناميكا الغازات", "معمل ميكانيكا الموائع", "معمل الآلات الهيدروليكية 2", "المطبعة", "حرس الجامعة"],
  1: ["معمل الكيمياء", "معمل ضبط جودة المياه", "معمل التربة", "معمل الهندسة الصحية", "معمل الدوائر الكهربية", "معمل الحماية الكهربية", "معمل القياسات الكهربية", "معمل النظم", "إدارة المعامل", "وحدة الصيانة", "معمل التشغيل الكهروكيميائي", "معمل القياسات الدقيقة", "معمل اختبارات الخيوط"],
  2: ["نادي تكنولوجيا المعلومات", "معمل الفحص الميكروسكوبي", "معمل المجسمات المعمارية", "معمل الهندسة المعمارية", "معيدين عمارة", "صالات رسم", "المكتبة"],
}
const BLOCK0: Record<number, string[]> = {
  1: ["مدرج", "مدرج", "رعاية الشباب", "المخازن", "المعاملات", "مخازن الخامات"],
  2: ["قائد الحرس", "مدرج", "مدرج", "مدرج"],
  3: ["حجرة التصوير", "مدرج", "مدرج", "مخزن", "وحدة الصناعات الصغيرة"],
  4: ["العيادة الطبية", "مدرج", "مدرج", "مدرج"],
  5: ["غرفة إدارية", "مدرج", "مدرج", "مدرج", "معمل تصميم معدات الإنتاج"],
  6: ["البريد", "مدرج", "غرفة", "مدرج", "مدرج"],
}
const BLOCK_NAMED: Record<number, Record<string, string>> = {
  2: { "5-8": "معمل عمارة" },
  3: { "4-0": "معمل الدراسات العليا", "4-9": "معمل حاسبات مدني", "5-0": "معمل حاسبات إنتاج", "6-0": "معمل تطبيقات الحاسب", "6-1": "ICDL Lab 3", "6-2": "ICDL Lab 2", "6-3": "ICDL Lab 1" },
}
const ADMIN_BLD = l("المبنى الإداري", "Administration building")
const LABS_BLD = l("المعامل البحرية", "North labs")
const WORK_BLD = l("مبنى الورش", "Workshops building")
const EAST_BLD = l("المعامل الشرقية", "East labs")

for (let f = 0; f < 4; f++) {
  const S = "gen"
  outlines.push({ space: S, f, x: 30, y: 30, w: 280, h: 276, label: ADMIN_BLD, lx: 170, ly: 22 })
  const A = ADMIN[f]
  split(S, f, ADMIN_BLD, [40, 40, 112, 300], A.w, "right", "v")
  split(S, f, ADMIN_BLD, [140, 40, 215, 82], A.t, "bottom", "h")
  split(S, f, ADMIN_BLD, [228, 40, 300, 240], A.e, "left", "v")
  split(S, f, ADMIN_BLD, [140, 262, 300, 300], A.b, "top", "h")
  labels.push({ space: S, f, x: 172, y: 176, t: l("فناء", "Courtyard"), size: 10 })
  const admName = l("ممر المبنى الإداري", "the administration corridor")
  corr(S, f, "adm", admName, [[125, 95], [215, 95], [215, 250], [125, 250], [125, 95]], { width: 16 })
  corr(S, f, "adm", admName, [[170, 250], [170, 315]], { width: 16 })

  if (f < 3) {
    outlines.push({ space: S, f, x: 315, y: 222, w: 652, h: 84, label: LABS_BLD, lx: 640, ly: 214 })
    split(S, f, LABS_BLD, [320, 230, 960, 300], LAB1[f], "bottom", "h")
    split(S, f, LABS_BLD, [460, 330, 600, 400], LAB2A[f], "top", "h")
    split(S, f, LABS_BLD, [660, 330, f === 1 ? 840 : 800, 400], LAB2B[f], "top", "h")
    room(S, f, LABS_BLD, [300, 335, 410, 420], CORNER[f], "top")
    corr(S, f, "north", l("الممر الشمالي قدام المعامل البحرية", "the north corridor by the north labs"), [[40, 315], [960, 315]])
  } else {
    corr(S, f, "north", l("الممر الشمالي", "the north corridor"), [[40, 315], [436, 315]])
  }
  if (f < 2) {
    outlines.push({ space: S, f, x: 612, y: 410, w: 196, h: 900, label: l("مبنى الورش التكنولوجية", "Workshops building"), lx: 712, ly: 1328 })
    split(S, f, WORK_BLD, [645, 420, 800, 1300], WORK[f], "left", "v")
    corr(S, f, "ws", l("طرقة مبنى الورش", "the workshops corridor"), [[630, 315], [630, f === 0 ? 1395 : 1300]])
  }
  if (f < 3) {
    outlines.push({ space: S, f, x: 842, y: 330, w: 126, h: 980, label: EAST_BLD, lx: 905, ly: 1328 })
    split(S, f, EAST_BLD, [872, 340, 960, 1300], EAST[f], "left", "v")
    corr(S, f, "east", l("طرقة المعامل الشرقية", "the east labs corridor"), [[858, 315], [858, f === 0 ? 1395 : 1300]])
  }
  for (let b = 1; b <= 6; b++) {
    const top = T[b - 1], n = f === 0 ? BLOCK0[b].length : 10, w = (420 - 62) / n
    const bld = l(`بلوك ${b}`, `Block ${b}`)
    outlines.push({ space: S, f, x: 58, y: top - 6, w: 394, h: 96 })
    labels.push({ space: S, f, x: 240, y: top + 108, t: l(`بلوك ${b} · ${dept(f, b).ar}`, `Block ${b} · ${dept(f, b).en}`), size: 12 })
    for (let i = 0; i < n; i++) {
      const code = `B${b}${f}${11 + i}`
      const name = f === 0 ? BLOCK0[b][i] : (BLOCK_NAMED[f]?.[`${b}-${i}`] ?? (f === 1 ? "مكتب" : "قاعة"))
      const x = 62 + i * w
      addRoom({ space: S, f, bld, dept: dept(f, b), name: nm(name), code, inferred: !PRINTED.has(code), x, y: top, w, h: 62, door: [x + w / 2, top + 62] })
    }
    corr(S, f, `w${b}`, l(`طرقة بلوك ${b}`, `the Block ${b} corridor`), [[f === 0 ? 48 : 62, top + 73], [436, top + 73]])
  }
  corr(S, f, "spine", l("الممر الرئيسي", "the main corridor"), [[436, 315], [436, f === 0 ? 1395 : 1288]])
  if (f === 0) {
    corr(S, f, "west", l("الممر الغربي", "the west walkway"), [[48, 315], [48, 1395]], { guess: true })
    corr(S, f, "south", l("الممشى الجنوبي", "the south walkway"), [[48, 1395], [858, 1395]], { guess: true })
  }
  if (f === 3) {
    split(S, f, l("جنب الممر الرئيسي", "By the main corridor"), [452, 840, 540, 900], ["معيدين اتصالات", "معيدين نسيج"], "left", "v")
    room(S, f, l("جنب الممر الرئيسي", "By the main corridor"), [452, 1146, 540, 1204], "مركز ITC", "left")
  }
}

const allGen = (p: Pt) => ({ 0: p, 1: p, 2: p, 3: p })
const lowGen = (p: Pt) => ({ 0: p, 1: p, 2: p })
risers.push(
  { id: "a1", space: "gen", kind: "stairs", name: l("سلم المبنى الإداري", "the administration stairs"), at: allGen([125, 95]) },
  { id: "a2", space: "gen", kind: "stairs", name: l("سلم المبنى الإداري التاني", "the second administration stairs"), at: allGen([215, 250]) },
  { id: "n1", space: "gen", kind: "stairs", name: l("سلم المعامل البحرية الغربي", "the west north-labs stairs"), at: lowGen([335, 315]) },
  { id: "n2", space: "gen", kind: "stairs", name: l("سلم المعامل البحرية الشرقي", "the east north-labs stairs"), at: lowGen([948, 315]) },
  { id: "e1", space: "gen", kind: "stairs", name: l("سلم المعامل الشرقية", "the east labs stairs"), at: lowGen([858, 700]) },
  { id: "e2", space: "gen", kind: "stairs", name: l("سلم المعامل الشرقية التاني", "the second east labs stairs"), at: lowGen([858, 1130]) },
  { id: "k1", space: "gen", kind: "stairs", name: l("سلم مبنى الورش", "the workshops stairs"), at: { 0: [630, 450], 1: [630, 450] } },
  { id: "k2", space: "gen", kind: "stairs", name: l("سلم مبنى الورش (النص)", "the middle workshops stairs"), at: { 0: [630, 880], 1: [630, 880] } },
  { id: "k3", space: "gen", kind: "stairs", name: l("سلم مبنى الورش (الآخر)", "the far workshops stairs"), at: { 0: [630, 1290], 1: [630, 1290] } },
)
for (let b = 1; b <= 6; b++) {
  risers.push({ id: `b${b}w`, space: "gen", kind: "stairs", name: l(`سلم بلوك ${b}`, `the Block ${b} stairs`), at: allGen([76, T[b - 1] + 73]) })
  if (b % 2 === 0)
    risers.push({ id: `b${b}e`, space: "gen", kind: "stairs", name: l(`السلم اللي جنب بلوك ${b} على الممر الرئيسي`, `the stairs by Block ${b} on the main corridor`), at: allGen([464, T[b - 1] + 73]) })
}
entrances.push(
  { id: "E2", space: "gen", f: 0, name: l("المدخل الرئيسي لمبنى عام (بين بلوك 3 و 4)", "the main entrance (between Blocks 3 and 4)"), short: l("المدخل الرئيسي", "Main entrance"), at: [22, 870], label: [-16, 851] },
  { id: "E1", space: "gen", f: 0, name: l("مدخل المبنى الإداري", "the administration entrance"), short: l("مدخل الإداري", "Admin entrance"), at: [22, 315], label: [-16, 296] },
  { id: "E3", space: "gen", f: 0, name: l("المدخل الجنوبي جنب بلوك 6 (آخر الممر الرئيسي)", "the south entrance by Block 6 (end of the main corridor)"), short: l("المدخل الجنوبي", "South entrance"), at: [436, 1418], label: [436, 1441] },
  { id: "E4", space: "gen", f: 0, name: l("مدخل المعامل الشرقية", "the east labs entrance"), short: l("مدخل المعامل الشرقية", "East labs entrance"), at: [858, 1418], label: [858, 1441] },
  { id: "E6", space: "gen", f: 0, name: l("الممر اللي بين الورش والمعامل الشرقية", "the passage between the workshops and the east labs"), short: l("ممر الورش", "Workshops passage"), at: [825, 332], label: [825, 360] },
)

// ================================================================================================ البرامج (Programs building)
// One frame for every floor, lined up on the team's colours: the red main corridor runs left to right at y 380,
// the green main stairs sit at both ends, and the black lift is just above the corridor on the left.

export const PROG_FLOORS = [l("الأرضي", "Ground floor"), l("الأول", "First floor"), l("الثاني", "Second floor"), l("الثالث", "Third floor"), l("الرابع", "Fourth floor")]
const PROG = l("مبنى البرامج", "Programs building")
const P = "prog"
const H = (n: number): Extra => ({ code: `H${n}` })

for (let f = 0; f < 5; f++) {
  outlines.push({ space: P, f, x: 30, y: 30, w: 940, h: 540 })
  corr(P, f, "main", l("الطرقة الرئيسية", "the main corridor"), [[75, 380], [930, 380]], { width: 40 })
}

// Ground floor: halls 23A/23B and the student lounges sit at the back, a few steps down from the main hall.
room(P, 0, PROG, [50, 45, 300, 180], "مجلس الطلاب", "bottom")
room(P, 0, PROG, [330, 90, 440, 180], "مدرج", "bottom", { code: "23A" })
room(P, 0, PROG, [520, 90, 620, 180], "مدرج", "bottom", { code: "23B" })
room(P, 0, PROG, [680, 45, 960, 180], "مجلس الطلاب 2", "bottom")
corr(P, 0, "back", l("الممشى اللي قدام المدرجات والمجلس", "the walkway by the halls and lounge"), [[70, 200], [950, 200]], { width: 18 })
for (const x of [355, 410, 590, 715]) {
  corr(P, 0, "steps", l("السلالم الصغيرة ناحية المدرجات والمجلس", "the short steps to the halls and lounge"), [[x, 380], [x, 200]], { width: 14, down: [0, -1] })
  steps.push({ space: P, f: 0, at: [x, 290] })
}
room(P, 0, PROG, [40, 250, 140, 340], "معمل النانو تكنولوجي", "bottom", H(109))
room(P, 0, PROG, [440, 250, 560, 340], "المعامل الافتراضية بكلية الهندسة", "bottom")
room(P, 0, PROG, [820, 215, 900, 295], "دورة مياه رجالي", "left", H(106))
corr(P, 0, "wc", l("الممر اللي رايح لدورة مياه الرجالي", "the passage to the men's toilets"), [[800, 380], [800, 255]], { width: 14 })
room(P, 0, PROG, [820, 300, 900, 352], "دورة مياه حريمي", "bottom", H(104))
room(P, 0, PROG, [40, 420, 140, 510], "مدير مركز النانو تكنولوجي", "top", H(110))
room(P, 0, PROG, [160, 430, 350, 540], "Workspace 2", "top", { type: "hall" })
room(P, 0, PROG, [590, 430, 900, 540], "Workspace 1", "top", { type: "hall" })
corr(P, 0, "entry", l("سلالم المدخل", "the entrance steps"), [[480, 380], [480, 600]], { width: 22, down: [0, 1] })
steps.push({ space: P, f: 0, at: [480, 490] })
entrances.push({ id: "PG", space: P, f: 0, name: l("بوابة الدخول بتاعة مبنى البرامج", "the Programs building gate"), short: l("بوابة الدخول", "Entrance gate"), at: [480, 622], label: [480, 645] })

// First floor
room(P, 1, PROG, [40, 250, 140, 340], "قاعة", "bottom", H(210))
room(P, 1, PROG, [350, 200, 450, 270], "سكرتارية برنامج البناء والتشييد", "right", H(209))
room(P, 1, PROG, [350, 275, 450, 350], "برنامج العمارة المستدامة", "bottom")
corr(P, 1, "star", l("الممر اللي رايح للسلم اللي عليه نجمة", "the passage to the star staircase"), [[470, 380], [470, 170]], { width: 18 })
room(P, 1, PROG, [490, 175, 610, 225], "بوفيه", "left")
room(P, 1, PROG, [490, 230, 610, 290], "مدير برنامج البناء والتشييد", "left", H(205))
room(P, 1, PROG, [490, 295, 610, 350], "نائب مدير برنامج البناء والتشييد", "bottom", H(204))
room(P, 1, PROG, [700, 230, 820, 350], "قاعة", "bottom", H(203))
// between H203 and the main stairs at the end of the corridor
room(P, 1, PROG, [825, 230, 877, 350], "دورة مياه حريمي", "bottom")
room(P, 1, PROG, [877, 230, 930, 350], "دورة مياه رجالي", "bottom")
room(P, 1, PROG, [40, 420, 130, 520], "قاعة", "top", H(211))
room(P, 1, PROG, [140, 420, 235, 510], "قاعة", "top", H(212))
room(P, 1, PROG, [480, 420, 605, 540], "قاعة", "top", H(213))
room(P, 1, PROG, [690, 420, 810, 540], "قاعة", "top", H(214))

// Second floor: a corridor loops around a middle block of program offices.
corr(P, 2, "ring", l("الطرقة اللي بتلف حوالين النص", "the corridor that loops round the middle"), [[200, 380], [200, 150], [820, 150], [820, 380]], { width: 22 })
// an L: along the top, then down the left side to H309 (shape still to be confirmed on site)
room(P, 2, PROG, [40, 40, 420, 125], "مدرج", "bottom", { code: "24A", poly: [[40, 40], [420, 40], [420, 125], [185, 125], [185, 245], [40, 245]] })
room(P, 2, PROG, [40, 255, 185, 345], "قاعة", "right", H(309))
room(P, 2, PROG, [640, 40, 960, 125], "مدرج", "bottom", { code: "24B" })
room(P, 2, PROG, [835, 165, 960, 235], "قاعة", "left", H(304))
room(P, 2, PROG, [835, 240, 960, 305], "غرفة صيانة", "left", H(303))
room(P, 2, PROG, [835, 310, 905, 350], "دورة مياه", "left", H(302))
room(P, 2, PROG, [420, 172, 540, 250], "برنامج هندسة الاتصالات والحاسبات (CCE)", "top")
room(P, 2, PROG, [545, 172, 665, 250], "برنامج الهندسة الطبية", "top")
room(P, 2, PROG, [350, 265, 460, 352], "برنامج هندسة الميكاترونكس", "bottom")
labels.push({ space: P, f: 2, x: 585, y: 312, t: l("فراغ مفتوح على الأدوار", "Open well"), size: 9 })
room(P, 2, PROG, [40, 420, 125, 540], "قاعة", "top", H(308))
room(P, 2, PROG, [125, 420, 200, 540], "قطاع الدراسات العليا والبحوث ووحدة الدعم العملي ومعمل الحاسبات الرقمية", "top")
room(P, 2, PROG, [200, 420, 275, 540], "مستشار عام البرامج", "top")
room(P, 2, PROG, [275, 420, 385, 540], "برنامج هندسة الذكاء الاصطناعي (AIE)", "top")
room(P, 2, PROG, [400, 420, 560, 540], "قاعة", "top")
room(P, 2, PROG, [590, 420, 750, 540], "إدارة البرامج البينية للدراسات العليا", "top")
room(P, 2, PROG, [775, 420, 930, 540], "قاعة", "top", H(315))

// Third floor
room(P, 3, PROG, [90, 290, 190, 350], "قاعة", "bottom", { code: "Hall 13" })
corr(P, 3, "h2", l("الممر اللي رايح لـ Hall 2", "the passage to Hall 2"), [[225, 380], [225, 215]], { width: 18 })
room(P, 3, PROG, [150, 140, 300, 215], "قاعة", "bottom", { code: "Hall 2" })
room(P, 3, PROG, [350, 270, 560, 352], "قاعة", "bottom", { code: "Hall 4" })
corr(P, 3, "h1", l("الممر اللي رايح لـ Hall 1", "the passage to Hall 1"), [[760, 380], [760, 235]], { width: 18 })
room(P, 3, PROG, [690, 150, 830, 235], "قاعة", "bottom", { code: "Hall 1" })
room(P, 3, PROG, [840, 270, 925, 345], "قاعة", "bottom", { code: "Hall 15" })
split(P, 3, PROG, [80, 420, 340, 530], [["قاعة", H(407)], ["قاعة", H(408)], ["قاعة", H(409)]], "top", "h")
room(P, 3, PROG, [340, 420, 450, 530], "معمل السيارات الكهربية", "top")
split(P, 3, PROG, [450, 420, 670, 530], [["قاعة", H(411)], ["قاعة", H(412)]], "top", "h")
room(P, 3, PROG, [730, 420, 840, 530], "قاعة", "top", H(413))

// Fourth floor
room(P, 4, PROG, [150, 270, 270, 352], "قاعة", "bottom", { code: "Hall 6" })
room(P, 4, PROG, [350, 270, 480, 352], "قاعة", "bottom", H(502))
room(P, 4, PROG, [610, 290, 740, 352], "مسجد", "bottom")
room(P, 4, PROG, [740, 290, 835, 352], "دورة مياه حريمي", "bottom")
room(P, 4, PROG, [835, 290, 930, 352], "دورة مياه رجالي", "bottom")
split(P, 4, PROG, [150, 420, 395, 530], [["قاعة", H(505)], ["قاعة", H(506)]], "top", "h")
room(P, 4, PROG, [395, 420, 505, 530], "معمل هندسة الأطراف الصناعية والتأهيل الحركي", "top")
room(P, 4, PROG, [505, 420, 735, 530], "معمل الهوائيات والذكاء الاصطناعي", "top")
room(P, 4, PROG, [735, 420, 890, 530], "قاعة", "top", H(510))

const progAll = (p: Pt) => ({ 0: p, 1: p, 2: p, 3: p, 4: p })
risers.push(
  { id: "ps1", space: P, kind: "stairs", name: l("السلم الرئيسي اللي جنب الأسانسير", "the main stairs by the lift"), at: progAll([55, 380]) },
  { id: "ps2", space: P, kind: "stairs", name: l("السلم الرئيسي التاني (آخر الطرقة)", "the main stairs at the far end of the corridor"), at: progAll([950, 380]) },
  { id: "pstar", space: P, kind: "stairs", name: l("السلم اللي عليه نجمة", "the star staircase"), at: { 0: [470, 150], 1: [470, 155], 2: [470, 112] } },
  { id: "plift", space: P, kind: "lift", name: l("الأسانسير", "the lift"), at: progAll([310, 350]) },
)

// ================================================================================================ the path between them
// From the team's sketch: leave "عام" at the south end of the main corridor (or the east labs door), walk round
// the south end of the workshops, then north along their east side to the Programs gate.

const C = "campus"
outlines.push(
  { space: C, f: 0, x: 60, y: 60, w: 320, h: 550, label: l("مبنى عام", "General building"), lx: 220, ly: 50 },
  { space: C, f: 0, x: 420, y: 40, w: 62, h: 560, label: l("الورش", "Workshops"), lx: 436, ly: 30 },
  { space: C, f: 0, x: 498, y: 40, w: 62, h: 560, label: l("المعامل الشرقية", "East labs"), lx: 556, ly: 30 },
  { space: C, f: 0, x: 700, y: 300, w: 240, h: 330, label: PROG, lx: 820, ly: 290 },
)
for (let b = 1; b <= 6; b++) {
  outlines.push({ space: C, f: 0, x: 80, y: 80 + (b - 1) * 86, w: 280, h: 62 })
  labels.push({ space: C, f: 0, x: 220, y: 116 + (b - 1) * 86, t: l(`بلوك ${b}`, `Block ${b}`), size: 13 })
}
labels.push({ space: C, f: 0, x: 820, y: 470, t: l("البرامج", "Programs"), size: 16 })
// 1. the shortest, sometimes closed: from the north corridor of عام down the passage with the east labs on one side and
//    the workshops on the other, out on the east side and down to the Programs gate
corr(C, 0, "r1", l("الممر اللي بين الورش والمعامل الشرقية", "the passage between the workshops and the east labs"), [[490, 40], [490, 265], [575, 265], [575, 440], [590, 440]], { width: 16 })
// 2. out of the south entrance by Block 6, round the south end of the workshops and the labs
corr(C, 0, "r2", l("الطريق اللي تحت الورش والمعامل", "the road below the workshops and the labs"), [[400, 615], [400, 700], [606, 700], [606, 440]], { width: 18 })
corr(C, 0, "c3", l("الطريق لبوابة البرامج", "the path to the Programs gate"), [[590, 440], [690, 440]], { width: 18 })
corr(C, 0, "o1", l("الطريق الخارجي من بوابة عام الرئيسية", "the outer road from the main gate"), [[60, 345], [10, 345], [10, 735], [650, 735]], { width: 18 })
corr(C, 0, "o2", l("الطريق اللي طالع لبوابة البرامج", "the road up to the Programs gate"), [[650, 735], [650, 440]], { width: 18 })
entrances.push(
  { id: "C_gs", space: C, f: 0, name: l("المدخل الجنوبي لعام", "the south entrance of the general building"), short: l("المدخل الجنوبي (بلوك 6)", "South entrance (Block 6)"), at: [400, 600], label: [330, 645], hidden: true },
  { id: "C_ws", space: C, f: 0, name: l("الممر اللي بين الورش والمعامل الشرقية", "the passage between the workshops and the east labs"), short: l("ممر الورش", "Workshops passage"), at: [490, 40], label: [490, 62], hidden: true },
  { id: "C_main", space: C, f: 0, name: l("المدخل الرئيسي لعام", "the main entrance of the general building"), short: l("المدخل الرئيسي", "Main entrance"), at: [60, 345], label: [5, 325], hidden: true },
  { id: "C_pg", space: C, f: 0, name: l("بوابة البرامج", "the Programs gate"), short: l("بوابة البرامج", "Programs gate"), at: [700, 440], label: [640, 485], hidden: true },
)

export const portals: Portal[] = [
  { a: "E6", b: "C_ws", w: 10, say: l("ادخل الممر اللي بين الورش والمعامل الشرقية", "Go into the passage between the workshops and the east labs"), sayBack: l("ادخل مبنى عام من الممر اللي بين الورش والمعامل الشرقية", "Enter the general building from the passage between the workshops and the east labs"), way: { id: "workshops", name: l("من الممر اللي بين الورش والمعامل (ساعات بيبقى مقفول)", "Through the workshops passage (sometimes closed)") } },
  { a: "E2", b: "C_main", w: 10, say: l("اخرج من المدخل الرئيسي لمبنى عام", "Leave the general building through the main entrance"), sayBack: l("ادخل مبنى عام من المدخل الرئيسي", "Enter the general building through the main entrance"), way: { id: "main", name: l("من المدخل الرئيسي لعام (الطريق الخارجي)", "Through the main entrance (the outer road)") } },
  { a: "E3", b: "C_gs", w: 10, say: l("اخرج من المدخل الجنوبي لمبنى عام", "Leave the general building through the south entrance"), sayBack: l("ادخل مبنى عام من المدخل الجنوبي", "Enter the general building through the south entrance"), way: { id: "block6", name: l("من المدخل الجنوبي جنب بلوك 6", "Through the south entrance by Block 6") } },
  { a: "C_pg", b: "PG", w: 10, say: l("ادخل مبنى البرامج من بوابة الدخول", "Enter the Programs building through its gate"), sayBack: l("اخرج من بوابة الدخول بتاعة مبنى البرامج", "Leave the Programs building through its gate") },
]

export const BUILDINGS: { space: Space; name: L; floors: L[] }[] = [
  { space: "gen", name: l("مبنى عام", "General building"), floors: GEN_FLOORS },
  { space: "prog", name: PROG, floors: PROG_FLOORS },
  { space: "campus", name: l("بين المبنيين", "Between buildings"), floors: [l("الطريق", "The path")] },
]
export const VIEWBOX: Record<Space, [number, number, number, number]> = {
  gen: [-60, 0, 1060, 1445],
  prog: [0, 0, 1000, 655],
  campus: [-50, 0, 1050, 770],
}
