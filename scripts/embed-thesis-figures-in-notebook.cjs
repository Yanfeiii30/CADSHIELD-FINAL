"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const NOTEBOOK = path.join(ROOT, "TRAINING", "SOP2_Evaluation.ipynb");
const SECTION_TAG = "thesis-figures-15-20";

function sourceLines(text) {
  const lines = text.replace(/^\n/, "").split("\n");
  return lines.map((line, index) => index < lines.length - 1 ? `${line}\n` : line);
}

function markdown(id, text) {
  return {
    cell_type: "markdown",
    id,
    metadata: { tags: [SECTION_TAG] },
    source: sourceLines(text),
  };
}

function code(id, text) {
  return {
    cell_type: "code",
    execution_count: null,
    id,
    metadata: { tags: [SECTION_TAG] },
    outputs: [],
    source: sourceLines(text),
  };
}

const notebook = JSON.parse(fs.readFileSync(NOTEBOOK, "utf8"));

// Make the pre-existing analysis describe the weight sweep accurately.
for (const cell of notebook.cells) {
  const joined = cell.source.join("");
  if (joined.includes("# HYBRID WEIGHT SWEEP — empirical basis for choosing 60% NB / 40% VADER")) {
    cell.source = sourceLines(joined.replace(
      "# HYBRID WEIGHT SWEEP — empirical basis for choosing 60% NB / 40% VADER",
      "# HYBRID WEIGHT SENSITIVITY ANALYSIS — evaluates the implemented 60% NB / 40% VADER split",
    ));
  }
  if (joined.includes("print(f'Naive Bayes Only    : {r_nb*100:.2f}%')") && joined.includes("SOP 2.2")) {
    cell.source = sourceLines(joined
      .replace("print(f'Naive Bayes Only    : {r_nb*100:.2f}%')", "print(f'Naive Bayes Only    : {r_nb*100:.2f}%  <-- BEST')")
      .replace("print(f'Hybrid (NB + VADER) : {r_hybrid*100:.2f}%  <-- BEST')", "print(f'Hybrid (NB + VADER) : {r_hybrid*100:.2f}%')"));
  }
}

notebook.cells = notebook.cells.filter(cell => !cell.metadata?.tags?.includes(SECTION_TAG));

const addedCells = [
  markdown("thesis-figures-heading", `
## Thesis Figures 15–20

The following cells regenerate the six thesis-ready figures directly from the dataset and the predictions already calculated in this notebook. All algorithm comparisons use the same 12,980-comment test set, the fixed 0.50 threshold, and no blocklist or whitelist overrides.

**Weight notation:** 60/40 means **60% Naive Bayes and 40% VADER**. The implemented split is marked as an operational balance; the sensitivity analysis separately identifies 65/35 as the highest tested F1-score.
`),
  code("thesis-figures-setup", `
# THESIS FIGURES 15–20 — shared style and output directory
from pathlib import Path
from matplotlib.ticker import PercentFormatter

def locate_project_root():
    cwd = Path.cwd().resolve()
    if (cwd / 'TRAINING' / 'data' / 'dataset.csv').exists():
        return cwd
    if (cwd / 'data' / 'dataset.csv').exists() and cwd.name.upper() == 'TRAINING':
        return cwd.parent
    raise FileNotFoundError('Run this notebook from the project root or TRAINING directory.')

PROJECT_ROOT = locate_project_root()
THESIS_FIGURE_DIR = PROJECT_ROOT / 'deliverables' / 'SOP1_SOP2' / 'thesis_figures'
THESIS_FIGURE_DIR.mkdir(parents=True, exist_ok=True)

THESIS_COLORS = {
    'nb': '#2563eb',
    'vader': '#d97706',
    'hybrid': '#7c3aed',
    'green': '#059669',
    'ink': '#172033',
    'muted': '#64748b',
    'panel': '#f8fafc',
}

def finish_thesis_figure(fig, filename):
    path = THESIS_FIGURE_DIR / filename
    fig.savefig(path, dpi=180, bbox_inches='tight', facecolor='white')
    plt.show()
    print(f'Saved: {path}')
`),
  markdown("figure-15-heading", `
### Figure 15 — Dataset Composition
`),
  code("figure-15-code", `
# FIGURE 15 — Dataset composition
class_counts = df['label'].value_counts()
non_aggressive_count = int(class_counts.get(0, 0))
aggressive_count = int(class_counts.get(1, 0))
dataset_total = non_aggressive_count + aggressive_count

fig, ax = plt.subplots(figsize=(11, 6.5), facecolor='white')
wedges, _ = ax.pie(
    [non_aggressive_count, aggressive_count],
    startangle=90,
    colors=[THESIS_COLORS['nb'], THESIS_COLORS['vader']],
    wedgeprops={'width': 0.36, 'edgecolor': 'white'},
)
ax.text(0, 0.08, f'{dataset_total:,}', ha='center', va='center',
        fontsize=27, fontweight='bold', color=THESIS_COLORS['ink'])
ax.text(0, -0.10, 'total comments', ha='center', va='center',
        fontsize=12, color=THESIS_COLORS['muted'])
legend_labels = [
    f'Non-aggressive — {non_aggressive_count:,} ({non_aggressive_count/dataset_total:.0%})',
    f'Aggressive — {aggressive_count:,} ({aggressive_count/dataset_total:.0%})',
]
ax.legend(wedges, legend_labels, loc='center left', bbox_to_anchor=(0.88, 0.5),
          frameon=False, fontsize=12)
ax.set_title('Dataset Composition', fontsize=18, fontweight='bold',
             color=THESIS_COLORS['ink'], pad=20)
ax.set_aspect('equal')
fig.tight_layout()
finish_thesis_figure(fig, 'Figure_15_Dataset_Composition.png')
`),
  markdown("figure-16-heading", `
### Figure 16 — Overall Precision, Recall, and F1-score
`),
  code("figure-16-code", `
# FIGURE 16 — Overall precision, recall, and F1-score
overall_metrics = pd.DataFrame({
    'Model': ['Naive Bayes', 'VADER', 'Hybrid (60/40)'],
    'Precision': [p_nb, p_vader, p_hybrid],
    'Recall': [r_nb, r_vader, r_hybrid],
    'F1-score': [f_nb, f_vader, f_hybrid],
})

fig, ax = plt.subplots(figsize=(12, 7), facecolor='white')
x = np.arange(len(overall_metrics))
bar_width = 0.24
metric_styles = [
    ('Precision', THESIS_COLORS['nb']),
    ('Recall', THESIS_COLORS['vader']),
    ('F1-score', THESIS_COLORS['hybrid']),
]
for offset, (metric, color) in zip([-bar_width, 0, bar_width], metric_styles):
    bars = ax.bar(x + offset, overall_metrics[metric] * 100, bar_width,
                  label=metric, color=color, zorder=3)
    ax.bar_label(bars, fmt='%.2f%%', padding=4, fontsize=10, fontweight='bold')

ax.set_title('Overall Precision, Recall, and F1-score', fontsize=18,
             fontweight='bold', color=THESIS_COLORS['ink'])
ax.set_ylabel('Score (%)')
ax.set_xticks(x)
ax.set_xticklabels(overall_metrics['Model'])
ax.set_ylim(0, 100)
ax.grid(axis='y', alpha=0.25, zorder=0)
ax.legend(frameon=False, ncol=3, loc='upper center')
fig.tight_layout()
finish_thesis_figure(fig, 'Figure_16_Overall_Precision_Recall_F1.png')
`),
  code("confusion-helper-code", `
# Shared confusion-matrix function for Figures 17–19
def make_thesis_confusion_matrix(y_actual, y_predicted, title, subtitle, filename):
    matrix = confusion_matrix(y_actual, y_predicted, labels=[0, 1])
    names = np.array([['True negative', 'False positive'],
                      ['False negative', 'True positive']])
    row_totals = matrix.sum(axis=1, keepdims=True)
    row_percentages = np.divide(matrix, row_totals, where=row_totals != 0)

    fig, ax = plt.subplots(figsize=(9, 7), facecolor='white')
    image = ax.imshow(matrix, cmap='Blues')
    threshold = matrix.max() * 0.45
    for row in range(2):
        for column in range(2):
            color = 'white' if matrix[row, column] > threshold else THESIS_COLORS['ink']
            annotation = (f'{matrix[row, column]:,}\n'
                          f'{row_percentages[row, column]:.2%} of actual class\n'
                          f'{names[row, column]}')
            ax.text(column, row, annotation, ha='center', va='center',
                    fontsize=12, fontweight='bold', color=color, linespacing=1.6)

    ax.set_title(f'{title}\n{subtitle}', fontsize=16, fontweight='bold', pad=18,
                 color=THESIS_COLORS['ink'])
    ax.set_xlabel('Predicted class', fontsize=12, fontweight='bold')
    ax.set_ylabel('Actual class', fontsize=12, fontweight='bold')
    ax.set_xticks([0, 1], ['Non-aggressive', 'Aggressive'])
    ax.set_yticks([0, 1], ['Non-aggressive', 'Aggressive'])
    for spine in ax.spines.values():
        spine.set_visible(False)
    accuracy = np.trace(matrix) / matrix.sum()
    fig.text(0.5, 0.03, f'Accuracy: {accuracy:.2%}  |  Test samples: {matrix.sum():,}',
             ha='center', fontsize=11, fontweight='bold', color=THESIS_COLORS['ink'])
    fig.tight_layout(rect=[0, 0.06, 1, 1])
    finish_thesis_figure(fig, filename)
`),
  markdown("figure-17-heading", `
### Figure 17 — Naive Bayes Confusion Matrix
`),
  code("figure-17-code", `
# FIGURE 17 — Naive Bayes confusion matrix
make_thesis_confusion_matrix(
    y_true, y_pred_nb,
    'Naive Bayes Confusion Matrix',
    'Fixed 0.50 decision threshold',
    'Figure_17_Naive_Bayes_Confusion_Matrix.png',
)
`),
  markdown("figure-18-heading", `
### Figure 18 — VADER Confusion Matrix
`),
  code("figure-18-code", `
# FIGURE 18 — VADER confusion matrix
make_thesis_confusion_matrix(
    y_true, y_pred_vader,
    'VADER Confusion Matrix',
    'Fixed 0.50 decision threshold',
    'Figure_18_VADER_Confusion_Matrix.png',
)
`),
  markdown("figure-19-heading", `
### Figure 19 — Hybrid Confusion Matrix
`),
  code("figure-19-code", `
# FIGURE 19 — Hybrid confusion matrix
make_thesis_confusion_matrix(
    y_true, y_pred_hybrid,
    'Hybrid Confusion Matrix',
    '60% Naive Bayes + 40% VADER; fixed 0.50 threshold',
    'Figure_19_Hybrid_Confusion_Matrix.png',
)
`),
  markdown("figure-20-heading", `
### Figure 20 — Hybrid-weight Metrics Comparison
`),
  code("figure-20-code", `
# FIGURE 20 — Precision, recall, and F1 across all hybrid weights
weight_plot = weight_ranking.sort_values('NB Weight').copy()
implemented = weight_plot[np.isclose(weight_plot['NB Weight'], 0.60)].iloc[0]
highest_precision = weight_plot.loc[weight_plot['Precision'].idxmax()]
highest_recall = weight_plot.loc[weight_plot['Recall'].idxmax()]
highest_f1 = weight_plot.loc[weight_plot['F1'].idxmax()]

# Complete result table: every tested split and every required SOP 2 metric.
weight_table = weight_plot[
    ['Weight Split', 'NB Weight', 'VADER Weight', 'Precision', 'Recall', 'F1']
].copy()
for metric in ['Precision', 'Recall', 'F1']:
    weight_table[f'{metric} Rank'] = (
        weight_table[metric].rank(method='min', ascending=False).astype(int)
    )
weight_table['Result note'] = ''
weight_table.loc[np.isclose(weight_table['NB Weight'], 0.60), 'Result note'] = 'Implemented split'
weight_table.loc[weight_table['Precision'] == weight_table['Precision'].max(), 'Result note'] += ' | Highest precision'
weight_table.loc[weight_table['Recall'] == weight_table['Recall'].max(), 'Result note'] += ' | Highest recall'
weight_table.loc[weight_table['F1'] == weight_table['F1'].max(), 'Result note'] += ' | Highest F1'
weight_table['Result note'] = weight_table['Result note'].str.strip(' |')

def highlight_implemented(row):
    selected = np.isclose(row['NB Weight'], 0.60)
    return ['background-color: #f3e8ff; font-weight: bold' if selected else '' for _ in row]

display(
    weight_table.style
    .format({
        'NB Weight': '{:.0%}',
        'VADER Weight': '{:.0%}',
        'Precision': '{:.2%}',
        'Recall': '{:.2%}',
        'F1': '{:.2%}',
    })
    .highlight_max(subset=['Precision', 'Recall', 'F1'], color='#dcfce7')
    .apply(highlight_implemented, axis=1)
)
print(f"Highest precision: {highest_precision['Weight Split']} — {highest_precision['Precision']:.2%}")
print(f"Highest recall:    {highest_recall['Weight Split']} — {highest_recall['Recall']:.2%}")
print(f"Highest F1-score:  {highest_f1['Weight Split']} — {highest_f1['F1']:.2%}")
print(f"Implemented:       {implemented['Weight Split']} — "
      f"P {implemented['Precision']:.2%}, R {implemented['Recall']:.2%}, F1 {implemented['F1']:.2%}")

fig, ax = plt.subplots(figsize=(13, 7), facecolor='white')
for metric, color in [
    ('Precision', THESIS_COLORS['nb']),
    ('Recall', THESIS_COLORS['vader']),
    ('F1', THESIS_COLORS['hybrid']),
]:
    ax.plot(weight_plot['NB Weight'], weight_plot[metric], marker='o',
            linewidth=2.8, markersize=5, label='F1-score' if metric == 'F1' else metric,
            color=color)
    ax.scatter([implemented['NB Weight']], [implemented[metric]],
               s=120, color=color, edgecolor='white', linewidth=2, zorder=5)

ax.axvline(0.60, color=THESIS_COLORS['hybrid'], linestyle='--', linewidth=1.8,
           label='Implemented 60% NB / 40% VADER')
ax.scatter([highest_f1['NB Weight']], [highest_f1['F1']], s=210,
           facecolor='none', edgecolor=THESIS_COLORS['green'], linewidth=3, zorder=6)
ax.annotate(
    f"Highest F1: {highest_f1['Weight Split']} ({highest_f1['F1']:.2%})",
    xy=(highest_f1['NB Weight'], highest_f1['F1']),
    xytext=(highest_f1['NB Weight'] + 0.05, highest_f1['F1'] + 0.025),
    color=THESIS_COLORS['green'], fontweight='bold',
    arrowprops={'arrowstyle': '-', 'color': THESIS_COLORS['green']},
)
implemented_text = (
    'Implemented 60/40\n'
    f"Precision {implemented['Precision']:.2%} | "
    f"Recall {implemented['Recall']:.2%} | F1 {implemented['F1']:.2%}"
)
ax.text(0.56, 0.925, implemented_text, transform=ax.transAxes,
        color=THESIS_COLORS['hybrid'], fontweight='bold',
        bbox={'boxstyle': 'round,pad=0.5', 'facecolor': '#f3e8ff', 'edgecolor': '#7c3aed'})
ax.set_title('Hybrid-weight Metrics Comparison', fontsize=18, fontweight='bold',
             color=THESIS_COLORS['ink'])
ax.set_xlabel('Naive Bayes weight (VADER receives the remaining weight)')
ax.set_ylabel('Metric score')
ax.set_xlim(0, 1)
ax.set_ylim(0.55, 0.95)
ax.xaxis.set_major_formatter(PercentFormatter(1.0))
ax.yaxis.set_major_formatter(PercentFormatter(1.0))
ax.grid(alpha=0.25)
ax.legend(frameon=False, ncol=2, loc='lower right')
fig.tight_layout()
finish_thesis_figure(fig, 'Figure_20_Hybrid_Weight_Comparison.png')
`),
  markdown("thesis-figures-previews", `
### Saved Figure Previews

The generated PNG files are embedded below. Re-run the preceding cells whenever the dataset or predictions change.

#### Figure 15 — Dataset Composition

![Figure 15 — Dataset Composition](../deliverables/SOP1_SOP2/thesis_figures/Figure_15_Dataset_Composition.png)

#### Figure 16 — Overall Precision, Recall, and F1-score

![Figure 16 — Overall Metrics](../deliverables/SOP1_SOP2/thesis_figures/Figure_16_Overall_Precision_Recall_F1.png)

#### Figure 17 — Naive Bayes Confusion Matrix

![Figure 17 — Naive Bayes Confusion Matrix](../deliverables/SOP1_SOP2/thesis_figures/Figure_17_Naive_Bayes_Confusion_Matrix.png)

#### Figure 18 — VADER Confusion Matrix

![Figure 18 — VADER Confusion Matrix](../deliverables/SOP1_SOP2/thesis_figures/Figure_18_VADER_Confusion_Matrix.png)

#### Figure 19 — Hybrid Confusion Matrix

![Figure 19 — Hybrid Confusion Matrix](../deliverables/SOP1_SOP2/thesis_figures/Figure_19_Hybrid_Confusion_Matrix.png)

#### Figure 20 — Hybrid-weight Metrics Comparison

![Figure 20 — Hybrid-weight Metrics Comparison](../deliverables/SOP1_SOP2/thesis_figures/Figure_20_Hybrid_Weight_Comparison.png)
`),
];

notebook.cells.push(...addedCells);
fs.writeFileSync(NOTEBOOK, `${JSON.stringify(notebook, null, 1)}\n`, "utf8");
process.stdout.write(`Added ${addedCells.length} thesis-figure cells to ${path.relative(ROOT, NOTEBOOK)}\n`);
