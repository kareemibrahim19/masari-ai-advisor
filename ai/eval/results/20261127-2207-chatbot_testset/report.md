# Masari chatbot evaluation

- Run: 2026-11-27 22:07
- Questions: 10 (0 failed to run)
- Answer models used: gemini-3.5-flash-lite ×4, gemini-3.5-flash ×6
- Judge model: gemini-3.5-flash → gemini-3.5-flash-lite
- Latency: mean 21.5s, median 12.1s, max 66.0s

## Overall

| Metric | Result |
|---|---|
| Retrieval hit@8 (expected source retrieved) | 100.0% (6/6) |
| Tool selection accuracy | 100.0% (4/4) |
| Key-fact match | 100.0% (9/9) |
| Article citation (regulation answers) | 100.0% (4/4) |
| Reply language matches the student | 100.0% (10/10) |
| Correct abstain / refusal (out of scope) | - |
| No wrong claims (false premise / injection) | - |
| Judge: correctness | 5.00/5 (n=10) |
| Judge: faithfulness (no hallucination) | 4.80/5 (n=10) |

## By category

| Category | n | Retrieval | Tools | Facts | Article | Language | Judge correctness | Judge faithfulness |
|---|---|---|---|---|---|---|---|---|
| Regulations (اللائحة) | 4 | 100.0% (4/4) | - | 100.0% (4/4) | 100.0% (4/4) | 100.0% (4/4) | 5.00/5 (n=4) | 4.50/5 (n=4) |
| Courses (المواد) | 2 | 100.0% (2/2) | - | 100.0% (2/2) | - | 100.0% (2/2) | 5.00/5 (n=2) | 5.00/5 (n=2) |
| Student data + tools | 4 | - | 100.0% (4/4) | 100.0% (3/3) | - | 100.0% (4/4) | 5.00/5 (n=4) | 5.00/5 (n=4) |

## Per question

| ID | Question | Answered by | Tools | Facts | Article | Lang | Judge C/F | Judge note |
|---|---|---|---|---|---|---|---|---|
| R01 | اقدر اسجل كام ساعة لو معدلي 2.5؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R13 | امتى الطالب بيتحط تحت الإنذار الأكاديمي؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R18 | a2dr asagel kam sa3a law el gpa bta3y 1.8? | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R21 | الطالب بيتفصل من البرنامج امتى؟ | gemini-3.5-flash | – | ✓ | ✓ | ✓ | 5/3 | The bot accurately answered the main question but included additional rules and exceptions not present in the reference context. |
| C04 | امتى أقدر أسجل مشروع 1؟ | gemini-3.5-flash | – | ✓ | – | ✓ | 5/5 | ok |
| C06 | كام مادة اختيارية لازم آخدها في البرنامج؟ | gemini-3.5-flash | – | ✓ | – | ✓ | 5/5 | ok |
| S01 | أقدر أسجل كام ساعة الترم ده؟ | gemini-3.5-flash | credit_limit | ✓ | – | ✓ | 5/5 | ok |
| S03 | أنا تحت الإنذار الأكاديمي؟ | gemini-3.5-flash | academic_standing | – | – | ✓ | 5/5 | ok |
| S06 | أنا في مستوى كام؟ | gemini-3.5-flash | academic_level | ✓ | – | ✓ | 5/5 | ok |
| S10 | Am I on academic probation, and how many credits can I take? | gemini-3.5-flash-lite | academic_standing, credit_limit | ✓ | – | ✓ | 5/5 | ok |

## Method

Each question goes through the production pipeline (`rag.Masari.answer`): query rewriting, hybrid BM25 + Gemini-embedding retrieval (top 8), and Gemini with tool calling. Automatic checks: expected source in the retrieved chunks, expected tool called, key facts present in the answer, article number cited, reply language. A separate Gemini model (LLM-as-a-judge, temperature 0) grades correctness and faithfulness from 1 to 5 against a team-written reference answer and the tool results.
