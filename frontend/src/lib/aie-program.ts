/**
 * B.Sc. Artificial Intelligence Engineering — Faculty of Engineering, Mansoura University.
 *
 * Source: AIE Program Guide (https://aieprogramguide.vercel.app/), an unofficial summary of the
 * program bylaws. Course codes, names, credits, semesters and prerequisites are copied from it as-is.
 * Verify against the official bylaws before relying on them for real advising.
 */
import type { L } from "@/lib/i18n"

export type Category = "UNR" | "BAS" | "ENG" | "CSE" | "ECE" | "ELE" | "PDE" | "ARI"
export type CourseType = "mandatory" | "elective" | "project"
export type Term = "fall" | "spring"
export type ElectiveGroup = "L300" | "L400"

export type Course = {
  code: string
  name: string
  category: Category
  type: CourseType
  /** Plan semester 1–10. Odd = Fall, even = Spring. */
  semester: number
  credits: number
  /** Course codes that must be passed first. */
  prereqs: string[]
  /** Minimum earned credit hours required (training and projects). */
  minCredits?: number
  /** Elective slot only: which pool it is filled from. */
  electiveGroup?: ElectiveGroup
}

export type PoolCourse = {
  code: string
  name: string
  category: Category
  credits: number
  prereqs: string[]
  description: string
}

const c = (
  code: string,
  name: string,
  category: Category,
  semester: number,
  credits: number,
  prereqs: string[] = [],
  extra: Partial<Course> = {}
): Course => ({ code, name, category, type: "mandatory", semester, credits, prereqs, ...extra })
const project = (code: string, name: string, semester: number, credits: number, minCredits: number): Course =>
  c(code, name, "ARI", semester, credits, [], { type: "project", minCredits })
const elective = (slot: number, semester: number, electiveGroup: ElectiveGroup): Course =>
  c(`ELEC E${slot}`, `Elective (${slot})`, "CSE", semester, 3, [], { type: "elective", electiveGroup })

export const courses: Course[] = [
  // Level 0
  c("BAS 011", "Mathematics (1)", "BAS", 1, 3),
  c("BAS 021", "Mechanics (1)", "BAS", 1, 3),
  c("BAS 031", "Physics (1)", "BAS", 1, 3),
  c("BAS 041", "Fundamentals of Engineering Chemistry", "BAS", 1, 3),
  c("PDE 052", "Engineering Drawing", "PDE", 1, 3),
  c("UNR 061", "English Language (1)", "UNR", 1, 2),
  c("BAS 012", "Mathematics (2)", "BAS", 2, 3, ["BAS 011"]),
  c("BAS 022", "Mechanics (2)", "BAS", 2, 3, ["BAS 021"]),
  c("BAS 032", "Physics (2)", "BAS", 2, 3),
  c("CSE 042", "Intro to Computer Systems", "CSE", 2, 3),
  c("PDE 051", "Principles of Manufacturing Engineering", "PDE", 2, 3),
  c("UNR 021", "History of Engineering & Technology", "UNR", 2, 1),
  // Level 1
  c("BAS 115", "Linear Algebra", "BAS", 3, 3, ["BAS 012"]),
  c("CSE 151", "Introduction to Artificial Intelligence", "CSE", 3, 3),
  c("CSE 141", "Digital Design", "CSE", 3, 3, ["CSE 042"]),
  c("UNR 181", "Law & Human Rights", "UNR", 3, 2),
  c("ECE 121", "Electric Circuits", "ECE", 3, 3, ["BAS 032"]),
  c("ENG 111", "Technical Report Writing", "ENG", 3, 2, ["UNR 061"]),
  c("BAS 116", "Mathematical Methods for Engineers", "BAS", 4, 3, ["BAS 115"]),
  c("ECE 122", "Electronics", "ECE", 4, 3, ["ECE 121"]),
  c("CSE 111", "Programming (1)", "CSE", 4, 3, ["CSE 141"]),
  c("CSE 112", "Algorithms & Data Structures", "CSE", 4, 3, ["CSE 042"]),
  c("ELE 151", "Electric Power & Machines", "ELE", 4, 3, ["ECE 121"]),
  c("UNR 121", "Research & Analysis Skills", "UNR", 4, 2),
  project("ARI 171", "Practical Training in AI Engineering", 4, 0, 56),
  // Level 2
  c("BAS 216", "Statistics & Data Analysis", "BAS", 5, 2, ["BAS 115"]),
  c("ECE 234", "Signals & Systems", "ECE", 5, 3, ["BAS 116"]),
  c("UNR 241", "Communication & Presentation Skills", "UNR", 5, 2),
  c("ECE 223", "Measurements & Instruments", "ECE", 5, 3, ["ECE 122"]),
  c("CSE 251", "Machine Learning", "CSE", 5, 3, ["CSE 151"]),
  c("CSE 221", "Automatic Control", "CSE", 5, 3, ["BAS 116"]),
  c("BAS 217", "Discrete & Numerical Mathematics", "BAS", 6, 3, ["BAS 216"]),
  c("ECE 224", "Sensors, Actuators & Sensor Networks", "ECE", 6, 3, ["ECE 223"]),
  c("BAS 218", "Advanced Engineering Mathematics", "BAS", 6, 3, ["BAS 216"]),
  c("UNR 261", "Professional Ethics", "UNR", 6, 2),
  c("CSE 212", "Database Systems", "CSE", 6, 3, ["CSE 112"]),
  c("ECE 235", "Signal Processing & Analysis", "ECE", 6, 3, ["ECE 234"]),
  project("ARI 271", "Field Training (1) in AI Engineering", 6, 0, 90),
  // Level 3
  elective(1, 7, "L300"),
  c("ECE 332", "Neural Networks", "ECE", 7, 3, ["BAS 218"]),
  c("CSE 331", "Programming (2)", "CSE", 7, 3, ["CSE 111"]),
  c("CSE 313", "Data Management", "CSE", 7, 3, ["CSE 212"]),
  c("CSE 317", "Computer Architecture", "CSE", 7, 3, ["CSE 141"]),
  c("ECE 333", "Digital Image Processing", "ECE", 7, 3, ["ECE 235"]),
  c("CSE 351", "Deep Learning", "CSE", 8, 3, ["ECE 332"]),
  c("CSE 315", "Embedded Systems", "CSE", 8, 3, ["CSE 317"]),
  elective(2, 8, "L300"),
  c("ECE 321", "Communication Networks", "ECE", 8, 3, ["ECE 234"]),
  c("ENG 312", "Project Management", "ENG", 8, 2),
  project("ARI 381", "Project (1) in AI Engineering", 8, 3, 96),
  project("ARI 371", "Field Training (2) in AI Engineering", 8, 0, 120),
  // Level 4
  elective(3, 9, "L400"),
  elective(4, 9, "L400"),
  c("CSE 423", "Robotics", "CSE", 9, 3, ["CSE 221"]),
  c("UNR 471", "Marketing", "UNR", 9, 2),
  project("ARI 481", "Project (2) in AI Engineering", 9, 3, 116),
  c("CSE 451", "Big Data Science", "CSE", 10, 3, ["CSE 313"]),
  c("CSE 452", "AI Applications", "CSE", 10, 3, ["CSE 351"]),
  elective(5, 10, "L400"),
  project("ARI 482", "Project (3) in AI Engineering", 10, 3, 130),
]

export const electivePools: Record<ElectiveGroup, PoolCourse[]> = {
  L300: [
    { code: "CSE 316", name: "Decision-Making Systems", category: "CSE", credits: 3, prereqs: ["BAS 218"], description: "Decision making under certainty/uncertainty, linear programming, knowledge representation, decision support interfaces, guideline verification." },
    { code: "ECE 334", name: "Pattern Recognition", category: "ECE", credits: 3, prereqs: ["BAS 218"], description: "Pattern recognition problem formulation, signal pre-processing, feature extraction, classification methods: supervised, unsupervised, parametric, non-parametric." },
    { code: "BAS 315", name: "Optimization Methods", category: "BAS", credits: 3, prereqs: ["BAS 218"], description: "Linear, numerical, dynamic, and nonlinear optimization; heuristic methods." },
    { code: "CSE 319", name: "Bioinformatics", category: "CSE", credits: 3, prereqs: ["BAS 216"], description: "DNA/protein databases, sequence alignment, phylogenetic trees, microarray analysis, protein structure prediction, comparative genomics." },
    { code: "CSE 318", name: "Human-Computer Interaction", category: "CSE", credits: 3, prereqs: ["CSE 251"], description: "HCI introduction, cognitive psychology, design methods, human psychology simulation, design sensitivity, evaluation methods, error recovery." },
    { code: "BAS 311", name: "Statistical Learning", category: "BAS", credits: 3, prereqs: ["BAS 216"], description: "Linear/logistic/polynomial regression, linear models, LDA, classification trees, random forests, SVM, PCA, cluster analysis." },
    { code: "CSE 335", name: "Data Visualization & Analysis", category: "CSE", credits: 3, prereqs: ["CSE 331", "BAS 218"], description: "Data analysis & visualization intro, Python/R programming, data description methods, high-dimensional data, statistical analysis, hypothesis testing, dashboard design." },
    { code: "CSE 352", name: "Cognitive Psychology", category: "CSE", credits: 3, prereqs: [], description: "Human information processing & AI, perception, human memory, visual cognition, language and thought." },
  ],
  L400: [
    { code: "ECE 432", name: "Internet of Things (IoT)", category: "ECE", credits: 3, prereqs: ["ECE 321"], description: "IoT intro, hardware platforms & OS, wireless communication, IP-connected smart objects, embedded web services, industrial network tracking, standards & protocols." },
    { code: "CSE 454", name: "Advanced Deep Learning", category: "CSE", credits: 3, prereqs: ["CSE 351"], description: "Advanced DL models: image-to-image networks, GANs for various signals, transfer learning, learning from small data, deep reinforcement learning, sequence modeling." },
    { code: "CSE 455", name: "Natural Language Processing", category: "CSE", credits: 3, prereqs: ["CSE 351"], description: "NLP intro, information extraction, translation tools, sentiment analysis, word vector representations, probabilistic NLP, sequence models, RNN, LSTM, machine translation." },
    { code: "ECE 435", name: "Computer Vision", category: "ECE", credits: 3, prereqs: ["ECE 333"], description: "Image formation, camera geometry, image statistics, motion estimation, stereo, image classification, scene understanding, deep learning with neural networks, optical flow, segmentation." },
    { code: "CSE 412", name: "Soft Computing", category: "CSE", credits: 3, prereqs: ["ECE 332"], description: "Soft computing intro, neural networks, fuzzy sets, fuzzy logic, fuzzy classification, hybrid methods, neuro-fuzzy models, genetic algorithms." },
    { code: "CSE 413", name: "High-Performance Computing Systems", category: "CSE", credits: 3, prereqs: ["CSE 313"], description: "Computer architecture, multi-core, vector representation, multithreading, distributed/shared memory, parallel computing, GPU computing, client-server communication." },
    { code: "CSE 456", name: "AI Applications in Medical Systems", category: "CSE", credits: 3, prereqs: ["CSE 351"], description: "AI in medicine intro, medical signals & images, medical data mining, CNNs, image-to-image models, GANs – applied to tumor detection, medical image segmentation, vital signal analysis." },
    { code: "CSE 457", name: "Reinforcement Learning", category: "CSE", credits: 3, prereqs: ["CSE 351"], description: "RL theory, state/action/reward definition, problem formulation in RL framework, deep RL as neural networks, DRL applications in AI." },
    { code: "CSE 414", name: "Data Mining", category: "CSE", credits: 3, prereqs: ["BAS 218", "CSE 351"], description: "Data mining concepts, reading & storing data, classification/clustering, feature extraction, statistical analysis, knowledge pattern inference, audio/text data, various ML algorithms." },
    { code: "CSE 458", name: "AI in Signal & Audio Processing", category: "CSE", credits: 3, prereqs: ["CSE 151", "CSE 351"], description: "DL for signal processing, advanced deep neural architectures, RNN models, LSTM, sequence-to-sequence networks, GANs for audio generation." },
    { code: "CSE 459", name: "Machine Learning in Arts", category: "CSE", credits: 3, prereqs: ["CSE 351"], description: "AI/ML in arts intro, image-to-image learning, GANs, style-transfer networks – applied to artistic image generation, interior design, music composition, video colorization." },
  ],
}

/** Program-level figures as stated by the source (not derivable per course from the published list). */
export const programFacts = {
  degree: { ar: "بكالوريوس هندسة الذكاء الاصطناعي", en: "B.Sc. in Artificial Intelligence Engineering" } as L,
  institution: { ar: "كلية الهندسة – جامعة المنصورة", en: "Faculty of Engineering – Mansoura University" } as L,
  totalCredits: 160,
  universityCredits: 13,
  collegeCredits: 45,
  specializationCredits: 102,
  semesters: 10,
  levels: 5,
}

export const categoryLabels: Record<Category, L> = {
  UNR: { ar: "متطلبات الجامعة", en: "University Req." },
  BAS: { ar: "العلوم الأساسية", en: "Basic Sciences" },
  ENG: { ar: "العلوم الهندسية", en: "Engineering" },
  CSE: { ar: "علوم وهندسة الحاسب", en: "Computer Science" },
  ECE: { ar: "الإلكترونيات والاتصالات", en: "Electronics & Comm." },
  ELE: { ar: "الهندسة الكهربية", en: "Electrical Eng." },
  PDE: { ar: "هندسة الإنتاج", en: "Production Eng." },
  ARI: { ar: "مشروعات وتدريب الذكاء الاصطناعي", en: "AI Projects & Training" },
}

export const typeLabels: Record<CourseType, L> = {
  mandatory: { ar: "إجباري", en: "Mandatory" },
  elective: { ar: "اختياري", en: "Elective" },
  project: { ar: "مشروع / تدريب", en: "Project / Training" },
}

// ------------------------------------------------------------------------------ helpers

export const termOf = (semester: number): Term => (semester % 2 === 1 ? "fall" : "spring")
export const levelOf = (semester: number) => Math.floor((semester - 1) / 2)

const index = new Map<string, Course | PoolCourse>()
courses.forEach((x) => index.set(x.code, x))
Object.values(electivePools).flat().forEach((x) => index.set(x.code, x))

export const findCourse = (code: string) => index.get(code)
export const courseName = (code: string) => index.get(code)?.name ?? code
/** Name as a bilingual value. Course names are official English names in both UI languages. */
export const courseNameL = (code: string): L => ({ ar: courseName(code), en: courseName(code) })

/** Every course or pool course that lists `code` as a direct prerequisite. */
export function dependentsOf(code: string): string[] {
  const out: string[] = []
  index.forEach((x) => {
    if (x.prereqs.includes(code)) out.push(x.code)
  })
  return out
}

/** Every course reachable through prerequisite links (direct and indirect). */
export function allDependentsOf(code: string): string[] {
  const seen = new Set<string>()
  const walk = (k: string) =>
    dependentsOf(k).forEach((d) => {
      if (!seen.has(d)) {
        seen.add(d)
        walk(d)
      }
    })
  walk(code)
  return [...seen]
}

/** Length of the longest prerequisite chain that starts at this course (0 = nothing depends on it). */
export function chainDepth(code: string): number {
  const deps = dependentsOf(code)
  return deps.length ? 1 + Math.max(...deps.map(chainDepth)) : 0
}

export const totalProgramCredits = courses.reduce((s, x) => s + x.credits, 0)
