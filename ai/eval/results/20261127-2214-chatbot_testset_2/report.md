# Masari chatbot evaluation

- Run: 2026-11-27 22:14
- Questions: 9 (0 failed to run)
- Answer models used: gemini-3.5-flash ×1, gemini-3.5-flash-lite ×8
- Judge model: gemini-3.5-flash → gemini-3.5-flash-lite
- Latency: mean 8.2s, median 8.3s, max 15.7s

## Overall

| Metric | Result |
|---|---|
| Retrieval hit@8 (expected source retrieved) | 100.0% (4/4) |
| Tool selection accuracy | 100.0% (5/5) |
| Key-fact match | 100.0% (9/9) |
| Article citation (regulation answers) | 100.0% (2/2) |
| Reply language matches the student | 88.9% (8/9) |
| Correct abstain / refusal (out of scope) | - |
| No wrong claims (false premise / injection) | 100.0% (2/2) |
| Judge: correctness | 4.56/5 (n=9) |
| Judge: faithfulness (no hallucination) | 5.00/5 (n=9) |

## By category

| Category | n | Retrieval | Tools | Facts | Article | Language | Judge correctness | Judge faithfulness |
|---|---|---|---|---|---|---|---|---|
| Regulations (اللائحة) | 4 | 100.0% (4/4) | - | 100.0% (4/4) | 100.0% (2/2) | 100.0% (4/4) | 4.50/5 (n=4) | 5.00/5 (n=4) |
| Student data + tools | 5 | - | 100.0% (5/5) | 100.0% (5/5) | - | 80.0% (4/5) | 4.60/5 (n=5) | 5.00/5 (n=5) |

## Per question

| ID | Question | Answered by | Tools | Facts | Article | Lang | Judge C/F | Judge note |
|---|---|---|---|---|---|---|---|---|
| T01 | سمعت إن الحد الأقصى 24 ساعة لو معدلي فوق 3.5، صح؟ | gemini-3.5-flash | – | ✓ | ✓ | ✓ | 5/5 | ok |
| T09 | إجمالي ساعات المواد الاختيارية في البرنامج كام؟ | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 5/5 | ok |
| T10 | كام مادة اختيارية من المستوى 400 لازم أختار؟ | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 3/5 | The bot answered the correct number of level 400 courses but missed mentioning the level 300 courses required. |
| T11 | law ghebt aktar men 25% fe madda eh elly hy7sal? | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| T22 | عايز أسجل 18 ساعة الترم ده، ينفع؟ | gemini-3.5-flash-lite | credit_limit | ✓ | – | ✓ | 5/5 | ok |
| T24 | إحنا في الأسبوع 6، لسه ينفع أحذف مادة؟ | gemini-3.5-flash-lite | drop_withdraw_info | ✓ | – | ✓ | 5/5 | ok |
| T26 | أنا في مستوى كام؟ | gemini-3.5-flash-lite | academic_level | ✓ | – | ✗ | 4/5 | Bot answered with the correct level, but omitted the detail about level 100 starting from semester 3. |
| T27 | أنا تحت الإنذار؟ | gemini-3.5-flash-lite | academic_standing | ✓ | – | ✓ | 4/5 | The bot correctly answers the core question using the right language, though it misses the minor details about the GPA and semester count mentioned in the reference. |
| T28 | a2dar asagel CSE 351 el term da? | gemini-3.5-flash-lite | registration_eligibility | ✓ | – | ✓ | 5/5 | ok |

## Method

Each question goes through the production pipeline (`rag.Masari.answer`): query rewriting, hybrid BM25 + Gemini-embedding retrieval (top 8), and Gemini with tool calling. Automatic checks: expected source in the retrieved chunks, expected tool called, key facts present in the answer, article number cited, reply language. A separate Gemini model (LLM-as-a-judge, temperature 0) grades correctness and faithfulness from 1 to 5 against a team-written reference answer and the tool results.
