"""Which language the student wrote in, so the answer can be forced into the same one.

Everything we send the model besides the question is Arabic (the instructions, the regulations, the rules
JSON, the tools' explanations, earlier answers). With that much Arabic around an English question, the model
sometimes drifted into Arabic even though the prompt says "answer in the student's language". Detecting the
language in code and putting it in the request as an explicit order removes the guesswork.

Three results:
  "ar"     Arabic script (Egyptian slang or formal)
  "franco" Egyptian Arabic written with Latin letters and numbers ("3ayez a3raf")
  "en"     English
"""

import re

_ARABIC = re.compile(r"[؀-ۿ]")
_LATIN = re.compile(r"[A-Za-z]")
# Course codes like "CSE 351", "cse351" or "ARI-381" say nothing about the language.
_COURSE_CODE = re.compile(r"\b[A-Za-z]{3}[\s\-_]?\d{3}\b")
# A digit used as an Arabic letter inside a word: 3ayez, 7aga, a3raf, ba2a, 5alas, 6ab3an, 8air.
_FRANCO_DIGIT = re.compile(r"\b[A-Za-z]*[2356789][A-Za-z]+\b|\b[A-Za-z]+[2356789][A-Za-z]*\b")
# Frequent Franco-Arab words that are not English words.
_FRANCO_WORDS = {
    "ana", "enta", "enti", "ezay", "ezzay", "izay", "ezayak", "mesh", "msh", "elly", "ely", "eh", "eih", "leh",
    "lw", "law", "bs", "bas", "kda", "keda", "kman", "kaman", "dlw2ty", "delwa2ty", "delwaty", "tayeb", "taib",
    "aywa", "aywa", "la2", "momken", "mmkn", "3shan", "3lshan", "aashan", "fe", "fi", "ma3", "mn", "men", "ala",
    "3la", "ya", "yaani", "ya3ni", "khalas", "5alas", "wallahi", "inshallah", "ensha2allah", "ba2a", "baa",
    "7aga", "haga", "doctor", "dr", "mohadra", "mohadrat", "madda", "mada", "gadwal", "te3mel", "a3mel",
}


def detect_language(text: str) -> str:
    """"ar", "franco" or "en" for a student's question (mixed text goes by its letters)."""
    t = _COURSE_CODE.sub(" ", text or "")
    arabic, latin = len(_ARABIC.findall(t)), len(_LATIN.findall(t))
    if arabic and arabic >= latin:
        return "ar"
    if not latin:
        return "ar"
    words = re.findall(r"[A-Za-z0-9']+", t.lower())
    franco_hits = sum(1 for w in words if w in _FRANCO_WORDS) + len(_FRANCO_DIGIT.findall(t))
    # One or two Franco hits in a longer English sentence ("dr" for doctor) is still English.
    if franco_hits and franco_hits * 4 >= max(1, len(words)):
        return "franco"
    return "en"


ORDERS = {
    "en": ("Language of this reply: ENGLISH. The student wrote in English, so write the whole answer in English "
           "(course names, explanations, bullet points), even though the reference material and the tools' "
           "explanations are in Arabic: translate them. Keep course codes and article numbers as they are."),
    "ar": ("لغة الرد في هذه الرسالة: العربية. اكتب الرد كله بالعربية، وبنفس مستوى الطالب (عامية مصرية لو كتب عامية، "
           "وفصحى لو كتب فصحى)."),
    "franco": ("لغة الرد في هذه الرسالة: الطالب كتب فرانكو (عربي بحروف إنجليزية). رد بالعامية المصرية بالحروف "
               "العربية، ومتكتبش فرانكو."),
}


def language_order(question: str) -> str:
    return ORDERS[detect_language(question)]
