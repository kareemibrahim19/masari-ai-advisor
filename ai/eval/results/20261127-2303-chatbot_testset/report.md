# Masari chatbot evaluation

- Run: 2026-11-27 23:03
- Questions: 4 (0 failed to run)
- Answer models used: gemini-3.5-flash-lite ×4
- Judge model: gemini-3.5-flash → gemini-3.5-flash-lite
- Latency: mean 2.7s, median 2.8s, max 3.5s

## Overall

| Metric | Result |
|---|---|
| Retrieval hit@8 (expected source retrieved) | 100.0% (3/3) |
| Tool selection accuracy | 100.0% (1/1) |
| Key-fact match | 100.0% (4/4) |
| Article citation (regulation answers) | 100.0% (3/3) |
| Reply language matches the student | 100.0% (4/4) |
| Correct abstain / refusal (out of scope) | - |
| No wrong claims (false premise / injection) | - |
| Judge: correctness | 5.00/5 (n=4) |
| Judge: faithfulness (no hallucination) | 4.75/5 (n=4) |

## By category

| Category | n | Retrieval | Tools | Facts | Article | Language | Judge correctness | Judge faithfulness |
|---|---|---|---|---|---|---|---|---|
| Regulations (اللائحة) | 3 | 100.0% (3/3) | - | 100.0% (3/3) | 100.0% (3/3) | 100.0% (3/3) | 5.00/5 (n=3) | 4.67/5 (n=3) |
| Student data + tools | 1 | - | 100.0% (1/1) | 100.0% (1/1) | - | 100.0% (1/1) | 5.00/5 (n=1) | 5.00/5 (n=1) |

## Per question

| ID | Question | Answered by | Tools | Facts | Article | Lang | Judge C/F | Judge note |
|---|---|---|---|---|---|---|---|---|
| R06 | اقدر احذف مادة لحد امتى؟ | gemini-3.5-flash-lite | drop_withdraw_info | ✓ | ✓ | ✓ | 5/5 | ok |
| R07 | آخر ميعاد للانسحاب من مادة في الترم العادي امتى؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R10 | نسبة الغياب المسموح بيها كام؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/4 | The bot answered correctly and in the right language, though it added a minor unverified detail about professors. |
| S14 | غبت 4 محاضرات من 28 في مادة، كده أنا في أمان؟ | gemini-3.5-flash-lite | attendance_check | ✓ | – | ✓ | 5/5 | ok |

## Method

Each question goes through the production pipeline (`rag.Masari.answer`): query rewriting, hybrid BM25 + Gemini-embedding retrieval (top 8), and Gemini with tool calling. Automatic checks: expected source in the retrieved chunks, expected tool called, key facts present in the answer, article number cited, reply language. A separate Gemini model (LLM-as-a-judge, temperature 0) grades correctness and faithfulness from 1 to 5 against a team-written reference answer and the tool results.
