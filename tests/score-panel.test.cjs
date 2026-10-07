"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAlgorithms, runExtensionScript, getBinding } = require("./support/browser-harness.cjs");

async function panelFor(text, mode = "hybrid") {
  const h = await loadAlgorithms();
  const nodes = [];
  h.context.document = { createElement() {
    const node = { style: {}, classList: { add() {} }, setAttribute() {}, addEventListener() {}, insertAdjacentElement() {} };
    nodes.push(node);
    return node;
  } };
  runExtensionScript(h.context, "config.js");
  runExtensionScript(h.context, "modules/result_display.js");
  const nb = h.NaiveBayes.scoreWithTrace(text);
  const vader = h.VADER.analyzeWithTrace(text);
  const config = getBinding(h.context, "CADConfig");
  const score = mode === "nb" ? nb.prob : mode === "vader" ? vader.aggression_score :
    nb.matched.length ? config.detection.hybridNaiveBayesWeight * nb.prob + config.detection.hybridVaderWeight * vader.aggression_score : vader.aggression_score;
  getBinding(h.context, "ResultDisplay").annotate({ insertAdjacentElement() {} }, score, mode, { nbTrace: nb, vaderTrace: vader });
  return { html: nodes.find(n => n.className === "cad-trace-panel").innerHTML, nb, vader };
}

test("score panel explains the screenshot probability and counts repeated features", async () => {
  for (const text of ["fuck howard duck here why", "stupid stupid stupid", "what pathetic list", "You are not stupid", "stupid ".repeat(12)]) {
    const { html, nb } = await panelFor(text, "nb");
    const sum = nb.matched.reduce((s, w) => s + w.ll1, 0);
    assert.ok(Math.abs(nb.logPrior1 + sum - nb.score1) < 1e-10);
    assert.ok(html.includes(sum.toFixed(6)));
    assert.ok(html.includes((nb.prob * 100).toFixed(1) + "%"));
    assert.ok(html.includes("Model rounds probability to 4 decimals"));
    assert.ok(html.includes("cad-score-output"));
    const walkthrough = html.slice(html.indexOf('How this percentage is computed'), html.indexOf('This is a model probability'));
    for (const word of nb.matched) {
      for (const side of [0, 1]) {
        assert.ok(walkthrough.includes(word.token + ': (<strong class="cad-calc-number">' + word['ll' + side].toFixed(6)));
      }
    }
    assert.equal((walkthrough.split(': (<strong class="cad-calc-number">').length - 1), nb.matched.length * 2);
    assert.ok(walkthrough.includes('We start with the safe class log prior'));
    assert.ok(!walkthrough.includes('Read this:'));
    assert.ok(walkthrough.includes('5 · Naive Bayes threshold decision'));
    assert.ok(walkthrough.includes('Word scores come from the trained vocabulary'));

    assert.doesNotMatch(html, /NaN|undefined/);
  }
});

test("VADER walkthrough accounts for punctuation, sarcasm and selected clauses", async () => {
  for (const text of ["you are VERY stupid!!!", "yeah right great", "yeah right idiot", "you are worthless but beautiful", "thank you"]) {
    const { html, vader: v } = await panelFor(text, "vader");
    const base = v.valenceSum / Math.sqrt(v.valenceSum ** 2 + v.alpha);
    const adjusted = v.sarcasmCue ? (base > 0 ? -base - 0.4 * v.sarcasmCue : base - 0.2 * v.sarcasmCue) : base;
    const expected = Number(Math.max(0, -Math.max(-1, Math.min(1, adjusted))).toFixed(4));
    assert.equal(expected, v.aggression_score);
    assert.ok(html.includes(base.toFixed(6)));
    assert.ok(html.includes((expected * 100).toFixed(1) + "%"));
    if (v.insultOverride) assert.ok(html.includes("Direct-insult clause selected"));
    assert.doesNotMatch(html, /NaN|undefined/);
  }
});

test("zero-evidence walkthrough explains the VADER fallback", async () => {
  const { html, nb } = await panelFor("zzzxqv");
  assert.equal(nb.matched.length, 0);
  assert.ok(html.includes("NB matched no words, so use VADER directly"));
  assert.ok(html.includes("Final output · SAFE"));
});
