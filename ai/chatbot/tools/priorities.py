"""How much each course of the current term matters for graduation: if the student does not pass it this term,
how many main semesters later is the earliest graduation? Worked out with the graduation planner (planner.py),
so summer courses on request, projects in order and the load cap after a lower GPA all count.

It also says when graduation stays on time only through something the college has to agree to: a summer course
that opens if enough students ask, or a course off its term by request. Such a course matters more than one that
needs nothing.

The website turns this into the course's priority (frontend/src/lib/rules.ts coursePriority), together with how
many later courses need it. A first-year student's plan takes a while to solve, so the answers are cached and
warm_up() works them out for every student in the background when the server starts.
"""

import threading
from functools import lru_cache

from . import _data as d
from . import planner as P


# Placements that happen only if the college agrees (see planner.FLAG_AR).
CONDITIONAL = {"summer_on_demand", "college_request", "graduation_request", "open_request"}


def _earliest(s: dict, current: dict, main_now: int, failed: list[str], start: int) -> tuple[int | None, int]:
    """The earliest main semester the student can graduate in, failing `failed` this term (None: not in 10 years),
    and how many courses that plan places by a summer opening or a college request."""
    proj = P._projection(s, failed, None)
    if "error" in proj:
        return None, 0
    cap, _ = P._load_cap(proj["cgpa"], main_now)
    last, _, placed = P._earliest(proj, cap, current, main_now, True, start)
    return last, sum(flag in CONDITIONAL for _, flag in (placed or {}).values())


@lru_cache(maxsize=256)
def _delays(student_id: str, codes: tuple[str, ...]) -> tuple[dict[str, int | None], dict[str, bool]]:
    s = d.get_student(student_id)
    current = P.current_or_frozen(s)
    main_now = s["academic_status"]["main_semesters_completed"] + (0 if current["term"] == "summer" else 1)
    base, base_requests = _earliest(s, current, main_now, [], main_now)
    if base is None:
        return {c: None for c in codes}, {c: False for c in codes}
    delays, needs_request = {}, {}
    for code in codes:
        # Failing a course never makes graduation earlier, so the search starts at the baseline.
        later, requests = _earliest(s, current, main_now, [code], base)
        delays[code] = None if later is None else later - base
        # On time, but only with one more summer opening or college request than the plan needs now.
        needs_request[code] = later == base and requests > base_requests
    return delays, needs_request


def graduation_delays(student_id: str) -> dict:
    """{"found", "student_id", "delays": {code: semesters later, or None if not within the 10-year limit},
    "needs_request": {code: graduation stays on time only through a summer opening or a college request}}."""
    s = d.get_student(student_id)
    if not s:
        return d.not_found("الطالب", student_id)
    current = P.current_or_frozen(s)
    if not current or current["status"] == "frozen":
        return {"found": True, "student_id": student_id, "delays": {}, "needs_request": {}}
    codes = tuple(sorted(c["code"] for c in current["courses"]))
    delays, needs_request = _delays(student_id, codes)
    return {"found": True, "student_id": student_id, "delays": delays, "needs_request": needs_request}


def warm_up() -> None:
    """Fill the cache for every student, in a background thread (the slowest takes ~20 s)."""

    def run():
        for student_id in d.students():
            try:
                graduation_delays(student_id)
            except Exception:  # noqa: BLE001  a student whose plan fails is answered (and logged) on request
                pass

    threading.Thread(target=run, name="graduation-delays", daemon=True).start()
