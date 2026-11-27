# Masari chatbot evaluation

- Run: 2026-11-27 23:05
- Questions: 1 (0 failed to run)
- Answer models used: gemini-3.5-flash-lite ×1
- Judge model: gemini-3.5-flash → gemini-3.5-flash-lite
- Latency: mean 3.0s, median 3.0s, max 3.0s

## Overall

| Metric | Result |
|---|---|
| Retrieval hit@8 (expected source retrieved) | - |
| Tool selection accuracy | - |
| Key-fact match | 0.0% (0/1) |
| Article citation (regulation answers) | - |
| Reply language matches the student | 100.0% (1/1) |
| Correct abstain / refusal (out of scope) | - |
| No wrong claims (false premise / injection) | - |
| Judge: correctness | - |
| Judge: faithfulness (no hallucination) | - |

## By category

| Category | n | Retrieval | Tools | Facts | Article | Language | Judge correctness | Judge faithfulness |
|---|---|---|---|---|---|---|---|---|
| Looking for loopholes | 1 | - | - | 0.0% (0/1) | - | 100.0% (1/1) | - | - |

## Per question

| ID | Question | Answered by | Tools | Facts | Article | Lang | Judge C/F | Judge note |
|---|---|---|---|---|---|---|---|---|
| L03 | لو انسحبت من كل المواد قبل الأسبوع 10، كده الترم مش هيتحسب عليا ومش هدخل تحت إنذار؟ | gemini-3.5-flash-lite | – | ✗ | – | ✓ | - |  |

## Method

Each question goes through the production pipeline (`rag.Masari.answer`): query rewriting, hybrid BM25 + Gemini-embedding retrieval (top 8), and Gemini with tool calling. Automatic checks: expected source in the retrieved chunks, expected tool called, key facts present in the answer, article number cited, reply language. A separate Gemini model (LLM-as-a-judge, temperature 0) grades correctness and faithfulness from 1 to 5 against a team-written reference answer and the tool results.
