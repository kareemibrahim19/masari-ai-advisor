# Masari chatbot evaluation

- Run: 2026-11-27 23:02
- Questions: 4 (0 failed to run)
- Answer models used: gemini-3.5-flash-lite ×4
- Judge model: gemini-3.5-flash → gemini-3.5-flash-lite
- Latency: mean 2.7s, median 2.8s, max 3.1s

## Overall

| Metric | Result |
|---|---|
| Retrieval hit@8 (expected source retrieved) | - |
| Tool selection accuracy | 100.0% (1/1) |
| Key-fact match | 66.7% (2/3) |
| Article citation (regulation answers) | - |
| Reply language matches the student | 100.0% (4/4) |
| Correct abstain / refusal (out of scope) | - |
| No wrong claims (false premise / injection) | - |
| Judge: correctness | 5.00/5 (n=4) |
| Judge: faithfulness (no hallucination) | 5.00/5 (n=4) |

## By category

| Category | n | Retrieval | Tools | Facts | Article | Language | Judge correctness | Judge faithfulness |
|---|---|---|---|---|---|---|---|---|
| Stress and frustration | 1 | - | - | - | - | 100.0% (1/1) | 5.00/5 (n=1) | 5.00/5 (n=1) |
| Looking for loopholes | 2 | - | 100.0% (1/1) | 50.0% (1/2) | - | 100.0% (2/2) | 5.00/5 (n=2) | 5.00/5 (n=2) |
| Unclear or messy questions | 1 | - | - | 100.0% (1/1) | - | 100.0% (1/1) | 5.00/5 (n=1) | 5.00/5 (n=1) |

## Per question

| ID | Question | Answered by | Tools | Facts | Article | Lang | Judge C/F | Judge note |
|---|---|---|---|---|---|---|---|---|
| E04 | أنا تعبان نفسيًا ومش قادر أذاكر خالص والامتحانات قربت | gemini-3.5-flash-lite | – | – | – | ✓ | 5/5 | ok |
| L02 | لو حضرت 70% بس من المحاضرات، هيحصل إيه؟ | gemini-3.5-flash-lite | attendance_check | ✓ | – | ✓ | 5/5 | ok |
| L03 | لو انسحبت من كل المواد قبل الأسبوع 10، كده الترم مش هيتحسب عليا ومش هدخل تحت إنذار؟ | gemini-3.5-flash-lite | – | ✗ | – | ✓ | 5/5 | ok |
| X03 | عايز اعرف الحد الأقصى للساعات لو معدلي 2.3، وآخر ميعاد للانسحاب، ونسبة الغياب المسموحة، وأقدر أحسّن كام مادة؟ | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 5/5 | ok |

## Method

Each question goes through the production pipeline (`rag.Masari.answer`): query rewriting, hybrid BM25 + Gemini-embedding retrieval (top 8), and Gemini with tool calling. Automatic checks: expected source in the retrieved chunks, expected tool called, key facts present in the answer, article number cited, reply language. A separate Gemini model (LLM-as-a-judge, temperature 0) grades correctness and faithfulness from 1 to 5 against a team-written reference answer and the tool results.
