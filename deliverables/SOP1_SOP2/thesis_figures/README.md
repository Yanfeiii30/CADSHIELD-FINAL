# Thesis figures for SOP 2

The PNG files are 1600 × 1000 pixels and are ready to insert into the thesis. Matching SVG files are included for lossless resizing.

| Figure | Suggested caption |
| --- | --- |
| Figure 15 | Dataset composition showing the distribution of aggressive and non-aggressive comments. |
| Figure 16 | Precision, recall, and F1-score of Naive Bayes, VADER, and the 60/40 hybrid model on the same test set. |
| Figure 17 | Confusion matrix of the Naive Bayes classifier on the test set. |
| Figure 18 | Confusion matrix of the VADER classifier on the test set. |
| Figure 19 | Confusion matrix of the 60% Naive Bayes and 40% VADER hybrid model on the test set. |
| Figure 20 | Precision, recall, and F1-score comparison of the tested Naive Bayes–VADER weighting configurations. |

Data sources:

- `TRAINING/data/dataset.csv`
- `TRAINING/model/sop2_metrics_from_predictions.csv`
- `TRAINING/model/hybrid_weight_ranking.csv`

`Table_20_Hybrid_Weight_All_Metrics.csv` lists all 21 tested weight splits in weight order, including precision, recall, F1-score, per-metric ranks, and result notes.

Regenerate the vector and bitmap figures from the repository root with:

```powershell
node scripts/generate-thesis-figures.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/render-thesis-figures.ps1
```
