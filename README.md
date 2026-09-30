# CAD Shield — Cyber-Aggression Detector

Real-time cyber-aggression detection and mitigation, implemented as a
Chromium-based browser extension. Hybrid detection combines a trained Naive
Bayes classifier with VADER sentiment analysis — fully client-side, no
server required.

*Pamantasan ng Cabuyao — BSCS Thesis 2026*

## Two parts, two languages

This repo has two independent pieces that work together:

| | `TRAINING/` | `EXTENSION/` |
|---|---|---|
| **What it is** | Offline model training & evaluation | The live Chrome extension |
| **Language** | Python | JavaScript |
| **Runs where** | Your machine, offline | Inside the user's browser |
| **Purpose** | Train the model, produce SOP 2 metrics | Detect and blur aggressive content in real time |

They're connected by one file: **`TRAINING/model/vocab.json`** — the trained
Naive Bayes model (word probabilities). When this model file is updated, copy
it into `EXTENSION/lib/vocab.json` so the extension picks up the new model.

Because a Chrome extension can only run JavaScript, the algorithm logic used
for offline evaluation in `TRAINING/SOP2_Evaluation.ipynb` is also implemented
in JavaScript (`EXTENSION/lib/naive_bayes.js` and `EXTENSION/lib/vader.js`) for
the live extension. Any change to shared detection behavior needs to be
reflected in both places to keep them in sync.

## Running the training and evaluation notebook

```bash
cd TRAINING
jupyter notebook SOP2_Evaluation.ipynb
```

Run the notebook cells from top to bottom. The notebook reads
`data/dataset.csv`, trains and evaluates Naive Bayes, VADER, and Hybrid, and
regenerates the evaluation report, charts, and weight-ranking files in
`TRAINING/model/`.

To recreate the sample-level SOP 2 evidence behind the notebook's reported
metrics, use the project's Python environment:

```powershell
TRAINING\.venv\Scripts\python.exe TRAINING\export_sop2_predictions.py
```

This writes `model/sop2_test_predictions.csv` and
`model/sop2_metrics_from_predictions.csv`. Browser blocklist and whitelist
overrides are intentionally excluded from this algorithm-only comparison.

## Loading the extension

`chrome://extensions` → enable Developer Mode → **Load unpacked** → select
the `EXTENSION/` folder. After editing any extension file, reload it from
that same page, then refresh any tab you're testing on (content scripts
don't hot-reload).

## Automated verification

The browser runtime has dependency-free Node tests for the shipped algorithms,
shared detection policy, storage modules, privacy rules, logging, diagnostics,
and manifest load order. With Node 18 or newer, run:

```powershell
npm test
npm run check
```

`npm run check` also validates extension JavaScript syntax and every local file
referenced by the manifest, popup, and service worker. See
[`docs/architecture.md`](docs/architecture.md) for module responsibilities,
dependency order, the safe change workflow, and the browser release checklist.

## Key files

**Training (`TRAINING/`)**
- `SOP2_Evaluation.ipynb` — trains and evaluates Naive Bayes, VADER, and Hybrid and generates the SOP 2 metrics
- `export_sop2_predictions.py` — deterministically exports actual labels, scores, and predictions for every held-out SOP 2 sample
- `data/dataset.csv` — labeled dataset used by the evaluation notebook
- `data/format_dataset.py` — converts the source Jigsaw data into the `text,label` format used by the notebook
- `model/vocab.json` — trained Naive Bayes vocabulary used by the extension
- `model/sop2_report.txt` — generated precision, recall, F1-score, and comparison report
- `model/confusion_matrices.png`, `model/sop2_bar_chart.png`, and `model/hybrid_weight_ranking.*` — generated evaluation visuals and weight-ranking results

**Extension (`EXTENSION/`)**
- `config.js` — single source for runtime modes, weights, thresholds, limits, keys, messages, and privacy rules
- `content.js` — coordinates page scanning, precedence, scoring, display, and logging
- `lib/naive_bayes.js` / `lib/vader.js` — the JS reimplementation of the same algorithms trained in Python
- `modules/` — focused policy, page-rule, logging, storage, diagnostics, and result-display modules
- `popup/` — the extension's popup UI and its focused layout/theme/rendering controllers
- `background.js` — service worker for defaults, tab reloads, activation, and badges

## Algorithm modifications beyond the base algorithms

Both Naive Bayes and VADER are extended with rule-based augmentation to
handle cases the unmodified algorithms can't:

- **Sarcasm cue detection** — known sarcastic phrases correct VADER's score and add NB features
- **Backhanded-insult clause override** — "you are worthless but you are beautiful" isn't allowed to cancel out via the compliment
- **Contextual valence shifting** — negation tagging (`not_stupid` ≠ `stupid`) and swear-word-as-intensifier detection (`fucking beautiful` isn't an insult)
- **English-language filter** — borderline detections on non-English text are suppressed, since both algorithms are trained/built for English only

Every one of these was validated against the real training dataset
(`data/dataset.csv`) before being kept — see `SOP2_Evaluation.ipynb` and the
comments in the JavaScript algorithm files for the calculations and design
rationale.

## Limitations

- **Obfuscated words** — deliberately altered spellings such as `stup!d`,
  `k1ll`, or `s t u p i d` may not match the learned vocabulary or VADER
  lexicon and can therefore evade detection.
