"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createContext,
  runExtensionScript,
  getBinding,
} = require("./support/browser-harness.cjs");

function loadPolicy() {
  const harness = createContext();
  runExtensionScript(harness.context, "config.js");
  runExtensionScript(harness.context, "modules/detection_policy.js");
  return {
    ...harness,
    config: getBinding(harness.context, "CADConfig"),
    policy: getBinding(harness.context, "DetectionPolicy"),
  };
}

test("shared configuration is immutable and has coherent detection values", () => {
  const { config } = loadPolicy();

  assert.equal(config.detection.hybridNaiveBayesWeight + config.detection.hybridVaderWeight, 1);
  assert.equal(config.thresholdForMode(config.modes.NAIVE_BAYES), config.detection.threshold);
  assert.equal(config.thresholdForMode(config.modes.VADER), config.detection.threshold);
  assert.equal(config.thresholdForMode(config.modes.HYBRID), config.detection.hybridThreshold);
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.detection));
  assert.equal(new Set(Object.values(config.storage)).size, Object.keys(config.storage).length);
});

test("DetectionPolicy truncates input at the configured token limit", () => {
  const { config, policy } = loadPolicy();
  const words = Array.from(
    { length: config.detection.maximumTokens + 10 },
    (_, index) => `word${index}`,
  );

  const truncated = policy.truncateTokens(words.join(" "));

  assert.equal(truncated.split(/\s+/).length, config.detection.maximumTokens);
  assert.equal(truncated.split(/\s+/).at(-1), `word${config.detection.maximumTokens - 1}`);
});

test("DetectionPolicy distinguishes scoped English text from Tagalog text", () => {
  const { policy } = loadPolicy();

  assert.equal(policy.looksEnglish("Thank you for your really good work"), true);
  assert.equal(policy.looksEnglish("Sobrang ganda talaga ng araw ngayon"), false);
});

test("DetectionPolicy recognizes pure self-directed distress", () => {
  const { policy } = loadPolicy();

  assert.equal(policy.isSelfDirectedDistress("I feel worthless and hopeless today"), true);
  assert.equal(policy.isSelfDirectedDistress("You are worthless and hopeless"), false);
});

test("DetectionPolicy selects NB, VADER, hybrid, and zero-evidence scores correctly", () => {
  const { config, policy } = loadPolicy();
  const common = {
    naiveBayesScore: 0.8,
    vaderScore: 0.2,
    useVaderOnly: false,
    text: "You are acting really badly today",
  };

  const nb = policy.scoreForMode({ ...common, mode: config.modes.NAIVE_BAYES });
  const vader = policy.scoreForMode({ ...common, mode: config.modes.VADER });
  const hybrid = policy.scoreForMode({ ...common, mode: config.modes.HYBRID });
  const noEvidence = policy.scoreForMode({
    ...common,
    mode: config.modes.HYBRID,
    useVaderOnly: true,
  });

  assert.equal(nb.score, common.naiveBayesScore);
  assert.equal(vader.score, common.vaderScore);
  assert.equal(
    hybrid.score,
    (config.detection.hybridNaiveBayesWeight * common.naiveBayesScore) +
      (config.detection.hybridVaderWeight * common.vaderScore),
  );
  assert.equal(noEvidence.score, common.vaderScore);
});

test("DetectionPolicy applies language and distress guards outside single-algorithm modes", () => {
  const { config, policy } = loadPolicy();
  const base = {
    naiveBayesScore: 0.9,
    vaderScore: 0.9,
    useVaderOnly: false,
  };

  const tagalogHybrid = policy.scoreForMode({
    ...base,
    mode: config.modes.HYBRID,
    text: "Sobrang sama talaga ng ginawa mo ngayon",
  });
  const distressHybrid = policy.scoreForMode({
    ...base,
    mode: config.modes.HYBRID,
    text: "I feel worthless and hopeless today",
  });
  const distressNb = policy.scoreForMode({
    ...base,
    mode: config.modes.NAIVE_BAYES,
    text: "I feel worthless and hopeless today",
  });

  assert.equal(tagalogHybrid.score, 0);
  assert.ok(
    Math.abs(distressHybrid.score - (0.9 * config.detection.selfDistressDampen)) < Number.EPSILON,
  );
  assert.equal(distressHybrid.isAggressive, false);
  assert.equal(distressNb.score, 0.9);
});

test("an unknown stored mode preserves the legacy hybrid behavior", () => {
  const { config, policy } = loadPolicy();
  const input = {
    naiveBayesScore: 0.9,
    vaderScore: 0.9,
    useVaderOnly: false,
    text: "Sobrang sama talaga ng ginawa mo ngayon",
  };

  const hybrid = policy.scoreForMode({ ...input, mode: config.modes.HYBRID });
  const unknown = policy.scoreForMode({ ...input, mode: "unexpected-value" });

  assert.equal(unknown.score, hybrid.score);
  assert.equal(unknown.threshold, hybrid.threshold);
  assert.equal(unknown.isAggressive, hybrid.isAggressive);
});
