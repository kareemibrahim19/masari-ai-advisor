# Masari chatbot evaluation

- Run: 2026-11-23 17:52
- Questions: 50 (0 failed to run)
- Answer models used: gemini-3.5-flash-lite ×50
- Judge model: gemini-3.5-flash → gemini-3.5-flash-lite
- Latency: mean 21.9s, median 11.2s, max 143.2s

## Overall

| Metric | Result |
|---|---|
| Retrieval hit@8 (expected source retrieved) | 96.4% (27/28) |
| Tool selection accuracy | 100.0% (14/14) |
| Key-fact match | 97.6% (40/41) |
| Article citation (regulation answers) | 100.0% (17/17) |
| Reply language matches the student | 100.0% (50/50) |
| Correct abstain / refusal (out of scope) | 100.0% (3/3) |
| Judge: correctness | 4.80/5 (n=50) |
| Judge: faithfulness (no hallucination) | 4.84/5 (n=50) |

## By category

| Category | n | Retrieval | Tools | Facts | Article | Language | Judge correctness | Judge faithfulness |
|---|---|---|---|---|---|---|---|---|
| Regulations (اللائحة) | 23 | 100.0% (20/20) | - | 100.0% (23/23) | 100.0% (17/17) | 100.0% (23/23) | 4.74/5 (n=23) | 4.83/5 (n=23) |
| Courses (المواد) | 8 | 85.7% (6/7) | - | 87.5% (7/8) | - | 100.0% (8/8) | 4.50/5 (n=8) | 4.50/5 (n=8) |
| Student data + tools | 14 | - | 100.0% (14/14) | 100.0% (8/8) | - | 100.0% (14/14) | 5.00/5 (n=14) | 5.00/5 (n=14) |
| Out of scope / refusal | 3 | - | - | - | - | 100.0% (3/3) | 5.00/5 (n=3) | 5.00/5 (n=3) |
| Multi-turn follow-ups | 2 | 100.0% (1/1) | - | 100.0% (2/2) | - | 100.0% (2/2) | 5.00/5 (n=2) | 5.00/5 (n=2) |

## Per question

| ID | Question | Answered by | Tools | Facts | Article | Lang | Judge C/F | Judge note |
|---|---|---|---|---|---|---|---|---|
| R01 | اقدر اسجل كام ساعة لو معدلي 2.5؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R02 | لو معدلي أقل من 2 أقدر أسجل كام ساعة؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R03 | What is the maximum credit load if my GPA is 3.2? | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R04 | أقصى عدد ساعات في الترم الصيفي كام؟ | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 4/5 | The bot correctly stated the maximum hours for the summer term, though it omitted the detail about projects. |
| R05 | الحد الأدنى للتسجيل في الترم الأساسي كام ساعة؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R06 | اقدر احذف مادة لحد امتى؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R07 | آخر ميعاد للانسحاب من مادة في الترم العادي امتى؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R08 | لو سقطت في مادة وعدتها، أعلى تقدير ممكن أجيبه كام؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R09 | كام مادة أقدر أحسّن فيها؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R10 | نسبة الغياب المسموح بيها كام؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R11 | محتاج كام ساعة معتمدة عشان أتخرج؟ | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 5/5 | ok |
| R12 | إيه شروط مرتبة الشرف؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 3/3 | The bot added a graduation honors GPA requirement of 3.6 that is not present in the reference answer. |
| R13 | امتى الطالب بيتحط تحت الإنذار الأكاديمي؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R14 | أقل درجة في الامتحان النهائي عشان أنجح في المادة كام؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R15 | How many weeks is the summer semester? | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R16 | إزاي أقدم طلب مراجعة على درجة مادة؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R17 | ينفع أحضر مادة كمستمع؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R18 | a2dr asagel kam sa3a law el gpa bta3y 1.8? | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R19 | إجمالي ساعات البرنامج كام وعلى كام ترم؟ | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 5/5 | ok |
| R20 | تقدير A- بيساوي كام نقطة؟ | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 4/5 | The bot correctly stated the GPA points for an A- grade, omitting only the optional percentage and course weight details. |
| R21 | الطالب بيتفصل من البرنامج امتى؟ | gemini-3.5-flash-lite | – | ✓ | ✓ | ✓ | 5/5 | ok |
| R22 | Can I register a graduation project in the summer semester? | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 5/5 | ok |
| R23 | أقل تقدير لازم أجيبه في المادة عشان تتحسب متطلب سابق لمادة بعدها؟ | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 3/3 | Mentioned the correct grade D, but included an unnecessary or invented course number reference. |
| C01 | إيه المتطلب السابق لمادة التعلم العميق؟ | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 5/5 | ok |
| C02 | مادة CSE 112 كام ساعة ومتطلبها إيه؟ | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 5/5 | ok |
| C03 | What are the prerequisites for the Computer Vision course? | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 5/5 | ok |
| C04 | امتى أقدر أسجل مشروع 1؟ | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 5/5 | ok |
| C05 | مواد الترم الأول في الخطة إيه؟ | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 5/5 | ok |
| C06 | كام مادة اختيارية لازم آخدها في البرنامج؟ | gemini-3.5-flash-lite | – | ✗ | – | ✓ | 1/1 | The bot stated the number of elective courses is 6 instead of the correct 5. |
| C07 | التدريب العملي ARI 171 بيدخل في المعدل؟ | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 5/5 | ok |
| C08 | فريق مشروع التخرج بيبقى كام طالب؟ | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 5/5 | ok |
| S01 | أقدر أسجل كام ساعة الترم ده؟ | gemini-3.5-flash-lite | credit_limit | ✓ | – | ✓ | 5/5 | ok |
| S02 | أقدر أسجل كام ساعة الترم ده؟ | gemini-3.5-flash-lite | credit_limit | ✓ | – | ✓ | 5/5 | ok |
| S03 | أنا تحت الإنذار الأكاديمي؟ | gemini-3.5-flash-lite | academic_standing | – | – | ✓ | 5/5 | The bot correctly answers in Egyptian Arabic and accurately uses the tool data. |
| S04 | أقدر أسجل التعلم العميق الترم ده؟ | gemini-3.5-flash-lite | registration_eligibility | ✓ | – | ✓ | 5/5 | ok |
| S05 | أنا هتخرج امتى؟ | gemini-3.5-flash-lite | graduation_plan | – | – | ✓ | 5/5 | ok |
| S06 | أنا في مستوى كام؟ | gemini-3.5-flash-lite | academic_level | ✓ | – | ✓ | 5/5 | ok |
| S07 | انهي مواد أحسّن فيها عشان معدلي يعلى؟ | gemini-3.5-flash-lite | improvement_candidates | – | – | ✓ | 5/5 | ok |
| S08 | معدلي التراكمي كام؟ | gemini-3.5-flash-lite | gpa_calculator | ✓ | – | ✓ | 5/5 | ok |
| S09 | مين المرشد الأكاديمي بتاعي؟ | gemini-3.5-flash-lite | my_advisor | ✓ | – | ✓ | 5/5 | ok |
| S10 | Am I on academic probation, and how many credits can I take? | gemini-3.5-flash-lite | academic_standing, credit_limit | ✓ | – | ✓ | 5/5 | ok |
| S11 | مين بيدرّس الشبكات العصبونية؟ | gemini-3.5-flash-lite | recommend_instructor | – | – | ✓ | 5/5 | ok |
| S12 | عايز ابعت إيميل للمرشد بتاعي عشان عندي ظروف عائلية وعايز انسحب من الترم | gemini-3.5-flash-lite | contact_advisor | – | – | ✓ | 5/5 | ok |
| S13 | أقدر أتخرج في 4 سنين؟ | gemini-3.5-flash-lite | graduation_plan | – | – | ✓ | 5/5 | ok |
| S14 | غبت 4 محاضرات من 28 في مادة، كده أنا في أمان؟ | gemini-3.5-flash-lite | attendance_check | ✓ | – | ✓ | 5/5 | ok |
| O01 | مصاريف الترم كام جنيه؟ | gemini-3.5-flash-lite | – | – | – | ✓ | 5/5 | ok |
| O02 | مين رئيس جامعة المنصورة الحالي؟ | gemini-3.5-flash-lite | – | – | – | ✓ | 5/5 | ok |
| O03 | Can you write me a Python function that sorts a list? | gemini-3.5-flash-lite | – | – | – | ✓ | 5/5 | ok |
| M01 | طب والصيفي؟ | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 5/5 | ok |
| M02 | ومتطلبها السابق إيه؟ | gemini-3.5-flash-lite | – | ✓ | – | ✓ | 5/5 | ok |

## Method

Each question goes through the production pipeline (`rag.Masari.answer`): query rewriting, hybrid BM25 + Gemini-embedding retrieval (top 8), and Gemini with tool calling. Automatic checks: expected source in the retrieved chunks, expected tool called, key facts present in the answer, article number cited, reply language. A separate Gemini model (LLM-as-a-judge, temperature 0) grades correctness and faithfulness from 1 to 5 against a team-written reference answer and the tool results.
