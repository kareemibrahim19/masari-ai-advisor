"""The report of the graduation-plan stress test (stress_plan.py), for people.

Reads ai/simulation/plan_stress.json and writes ai/simulation/plan_stress_report.html. Run from the repo root:
    .venv\\Scripts\\python.exe ai\\scripts\\stress_plan_report.py
"""

import html
import json
import statistics
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "simulation"
TARGET_AR = {"4": "4 سنين", "4.5": "4.5 سنين", "5": "5 سنين"}
STATUS_AR = {"feasible": "ممكن", "conditional": "ممكن بشرط", "impossible": "مش ممكن"}

# What each kind of problem means, in words (the checker's categories).
PROBLEM_AR = {
    "crash": "الخطة وقعت (exception)",
    "error": "الخطة رجّعت خطأ بدل إجابة",
    "invalid_plan": "خطة مكسورة: فيها قاعدة اتكسرت (متطلب، ترم، حد ساعات...)",
    "false_no": "قالت \"مش ممكن\" وفيه جدول بيلحق الهدف",
    "oracle_disagrees": "قالت \"ممكن\" والحل المستقل ملقاش جدول",
    "late_feasible": "قالت \"ممكن\" بس التخرج بعد الهدف",
    "missed_route": "قالت \"مش ممكن\" من غير صيفي ومقالتش إن الصيفي بيحلها",
    "not_earliest": "\"أقرب تخرج\" مش أقرب حاجة",
    "no_plan": "مرجّعتش خطة وفيه خطة",
    "summer_skipped": "\"أقرب تخرج\" خريف أو ربيع، والصيفي اللي قبله كان كفاية",
    "monotonic": "هدف أطول بقى أصعب",
    "summer_worse": "الصيفي خلّى الحال أسوأ",
    "table": "جدول الأهداف في الصفحة مختلف عن الخطة",
    "whatif_gpa": "\"لو سقطت / معدلي كذا\": المعدل المتوقع غلط",
    "whatif_cap": "\"لو سقطت / معدلي كذا\": حد الساعات غلط",
}

CSS = """
:root{--bg:#f7f7f5;--card:#fff;--ink:#1d1d1b;--muted:#6b6b66;--line:#e4e3de;--ok:#1f7a4d;--warn:#b25e00;--bad:#b3261e;
--chip:#efeee9;--accent:#3550c8;--okbg:#e6f3ec;--warnbg:#fbefe0;--badbg:#fbe9e7}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#161615;--card:#1f1f1d;--ink:#ecebe6;--muted:#a3a29b;
--line:#33332f;--ok:#5cc28d;--warn:#f0a44a;--bad:#f2867e;--chip:#2a2a27;--accent:#8ea0ff;--okbg:#1b2d23;--warnbg:#33281a;--badbg:#3a1f1d}}
:root[data-theme="dark"]{--bg:#161615;--card:#1f1f1d;--ink:#ecebe6;--muted:#a3a29b;--line:#33332f;--ok:#5cc28d;--warn:#f0a44a;
--bad:#f2867e;--chip:#2a2a27;--accent:#8ea0ff;--okbg:#1b2d23;--warnbg:#33281a;--badbg:#3a1f1d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.7 "Segoe UI",Tahoma,sans-serif}
main{max-width:1100px;margin:auto;padding:24px 16px 64px}h1{font-size:26px;margin:0 0 4px}h2{font-size:20px;margin:28px 0 8px}
h3{font-size:16px;margin:16px 0 6px}.sub{color:var(--muted);margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:14px 0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:14px 0}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.kpi b{display:block;font-size:24px;font-variant-numeric:tabular-nums}.kpi span{color:var(--muted);font-size:13px}
.verdict{border-radius:12px;padding:14px 18px;margin:14px 0;border:1px solid var(--line)}
.v-ok{background:var(--okbg)}.v-warn{background:var(--warnbg)}.v-bad{background:var(--badbg)}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{border-bottom:1px solid var(--line);padding:7px 6px;text-align:start;vertical-align:top}
th{color:var(--muted);font-weight:600;white-space:nowrap}td.n{font-variant-numeric:tabular-nums;white-space:nowrap}
.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad);font-weight:600}.small{font-size:12.5px;color:var(--muted)}
.tag{display:inline-block;border-radius:99px;padding:1px 10px;font-size:12.5px;font-weight:600}
.t-bug{background:var(--badbg);color:var(--bad)}.t-q{background:var(--warnbg);color:var(--warn)}.t-ok{background:var(--okbg);color:var(--ok)}
details summary{cursor:pointer;color:var(--accent)}code{background:var(--chip);border-radius:4px;padding:0 4px;font-size:13px}
ol li,ul li{margin:4px 0}.bar{display:inline-block;height:10px;border-radius:3px;background:var(--accent);vertical-align:middle;margin-inline-start:6px}
"""


def esc(x) -> str:
    return html.escape(str(x)) if x is not None else "—"


def pct(a: int, b: int) -> str:
    return f"{100 * a / b:.1f}%" if b else "—"


def quantile(xs: list[float], q: float) -> float:
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * len(xs)))] if xs else 0


def table(head: list[str], rows: list[list], numeric_from: int = 1) -> str:
    th = "".join(f"<th>{esc(h)}</th>" for h in head)
    body = "".join("<tr>" + "".join(f"<td class='{'n' if i >= numeric_from else ''}'>{c}</td>" for i, c in enumerate(r)) + "</tr>"
                   for r in rows)
    return f"<div class='scroll'><table><tr>{th}</tr>{body}</table></div>"


def bucket_sem(m: int) -> str:
    return "الترم 1–2" if m <= 2 else "الترم 3–4" if m <= 4 else "الترم 5–6" if m <= 6 else "الترم 7–8" if m <= 8 \
        else "الترم 9–10" if m <= 10 else "بعد الترم 10"


def bucket_gpa(g) -> str:
    if g is None:
        return "مفيش معدل لسه"
    return "أقل من 2.00" if g < 2 else "2.00 – 2.99" if g < 3 else "3.00 فأكتر"


def bucket_hours(h: int) -> str:
    for lo, hi in ((0, 32), (32, 64), (64, 96), (96, 130), (130, 160)):
        if h < hi:
            return f"{lo}–{hi - 1} ساعة"
    return "160 (خلّص)"


def coverage(results: list[dict]) -> str:
    parts = []
    for title, key in (("الترم اللي الطالب فيه", lambda r: bucket_sem(r["main_now"])),
                       ("المعدل التراكمي المتوقع", lambda r: bucket_gpa(r["cgpa"])),
                       ("الساعات الناجحة بعد الترم الحالي", lambda r: bucket_hours(r["earned"])),
                       ("الترم الحالي", lambda r: {"fall": "خريف", "spring": "ربيع", "summer": "صيفي"}[r["current"]]),
                       ("حد الساعات", lambda r: f"{r['cap']} ساعة")):
        c = Counter(key(r) for r in results if "main_now" in r)
        mx = max(c.values())
        rows = [[esc(k), f"{v}<span class='bar' style='width:{int(120 * v / mx)}px'></span>"] for k, v in sorted(c.items())]
        parts.append(f"<div class='card'><h3>{title}</h3>{table(['', 'عدد الطلاب'], rows)}</div>")
    return "<div class='kpis' style='grid-template-columns:repeat(auto-fit,minmax(300px,1fr))'>" + "".join(parts) + "</div>"


def answers(results: list[dict]) -> str:
    rows = []
    for y in ("4", "4.5", "5"):
        for s, s_ar in (("0", "من غير صيفي"), ("1", "مع الصيفي")):
            cells = [r["cells"].get(f"{y}|{s}") for r in results]
            cells = [c for c in cells if c]
            c = Counter(x["status"] for x in cells)
            n = len(cells)
            rows.append([f"{TARGET_AR[y]} — {s_ar}", f"{c['feasible']} ({pct(c['feasible'], n)})",
                         f"{c['conditional']} ({pct(c['conditional'], n)})", f"{c['impossible']} ({pct(c['impossible'], n)})"])
    return table(["الهدف", "ممكن", "ممكن بشرط", "مش ممكن"], rows)


def asks(results: list[dict]) -> str:
    """How often the plans lean on the college or on paper (the 5-year plan with summer)."""
    cells = [r["cells"].get("5|1") for r in results]
    cells = [c for c in cells if c and c["status"] != "impossible" or c and c.get("grad")]
    n = len(cells)
    items = [("مواد في الصيفي (لو الكلية فتحتها)", sum(1 for c in cells if c["summer_courses"])),
             ("تدريب في ترم أساسي (بموافقة الكلية)", sum(1 for c in cells if c["training_main"])),
             ("مادة في غير ترمها في ترم التخرج (طلب للكلية)", sum(1 for c in cells if c["grad_request"])),
             ("مشروع بتسجيل ورقي (ساعات ناقصة جوه السماحية)", sum(1 for c in cells if c["paper_project"])),
             ("15 ساعة ورقي بمعدل تحت 2.00", sum(1 for c in cells if c["paper_load"])),
             ("ترم قبل التخرج أقل من 12 ساعة (موافقة المجلس)", sum(1 for c in cells if c["council"])),
             ("ترم التخرج أقل من 12 ساعة (ورقي)", sum(1 for c in cells if c["grad_under_12"])),
             ("خطة تحسين (خلّص المواد ومعدله تحت 2.00)", sum(1 for c in cells if c["improvement"]))]
    return table(["الخطة فيها", "عدد الخطط"], [[esc(k), f"{v} ({pct(v, n)})"] for k, v in items])


def timing(results: list[dict]) -> tuple[str, dict]:
    one = [c["ms"] for r in results for c in r["cells"].values() if c.get("ms") is not None]
    page = [r["ms_total"] for r in results if r.get("ms_total")]
    st = {"one_p50": quantile(one, .5), "one_p95": quantile(one, .95), "one_max": max(one, default=0),
          "page_p50": quantile(page, .5), "page_p95": quantile(page, .95), "page_max": max(page, default=0),
          "page_over_5s": sum(1 for x in page if x > 5000), "n": len(page)}
    rows = [["خطة واحدة (هدف واحد)", f"{st['one_p50'] / 1000:.2f} ث", f"{st['one_p95'] / 1000:.2f} ث", f"{st['one_max'] / 1000:.1f} ث"],
            ["جدول الأهداف كله (6 خطط، زي صفحة الخطة)", f"{st['page_p50'] / 1000:.2f} ث", f"{st['page_p95'] / 1000:.2f} ث",
             f"{st['page_max'] / 1000:.1f} ث"]]
    slow = sorted(results, key=lambda r: -(r.get("ms_total") or 0))[:8]
    slow_rows = [[esc(r["sid"]), f"{r['main_now']}", f"{r['earned']}", esc(r["cgpa"]), f"{r['cap']}",
                  f"{r['ms_total'] / 1000:.1f} ث"] for r in slow]
    html_ = (table(["", "النص (median)", "95% من الطلاب أقل من", "أبطأ حالة"], rows)
             + "<h3>أبطأ الحالات</h3>" + table(["الطالب", "الترم", "الساعات", "المعدل", "الحد", "6 خطط"], slow_rows))
    return html_, st


def problems_section(results: list[dict]) -> str:
    probs = [(r, p) for r in results for p in r["problems"]]
    if not probs:
        return "<p class='ok'>ولا مشكلة من الأنواع اللي تحت.</p>"
    by = Counter(p["kind"] for _, p in probs)
    rows = []
    for k, v in by.most_common():
        ex = [f"{esc(r['sid'])}: {esc(p['text'])}" for r, p in probs if p["kind"] == k][:5]
        studs = len({r["sid"] for r, p in probs if p["kind"] == k})
        rows.append([esc(PROBLEM_AR.get(k, k)), f"{v}", f"{studs}",
                     "<details><summary>أمثلة</summary>" + "<br>".join(ex) + "</details>"])
    return table(["المشكلة", "مرات", "طلاب", ""], rows)


def checks_list(results: list[dict]) -> str:
    by = Counter(p["kind"] for r in results for p in r["problems"])
    rows = [[esc(v), f"<span class='{'bad' if by[k] else 'ok'}'>{by[k] or '✓ صفر'}</span>"] for k, v in PROBLEM_AR.items()]
    return table(["اللي اتفحص", "مرات حصل"], rows)


def follow_section(results: list[dict]) -> tuple[str, dict]:
    fs = [r["follow"] for r in results if r.get("follow")]
    ok = sum(1 for f in fs if f["ok"] is True)
    bad = [f for f in fs if f["ok"] is False]
    under = sum(1 for f in fs if f["ok"] is None and "2.00" in (f["why"] or ""))
    noplan = sum(1 for f in fs if f["ok"] is None and "الحد الأقصى" in (f["why"] or ""))
    st = {"n": len(fs), "ok": ok, "bad": len(bad), "under2": under, "noplan": noplan}
    rows = [["اتخرج في الميعاد اللي الخطة قالته أو قبله", f"<span class='ok'>{ok}</span>"],
            ["اتخرج متأخر عن الميعاد، أو الميعاد اتأخر وهو ماشي على الخطة", f"<span class='{'bad' if bad else 'ok'}'>{len(bad)}</span>"],
            ["خلّص المواد بمعدل تحت 2.00 (لأن الاختبار ثبّت درجاته تحت 2.00)", f"{under}"],
            ["مفيش خطة جوه الحد الأقصى للدراسة من الأول", f"{noplan}"]]
    out = table(["النتيجة", "عدد الطلاب"], rows)
    if bad:
        out += "<details><summary>الحالات</summary>" + "<br>".join(esc(f["why"]) for f in bad[:20]) + "</details>"
    return out, st


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    data = json.loads((OUT / "plan_stress.json").read_text(encoding="utf-8"))
    results, meta = data["results"], data["meta"]
    findings = json.loads((OUT / "plan_stress_findings.json").read_text(encoding="utf-8")) \
        if (OUT / "plan_stress_findings.json").exists() else {"verdict": "", "items": [], "not_covered": []}
    n = len(results)
    n_answers = sum(len(r["cells"]) for r in results) + sum(1 for r in results if r.get("whatif"))
    n_probs = sum(len(r["problems"]) for r in results)
    bad_students = sum(1 for r in results if r["problems"])
    time_html, tst = timing(results)
    follow_html, fst = follow_section(results)
    kinds = Counter(r["meta"]["kind"] for r in results)
    profiles = Counter(r["meta"].get("profile", "").split("→")[0] for r in results if r["meta"]["kind"] == "lived")

    broken = sum(1 for r in results for p in r["problems"] if p["kind"] in ("invalid_plan", "crash", "oracle_disagrees"))
    cls = "v-ok" if not n_probs else "v-bad" if broken else "v-warn"
    items = []
    for it in findings["items"]:
        tag = {"bug": ("t-bug", "غلط في الكود"), "question": ("t-q", "محتاج قرار منكم"),
               "perf": ("t-q", "سرعة"), "ok": ("t-ok", "تمام")}[it["type"]]
        items.append(f"<div class='card'><span class='tag {tag[0]}'>{tag[1]}</span> <b>{esc(it['title'])}</b>"
                     f"<div>{it['body']}</div></div>")
    edge_rows = [[esc(r["meta"]["what"]), esc(r["cells"].get("4|1", {}).get("status") and STATUS_AR[r["cells"]["4|1"]["status"]]),
                  esc(r["cells"].get("5|1", {}).get("grad")), f"<span class='{'bad' if r['problems'] else 'ok'}'>{len(r['problems']) or '✓'}</span>"]
                 for r in results if r["meta"]["kind"] == "edge"]

    page = f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>اختبار خطة التخرج</title><style>{CSS}</style></head>
<body><main>
<h1>اختبار خطة التخرج في مساري</h1>
<p class="sub">{n:,} حالة طالب، كل واحدة اتسألت عن الأهداف التلاتة (4 / 4.5 / 5 سنين) مع الصيفي ومن غيره، وكل إجابة اتفحصت بحل مستقل.</p>

<div class="verdict {cls}"><b>الخلاصة:</b> {findings['verdict']}</div>

<div class="kpis">
<div class="kpi"><b>{n:,}</b><span>حالة طالب</span></div>
<div class="kpi"><b>{n_answers:,}</b><span>إجابة خطة اتفحصت</span></div>
<div class="kpi"><b class="{'bad' if broken else 'ok'}">{broken}</b><span>خطة مكسورة أو كود وقع</span></div>
<div class="kpi"><b class="{'warn' if bad_students else 'ok'}">{bad_students:,}</b><span>طالب فيه إجابة غلط ({n_probs} مرة على كل الأهداف)</span></div>
<div class="kpi"><b>{fst['ok']:,} / {fst['ok'] + fst['bad']:,}</b><span>طالب مشي على الخطة واتخرج في ميعادها</span></div>
<div class="kpi"><b>{tst['page_p50'] / 1000:.1f} ث</b><span>وقت صفحة الخطة (النص)، وأبطأ حالة {tst['page_max'] / 1000:.0f} ث</span></div>
</div>

<h2>اللي لقيناه</h2>
{''.join(items)}

<h2>عملنا الاختبار ازاي</h2>
<div class="card">
<p><b>ببساطة:</b> عملنا آلاف الطلاب الوهميين في كل الأوضاع اللي ممكن طالب يبقى فيها، وسألنا مساري لكل واحد: "أقدر أتخرج في 4 سنين؟ 4.5؟ 5؟ ولو مش هلحق، أقرب ميعاد إمتى؟".
وبعدين عملنا "حَكَم" مستقل: برنامج تاني مكتوب من الصفر من أرقام اللائحة (courses.json)، مش من كود مساري، بيدوّر بنفسه: هل فيه أي جدول مواد ممكن يوصّل الطالب للهدف؟
لو مساري قال "مش ممكن" والحكم لقى جدول، تبقى غلطة. ولو مساري قال "ممكن"، بنفحص الخطة اللي اداها سطر سطر.</p>
<h3>1. الطلاب ({n:,} حالة)</h3>
<ul>
<li><b>{kinds['lived']:,} طالب "عاش" تاريخ عشوائي</b> ترم ورا ترم من أول الكلية: 9 أنواع (متفوق، كويس، متوسط، ضعيف، متعثر، بيشتغل جنب الدراسة،
بياخد صيفي كتير، مبياخدش صيفي، درجاته متقلبة)، وربعهم بيتغير نوعه في النص (سنة وحشة أو رجوع). بيسقطوا وبيعيدوا (والإعادة أقصاها B+)، وبياخدوا التدريب في الصيفي أو في ترم أساسي، والمشاريع بالترتيب.
<span class="small">التوزيع: {esc(dict(profiles))}</span></li>
<li><b>{kinds['transfer']:,} طالب محوّل / معادلات:</b> المواد الناجح فيها مجموعة عشوائية (بس متطلباتها موجودة)، ومعاها شوية مواد ساقط فيها. دي بتعمل أوضاع غريبة مش هتطلع من المسار العادي.</li>
<li><b>{kinds['edge']:,} حالة على الحافة معمولة باليد:</b> طالب جديد، فاضل مشروع 3 بس، سقط في مشروع 1، ساعات تحت حد المشروع بساعة، معدل 2.00 و3.00 بالظبط، خلّص المواد ومعدله تحت 2.00، فاضل تدريب بس، فاضل مادة واحدة في غير ترمها، قرب الحد الأقصى للدراسة، بيعيد أول سلسلة طويلة.</li>
<li>الترم الحالي ممكن يكون خريف أو ربيع أو صيفي.</li>
</ul>
<h3>2. الأسئلة</h3>
<p>كل طالب اتسأل 6 أسئلة (3 أهداف × صيفي أو لأ)، زي جدول الأهداف في صفحة الخطة، وكمان سؤال "what-if" عشوائي: "لو سقطت في المادة دي وجبت معدل ترم كذا؟".</p>
<h3>3. الفحص (من غير ما نستخدم كود مساري)</h3>
<ol>
<li><b>الخطة نفسها تتنفذ؟</b> كل مادة فاضلة مرة واحدة، المتطلب قبلها، المادة في ترم بتتدرّس فيه (أو طلب واحد في ترم التخرج)، ساعات المشروع والتدريب (بالسماحية)، حد الساعات حسب المعدل
(14 تحت 2.00 → 12 لما الإنذار يبدأ، 15 ورقي لو كلهم 3 ساعات)، الصيفي 6 ساعات ومن غير مشاريع، المشاريع ورا بعض، والخطة توصل 160 ساعة.</li>
<li><b>الحكم صح؟</b> الحل المستقل (برنامج خطي بأعداد صحيحة اتكتب من جديد) بيقول هل فيه أي جدول بيلحق الهدف. بنقارن: "ممكن" / "ممكن بشرط" / "مش ممكن"، و"أقرب تخرج" فعلًا أقرب حاجة (الترم اللي قبله مستحيل).</li>
<li><b>منطقي مع نفسه؟</b> هدف أطول عمره ما يبقى أصعب، الصيفي عمره ما يأخّر، وجدول الأهداف في الصفحة بيقول نفس اللي في الخطة.</li>
<li><b>نمشي على الخطة:</b> {fst['n']:,} طالب عملوا اللي الخطة قالته بالظبط ونجحوا في كل حاجة (بدرجات بتخلّي المعدل في نفس الشريحة)، واتسألوا تاني كل ترم. هل اتخرجوا في الميعاد اللي اتوعدوا بيه؟</li>
</ol>
<p class="small">نفس الـ seed بيطلع نفس النتيجة. الفحص كله مكتوب من courses.json وقواعد الخطة اللي اتفقنا عليها، فلو القاعدة نفسها فهمها غلط، الاتنين هيغلطوا مع بعض: ده اللي محتاج مراجعة من حد بيفهم اللائحة (تحت).</p>
</div>

<h2>كل اللي اتفحص</h2>
<div class="card">{checks_list(results)}</div>

<h2>النتيجة بالتفصيل</h2>
<div class="card"><h3>المشاكل اللي الفحص لقاها</h3>{problems_section(results)}</div>
<div class="card"><h3>مشينا على الخطة لحد التخرج</h3>{follow_html}</div>
<div class="card"><h3>إجابات مساري على الطلاب دول</h3>{answers(results)}
<p class="small">"ممكن بشرط" = مش هيلحق وهو ماشي كده، بس هيلحق لو حضر صيفي أو رفع معدله لـ 3.00 (والخطة بتقوله الشرط).</p></div>
<div class="card"><h3>الخطط بتطلب إيه من الطالب والكلية (هدف 5 سنين مع الصيفي)</h3>{asks(results)}</div>
<div class="card"><h3>الحالات اللي على الحافة</h3>{table(['الحالة', '4 سنين مع الصيفي', 'التخرج (5 سنين مع الصيفي)', 'مشاكل'], edge_rows, 9)}</div>

<h2>اتغطى إيه</h2>
{coverage(results)}

<h2>السرعة</h2>
<div class="card">{time_html}
<p class="small">على جهاز واحد، 6 حالات في نفس الوقت. السيرفر بيحل خطة واحدة في المرة (قفل على الـ solver)، فلو طلاب كتير فتحوا الصفحة مع بعض هيستنوا ورا بعض.</p></div>

<h2>اللي الاختبار ده مبيغطيهوش</h2>
<div class="card"><ul>{''.join(f'<li>{x}</li>' for x in findings['not_covered'])}</ul></div>

<h2>تعيدوه ازاي</h2>
<div class="card"><code>.venv\\Scripts\\python.exe ai\\scripts\\stress_plan.py 2000</code> وبعدين
<code>.venv\\Scripts\\python.exe ai\\scripts\\stress_plan_report.py</code><br>
<span class="small">{meta['seconds'] // 60} دقيقة تقريبًا على الجهاز ده. الرقم = عدد الطلاب العشوائيين (غير حالات الحافة). كل إجابة بتفاصيلها في ai/simulation/plan_stress.json.</span></div>
</main></body></html>"""
    (OUT / "plan_stress_report.html").write_text(page, encoding="utf-8")
    print(f"wrote {OUT / 'plan_stress_report.html'}  students={n} answers={n_answers} problems={n_probs} "
          f"bad_students={bad_students} follow={fst} timing={ {k: round(v) for k, v in tst.items()} }")


if __name__ == "__main__":
    main()
