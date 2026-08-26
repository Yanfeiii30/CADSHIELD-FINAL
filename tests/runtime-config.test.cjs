"use strict";

const fs = require("node:fs");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extensionPath,
  createContext,
  runExtensionScript,
  getBinding,
  loadDetectionRuntime,
  makeElement,
} = require("./support/browser-harness.cjs");

function extractPopupInjectedAnalyzer(source) {
  const match = source.match(
    /func:\s*(\(inputText\)\s*=>\s*\{[\s\S]*?\n\s*\}),\s*\n\s*args:\s*\[text\]/,
  );
  assert.ok(match, "the Test-tab injected analyzer must remain discoverable");
  return match[1];
}

test("manifest loads the detection runtime in its required dependency order", () => {
  const manifest = JSON.parse(fs.readFileSync(extensionPath("manifest.json"), "utf8"));
  const scripts = manifest.content_scripts[0].js;
  const expectedOrder = [
    "config.js",
    "modules/diagnostics.js",
    "lib/vader.js",
    "lib/naive_bayes.js",
    "modules/detection_policy.js",
    "modules/page_rules.js",
    "modules/detection_log.js",
    "modules/algorithm_selector.js",
    "modules/custom_filter.js",
    "modules/result_display.js",
    "content.js",
  ];

  assert.deepEqual(scripts, expectedOrder);
  assert.ok(
    manifest.web_accessible_resources.some(({ resources }) => resources.includes("lib/vocab.json")),
    "the Naive Bayes vocabulary must remain web-accessible",
  );
});

test("runtime detection configuration remains valid and internally consistent", async () => {
  const { config } = await loadDetectionRuntime();

  assert.equal(config.THRESHOLD, 0.5);
  assert.equal(config.HYBRID_THRESHOLD, config.THRESHOLD);
  assert.equal(config.HYBRID_NB_WEIGHT + config.HYBRID_VADER_WEIGHT, 1);
  assert.ok(config.HYBRID_NB_WEIGHT > config.HYBRID_VADER_WEIGHT);
  assert.ok(config.MAX_TOKENS > 0);
  assert.ok(config.SELF_DISTRESS_DAMPEN > 0 && config.SELF_DISTRESS_DAMPEN < 1);
});

test("popup loads shared modules before its controllers", () => {
  const html = fs.readFileSync(extensionPath("popup/popup.html"), "utf8");
  const scriptSources = Array.from(
    html.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g),
    (match) => match[1],
  );

  assert.deepEqual(scriptSources, [
    "../config.js",
    "../modules/diagnostics.js",
    "../modules/page_rules.js",
    "expert_layout.js",
    "theme_controller.js",
    "step_renderer.js",
    "popup.js",
  ]);
});

test("popup Test-tab analyzer delegates truncation and hybrid scoring to shared policy", async () => {
  const popupSource = fs.readFileSync(extensionPath("popup/popup.js"), "utf8");
  assert.match(popupSource, /DetectionPolicy\.truncateTokens\(inputText\)/);
  assert.match(popupSource, /DetectionPolicy\.scoreForMode\(\{/);
  assert.doesNotMatch(popupSource, /typeof\s+HYBRID_(?:NB|VADER|THRESHOLD)/);
  assert.doesNotMatch(popupSource, /typeof\s+SELF_DISTRESS_DAMPEN/);
  assert.doesNotMatch(popupSource, /typeof\s+(?:looksEnglish|isSelfDirectedDistress)/);

  const harness = createContext();
  runExtensionScript(harness.context, "config.js");
  runExtensionScript(harness.context, "lib/vader.js");
  runExtensionScript(harness.context, "lib/naive_bayes.js");
  runExtensionScript(harness.context, "modules/detection_policy.js");
  const analyzer = getBinding(harness.context, `(${extractPopupInjectedAnalyzer(popupSource)})`);
  const NaiveBayes = getBinding(harness.context, "NaiveBayes");
  const VADER = getBinding(harness.context, "VADER");
  const config = getBinding(harness.context, "CADConfig");
  await NaiveBayes.load();

  let nbInput;
  let vaderInput;
  NaiveBayes.scoreWithTrace = (text) => {
    nbInput = text;
    return { ok: true, prob: 0.9, matched: [] };
  };
  VADER.analyzeWithTrace = (text) => {
    vaderInput = text;
    return { aggression_score: 0.2, matchedWords: [] };
  };
  const longInput = [
    ...Array.from({ length: config.detection.maximumTokens }, (_, index) => `word${index}`),
    "TAIL_MARKER",
  ].join(" ");

  const result = analyzer(longInput);

  assert.equal(nbInput, vaderInput);
  assert.equal(nbInput.split(/\s+/).length, config.detection.maximumTokens);
  assert.equal(nbInput.includes("TAIL_MARKER"), false);
  assert.equal(result.hybrid, 0.2, "successful zero evidence must use VADER alone");
});

test("hybrid mode uses the deployed NB/VADER pipeline for clear safe and aggressive text", async () => {
  const runtime = await loadDetectionRuntime({ mode: "hybrid", enabled: true });
  const aggressiveElement = makeElement();
  const safeElement = makeElement();

  await runtime.analyzeElement(aggressiveElement, "You are a worthless, pathetic, disgusting idiot");
  await runtime.analyzeElement(safeElement, "Thank you for your wonderful and kind help today");

  assert.equal(aggressiveElement.getAttribute("data-cad"), "aggressive");
  assert.equal(safeElement.getAttribute("data-cad"), "safe");
  assert.equal(runtime.display.calls.blur.length, 1);

  const entries = runtime.storage.snapshot().log_entries;
  assert.equal(entries.length, 2);
  assert.equal(entries[0].mode, "hybrid");
  assert.equal(entries[0].is_aggressive, true);
  assert.equal(entries[1].is_aggressive, false);
});

test("NB-only and VADER-only modes remain independently testable", async (t) => {
  for (const mode of ["nb", "vader"]) {
    await t.test(mode, async () => {
      const runtime = await loadDetectionRuntime({ mode, enabled: true });
      const element = makeElement();
      await runtime.analyzeElement(element, "You are a worthless, pathetic, disgusting idiot");

      assert.equal(element.getAttribute("data-cad"), "aggressive");
      assert.equal(runtime.storage.snapshot().log_entries[0].mode, mode);
    });
  }
});

test("whitelist and blocklist keep their precedence around algorithm scoring", async () => {
  const whitelisted = await loadDetectionRuntime({
    mode: "hybrid",
    enabled: true,
    whitelist: ["approved phrase"],
  });
  const safeElement = makeElement();
  await whitelisted.analyzeElement(
    safeElement,
    "Approved phrase: you are a worthless and disgusting idiot",
  );
  assert.equal(safeElement.getAttribute("data-cad"), "safe");
  assert.equal(whitelisted.display.calls.blur.length, 0);

  const blocklisted = await loadDetectionRuntime({
    mode: "hybrid",
    enabled: true,
    custom_keywords: ["forced block"],
  });
  const blockedElement = makeElement();
  await blocklisted.analyzeElement(blockedElement, "This harmless forced block text is present");
  assert.equal(blockedElement.getAttribute("data-cad"), "aggressive");
  assert.equal(blocklisted.display.calls.blur[0][1], 1);
});

test("content runtime uses VADER-only fallback only for a successful zero-evidence NB trace", async () => {
  const failedModel = await loadDetectionRuntime({ mode: "hybrid", enabled: true });
  failedModel.NaiveBayes.scoreWithTrace = () => ({ ok: false, reason: "test failure" });
  failedModel.NaiveBayes.score = () => 0.9;
  failedModel.VADER.analyze = () => ({ aggression_score: 0.1 });
  const failedModelElement = makeElement();

  await failedModel.analyzeElement(failedModelElement, "This is ordinary English test content");

  assert.equal(
    failedModelElement.getAttribute("data-cad"),
    "aggressive",
    "a model-load failure must not be mistaken for successful zero evidence",
  );

  const zeroEvidence = await loadDetectionRuntime({ mode: "hybrid", enabled: true });
  zeroEvidence.NaiveBayes.scoreWithTrace = () => ({ ok: true, prob: 0.9, matched: [] });
  zeroEvidence.VADER.analyze = () => ({ aggression_score: 0.1 });
  const zeroEvidenceElement = makeElement();

  await zeroEvidence.analyzeElement(zeroEvidenceElement, "This is ordinary English test content");

  assert.equal(zeroEvidenceElement.getAttribute("data-cad"), "safe");
  assert.equal(zeroEvidence.storage.snapshot().log_entries[0].score, 0.1);
});

test("content runtime truncates algorithm input to the shared maximum token count", async () => {
  const runtime = await loadDetectionRuntime({ mode: "nb", enabled: true });
  const observed = [];
  runtime.NaiveBayes.scoreWithTrace = (text) => {
    observed.push(text);
    return { ok: true, prob: 0.9, matched: [{ token: "evidence" }] };
  };
  runtime.VADER.analyze = () => ({ aggression_score: 0.1 });
  const element = makeElement();
  const input = [
    ...Array.from({ length: runtime.config.MAX_TOKENS }, (_, index) => `word${index}`),
    "TAIL_MARKER",
  ].join(" ");

  await runtime.analyzeElement(element, input);

  assert.equal(observed.length, 1);
  assert.equal(observed[0].split(/\s+/).length, runtime.config.MAX_TOKENS);
  assert.equal(observed[0].includes("TAIL_MARKER"), false);
});

test("content boot resets tab statistics without sending a stale clear-badge message", async () => {
  const runtime = await loadDetectionRuntime({ mode: "hybrid", enabled: true });

  assert.equal(
    runtime.chrome.__sentMessages.some(({ type }) => type === "CLEAR_BADGE"),
    false,
  );
  assert.equal(runtime.storage.snapshot().stat_total, 0);
  assert.equal(runtime.storage.snapshot().stat_aggressive, 0);
});
