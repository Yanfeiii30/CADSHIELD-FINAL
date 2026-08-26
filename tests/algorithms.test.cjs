"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAlgorithms } = require("./support/browser-harness.cjs");

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
});
