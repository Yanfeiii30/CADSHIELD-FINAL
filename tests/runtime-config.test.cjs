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
    "modules/page_protection.js",
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
    "pdf_exporter.js",
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

test("word-list search is case-insensitive and preserves stored order", () => {
  const harness = createContext();
  harness.context.document = { addEventListener() {} };
  runExtensionScript(harness.context, "config.js");
  runExtensionScript(harness.context, "popup/popup.js");
  const filterManagedWords = getBinding(harness.context, "filterManagedWords");
  const words = ["Toxic Phrase", "approved joke", "toxic waste"];

  assert.deepEqual(Array.from(filterManagedWords(words, " TOXIC ")), ["Toxic Phrase", "toxic waste"]);
  assert.deepEqual(Array.from(filterManagedWords(words, "")), words);
  assert.deepEqual(Array.from(filterManagedWords(words, "missing")), []);
});

test("adding a blocked word moves it out of the whitelist", () => {
  const harness = createContext();
  harness.context.document = { addEventListener() {} };
  runExtensionScript(harness.context, "config.js");
  runExtensionScript(harness.context, "popup/popup.js");
  const resolveBlocklistAddition = getBinding(harness.context, "resolveBlocklistAddition");

  const moved = resolveBlocklistAddition("weak", ["weak", "friendly"], ["deserve"]);
  assert.equal(moved.status, "moved");
  assert.deepEqual(Array.from(moved.whitelist), ["friendly"]);
  assert.deepEqual(Array.from(moved.blocklist), ["deserve", "weak"]);

  const exists = resolveBlocklistAddition("deserve", ["friendly"], ["deserve"]);
  assert.equal(exists.status, "exists");
  assert.deepEqual(Array.from(exists.whitelist), ["friendly"]);
  assert.deepEqual(Array.from(exists.blocklist), ["deserve"]);
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

test("live scanner detects comments with one, two, three, or more words", async () => {
  const runtime = await loadDetectionRuntime({ mode: "hybrid", enabled: true });
  const cases = [
    { text: "idiot", expected: "aggressive" },
    { text: "toxic shit", expected: "aggressive" },
    { text: "you are stupid", expected: "aggressive" },
    { text: "You are a worthless, pathetic, disgusting idiot", expected: "aggressive" },
    { text: "ok", expected: "safe" },
  ];
  const comments = cases.map(({ text }) => Object.assign(makeElement(), {
    tagName: "SPAN",
    innerText: text,
    textContent: text,
    parentElement: null,
  }));
  const textNodes = cases.map(({ text }, index) => ({
    textContent: text,
    parentElement: comments[index],
  }));
  const ownerDocument = {
    createTreeWalker(_root, _whatToShow, filter) {
      let index = 0;
      return {
        nextNode() {
          while (index < textNodes.length) {
            const node = textNodes[index++];
            if (filter.acceptNode(node) === 1) return node;
          }
          return null;
        },
      };
    },
  };
  comments.forEach(comment => { comment.ownerDocument = ownerDocument; });

  const collectByTreeWalker = getBinding(runtime.context, "collectByTreeWalker");
  const processQueue = getBinding(runtime.context, "processQueue");
  collectByTreeWalker({ ownerDocument });
  await processQueue();

  cases.forEach(({ expected }, index) => {
    assert.equal(comments[index].getAttribute("data-cad"), expected);
  });
  assert.equal(runtime.display.calls.blur.length, 4);
  comments.slice(0, 4).forEach(comment => {
    const blurCall = runtime.display.calls.blur.find(([element]) => element === comment);
    assert.ok(blurCall, `expected ${comment.textContent} to be blurred`);
    assert.ok(blurCall[1] >= runtime.config.HYBRID_THRESHOLD);
    assert.equal(blurCall[2], "hybrid");
  });
  assert.deepEqual(
    new Set(runtime.storage.snapshot().log_entries.map(entry => entry.text)),
    new Set(cases.map(({ text }) => text)),
  );
});

test("mutation rescans are limited to added content and ignore extension UI", async () => {
  const runtime = await loadDetectionRuntime({ mode: "hybrid", enabled: true });
  const mutationScanRoots = getBinding(runtime.context, "mutationScanRoots");
  const contentRoot = Object.assign(makeElement(), { nodeType: 1, isConnected: true });
  const textParent = Object.assign(makeElement(), { nodeType: 1, isConnected: true });
  const textNode = { nodeType: 3, parentElement: textParent };
  const extensionUi = Object.assign(makeElement(), {
    nodeType: 1,
    isConnected: true,
    closest(selector) { return selector === "[data-cad-ui]" ? this : null; },
  });

  const roots = Array.from(mutationScanRoots([{
    addedNodes: [contentRoot, textNode, extensionUi],
  }]));

  assert.deepEqual(roots, [contentRoot, textParent]);
  assert.equal(roots.includes(extensionUi), false);
});

test("scanner does not recount a DOM node when the host strips its marker", async () => {
  const runtime = await loadDetectionRuntime({ mode: "hybrid", enabled: true });
  const queueEl = getBinding(runtime.context, "queueEl");
  const processQueue = getBinding(runtime.context, "processQueue");
  const element = Object.assign(makeElement(), {
    innerText: "Thank you for the helpful answer",
    textContent: "Thank you for the helpful answer",
  });

  queueEl(element);
  element.removeAttribute("data-cad");
  queueEl(element);
  await processQueue();

  assert.equal(runtime.storage.snapshot().stat_total, 1);
  assert.equal(runtime.storage.snapshot().log_entries.length, 1);
});

test("clear detections resets the active content runtime's in-memory totals", async () => {
  const runtime = await loadDetectionRuntime({ mode: "hybrid", enabled: true });
  const element = makeElement();
  await runtime.analyzeElement(element, "Thank you for the helpful answer");

  assert.equal(runtime.storage.snapshot().stat_total, 1);
  const clearType = getBinding(runtime.context, "CADConfig.messages.clearDetections");
  runtime.chrome.__runtimeMessageListeners.forEach(listener => listener({ type: clearType }));

  assert.equal(runtime.storage.snapshot().stat_total, 0);
  assert.equal(runtime.storage.snapshot().stat_aggressive, 0);
  assert.deepEqual(runtime.storage.snapshot().log_entries, []);
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

  const conflicting = await loadDetectionRuntime({
    mode: "hybrid",
    enabled: true,
    whitelist: ["weak"],
    custom_keywords: ["deserve"],
  });
  const conflictElement = makeElement();
  await conflicting.analyzeElement(
    conflictElement,
    "I think you are weak, and you don't deserve to play next tournament",
  );
  assert.equal(conflictElement.getAttribute("data-cad"), "aggressive");
  assert.equal(conflicting.display.calls.blur[0][1], 1);
  assert.deepEqual(Array.from(conflicting.display.calls.blur[0][4]), ["weak"]);
  assert.equal(conflicting.storage.snapshot().log_entries[0].mode, "custom_keyword");
});

test("mixed blocklist and whitelist text preserves the whitelist terms for rendering", async () => {
  const runtime = await loadDetectionRuntime({
    mode: "hybrid",
    enabled: true,
    whitelist: ["super"],
    custom_keywords: ["ugly"],
  });
  const element = makeElement();

  await runtime.analyzeElement(element, "you are ugly super");

  assert.equal(element.getAttribute("data-cad"), "aggressive");
  assert.equal(runtime.display.calls.blur.length, 1);
  assert.equal(runtime.display.calls.blur[0][2], "custom_keyword");
  assert.deepEqual(Array.from(runtime.display.calls.blur[0][4]), ["super"]);
});

test("aggressive questions are analyzed instead of automatically marked safe", async () => {
  const runtime = await loadDetectionRuntime({ mode: "hybrid", enabled: true });
  const element = makeElement();

  await runtime.analyzeElement(element, "Are you a worthless disgusting idiot?");

  assert.equal(element.getAttribute("data-cad"), "aggressive");
  assert.equal(runtime.display.calls.blur.length, 1);
  assert.equal(runtime.storage.snapshot().stat_total, 1);
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

test("tab activation immediately re-arms a supported page scanner", async () => {
  const runtime = await loadDetectionRuntime({ mode: "hybrid", enabled: true });
  runtime.context.window.location.hostname = "www.facebook.com";
  runtime.context.window.location.pathname = "/groups/example";
  runtime.context.window.removeEventListener = () => {};
  runtime.context.document.createTreeWalker = () => ({ nextNode() { return null; } });

  const listener = runtime.chrome.__runtimeMessageListeners.at(-1);
  listener({ type: "TAB_ACTIVATED" });

  assert.equal(getBinding(runtime.context, "_observer !== null"), true);
  assert.equal(
    getBinding(runtime.context, "_initialScanTimers.length"),
    getBinding(runtime.context, "CADConfig.timing.initialScanDelaysMs.length"),
  );
  getBinding(runtime.context, "stopScanning")();
});
