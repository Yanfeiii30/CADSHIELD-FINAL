# CAD Shield — SOP 1 and SOP 2 Implementation Handoff

Prepared from the current project workspace on September 4, 2026.

## Files in this handoff

- `CAD_Shield_Latest_Source_2026-09-04.zip` — current extension, training/evaluation code, tests, and supporting documentation.
- `sop2_test_predictions.csv` — 12,980 test samples with actual labels, predictions, and scores for all three approaches.
- `sop2_metrics_from_predictions.csv` — independently recalculated metrics and confusion-matrix counts from the prediction file.
- `screenshots/` — genuine system screenshots captured from the unpacked extension in Microsoft Edge.

The full 64,900-row `dataset.csv` is retained in `TRAINING/data/` but is not duplicated in this handoff folder or source-code ZIP.

## SOP 1 — Development of the system

### Implemented system

CAD Shield is a Manifest V3 Chromium browser extension that scans webpage text locally. It uses a trained Naive Bayes model and a VADER-derived sentiment score, combines them in Hybrid mode, and blurs text when its final score reaches the configured threshold. The system does not require a classification server.

### Final implemented feature list

| Feature | Current implementation status |
| --- | --- |
| Real-time webpage scanning | Implemented with initial scans, debounced mutation scanning, batching, and open Shadow DOM traversal. |
| Hybrid detection | Implemented as `0.60 × NB + 0.40 × VADER`, with a fixed `0.50` threshold. |
| Individual algorithm modes | Naive Bayes-only and VADER-only modes are selectable. |
| Input limit | Runtime analysis is limited to the first 128 whitespace-separated tokens. |
| Aggressive-content mitigation | Flagged content is blurred rather than deleted. |
| Reveal and re-blur control | An eye button reveals hidden content and can restore the blur. |
| Whitelist | Case-insensitive words and phrases can exempt matching content from algorithm scoring. |
| Blocklist | Case-insensitive words and phrases force an aggressive verdict before algorithm scoring. |
| Mixed custom-list rendering | If a text contains both a blocklisted term and a separate whitelisted term, the non-whitelisted text remains blurred while the exact whitelist match stays visible. |
| Detection statistics | Scanned, blocked, and safe totals are displayed. |
| Detection log | Stores a bounded local history with text excerpt, score, verdict, mode, time, and processing duration. |
| Log filtering and clearing | Users can view all, blocked, or safe entries and clear the log. |
| Expert Mode | Reveals Test, Steps, Algorithms, and Evaluation tabs plus inline score explanations. |
| PDF export | Expert Mode can export the current detection log as a locally generated PDF. |
| Theme control | Auto, light, and dark interface themes are implemented. |
| Context rules | Includes negation handling, sarcasm cues, backhanded-insult handling, swear-word intensifier handling, language filtering, and self-directed-distress dampening. |
| Privacy exclusions | Configured private messaging, email, document, and AI-assistant sites are excluded from scanning. |
| Local processing | Model scoring and logs remain within the browser extension's local environment. |

### Actual development process

1. The Jigsaw source data was converted into a binary `text,label` dataset. A sample is labeled aggressive when any of `toxic`, `severe_toxic`, `obscene`, `threat`, `insult`, or `identity_hate` equals 1.
2. A custom multinomial Naive Bayes classifier was trained offline. The model uses lowercased alphabetic tokens, stop-word removal, class priors, word likelihoods, and add-one/Laplace smoothing.
3. VADER negative sentiment was transformed into an aggression score with `max(0, -compound)`.
4. The notebook compared Naive Bayes, VADER, and the weighted Hybrid approach on the same stratified test set.
5. The trained Naive Bayes parameters were serialized to `vocab.json` and loaded by the JavaScript browser implementation.
6. Content-script scanning, score integration, blur/reveal controls, local settings, logs, statistics, and popup views were integrated into a Manifest V3 extension.
7. Testing exposed problems involving dynamic-page rescans, short aggressive comments, aggressive questions, extension UI being rescanned, private-page handling, tab activation, and conflicting custom lists. These were addressed through scoped mutation roots, duplicate-element tracking, revised page rules, lifecycle handling, and partial mixed-list rendering.
8. Automated regression tests and static integrity checks were added so later changes could be checked against the shipped JavaScript rather than a separate mock algorithm implementation.

### Actual functional testing record

Automated verification was run with `npm run check` on September 4, 2026. The static checks passed and all 70 tests passed.

Covered automated behaviors include:

- Naive Bayes model loading and scoring;
- VADER sentiment rules, negation, sarcasm, and trace parity;
- 60/40 hybrid score calculation and 0.50 threshold;
- the 128-token runtime limit;
- individual NB-only and VADER-only modes;
- blocklist and whitelist behavior, including the mixed-list example;
- extension lifecycle, dynamic rescanning, storage synchronization, logging, and statistics;
- private-site rules and manifest dependency order;
- PDF generation and escaping;
- JavaScript syntax, referenced assets, and JSON integrity.

Browser smoke testing was performed in **Microsoft Edge 152.0.4191.53** with the unpacked extension on a controlled localhost page. It verified:

| Test case | Result |
| --- | --- |
| `you are ugly super`, with `ugly` blocked and `super` whitelisted | Passed: non-whitelisted portion blurred; `super` visible. |
| Eye-button reveal | Passed: hidden text became readable. |
| Eye-button re-blur | Passed: partial blur was restored. |
| Clear aggressive example | Passed: blurred by Hybrid mode with reveal and Expert Mode controls. |
| Clear non-aggressive example | Passed: remained visible. |
| Detection statistics and logs | Passed: 3 scanned, 2 blocked, and 1 safe were displayed with log entries. |
| Whitelist and blocklist settings | Passed: stored terms appeared in their respective panels. |
| Expert Mode evaluation view | Passed: evaluation tab and weight-ranking details rendered. |

### Screenshot inventory

1. `01-main-interface-logs-statistics.png` — protection status, three modes, statistics, detection records, and PDF export.
2. `02-detected-and-blurred-text.png` — mixed partial blur, full aggressive blur, safe content, reveal buttons, and Expert Mode buttons.
3. `02b-reveal-control-active.png` — the mixed blocklist/whitelist text after using the eye reveal control.
4. `03-settings-whitelist.png` — Expert Mode control and populated whitelist.
5. `04-settings-blocklist.png` — populated blocklist.
6. `05-expert-mode-evaluation.png` — SOP 2 results and hybrid-weight comparison.

These are controlled demonstration screenshots, not screenshots from a third-party social-media platform. Google Chrome 152.0.7977.65 is installed, but its branded headless build did not load the unpacked extension through the automation flag. A manual Google Chrome smoke test and a documented website-by-website test matrix remain outstanding.

## SOP 2 — Algorithm performance

### Dataset

- Name: Jigsaw Toxic Comment Classification Challenge dataset.
- Official source: https://www.kaggle.com/competitions/jigsaw-toxic-comment-classification-challenge/data
- Source content: Wikipedia comments labeled by human raters.
- Original categories combined by this project: `toxic`, `severe_toxic`, `obscene`, `threat`, `insult`, and `identity_hate`.
- Project label rule: if any source category is 1, the binary project label is aggressive (`1`); otherwise it is non-aggressive (`0`).
- Project dataset total: 64,900 samples.
- Non-aggressive: 48,675 samples (75%).
- Aggressive: 16,225 samples (25%).
- Sampling: all available aggressive rows plus randomly undersampled non-aggressive rows up to a 3:1 ratio, using `random_state=42`.

### Training, validation, and testing split

| Subset | Samples | Percentage |
| --- | ---: | ---: |
| Training | 51,920 | 80% |
| Validation | None | None |
| Testing | 12,980 | 20% |

The train/test split is stratified by the binary label and uses `random_state=42`. The test set contains 9,735 non-aggressive and 3,245 aggressive samples.

### Decision rules used for the exported Chapter 4 predictions

- Naive Bayes: aggressive when the computed NB aggression probability is at least `0.50`.
- VADER: calculate `max(0, -compound)` and classify as aggressive when the resulting score is at least `0.50`.
- Hybrid: calculate `0.60 × NB score + 0.40 × VADER aggression score`; classify as aggressive at `0.50` or above.
- All models were evaluated on the exact same 12,980 test rows.
- Browser blocklist and whitelist overrides were disabled during algorithm comparison.
- The notebook evaluates the complete comment. It does **not** apply the browser runtime's separate 128-token limit.

### Recalculated results from the exported predictions

| Model | Precision | Recall | F1-score | Accuracy | TN | FP | FN | TP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Naive Bayes | 85.13% | 77.60% | 81.19% | 91.01% | 9,295 | 440 | 727 | 2,518 |
| VADER | 57.40% | 58.43% | 57.91% | 78.77% | 8,328 | 1,407 | 1,349 | 1,896 |
| Hybrid, 60% NB / 40% VADER | 88.82% | 75.16% | 81.42% | 91.43% | 9,428 | 307 | 806 | 2,439 |

The Hybrid configuration has the highest precision and a slightly higher F1-score than Naive Bayes. Naive Bayes has the highest recall. The F1 increase from NB to the 60/40 Hybrid is 0.23 percentage points and should not be described as statistically significant without a significance test or confidence interval.

### Prediction-file columns

`sop2_test_predictions.csv` contains:

- stable sample number and original dataset index;
- full test text;
- numeric actual label and readable actual class;
- Naive Bayes score, numeric prediction, and readable prediction;
- original VADER compound score, transformed aggression score, and prediction;
- Hybrid score and prediction.

The file has 12,980 data rows plus one header row. `export_sop2_predictions.py` deterministically recreates both prediction and metric files.

## Important limitations to resolve before final Chapter 4 submission

1. **No validation set was used.** The hybrid-weight sweep was performed on the same test set used for final reporting. A validation set or nested cross-validation is needed for an unbiased final estimate if the weights are selected empirically.
2. **The selected 60/40 weight is not the highest-F1 tested split.** It ranks 6th of 21. The measured highest tested F1 is 81.55% at 65% NB / 35% VADER. If 60/40 is retained, describe it as a predetermined or design-selected configuration, not the empirically best weight.
3. **Notebook and deployed runtime are not identical.** The prediction CSV exactly reproduces the current notebook and Chapter 4 metrics. The browser extension additionally uses a custom JavaScript VADER lexicon, negation and sarcasm features, runtime policy filters, and 128-token truncation. Therefore these metrics should be described as the notebook algorithm evaluation, not a complete end-to-end measurement of every deployed browser rule.
4. **The generated notebook vocabulary and the shipped artifact differ.** A fresh run of the current notebook creates 86,110 tokens, while the deployed `vocab.json` reports 99,561 tokens. The training/export pipeline should be synchronized before claiming exact training-to-deployment parity.
5. **Manual field testing is incomplete.** No documented matrix currently proves behavior on specific live versions of Facebook, YouTube, Reddit, X, or other public platforms. Such testing should record browser version, website, test date, expected outcome, actual outcome, and screenshot or observer signature.

## Currently unavailable or still required

- A documented manual Google Chrome test.
- A live website-by-website functional test record.
- A separate validation set or cross-validation result for selecting weights and thresholds.
- An end-to-end evaluation of the exact customized JavaScript runtime on the labeled dataset.
- SOP 3 respondent data is outside this handoff because the user-survey assessment is handled separately.
