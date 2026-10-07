"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAlgorithms, runExtensionScript } = require("./support/browser-harness.cjs");

test("VADER gives negative attacks more aggression than sincere praise", async () => {
  const { VADER } = await loadAlgorithms();
  const attack = VADER.analyze("You are a worthless and pathetic idiot!");
  const praise = VADER.analyze("You did a wonderful and amazing job!");

  assert.ok(attack.aggression_score >= 0.5, JSON.stringify(attack));
  assert.equal(praise.aggression_score, 0);
  assert.ok(attack.aggression_score > praise.aggression_score);
});

test("VADER handles joined slang, negation, and sarcasm cues", async () => {
  const { VADER } = await loadAlgorithms();

  assert.ok(VADER.analyze("shutup you pathetic idiot").aggression_score >= 0.5);
  assert.equal(VADER.analyze("You are not stupid").aggression_score, 0);
  assert.ok(VADER.analyze("Yeah right, what a genius you are").aggression_score > 0);
  assert.deepEqual(
    Array.from(VADER.matchedSarcasmMarkers("Nice job!")),
    [],
    "standalone sincere praise must not be tagged as sarcasm",
  );
});

test("VADER trace and normal analysis return the same final scores", async () => {
  const { VADER } = await loadAlgorithms();
  const text = "You are REALLY pathetic and awful!";

  const normal = VADER.analyze(text);
  const traced = VADER.analyzeWithTrace(text);

  assert.equal(traced.compound, normal.compound);
  assert.equal(traced.aggression_score, normal.aggression_score);
  assert.ok(traced.matchedWords.length >= 2);
});

test("Naive Bayes loads the shipped vocabulary and separates clear examples", async () => {
  const { NaiveBayes } = await loadAlgorithms();
  const attack = NaiveBayes.scoreWithTrace("You are worthless, stupid, and pathetic");
  const praise = NaiveBayes.scoreWithTrace("Thank you for your kind and wonderful help");

  assert.equal(attack.ok, true);
  assert.equal(praise.ok, true);
  assert.ok(attack.matched.length > 0);
  assert.ok(praise.matched.length > 0);
  assert.ok(attack.prob > praise.prob, `${attack.prob} should exceed ${praise.prob}`);
  assert.ok(attack.prob >= 0 && attack.prob <= 1);
  assert.ok(praise.prob >= 0 && praise.prob <= 1);
});

test("Naive Bayes trace agrees with score and exposes model evidence", async () => {
  const { NaiveBayes } = await loadAlgorithms();
  const text = "You are a disgusting worthless loser";
  const trace = NaiveBayes.scoreWithTrace(text);

  assert.equal(NaiveBayes.score(text), trace.prob);
  assert.ok(Number.isInteger(trace.vocabSize) && trace.vocabSize > 0);
  assert.ok(Number.isFinite(trace.logPrior0));
  assert.ok(Number.isFinite(trace.logPrior1));
  assert.ok(trace.matched.some((match) => match.pushToAggressive > 0));

  const h = await loadAlgorithms();
  h.context.document = { createElement() { return {
    set textContent(value) { this.innerHTML = String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); },
  }; } };
  runExtensionScript(h.context, "config.js");
  runExtensionScript(h.context, "popup/step_renderer.js");
  const render = h.context.CADShieldPopup.StepRenderer.buildNbCalculationHtml;
  for (const input of [text, "stupid ".repeat(12), "You are not stupid", "thank you wonderful help", "zzzxqv"]) {
    const evidence = h.NaiveBayes.scoreWithTrace(input);
    for (const side of [0, 1]) {
      const sum = evidence.matched.reduce((total, word) => total + word["ll" + side], 0);
      assert.ok(Math.abs(evidence["logPrior" + side] + sum - evidence["score" + side]) < 1e-10);
    }
    const max = Math.max(evidence.score0, evidence.score1);
    const safe = Math.exp(evidence.score0 - max);
    const aggressive = Math.exp(evidence.score1 - max);
    assert.equal(evidence.prob, Number((aggressive / (safe + aggressive)).toFixed(4)));
    const html = render(evidence);
    assert.equal((html.match(/<tr><td>/g) || []).length, evidence.matched.length);
    assert.ok(html.includes(evidence.prob.toFixed(4)));
    assert.ok(html.includes(evidence.score0.toFixed(6)));
    assert.ok(html.includes(evidence.score1.toFixed(6)));
    assert.doesNotMatch(html, /NaN|undefined/);
  }
  const sample = h.NaiveBayes.scoreWithTrace("stupid");
  assert.match(render({ ...sample, prob: 0.5 }), /≥ 0.5000 → <strong>AGGRESSIVE/);
  assert.match(render({ ...sample, prob: 0.4999 }), /&lt; 0.5000 → <strong>SAFE/);
  assert.ok(render({ ...sample, matched: [{ token: "<img>", ll0: -1, ll1: -2 }] }).includes("&lt;img&gt;"));

});
