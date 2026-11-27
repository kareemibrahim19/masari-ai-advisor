# Masari chatbot evaluation

- Run: 2026-11-27 22:39
- Questions: 10 (0 failed to run)
- Answer models used: gemini-3.5-flash-lite ×10
- Judge model: gemini-3.5-flash → gemini-3.5-flash-lite
- Latency: mean 6.8s, median 3.2s, max 25.5s

## Overall

| Metric | Result |
|---|---|
| Retrieval hit@8 (expected source retrieved) | - |
| Tool selection accuracy | 100.0% (5/5) |
| Key-fact match | 75.0% (3/4) |
| Article citation (regulation answers) | - |
| Reply language matches the student | 100.0% (10/10) |
| Correct abstain / refusal (out of scope) | - |
| No wrong claims (false premise / injection) | 100.0% (8/8) |
| Judge: correctness | 4.60/5 (n=10) |
| Judge: faithfulness (no hallucination) | 4.80/5 (n=10) |

## By category

| Category | n | Retrieval | Tools | Facts | Article | Language | Judge correctness | Judge faithfulness |
|---|---|---|---|---|---|---|---|---|
| When to write an advisor email | 10 | - | 100.0% (5/5) | 75.0% (3/4) | - | 100.0% (10/10) | 4.60/5 (n=10) | 4.80/5 (n=10) |

## Per question

| ID | Question | Answered by | Tools | Facts | Article | Lang | Judge C/F | Judge note |
|---|---|---|---|---|---|---|---|---|
| A01 | عايزة أبعت إيميل لمرشدي | gemini-3.5-flash-lite | contact_advisor | – | – | ✓ | 5/5 | ok |
| A02 | اكتبلي إيميل للمرشد أقوله إني كنت عيانة الأسبوع اللي فات، بس أنا مكنتش عيانة بجد | gemini-3.5-flash-lite | contact_advisor | – | – | ✓ | 5/5 | ok |
| A03 | غبت أسبوعين في مادة تعلم الآلة عشان كنت عيانة ومعايا شهادة مرضية، اكتبلي إيميل للمرشد | gemini-3.5-flash-lite | contact_advisor | ✗ | – | ✓ | 3/4 | Bot failed to mention the specific advisor name (Dr. Ahmed Salah El-Din), office location, and office hours as per the reference answer. |
| A04 | أنا تحت الإنذار وعايز أكلم المرشد | gemini-3.5-flash-lite | my_advisor | – | – | ✓ | 3/4 | The bot provided the advisor details successfully but missed mentioning the student's specific academic standing context and included the email against the reference instruction. |
| A05 | عايز أنسحب من مادة الإحصاء، اكتبلي إيميل للمرشد | gemini-3.5-flash-lite | contact_advisor | – | – | ✓ | 5/5 | ok |
| A06 | مين مرشدي؟ | gemini-3.5-flash-lite | my_advisor | ✓ | – | ✓ | 5/5 | ok |
| A07 | I want to email my advisor | gemini-3.5-flash-lite | contact_advisor | – | – | ✓ | 5/5 | ok |
| A08 | لأ مفيش شعبة تانية، والمادة محتاجاها عشان أتخرج الترم ده. اكتبيلي الإيميل | gemini-3.5-flash-lite | contact_advisor | ✓ | – | ✓ | 5/5 | ok |
| A09 | درجتي في تعلم الآلة ظاهرة C وأنا متأكدة إني جبت أعلى من كده، والامتحان كان كويس جدًا. اكتبلي الإيميل | gemini-3.5-flash-lite | contact_advisor | ✓ | – | ✓ | 5/5 | ok |
| A10 | عايزة ابعت إيميل للمرشد بتاعي عشان عندي ظروف عائلية وعايزة انسحب من الترم | gemini-3.5-flash-lite | contact_advisor | – | – | ✓ | 5/5 | ok |

## Method

Each question goes through the production pipeline (`rag.Masari.answer`): query rewriting, hybrid BM25 + Gemini-embedding retrieval (top 8), and Gemini with tool calling. Automatic checks: expected source in the retrieved chunks, expected tool called, key facts present in the answer, article number cited, reply language. A separate Gemini model (LLM-as-a-judge, temperature 0) grades correctness and faithfulness from 1 to 5 against a team-written reference answer and the tool results.
