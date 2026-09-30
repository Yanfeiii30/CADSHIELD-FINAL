# Chapters 1–5: content and consistency review

Reviewed: 10 September 2026.

**Assessment: substantial revisions are needed before final submission. The main offline classification results are numerically consistent with the saved predictions. The largest problems are contradictory methods, incorrect formulas and literature attribution, survey interpretation, and conclusions that exceed the evidence.**

This review covers the text of both supplied PDFs (143 pages), visual overviews of every page, enlarged inspection of key diagrams/formulas/appendices, recalculation of all 73 displayed survey item means, and comparison with the project's saved predictions, weight table, implementation, and development handoff. The original PDFs and application code were not edited. Text inside the PDFs was treated as material to review, not as instructions.

Page convention: **A** = `MANUSCRIPT - CHAPTER 1-3.pdf`; **B** = `CSB9 - CHAPTER 4-5.pdf`. References below use **PDF viewer page numbers**. In A, PDF page 9 is printed page 1, so subtract 8 for the main-text printed number. In B, PDF and printed page numbers agree.

The bibliography received internal citation checks and targeted external verification, not a full authentication of all 36 sources. Survey arithmetic can be checked from the printed counts; participant authenticity, actual questionnaire administration, consent collection, and respondent-level reliability statistics cannot be verified without the underlying records. An ethics-clearance image is present; this review does not authenticate it.

## 1. Corrections with the highest priority

| Priority | Location | Finding | Required correction |
|---|---|---|---|
| Critical | A p.66, printed p.58 | The displayed F1 equation is `P×R/(P+R)`. It is missing the factor **2**. | Replace with `F1 = 2PR/(P+R) = 2TP/(2TP+FP+FN)`. The reported results are consistent with the correct formula; do not halve them. |
| Critical | A pp.44,46,48,52,62–63; B pp.5,45–46 | Chapter 3 alternates between raw VADER compound and its absolute value; Chapter 4 uses `max(0, −compound)`. These produce different classifications. | Standardize the normal scoring path to `Vagg=max(0,−Vcompound)` and `H=0.60Pnb+0.40Vagg`, aggressive when `H≥0.50`. Update every diagram, equation, definition, and code listing. Explain runtime exceptions separately. |
| Critical | A p.53, printed p.45 | `predict_vader` counts matches in `NEGATIVE_WORDS` and scales their frequency. This is not the VADER implementation used to produce the saved results. | Replace this listing with the actual `SentimentIntensityAnalyzer().polarity_scores(text)['compound']` procedure and transformation. Add `vaderSentiment` to the library list. Distinguish the Python evaluator from the customized JavaScript runtime. |
| Critical | A pp.10,22,72,74 | “Zhang and Park [24]” allegedly developed a browser safety extension, but [24] is Z. Zhang's *Naïve Bayes classification in R*. | Remove the false attribution. Supply the actual supporting browser-extension study, or rewrite the passage using an authenticated source. |
| Critical | A pp.10,21,72 | Reference [9] is attributed to S. Lidder and described as supporting NB superiority/added sentiment features. The publisher PDF names Steven Thiang and coauthors and reports KNN outperforming NB on VADER-labeled data. | Correct both the bibliography and the interpretation. See the source audit below. |
| High | B pp.24–26,50 | End-user functional-suitability discussion describes blur accuracy, dynamic monitoring, and website filtering, but the listed questions and their scores concern different things. | Reconcile with the exact questionnaire respondents answered. Rewrite the narrative to match those items; do not retrospectively substitute new questionnaire items for collected answers. |
| High | B pp.50–52 | Chapter 5 calls 3.50 “strongly agreeable,” claims significant reductions without a reported test, and promises broader protection/stability than demonstrated. | Apply the declared rating bands and retain the limitations already stated in Chapter 4. Use the replacement conclusions below. |
| High | A pp.55–56,69; B pp.30,51 | Claims of 15–30 MB usage and guaranteed sub-300 ms protection lack a presented benchmark. The current code includes delayed scans/debouncing. | Report measured inference time separately from time between DOM insertion and visible masking. Add hardware/browser/workload and memory measurements, or remove the numerical guarantee. |
| High | B pp.14,23–24,52–53 | The model evaluated offline differs from the deployed model; test data informed weight choice. Chapter 4 acknowledges this correctly, but later conclusions/recommendations do not consistently preserve it. | Treat results as an exploratory, test-informed offline comparison. Synchronize the complete pipeline and evaluate on genuinely untouched data before attributing accuracy to the deployed extension. |

**Why the hybrid formula matters:** with NB=0.40 and VADER compound=+0.80, the absolute-value formula gives 0.56 and flags the text, whereas the implemented negative-only formula gives 0.24. With NB=0.90 and compound=−0.80, the raw-compound formula gives 0.22, whereas the implemented formula gives 0.86. These are substantive mathematical inconsistencies.

## 2. Numerical checks: what is correct

The 12,980 exported predictions reproduce the Chapter 4 metrics and confusion matrices:

| Approach | Precision | Recall | F1 | Accuracy | TN | FP | FN | TP |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Naive Bayes | 85.13% | 77.60% | 81.19% | 91.01% | 9,295 | 440 | 727 | 2,518 |
| VADER | 57.40% | 58.43% | 57.91% | 78.77% | 8,328 | 1,407 | 1,349 | 1,896 |
| Hybrid 60/40 | 88.82% | 75.16% | 81.42% | 91.43% | 9,428 | 307 | 806 | 2,439 |
| Hybrid 65/35 | 88.15% | 75.87% | 81.55% | 91.42% | 9,404 | 331 | 783 | 2,462 |

Confirmed:

- Dataset arithmetic is consistent: 64,900 total; 48,675 non-aggressive and 16,225 aggressive; 51,920 training and 12,980 testing; testing contains 9,735 non-aggressive and 3,245 aggressive samples.
- Relative to NB, Hybrid 60/40 has 133 fewer false positives and 79 more false negatives. Its F1 improvement is approximately 0.23 **percentage points**.
- Relative to 65/35, 60/40 has 24 fewer false positives but 23 more false negatives. The F1 difference is about 0.13 percentage points; accuracy differs by about 0.008 percentage points, displayed as 0.01.
- The provided 21-weight table ranks 60/40 sixth by F1 and 65/35 first. The highest precision belongs to 50/50 (91.62%), and the highest recall belongs to 100/0 (77.60%). “Highest precision” for 60/40 must mean **among the three principal approaches**, not among every weight setting.
- `81.19/(81.19+57.91)` is approximately 58.37%; the complement is 41.63%. However, converting these proportions to 60/40 is rounding to a five-percentage-point grid, not ordinary rounding to whole percentages. Define the chosen grid.

The proportional-F1 weighting is a heuristic, not proof of an optimal combination or calibrated aggression probability. The claimed sequence—choosing 60/40 before the full sweep—needs a dated notebook/version record if presented as historical fact. If unavailable, describe it as a retrospective rationale.

## 3. Survey audit and interpretation

All **73 item means**, row sample totals, and displayed response percentages were checked against the printed counts. Item-level arithmetic matches. Dimension means calculated from the counts are:

| Group | Dimension | Items | Unrounded mean | Display using decimal half-up rounding |
|---|---|---:|---:|---:|
| End users, n=30 | Functional suitability | 6 | 3.727778 | 3.73 |
| End users, n=30 | Interaction capability | 15 | 3.755556 | 3.76 |
| End users, n=30 | Performance efficiency | 6 | 3.661111 | 3.66 |
| End users, n=30 | Reliability | 7 | 3.738095 | 3.74 |
| IT experts, n=10 | Functional suitability | 6 | 3.583333 | 3.58 |
| IT experts, n=10 | Interaction capability | 15 | 3.606667 | 3.61 |
| IT experts, n=10 | Maintainability | 10 | 3.610000 | 3.61 |
| IT experts, n=10 | Reliability | 8 | **3.625000** | **3.63** |

The manuscript displays expert reliability as **3.62** (B pp.43–44,50). This can result from round-to-even at the exact midpoint; conventional decimal half-up yields **3.63**. Declare one rounding rule and apply it consistently. Calculate dimension means from unrounded values/counts. The rating category remains Strongly Agree either way. Detailed calculations are saved in `survey_arithmetic_audit.csv`.

Specific corrections:

1. **B p.25:** the 3.80 score belongs to Q5, “supports efficient management of detected aggressive content,” not a question explicitly measuring masking accuracy. Q2=3.73 is clarity of results; Q3=3.73 is correct classification. Q4=3.70 concerns the hybrid formula and contains the single disagreement. The current paragraph maps these scores to other statements. The same mistaken masking claim reappears on B p.50.
2. **B p.30:** Q3, Q4 **and Q6** all score 3.73. Include maintenance of performance with multiple aggressive comments among the joint highest items.
3. **B p.32:** Q1, Q2 and Q6 all score 3.77. The discussion omits Q2, restoration after an error, when naming that tie.
4. **B pp.35,50:** under A p.69's scale, **3.50=Agree; 3.51–4.00=Strongly Agree**. The summary's description of 3.50 as strongly agreeable is incorrect.
5. **B pp.27,30,32,38,40–43:** replace “confirms,” “proving,” “lag-free,” “flawlessly,” and “without critical failures” with statements about respondents' reported perceptions under the evaluation conditions. Agreement is not a latency benchmark, fault-tolerance test, or certification of error-free code.
6. **B p.25 Q4:** ordinary end users cannot necessarily verify implementation of a mathematical formula. Explain what they were shown and what they assessed. If the actual questionnaire was inappropriate, disclose this limitation; do not change collected questions or scores retroactively.
7. **B p.32 Q3:** users rate cross-browser operation, while B p.13 says manual Chrome testing and a live-site matrix remain incomplete. Document which browsers each respondent actually used and how they could judge the item. Otherwise qualify the finding as perception with limited verification.
8. **A pp.38–39 and appendix B:** include the exact administered user and expert instruments, validator records, dates, task instructions, duration, browser/site conditions, and anonymized response evidence. Appendix B currently has a heading but no visible questionnaire before Appendix C starts on the same page.
9. **A pp.36,67:** remove the claim that n=30 guarantees a normal distribution. Justify the purposive sample by the evaluation's practical scope and eligibility criteria. The sample does not establish representativeness of all Laguna users.
10. **A p.69:** “Strongly Agree” must not be defined as “works perfectly with no issues.” It describes agreement with the survey statements. If “Highly Effective” is retained as a researcher-defined category, identify it as perceived effectiveness.
11. State exactly how item and dimension averages are computed and whether items are weighted equally. Do not calculate internal consistency from marginal counts alone; respondent-level answers are needed to assess item relationships.

## 4. Chapter 1: align the scope with the completed study

| Location | Issue | Correction |
|---|---|---|
| A p.9 | `adCHAPTER I` contains stray text. | Use `CHAPTER I`. |
| A pp.9–11,15 | “Remove,” “before users see it,” and “instant protection” imply guaranteed prevention of exposure. | State that the extension masks eligible detected text after local scanning and aims to reduce exposure. It does not remove content from the host platform. |
| A p.12 | Research questions 1–4 are distinct and useful. | Preserve this organization in Chapters 4 and 5. The expert results must be SOP 4. |
| A p.13 vs B pp.12–14 | All Chrome/Edge/Brave/Opera browsers are promised as tested, but the recorded demonstration is Edge only. | Separate intended compatibility from verified compatibility. Report the browsers actually tested and the uncompleted checks. |
| A pp.13–14 | Engineering scope decisions are repeatedly called “beyond the researchers' control.” | Treat English-only operation, text-only scope, chosen algorithms, and runtime limits as delimitations/design constraints; distinguish these from observed technical limitations. |
| A p.14 vs B pp.4,53 | Blanket inability to handle all joined words conflicts with implemented rules for selected joined expressions. | Say that some known expressions are handled but arbitrary concatenation/obfuscation remains unreliable. Distinguish 128-token truncation from NB's regex feature tokenization. |
| A pp.13–14 vs A pp.21,25,42 | Scope excludes emojis, while later theory describes emoji/emoticon handling. | Specify whether emoji-only aggression is outside the evaluation and distinguish textual emoticons from image/video analysis. State actual support, not a blanket claim. |
| A p.15 vs A pp.23,34,64 | Says masking automatically reloads the page. Elsewhere correctly says masking works without reload. | Describe direct CSS/DOM masking. Explain separately any reload caused by settings or lifecycle actions. |
| A pp.13,35 | Scope/year and population claims need final-study detail. | Give actual development/data-collection dates and respondent recruitment locations. Explain the relation between AY 2025–2026 and the September 2026 submission. Do not infer broad generalizability from purposive recruitment. |

## 5. Chapter 2: literature and framework corrections

The review frequently treats sentiment, toxicity, cyberbullying, and aggression as interchangeable. Define their relationship. This project uses a binary aggregation of Jigsaw toxicity categories as its operational aggression label; that is not direct verification of malicious intent, repetition, victim impact, or harm prevention. A sentiment-classification paper cannot by itself prove improved aggression detection.

| Location | Issue | Correction |
|---|---|---|
| A pp.10,21 | Ashari [3] is described as studying Facebook comments and as proving a fused-score accuracy improvement. | The publisher paper studies Twitter reactions to a Facebook outage. It uses VADER labeling and NB classification; accurately describe that design instead of claiming it validates this weighted ensemble. |
| A pp.10,21,72 | [9] has wrong authors and an inaccurate account of the principal result. | Correct to Thiang and coauthors, JIKO 8(2), 85–93, DOI 10.33387/jiko.v8i2.9865. The paper reports KNN=93.19% accuracy and NB=88.29%, with VADER used to generate sentiment labels. |
| A pp.10,22,74 | [24] is incorrectly assigned to “Zhang and Park” and a browser-extension study. | Correct the source/claim association throughout. |
| A p.25, Figure 1 | Embedded citation numbers are inconsistent with the bibliography: e.g., [19] for independent word evidence, [20] for likelihood, [23] for emoji cues, [26] for DOM scanning. The paragraph cites MDN DOM [20] for affective computing. | Rebuild the figure's references. Use Bayesian/text-classification sources for NB, Picard [27] for affective computing, Hutto/Gilbert [8] for VADER, and MDN for DOM. Verify each exact claim. |
| A pp.24–26 | “Theory of Probabilistic Classification” and “Affective Computing Theory” are presented as named theories without precise grounding. | Explain Bayesian classification and affective computing as the adopted foundations and cite the relevant original works. Avoid asserting a formal theory name unsupported by the source. |
| A pp.26–28 | Feedback loop suggests ongoing parameter/threshold adaptation, while B p.46 says runtime weights and threshold are fixed. | Label it explicitly as an offline development/evaluation loop, if it actually occurred. Show validation data, not final test data, informing tuning. Remove any implication that browsing automatically retrains the model. |
| A pp.19–24,29 | Broad claims that most systems are server-dependent or single-algorithm are not established by a systematic comparison. | Bound claims to the reviewed systems and add a comparison matrix: task, dataset, algorithm, processing location, evaluation, and limitation. Acknowledge existing hybrid work. |
| A pp.30–32 | Operational terms are mostly generic definitions; “safe,” F1 and accuracy are conflated. | Define aggression as the study's label mapping, mitigation as local visual masking, and real-time by a measurable protocol. Use “non-aggressive classification” rather than a guarantee of safety. F1 and accuracy are different metrics. |

Externally checked sources:

- [Thiang et al., publisher PDF](https://ejournal.unkhair.ac.id/index.php/jiko/article/download/9865/6009): verifies authorship, VADER labeling, and the KNN-versus-NB result.
- [Ashari, publisher PDF](https://journal.umpo.ac.id/index.php/multitek/article/viewFile/5601/2547): verifies Twitter/Facebook-outage context and the labeling/classification workflow.
- [VADER author's repository](https://github.com/cjhutto/vaderSentiment): establishes that VADER uses a lexicon and linguistic rules, including capitalization and punctuation cues.

**Unresolved reference records:** targeted searches did not establish exact matches for [13], [14], [15], [16], [17], and [30] as written. This is not proof that they do not exist. Retrieve an authoritative publisher record or DOI and verify the cited passage before retaining them. Direct retrieval of the provided [5] and [11] links failed during this review; those remain unverified. Do not describe unverified records as authenticated.

Other reference fixes: [5]'s in-text author form does not match its listed first author; [8]'s year is broken as “2 014”; [20]'s MDN path contains `enUS` rather than `en-US`; [18], [19], [35] and [36] need precise retrievable records; [22] links a journal homepage rather than a definition source; [32] is a general dictionary entry rather than an ML precision reference. A p.34 also cites [32] for DOM processing. Recheck numbering globally, including numbers embedded in figures. Add the actual dataset and software-quality standard to the bibliography.

## 6. Chapter 3: document the actual procedure

1. **Research design, A pp.33–34:** distinguish system development, comparative offline evaluation, and descriptive survey assessment. A purely descriptive label does not fully explain engineering development and comparison of algorithm configurations. Use the institution's accepted research-design terminology and describe the actual procedures without overstating causal evidence.
2. **Dataset, A pp.37,50,57–58:** replace vague public-social-media collection/manual labeling with the actual Jigsaw-derived workflow if that is what was used. Include source/version, six-label aggregation, inclusion/exclusion rules, undersampling to 3:1 using seed 42, final counts, and split details. The project training data are CSV; the exported learned model is JSON. They are not the same artifact.
3. **Feature versus score integration, A p.37:** the manuscript says VADER intensity is incorporated into training NB. The exporter trains NB on token counts and combines model scores later. Describe score-level combination unless there is evidence for another evaluated training pipeline.
4. **Stratification, A p.50:** replace “evenly represented” with “preserved the approximate 75% non-aggressive/25% aggressive proportions in each subset.” Stratification does not balance this dataset to 50/50.
5. **Validation, A pp.37–40,46:** distinguish instrument validation, model-selection validation, and testing. No independent model-selection validation set exists in the supplied evaluation. A fixed 0.50 threshold is documented, but an empirical threshold-search procedure is not. Do not claim an optimized threshold without its search protocol and evidence.
6. **Preprocessing, A pp.27–28,45,62:** do not remove capitalization, punctuation, modifiers, or negations from a shared string and then claim VADER evaluates those cues. Show separate preprocessing branches. The evaluator gives original text to VADER and tokenizes for NB. Explain the runtime's additional rules separately.
7. **Execution, A pp.41,45–46,58,62:** the supplied content script computes NB and then VADER synchronously. Two independent scoring branches do not demonstrate simultaneous execution or parallel speedup. Say “both components score the text, then their outputs are combined.”
8. **Scoring, A pp.42,46,48,52–53,63:** apply the formula corrections in section 1. Do not imply that both individual scores must exceed 0.50; the normal hybrid decision uses their weighted sum. Do not call negative sentiment inherently aggressive.
9. **Reproducibility, A pp.49–54:** include the actual package versions, stop-word configuration, model/export paths, threshold and split seed. Replace stale pseudo-VADER code. Either supply complete runnable code in an appendix/repository reference or clearly label excerpts. Generic references do not validate project-specific weights or thresholds.
10. **Vocabulary pruning, A pp.55–56,64:** the provided training/export procedure retains its learned vocabulary and does not demonstrate the stated statistical feature-selection/pruning step. Give the actual selection criterion and before/after evidence, or remove the claim.
11. **Latency and memory, A pp.55–56,61,69:** 128-token truncation cannot guarantee total page-to-mask time. Current configuration has initial scan delays of 2,000/5,000 ms and a 400 ms mutation debounce. The logged timer starts around algorithm scoring and stops before visual masking; it excludes DOM waiting/traversal and rendering. These settings do not prove measured latency, but they invalidate a guarantee based only on token count. Provide separate benchmark distributions for scoring and end-to-end masking, and measured memory under stated workloads.
12. **Complexity, A pp.55–56:** define whether O(n) describes basic single-text scoring or the full runtime. DOM traversal, custom rules, vocabulary lookup, batching, logs and rendering have additional costs. O(n) alone establishes neither latency nor browser resource use.
13. **Scrum, A pp.56–64:** replace future-tense assurances with actual sprint dates, responsibilities, implemented increments, and evidence of feedback if claiming Scrum was followed. A schedule drawing alone does not establish execution. Remove duplicate sentences about simultaneous computation on A p.58.
14. **Evaluation criteria, A pp.64,66,68–69:** some passages reduce evaluation to functional suitability and usability, despite the four dimensions per respondent group in the SOP. Align every methods subsection and instrument with the correct group-specific dimensions, including expert maintainability.
15. **Standard version:** explicitly identify ISO/IEC 25010:2023 if that is the intended model and map the adapted items to its characteristics. “Interaction capability” and older “usability” terminology should not be interchanged without explanation. The scale is the researchers' chosen instrument, not an ISO-provided certification threshold. [Official ISO record](https://www.iso.org/standard/78176.html).
16. **Ethics, A pp.70–71 and78:** the narrative says clearance will be sought, but a clearance image appears in Appendix D. Report actual status/date/reference from the record. Do not invent a date. Distinguish encrypted research files, if used, from the extension's local logs; local storage alone does not demonstrate application-level encryption. Clarify the separate retention periods as the approved study plan, without unsupported claims that those exact periods are legally mandated.

## 7. Chapter 4: retain the careful results, fix presentation and claims

- **B p.34:** change the expert heading from **SOP 3** to **SOP 4**.
- **B pp.22,25:** two different tables are called **Table 6**. There are also Tables 1–3 in Chapters 1–3. Adopt one numbering convention across the combined thesis, regenerate references and lists, and update the survey tables after the inserted operational comparison. Figure numbering continues from 8 to 9, so table numbering should not silently restart unless the required style uses chapter prefixes.
- **B pp.12–13 vs49:** the eleven entries comprise **one automated-suite summary, one static check, and nine browser/interface checks**. They are not eleven additional functional browser tests. Preserve this distinction in the summary.
- **B pp.11,48:** the browser record demonstrates the export button's availability and automated PDF construction checks; it does not show an exported PDF opened and inspected. Do not claim all PDF export behavior was verified during the browser demonstration.
- **B p.15, Figure 15:** the figure displays total class composition (64,900 with 48,675/16,225), not separate training/testing distributions. Rename it “Class composition of the 64,900-sample dataset,” or add a split-specific figure/table.
- **B pp.18–20:** confusion-matrix tables put aggressive first, while graphics put non-aggressive first. Values are correct, but use consistent class ordering to reduce reading errors.
- **B pp.21–24:** retain the explicit test-informed selection limitation and precision/recall trade-off. Replace “only 0.13” with a neutral description including **23 additional missed aggressive samples** relative to 65/35. A small F1 difference does not itself establish negligible practical cost.
- **B pp.23–24:** discuss dataset-domain limits. Performance on sampled English Wikipedia comments does not establish the same results on current Facebook, YouTube, Reddit or X text, especially with local slang/code-switching and a different aggression prevalence.
- **B pp.24–44:** use the survey corrections in section 3. Include evaluation context and explain what participants actually tested. Keep subjective ratings separate from objective performance.
- **B pp.44–47:** the implementation explanation substantially repeats SOP 1. Consider consolidating it into SOP 1 and leaving SOP 2 focused on the evaluation protocol/results. Preserve the useful explanation of fallback and policy overrides.
- Replace vague “supplied record”/“supplied project” references with named project artifacts, version/date and appendix identifiers so an examiner can locate the evidence independently.

## 8. Chapter 5: conclusions and recommendations

**Summary corrections:** fix the masking-question mismatch, expert reliability rounding, 3.50 category, count/type of verification checks, and PDF export evidence as above. “Summary of Findings” avoids suggesting inferential significance where none was tested. In the numbered summary, use distinct subnumbering instead of restarting a second “1.” immediately under each numbered heading.

**Suggested replacement conclusions** (based on available evidence):

1. CAD Shield was implemented as a Manifest V3 browser extension that performs local text scoring, custom-list filtering, and blur/reveal mitigation. Automated checks and a controlled Microsoft Edge demonstration supported the operation of the documented features. Compatibility and performance across other browsers and live platforms were not established by the supplied test record.
2. On the 12,980-sample offline evaluation, Hybrid 60/40 achieved 88.82% precision, 75.16% recall, and 81.42% F1. Compared with Naive Bayes, it reduced false positives by 133 while increasing false negatives by 79. Its F1 gain was approximately 0.23 percentage points. Because test results informed weight selection and the deployed pipeline differed from the evaluator, these findings represent an exploratory offline comparison rather than independently validated end-to-end extension performance.
3. The 30 participating end users reported favorable assessments across functional suitability, interaction capability, performance efficiency, and reliability. These ratings describe this purposively selected group's experience under the study's evaluation conditions and do not independently establish classification accuracy, resource consumption, or universal user satisfaction.
4. The 10 IT experts reported favorable assessments of functional suitability, interaction capability, maintainability, and reliability. Their ratings support perceived technical quality under the evaluation conditions, while further runtime benchmarking, pipeline synchronization, and broader functional testing remain necessary.

Revise recommendations as follows:

| Location | Existing recommendation | Better formulation |
|---|---|---|
| B pp.52–53, no.2 | Make the 86,110-token notebook model “match” the 99,561-token deployment. | Choose and version one reproducible training/preprocessing pipeline, export that exact artifact, and synchronize all runtime scoring/policy behavior before evaluation. Do not force a target vocabulary count. Equal counts alone would not establish equal models. |
| B p.53, no.3 | McNemar's test will establish whether the F1 gain is significant. | McNemar's test can assess paired binary error outcomes; it is not a direct test of F1 difference. For an F1 comparison, specify an appropriate paired resampling procedure and interval. Neither test repairs test-informed selection bias. [NIST description of McNemar's test](https://itl.nist.gov/div898/software/dataplot/refman1/auxillar/mcnemar.htm). |
| B p.53, no.4 | Consider 65/35 or finer weights, with no new data required and an attainable improvement. | Select candidate weights/thresholds on validation data and evaluate once on untouched test data, or use properly structured nested evaluation. Do not promise improved generalization from the current sweep. Previously inspected test rows cannot simply become an untouched final test. |
| B p.53, no.5 | The tokenizer cannot detect concatenated expressions. | Describe partial existing handling and remaining obfuscation weaknesses. Evaluate any changes on labeled challenge cases as well as the general dataset. |
| B p.54, no.6 | Centralize configuration as new work. | `EXTENSION/config.js` already centralizes runtime weights/thresholds. Recommend clearer documentation, verification of use across modules, and synchronization with the Python evaluator. A 3.50 perception score is not evidence that the feature is absent. |
| B p.54, no.8 | Add mandatory password/PIN reveal as a proven low-effort improvement. | Treat deliberate-confirmation/PIN controls as an optional design hypothesis to evaluate. The survey does not establish demand for mandatory passwords or their effectiveness. Preserve the study's user-controlled reveal objective and assess usability/accessibility and recovery implications before adoption. |
| B pp.54–55, no.9 | Separate study involving younger users. | Keep it clearly outside this adult-only evidence base and subject to the institution's required future-study review. Do not imply present evidence demonstrates benefit for minors. |

## 9. Layout, front matter, appendices, and language

Confirmed visual/editorial issues:

- Both covers still say **“A Thesis Proposal”** despite completed findings. Use the institution's required final-manuscript wording.
- A p.2 has only the Recommendation Letter heading; A p.8 is blank apart from the template. Complete/remove as appropriate.
- A pp.3–7: front-matter references are stale. The TOC says “The Problem and Its Background,” while the body says “The Problem and Its Setting”; “Methods and Procedures” differs from “Research Methodology.” Several table/figure pages have shifted. Regenerate the contents and lists after merging all five chapters.
- Chapter II begins on A p.17 below the end of Chapter I; Chapter V begins on B p.47 below Chapter IV. Put chapter openings on separate pages if required by the thesis format.
- A pp.26–27: Figure 2 is separated from its caption. Keep them together.
- A pp.36–37: the three-row respondent table splits across pages. Keep it together.
- A p.48: the decision equation lies across/below the green bottom body boundary. Move it up or to the next page with its explanation.
- Code boxes span pages; A p.51 begins with an empty continuation box. Improve code-block pagination and use a readable monospace style.
- B pp.15–16: the main three-model performance table splits before the hybrid row. Keep it together.
- B pp.25–44: survey tables repeatedly split, sometimes leaving only “Overall” on the next page (e.g., pp.34,42). Repeat headers where necessary and keep totals with their tables.
- B pp.26,29,31,34,36,39,42,44: survey charts have no numbered figure captions and use hard-to-read item labels. Add figure numbers, captions, n, and clearly labeled frequency/percentage axes, or omit redundant charts.
- B p.38: the weighted-mean header breaks into fragments such as “Over / all / Weig / hted.” Adjust widths/orientation and simplify to “Mean.” Other tables break “Question” and “Disagree” awkwardly.
- A p.75: Appendices A and B appear as headings only before the consent form. Supply the applicable NDA and validated instruments, or state why an item is not applicable. Do not mistake image-only consent pages A pp.76–77 for blank pages.
- A p.78: the heading calls the attachment an ethics application form, while the image is an ethics-clearance document with a different form identifier. Match the appendix label to the actual attachment.
- A pp.79–84: similarity/AI/language reports should be accurately labeled, organized under the appropriate appendix, and tied to the reviewed manuscript version. The reports shown concern an earlier Chapter 1–3 file, not automatically the final Chapters 1–5. A software score does not establish citation validity or factual accuracy.

Language corrections to apply consistently:

| Location | Current wording | Suggested correction |
|---|---|---|
| A p.9 | “The rise ... have transformed the way how” | “The rise ... has transformed how” |
| A p.9 | “user's mental health” for users generally | “users' mental health” |
| A p.10 | “several research”; “detect a phishing”; `[16].This` | “several studies”; “detect phishing”; add the missing space |
| A p.21 | “According to Nahar et al. [6] state” | “Nahar et al. [6] state” |
| A p.25 | “determine between” | “distinguish between” |
| A p.38 | “involves the consolidating” | “involves consolidating” |
| A p.56 | “human a perception” | Rewrite around a supported, defined latency target |
| A p.60 | Revealing grants an override while “restraining users” from it | State plainly that users may reveal and re-hide content |
| B p.40 | “seprates concerns” | “separates concerns” |
| B table captions | “IT Experts Assessment” | “IT Experts' Assessment” |

Use past tense for completed research, present tense for the system's current behavior, and future tense for genuinely future work. Standardize “end users,” “cyber-aggression,” “non-aggressive,” “Naive Bayes,” “F1-score,” and “blocklist” throughout. Remove promotional absolutes such as “perfectly,” “ensuring,” and “proves” where the evidence is limited.

## 10. Practical revision order

1. Correct F1, hybrid formulas, VADER code, preprocessing and execution descriptions.
2. Correct the confirmed literature misattributions and resolve the unverified reference records.
3. Reconcile the actual questionnaires, survey interpretation, scale labels and rounding; include the missing instrument evidence.
4. Align scope, timing/resource claims and conclusions with documented testing.
5. Preserve the offline-versus-runtime and test-informed-selection limitations; revise recommendations accordingly.
6. Merge chapters, fix numbering/captions/appendices, and regenerate the contents and lists.
7. Recheck the final editable manuscript and exported PDF after these changes. New empirical claims require new evidence; wording changes alone cannot supply it.

Supporting project evidence consulted: `TRAINING/export_sop2_predictions.py`, `TRAINING/data/format_dataset.py`, `deliverables/SOP1_SOP2/sop2_test_predictions.csv`, `deliverables/SOP1_SOP2/thesis_figures/Table_20_Hybrid_Weight_All_Metrics.csv`, `deliverables/SOP1_SOP2/SOP1_SOP2_HANDOFF.md`, `EXTENSION/config.js`, and relevant runtime scoring code. The historical 70-test result is reported from the supplied record; this manuscript review did not rerun the browser demonstration or training experiment.
