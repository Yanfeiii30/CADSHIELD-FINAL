"use strict";

const fs = require("node:fs");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createContext,
  runExtensionScript,
  getBinding,
  extensionPath,
} = require("./support/browser-harness.cjs");

function loadSupportModules(initialStorage = {}) {
  const harness = createContext(initialStorage);
  runExtensionScript(harness.context, "config.js");
  runExtensionScript(harness.context, "modules/diagnostics.js");
  runExtensionScript(harness.context, "modules/page_rules.js");
  runExtensionScript(harness.context, "modules/detection_log.js");
  return {
    ...harness,
    config: getBinding(harness.context, "CADConfig"),
    diagnostics: getBinding(harness.context, "CADDiagnostics"),
    pageRules: getBinding(harness.context, "PageRules"),
    detectionLog: getBinding(harness.context, "DetectionLog"),
  };
}

test("PageRules excludes configured private hosts, subdomains, and message paths", () => {
  const { pageRules } = loadSupportModules();

  assert.equal(pageRules.isExcludedHostname("slack.com"), true);
  assert.equal(pageRules.isExcludedHostname("workspace.slack.com"), true);
  assert.equal(pageRules.isExcludedHostname("example.com"), false);
  assert.equal(
    pageRules.isPrivateLocation({ hostname: "www.facebook.com", pathname: "/messages/t/123" }),
    true,
  );
  assert.equal(
    pageRules.isPrivateLocation({ hostname: "www.facebook.com", pathname: "/public-post" }),
    false,
  );
});

test("PageRules runtime exclusions cover every host excluded by the manifest", () => {
  const { pageRules } = loadSupportModules();
  const manifest = JSON.parse(fs.readFileSync(extensionPath("manifest.json"), "utf8"));
  const patterns = manifest.content_scripts[0].exclude_matches;

  for (const pattern of patterns) {
    const hostPattern = pattern.replace(/^\*:\/\//, "").replace(/\/\*$/, "");
    const sampleHost = hostPattern.startsWith("*.")
      ? `sample.${hostPattern.slice(2)}`
      : hostPattern;
    assert.equal(
      pageRules.isExcludedHostname(sampleHost, manifest),
      true,
      `${sampleHost} must be excluded at runtime as well as in manifest.json`,
    );
  }
});

test("PageRules keeps UI labels, names, and content decisions independently testable", () => {
  const { pageRules } = loadSupportModules();
  const skipped = { closest: (selector) => selector === "button" ? skipped : null };
  const content = { closest: () => null };

  assert.equal(pageRules.shouldSkipElement(skipped), true);
  assert.equal(pageRules.shouldSkipElement(content), false);
  assert.equal(pageRules.isUiLabelText("View more comments"), true);
  assert.equal(pageRules.isUiLabelText("This is an actual comment"), false);
  assert.equal(pageRules.looksLikeNameLink("Ada Lovelace"), true);
  assert.equal(pageRules.looksLikeNameLink("this is a normal comment"), false);
});

test("DetectionLog resets, records bounded entries, and publishes per-tab statistics", () => {
  const { detectionLog, storage, chrome, config } = loadSupportModules();
  const fixedDate = new Date("2026-08-19T10:00:00Z");
  const log = detectionLog.create(chrome, {
    tabKey: "tab_test",
    now: () => fixedDate,
  });

  log.reset();
  assert.equal(chrome.__sentMessages.at(-1).type, "CLEAR_BADGE");

  const totalToSave = config.limits.maximumLogEntries + 3;
  for (let index = 0; index < totalToSave; index++) {
    log.save(`entry-${index}-` + "x".repeat(150), 0.87654, index % 2 === 0, "hybrid", 3);
  }

  const snapshot = log.snapshot();
  assert.equal(snapshot.total, totalToSave);
  assert.equal(snapshot.aggressive, Math.ceil(totalToSave / 2));
  assert.equal(snapshot.entries.length, config.limits.maximumLogEntries);
  assert.ok(snapshot.entries.every((entry) => entry.text.length <= config.limits.loggedTextLength));
  assert.ok(snapshot.entries.every((entry) => entry.score === 0.877));

  log.publish();
  assert.equal(chrome.__sentMessages.at(-1).type, "AGGRESSIVE_FOUND");
  const stored = storage.snapshot();
  assert.equal(stored[config.storage.totalScanned], totalToSave);
  assert.equal(stored[config.storage.totalAggressive], Math.ceil(totalToSave / 2));
  assert.equal(stored[config.storage.logEntries].length, config.limits.maximumLogEntries);
});

test("CADDiagnostics keeps a bounded, copy-safe technical error history", () => {
  const { diagnostics } = loadSupportModules();

  for (let index = 0; index < 55; index++) {
    diagnostics.warn("test.area", new Error(`problem-${index}`), { index });
  }
  const recent = diagnostics.getRecent();

  assert.equal(recent.length, 50);
  assert.equal(recent[0].message, "problem-5");
  recent[0].details.index = -1;
  assert.equal(diagnostics.getRecent()[0].details.index, 5);

  diagnostics.clear();
  assert.equal(diagnostics.getRecent().length, 0);
});
