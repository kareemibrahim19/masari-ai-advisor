"""Where a room is: the building and floor of a hall or lab, and the link that opens it on the website's campus map.

The rooms come from campus_rooms.json, exported from the website's map (ai/scripts/export_campus_rooms.mjs), so
the chat and the map always agree. Numbers work the way students write them: "308" or "H308" (Programs building),
"2012" or "B2012" (general building), "23A", "Hall 13"; a lab can be asked for by its name.
"""

import json
import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

ROOMS_FILE = Path(__file__).with_name("campus_rooms.json")
_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
# Words students put before a number: "قاعة 308", "مدرج 2012", "room 308"...
_PREFIX = re.compile(r"^(قاعة|قاعه|مدرج|اوضة|أوضة|اوضه|room)\s*(?=[\dA-Za-z])", re.IGNORECASE)


@lru_cache(maxsize=1)
def _rooms() -> list[dict]:
    return json.loads(ROOMS_FILE.read_text(encoding="utf-8"))["rooms"]


def _code_of(text: str) -> str:
    """'308' -> 'H308', '2012' -> 'B2012', 'hall 13' -> 'HALL13'; anything else as written, upper case, no spaces."""
    s = text.translate(_ARABIC_DIGITS).strip()
    s = _PREFIX.sub("", s).replace(" ", "").upper()
    s = re.sub(r"^(هول|قاعة)", "HALL", s)
    if re.fullmatch(r"\d{4}", s):
        return "B" + s
    if re.fullmatch(r"\d{3}", s):
        return "H" + s
    return s


def _find(query: str) -> dict | None:
    want = _code_of(query)
    for r in _rooms():
        if r["code"] and r["code"].replace(" ", "").upper() == want:
            return r
    q = query.strip().lower()
    exact = [r for r in _rooms() if q in (r["name_ar"].lower(), r["name_en"].lower())]
    if exact:
        return exact[0]
    # a lab or office by name: the shortest name containing every word ("معمل الهوائيات" -> the antennas & AI lab)
    words = [w for w in query.split() if len(w) > 1 or w.isdigit()]
    named = [r for r in _rooms() if words and all(w in r["name_ar"] or w.lower() in r["name_en"].lower() for w in words)]
    return min(named, key=lambda r: len(r["name_ar"])) if named else None


def room_location(room: str) -> dict:
    """The building and floor of a room, with the campus map link (the website shows it as a button)."""
    r = _find(room or "")
    if not r:
        return {"found": False,
                "error": f"مفيش قاعة أو معمل اسمه '{room}' على خريطة الكلية. اتأكد من الرقم (زي 308 أو B2012)، "
                         "أو افتح خريطة الكلية من الأيقونة اللي فوق جنب الكاليندر ودوّر عليها."}
    label = r["code"] or r["name_ar"]
    where = f"{r['building_ar']}، الدور {r['floor_ar']}"
    if r["part_ar"] not in (r["building_ar"], "مبنى البرامج"):
        where += f" ({r['part_ar']})"
    return {
        "found": True,
        "room": label,
        "name_ar": r["name_ar"],
        "building_ar": r["building_ar"],
        "floor_ar": r["floor_ar"],
        "where_ar": where,
        "map_link": f"/map?room={quote(r['map_room'])}",
        "inferred_number": r["inferred"],
        "explanation": f"{label} ({r['name_ar']}) في {where}. الطالب يقدر يفتحها على خريطة الكلية من الزرار اللي تحت الرد، "
                       "وهيلاقي الطريق ليها خطوة بخطوة.",
        # The website turns this into an "open on the map" button under the answer.
        "action": {"type": "campus_map", "room": r["map_room"], "label": label},
    }
