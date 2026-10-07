'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { ROOT, loadDetectionRuntime, getBinding, makeElement } = require('../tests/support/browser-harness.cjs');
const cases = require('../tests/fixtures/detection-baseline.cjs');

function fingerprint() {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else files.push(file);
    }
  }
  walk(path.join(ROOT, 'EXTENSION'));
  return Object.fromEntries(files.sort().map(file => [path.relative(ROOT, file).replace(/\\/g, '/'),
    crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
}
function summarize(rows) {
  const tp = rows.filter(r => r.expected === 'aggressive' && r.predicted === 'aggressive').length;
  const fn = rows.filter(r => r.expected === 'aggressive' && r.predicted === 'safe').length;
  const fp = rows.filter(r => r.expected === 'safe' && r.predicted === 'aggressive').length;
  const tn = rows.filter(r => r.expected === 'safe' && r.predicted === 'safe').length;
  return { total: rows.length, tp, fn, fp, tn, recall: tp + fn ? tp / (tp + fn) : null,
    precision: tp + fp ? tp / (tp + fp) : null, falsePositiveRate: fp + tn ? fp / (fp + tn) : null };
}
async function main() {
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
  assert.ok(cases.every(c => ['safe', 'aggressive'].includes(c.expected) && c.text));
  const sources = fingerprint();
  const runtime = await loadDetectionRuntime({ enabled: true, mode: 'hybrid', whitelist: [], custom_keywords: [] });
  const policy = getBinding(runtime.context, 'DetectionPolicy');
  const results = [];
  for (const sample of cases) {
    const normalized = runtime.VADER.normalizeObfuscation(sample.text);
    const analyzed = policy.truncateTokens(sample.text);
    const nb = runtime.NaiveBayes.scoreWithTrace(analyzed);
    assert.equal(nb.ok, true, 'The deployed NB model must be loaded');
    const vader = runtime.VADER.analyze(analyzed).aggression_score;
    const modes = Object.fromEntries(['hybrid', 'nb', 'vader'].map(mode => [mode, policy.scoreForMode({
      mode, naiveBayesScore: nb.prob, vaderScore: vader,
      useVaderOnly: nb.matched.length === 0, text: analyzed,
    })]));
    const element = makeElement();
    await runtime.analyzeElement(element, sample.text);
    const predicted = element.getAttribute('data-cad');
    assert.ok(['aggressive', 'safe'].includes(predicted), `${sample.id}: analysis failed`);
    assert.equal(predicted, modes.hybrid.isAggressive ? 'aggressive' : 'safe', `${sample.id}: runtime/policy mismatch`);
    results.push({ ...sample, predicted, correct: predicted === sample.expected,
      score: modes.hybrid.score, nb: nb.prob, vader, modes,
      normalized, analyzed, truncated: normalized !== analyzed,
      englishAccepted: policy.looksEnglish(analyzed), distress: policy.isSelfDirectedDistress(analyzed) });
  }
  assert.deepEqual(fingerprint(), sources, 'Evaluation must not change extension files');
  const summary = summarize(results);
  const byCategory = Object.fromEntries([...new Set(results.map(r => r.category))]
    .map(category => [category, summarize(results.filter(r => r.category === category))]));
  const byMode = Object.fromEntries(['hybrid', 'nb', 'vader'].map(mode => [mode, summarize(results.map(r => ({
    ...r, predicted: r.modes[mode].isAggressive ? 'aggressive' : 'safe',
  })))]));
  const report = { evaluatedAt: new Date().toISOString(), description: 'Synthetic diagnostic set; labels need user review. Not a held-out accuracy benchmark.',
    configuration: runtime.config, sources, summary, byCategory, byMode, results };
  const out = path.join(ROOT, 'deliverables', 'detection_baseline');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  const columns = ['id', 'category', 'expected', 'predicted', 'score', 'nb', 'vader', 'truncated', 'englishAccepted', 'text', 'analyzed'];
  const csv = value => '"' + String(value).replace(/"/g, '""') + '"';
  fs.writeFileSync(path.join(out, 'results.csv'), [columns.join(','), ...results.map(r => columns.map(k => csv(r[k])).join(','))].join('\r\n') + '\r\n');
  const escape = value => String(value).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
  const displayText = r => r.category === 'long_text' ? `[Long message; full text in results.csv] ${r.text.slice(-100)}` : r.text;
  const lines = [
    '# Detection baseline', '',
    'Hand-authored diagnostic examples. Expected labels distinguish targeted aggression from criticism, reporting, negation, and harmless profanity. Some labels depend on context and should be reviewed. Existing regression examples overlap this set; these are not independent test data or production accuracy estimates.', '',
    'Mode: Hybrid; shipped model and thresholds; empty whitelist/blocklist. Each result was checked against the content script analysis function. DOM collection and actual page rendering are outside this evaluation. Extension-file hashes were verified unchanged.', '',
    `Cases: ${summary.total}. Aggressive caught: ${summary.tp}/${summary.tp + summary.fn}. Aggressive missed: ${summary.fn}. Harmless falsely flagged: ${summary.fp}/${summary.fp + summary.tn}.`, '',
    '| Category | Cases | Caught aggression | Missed aggression | Harmless flagged | Harmless accepted |',
    '|---|---:|---:|---:|---:|---:|',
    ...Object.entries(byCategory).map(([c, s]) => `| ${c} | ${s.total} | ${s.tp} | ${s.fn} | ${s.fp} | ${s.tn} |`), '',
    '## Missed aggressive messages', '',
    '| ID | Message | Hybrid score | Truncated | English accepted |', '|---|---|---:|---|---|',
    ...results.filter(r => r.expected === 'aggressive' && !r.correct).map(r => `| ${r.id} | ${escape(displayText(r))} | ${r.score.toFixed(4)} | ${r.truncated} | ${r.englishAccepted} |`), '',
    '## Harmless messages falsely flagged', '',
    '| ID | Message | Hybrid score |', '|---|---|---:|',
    ...results.filter(r => r.expected === 'safe' && !r.correct).map(r => `| ${r.id} | ${escape(displayText(r))} | ${r.score.toFixed(4)} |`), '',
    '## Diagnostic mode comparison', '',
    'Same examples across modes; do not select a winner from this small constructed sample.', '',
    '| Mode | Caught | Missed | Harmless flagged | Harmless accepted |', '|---|---:|---:|---:|---:|',
    ...Object.entries(byMode).map(([m, s]) => `| ${m} | ${s.tp} | ${s.fn} | ${s.fp} | ${s.tn} |`), '',
    'Reproduce: `node scripts/evaluate-detection-baseline.cjs`. Complete inputs, normalized/scored text, scores, configuration, and source hashes are in results.json. Evaluation does not retrain the model or alter detection rules.', '',
  ];
  fs.writeFileSync(path.join(out, 'report.md'), lines.join('\n'));
  console.log(JSON.stringify({ summary, byCategory, byMode, report: path.join(out, 'report.md') }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
