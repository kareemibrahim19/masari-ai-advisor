"""Masari RAG: turns courses.json + regulations_chunks.json into searchable chunks,
retrieves the relevant ones (BM25 + Gemini embeddings), and asks Gemini to answer.
"""

import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx
import numpy as np
from dotenv import load_dotenv
from google import genai
from google.genai import errors, types
from rank_bm25 import BM25Okapi

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tools import call_tool, gemini_tool  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
# Relative to this file, so it also works when only ai/ is deployed (e.g. on Vercel).
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CACHE_DIR = Path(__file__).resolve().parent / "embeddings"  # not ".cache": hosts like Vercel skip dot-folders
load_dotenv(REPO_ROOT / ".env")

CHAT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
REWRITE_MODEL = os.getenv("GEMINI_REWRITE_MODEL", "gemini-3.5-flash-lite")
FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.5-flash-lite"]
MODEL_TIMEOUT_MS = 20_000
EMBED_MODEL = os.getenv("GEMINI_EMBED_MODEL", "gemini-embedding-001")
TOP_K = 8
RETRY_DELAYS = [3, 8, 20]
MAX_TOOL_ROUNDS = 3  # how many times the model may call tools before it must answer

SYSTEM_PROMPT = """أنت "مساري"، المرشد الأكاديمي الذكي لبرنامج هندسة الذكاء الاصطناعي (AIE) بكلية الهندسة جامعة المنصورة.

القواعد:
1. جاوب فقط من "المعلومات المرجعية" و"القواعد الرسمية" اللي تحت. لو المعلومة مش موجودة فيهم قول بوضوح إنك مش متأكد وانصح الطالب يراجع شئون الطلاب أو المرشد الأكاديمي. متألفش أي رقم أو قاعدة.
2. ردودك قطعية ومباشرة. متذكرش أي اختلاف بين المصادر، ومتقولش "قد تختلف القواعد".
3. أي إجابة عن اللائحة لازم تذكر رقم المادة، مثلًا: (مادة 19).
4. لو السؤال عن مقرر، اذكر كوده واسمه وعدد ساعاته ومتطلباته السابقة.
5. "القواعد الرسمية" (JSON) هي المرجع الأعلى في الأرقام: حد الساعات، الصيفي، الإنذار، الفصل، التخرج.
6. رد بنفس لغة الطالب: لو كتب عامية مصرية رد بعامية مصرية واضحة، لو فصحى ففصحى، لو إنجليزي فإنجليزي، لو فرانكو رد بالعامية المصرية بالحروف العربية.
7. خلي الرد منظم ومختصر: نقط قصيرة لما يكون فيه أكتر من معلومة.
8. عندك أدوات (tools). لو السؤال عن أرقام الطالب نفسه أو قرار محسوب (حد الساعات، الإنذار، المعدل، الإعادة والتحسين، أهلية تسجيل مادة، المستوى، الاختياري، الغياب، الحذف والانسحاب، الدكاترة) نادِ الأداة المناسبة، ومتحسبهاش بنفسك. ونتيجة الأداة هي المرجع، اشرحها للطالب بس وبنفس لغته.
9. لو الأداة رجّعت found=false أو error، قول للطالب إيه الناقص (كود مادة غلط مثلًا) بدل ما تخمّن.
10. في ترشيح الدكاترة اذكر مصدر الترشيح (basis_ar) والسبب، ولو الثقة منخفضة (عدد التقييمات قليل) قولها صراحة. ولو الطالب قال تفضيلاته (سرعة/عبء/عملي) مرّرها للأداة.
11. لو السؤال عن مادة معينة (كودها، ساعاتها، متطلباتها) نادِ course_info، ولو الطالب ذكر اسم مادة من غير كود أو الاسم مش واضح نادِ find_courses الأول. ولو سأل "اعيد انهي مادة" أو "احسن معدلي" نادِ improvement_candidates.
12. لو الطالب قال إنه مش عايز دكتور معين نادِ avoid_instructor (وده بيشيله من صفحة الترشيحات)، ولو غيّر رأيه نادِ restore_instructor. ولو وصف أسلوب الشرح اللي بيحبه (بطيء/سريع، خفيف/تقيل، عملي/نظري) نادِ set_instructor_preferences بأرقام من 0 لـ 100 (بطيء=20، سريع=80، خفيف=20، تقيل=80، نظري=20، عملي=80). وبعدها قوله بوضوح إن الصفحة اتحدّثت.
13. ابدأ الرد بالإجابة المباشرة في أول سطر (نعم/لا/الرقم)، وبعدها السبب ورقم المادة. من غير مقدمات زي "بناءً على" ومن غير تكرار السؤال.
"""

REWRITE_PROMPT = """حوّل سؤال الطالب الأخير لسؤال بحث واحد واضح بالعربية الفصحى، يكون مستقل بذاته (استخدم المحادثة السابقة لفهم الإشارات زي "طب والصيفي؟").
حافظ على أكواد المواد زي ARI 381 كما هي، وأضف المصطلحات الرسمية المناسبة (مثل: العبء الدراسي، المعدل التراكمي، الإنذار الأكاديمي، المتطلب السابق، الفصل الصيفي).
اكتب السؤال فقط بدون أي شرح.

المحادثة السابقة:
{history}

سؤال الطالب: {question}"""


# ---------------------------------------------------------------- chunks

def _load_json(name: str):
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


def build_chunks() -> tuple[list[dict], dict]:
    """Return (chunks, courses_data). Each chunk: id, source, title, text."""
    regs = _load_json("regulations_chunks.json")
    data = _load_json("courses.json")

    chunks = [
        {"id": r["id"], "source": "regulation", "article": r.get("article"),
         "lang": r["lang"], "pair_id": r.get("pair_id"),
         "title": r["title"], "text": r["text"]}
        for r in regs
    ]

    names = {c["code"]: c["name_ar"] for c in data["courses"]}
    for c in data["courses"]:
        prereqs = "، ".join(f"{p} ({names.get(p, '')})" for p in c["prerequisites"]) or "لا يوجد"
        a = c.get("assessment") or {}
        lines = [
            f"المقرر {c['code']}: {c['name_ar']} — {c.get('name_en', '')}",
            f"Course {c['code']}: {c.get('name_en', '')} {' / '.join(c.get('aliases_en', []))}",
            f"الساعات المعتمدة: {c['credits']} | الحمل الأسبوعي: {c.get('weekly_load_hours')} ساعة",
            f"الفئة: {c['category']} | النوع: {'إجباري' if c['type'] == 'mandatory' else c['type']} | القسم: {c['department']}",
            f"المستوى: {c['level']} | الترم المخطط في الخطة الدراسية: {c['planned_semester']}",
            f"المتطلبات السابقة: {prereqs}",
        ]
        if c.get("min_level_required"):
            lines.append(f"يشترط الوصول لمستوى: {c['min_level_required']}")
        if c.get("min_credits_required"):
            lines.append(f"يشترط اجتياز {c['min_credits_required']} ساعة معتمدة على الأقل قبل التسجيل في هذا المقرر.")
        if a:
            lines.append(f"توزيع الدرجات: أعمال سنة {a.get('coursework')}، منتصف الترم {a.get('midterm')}، عملي {a.get('practical')}، نهائي {a.get('final')}")
        if c.get("graded") is False:
            lines.append("المقرر نجاح/رسوب ولا يدخل في المعدل.")
        chunks.append({"id": f"course-{c['code']}", "source": "course",
                       "title": f"{c['code']} {c['name_ar']}", "text": "\n".join(lines)})

    # One chunk per semester of the study plan ("مواد الترم الخامس").
    by_sem: dict[int, list] = {}
    for c in data["courses"]:
        if c.get("planned_semester"):
            by_sem.setdefault(c["planned_semester"], []).append(c)
    slots = {}
    for s in data.get("elective_slots", []):
        slots.setdefault(s["semester"], []).append(s["slot"])
    for sem, cs in sorted(by_sem.items()):
        body = "\n".join(f"- {c['code']} {c['name_ar']} ({c['credits']} س)" for c in cs)
        extra = f"\nبالإضافة لمقرر اختياري: {'، '.join(slots[sem])}" if sem in slots else ""
        total = sum(c["credits"] for c in cs)
        chunks.append({"id": f"plan-sem-{sem}", "source": "plan",
                       "title": f"الخطة الدراسية - الترم {sem}",
                       "text": f"مقررات الترم رقم {sem} في الخطة الدراسية (مجموع {total} ساعة بدون الاختياري):\n{body}{extra}"})

    for pool in data.get("elective_pools", []):
        body = "\n".join(f"- {code} {names.get(code, '')}" for code in pool["courses"])
        chunks.append({"id": f"electives-{pool['level']}", "source": "plan",
                       "title": f"المقررات الاختيارية مستوى {pool['level']}",
                       "text": f"المقررات الاختيارية للمستوى {pool['level']} (يختار الطالب {pool['choose']} للخانات {', '.join(pool['slots'])}):\n{body}"})

    p = data["program"]
    chunks.append({"id": "program-overview", "source": "plan", "title": "نظرة عامة على البرنامج",
                   "text": f"{p['name_ar']} ({p['name_en']}) - {p['faculty']}. إجمالي الساعات {p['total_credits']} على {p['semesters']} فصول دراسية. "
                           f"توزيع الساعات: {json.dumps(p['credit_breakdown'], ensure_ascii=False)}. عدد المقررات الاختيارية المطلوبة {p['electives_required']}."})
    return chunks, data


# ---------------------------------------------------------------- gemini helpers

def _client() -> genai.Client:
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        sys.exit(f"GEMINI_API_KEY is missing in {REPO_ROOT / '.env'}")
    return genai.Client(api_key=key, http_options=types.HttpOptions(
        retry_options=types.HttpRetryOptions(attempts=1)))


def _with_retry(fn, delays=RETRY_DELAYS, wait_on_429=True):
    """Retry on 503 (busy) and 429 (rate limit); raise anything else."""
    for delay in [*delays, None]:
        try:
            return fn()
        except errors.APIError as e:
            retryable = e.code == 503 or (e.code == 429 and wait_on_429)
            if not retryable or delay is None:
                raise
            # The free tier counts quota per minute, so a 429 needs a longer wait.
            time.sleep(35 if e.code == 429 else delay)


def _tokenize(text: str) -> list[str]:
    text = re.sub(r"[ًٌٍَُِّْـ]", "", text.lower())          # strip Arabic diacritics
    text = re.sub(r"[إأآ]", "ا", text).replace("ة", "ه").replace("ى", "ي")
    text = re.sub(r"\b([a-z]{3})\s+(\d{3})\b", r"\1\2", text)  # "ARI 381" -> "ari381"
    tokens = re.findall(r"[\w]+", text)
    return [t[2:] if t.startswith("ال") and len(t) > 4 else t for t in tokens]


# ---------------------------------------------------------------- retriever

class Masari:
    def __init__(self):
        self.client = _client()
        self.chunks, self.data = build_chunks()
        self.by_id = {c["id"]: c for c in self.chunks}
        self.bm25 = BM25Okapi([_tokenize(c["title"] + " " + c["text"]) for c in self.chunks])
        self.vectors = self._load_or_embed()
        self.cooldown: dict[str, float] = {}  # model -> time it can be used again
        self.rules_json = json.dumps(self.data["rules"], ensure_ascii=False, indent=1)

    def _embed(self, texts: list[str], task: str, wait_on_429: bool = True) -> np.ndarray:
        out = []
        # Free tier: 100 embedded texts per minute, so send at most 90 at a time.
        for i in range(0, len(texts), 90):
            batch = texts[i:i + 90]
            if i:
                time.sleep(61)
            r = _with_retry(lambda: self.client.models.embed_content(
                model=EMBED_MODEL, contents=batch,
                config=types.EmbedContentConfig(task_type=task)), wait_on_429=wait_on_429)
            out.extend(e.values for e in r.embeddings)
        v = np.array(out, dtype=np.float32)
        return v / np.linalg.norm(v, axis=1, keepdims=True)

    def _load_or_embed(self) -> np.ndarray:
        """Embeddings are cached; they are rebuilt only when the data changes."""
        texts = [c["title"] + "\n" + c["text"][:6000] for c in self.chunks]
        digest = hashlib.sha256((EMBED_MODEL + "".join(texts)).encode()).hexdigest()[:16]
        path = CACHE_DIR / f"embeddings-{digest}.npy"
        if path.exists():
            return np.load(path)
        print(f"Embedding {len(texts)} chunks with {EMBED_MODEL}...", file=sys.stderr)
        v = self._embed(texts, "RETRIEVAL_DOCUMENT")
        try:
            CACHE_DIR.mkdir(exist_ok=True)
            for old in CACHE_DIR.glob("embeddings-*.npy"):  # the cache is committed, so keep only the current one
                old.unlink()
            np.save(path, v)
        except OSError:  # read-only disk on serverless hosts: keep the vectors in memory only
            print("Could not save the embedding cache; commit an up-to-date one.", file=sys.stderr)
        return v

    def rewrite(self, question: str, history: list[dict]) -> str:
        hist = "\n".join(f"{m['role']}: {m['content'][:400]}" for m in history[-6:]) or "(لا يوجد)"
        try:
            r = _with_retry(lambda: self.client.models.generate_content(
                model=REWRITE_MODEL, contents=REWRITE_PROMPT.format(history=hist, question=question)),
                wait_on_429=False)
            return (r.text or "").strip() or question
        except errors.APIError:
            return question

    def search(self, queries: list[str], k: int = TOP_K) -> list[dict]:
        """Hybrid search: reciprocal-rank fusion of BM25 and embedding ranks."""
        scores = np.zeros(len(self.chunks))
        # If the embedding service is out of quota or down, search by keywords only instead of waiting a minute.
        try:
            qv = self._embed(queries, "RETRIEVAL_QUERY", wait_on_429=False)
        except (errors.APIError, httpx.TimeoutException) as e:
            print(f"query embedding failed ({getattr(e, 'code', 'timeout')}), using keyword search only", file=sys.stderr)
            qv = [None] * len(queries)
        for q, v in zip(queries, qv):
            rankings = [np.argsort(-self.bm25.get_scores(_tokenize(q)))]
            if v is not None:
                rankings.append(np.argsort(-(self.vectors @ v)))
            for ranking in rankings:
                for rank, idx in enumerate(ranking[:30]):
                    scores[idx] += 1 / (60 + rank)
        # Explicit course codes in the question always pull in that course.
        for code in re.findall(r"[A-Za-z]{3}\s?\d{3}", " ".join(queries)):
            cid = f"course-{code[:3].upper()} {code[-3:]}"
            if cid in self.by_id:
                scores[self.chunks.index(self.by_id[cid])] += 1
        return [self.chunks[i] for i in np.argsort(-scores)[:k]]

    def _generate(self, contents: list, config) -> tuple:
        """One Gemini call with model fallback. If a model is busy, out of quota or too slow, try the
        next one; a model that just failed is skipped for a while so the next questions don't wait on it again.

        Thinking is kept short (LOW): the answers come from tool results and retrieved text, and long
        thinking took ~20 s instead of ~5 s. A model that doesn't accept the setting is called without it.
        """
        models = [m for m in dict.fromkeys([CHAT_MODEL, *FALLBACK_MODELS])
                  if self.cooldown.get(m, 0) < time.time()] or FALLBACK_MODELS[-1:]
        for i, model in enumerate(models):
            try:
                try:
                    cfg = config.model_copy(update={"thinking_config": types.ThinkingConfig(thinking_level="LOW")})
                    r = _with_retry(lambda: self.client.models.generate_content(
                        model=model, contents=contents, config=cfg), delays=[2], wait_on_429=False)
                except errors.ClientError as e:
                    if e.code != 400:
                        raise
                    r = _with_retry(lambda: self.client.models.generate_content(
                        model=model, contents=contents, config=config), delays=[2], wait_on_429=False)
                return r, model
            except (errors.APIError, httpx.TimeoutException) as e:
                code = getattr(e, "code", "timeout")
                print(f"{model} failed ({code}), trying next model", file=sys.stderr)
                # 429 = quota (wait longer); 500/503/504/timeout = the model is struggling right now.
                self.cooldown[model] = time.time() + (300 if code == 429 else 90)
                # 404 = model retired: also worth trying the next model.
                if code not in (404, 429, 500, 503, 504, "timeout") or i == len(models) - 1:
                    raise

    def answer(self, question: str, history: list[dict], student_id: str | None = None,
               session: dict | None = None) -> dict:
        search_q = self.rewrite(question, history)
        hits = self.search(list(dict.fromkeys([search_q, question])))

        context = "\n\n".join(f"[{h['title']}]\n{h['text']}" for h in hits)
        who = (f"الطالب الحالي: رقمه {student_id} (الأدوات هتستخدمه تلقائيًا)." if student_id else
               "مفيش طالب محدد في المحادثة دي، فمتنادِش أدوات بيانات الطالب؛ لو السؤال عن أرقامه اطلب منه يختار طالب.")
        session = session or {}
        if session.get("excluded"):
            who += f"\nالدكاترة اللي الطالب طلب يستبعدهم (متقترحهمش): {', '.join(session['excluded'])}."
        if session.get("preferences"):
            who += f"\nتفضيلات الطالب الحالية في الصفحة (0-100): {session['preferences']}."
        contents = [types.Content(role="user" if m["role"] == "user" else "model",
                                  parts=[types.Part(text=m["content"])]) for m in history[-10:]]
        contents.append(types.Content(role="user", parts=[types.Part(text=(
            f"القواعد الرسمية (JSON):\n{self.rules_json}\n\n"
            f"المعلومات المرجعية:\n{context}\n\n"
            f"{who}\n\n"
            f"سؤال الطالب: {question}"))]))

        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT, temperature=0.2,
            tools=[gemini_tool(with_student=bool(student_id))],
            # We run the tools ourselves so the student's id is always the session's, never the model's guess.
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            http_options=types.HttpOptions(timeout=MODEL_TIMEOUT_MS))

        tools_used = []
        for _ in range(MAX_TOOL_ROUNDS + 1):
            r, model = self._generate(contents, config)
            calls = r.function_calls or []
            if not calls or len(tools_used) >= MAX_TOOL_ROUNDS * 3:
                break
            contents.append(r.candidates[0].content)  # keep the model's own turn (thought signatures included)
            parts = []
            for fc in calls:
                result = call_tool(fc.name, dict(fc.args or {}), student_id, session)
                tools_used.append({"name": fc.name, "args": dict(fc.args or {}), "result": result})
                parts.append(types.Part.from_function_response(name=fc.name, response={"result": result}))
            contents.append(types.Content(role="user", parts=parts))
        return {
            "answer": r.text or "",
            "model": model,
            "search_query": search_q,
            "sources": [{"id": h["id"], "title": h["title"], "source": h["source"]} for h in hits],
            "tools_used": tools_used,
            # Changes the website should apply to its pages (remove an instructor, move a preference slider...).
            "actions": [t["result"]["action"] for t in tools_used
                        if isinstance(t["result"], dict) and t["result"].get("action")],
        }


if __name__ == "__main__":
    # Quick CLI test: python ai/chatbot/rag.py "سؤالك"
    sys.stdout.reconfigure(encoding="utf-8")
    bot = Masari()
    q = sys.argv[1] if len(sys.argv) > 1 else "اقدر اسجل كام ساعة لو معدلي 2.5؟"
    sid = sys.argv[2] if len(sys.argv) > 2 else None  # optional: a student id from ai/data/students.json
    res = bot.answer(q, [], sid)
    print("أدوات:", [(c["name"], c["args"]) for c in res["tools_used"]])
    print("بحث:", res["search_query"])
    print("مصادر:", [s["title"] for s in res["sources"]])
    print(res["answer"])
